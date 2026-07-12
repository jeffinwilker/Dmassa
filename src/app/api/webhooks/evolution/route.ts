import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Endpoint global de webhook do Evolution.
 *  - connection.update: atualiza status da Instance
 *  - messages.update / send.message: atualiza status do MessageJob (sent/delivered/read)
 *  - messages.upsert (fromMe=false): detecta opt-out (blacklist auto) e marca
 *    o contato como inConversation=true (pausa disparos futuros).
 */

interface EvolutionKey {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
}

interface EvolutionMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
}

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    state?: string;
    key?: EvolutionKey;
    status?: string;              // sent | delivered | read
    message?: EvolutionMessage;
    messageType?: string;
    pushName?: string;
  };
}

const stateMap = {
  open: "CONNECTED",
  connecting: "CONNECTING",
  close: "DISCONNECTED",
  refused: "ERROR",
} as const;

// Palavras de opt-out (case/acento insensitive)
const OPT_OUT_KEYWORDS = ["pare", "sair", "stop", "remover", "cancelar", "descadastrar"];

function extractText(msg?: EvolutionMessage) {
  if (!msg) return "";
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    ""
  );
}

function isOptOut(text: string) {
  const norm = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  // considera opt-out se a mensagem for exatamente uma palavra-chave OU
  // se comecar com uma delas (ex: "PARE de mandar")
  return OPT_OUT_KEYWORDS.some(
    (kw) => norm === kw || norm.startsWith(`${kw} `) || norm.startsWith(`${kw}.`),
  );
}

/** "5511999999999@s.whatsapp.net" -> "5511999999999" */
function jidToNumber(jid?: string) {
  if (!jid) return null;
  const at = jid.indexOf("@");
  return (at > 0 ? jid.slice(0, at) : jid).replace(/\D/g, "");
}

export async function POST(req: Request) {
  const expected = process.env.WEBHOOK_TOKEN;
  if (expected) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== expected) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }
  }

  let payload: EvolutionWebhookPayload;
  try {
    payload = (await req.json()) as EvolutionWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const event = payload.event ?? "unknown";
  const instanceName = payload.instance ?? null;

  const record = await prisma.webhookEvent
    .create({
      data: {
        event,
        instanceName,
        payload: payload as unknown as object,
      },
    })
    .catch((err) => {
      console.error("webhookEvent.create falhou:", err);
      return null;
    });

  try {
    switch (event) {
      case "connection.update": {
        const state = payload.data?.state;
        const mapped = stateMap[state as keyof typeof stateMap];
        if (instanceName && mapped) {
          await prisma.instance.updateMany({
            where: { evolutionInstance: instanceName },
            data: {
              status: mapped,
              lastConnectionAt: mapped === "CONNECTED" ? new Date() : undefined,
            },
          });
        }
        break;
      }

      case "messages.update":
      case "send.message": {
        const key = payload.data?.key;
        const status = payload.data?.status;
        if (key?.id && status) {
          const statusMap = {
            sent: "SENT",
            delivered: "DELIVERED",
            read: "READ",
          } as const;
          const mapped = statusMap[status.toLowerCase() as keyof typeof statusMap];
          if (mapped) {
            const now = new Date();
            await prisma.messageJob.updateMany({
              where: { whatsappMessageId: key.id },
              data: {
                status: mapped,
                deliveredAt: mapped === "DELIVERED" ? now : undefined,
                readAt: mapped === "READ" ? now : undefined,
              },
            });
            // Se ficou READ, incrementa contador da campanha (sem duplicar)
            if (mapped === "READ") {
              const mj = await prisma.messageJob.findFirst({
                where: { whatsappMessageId: key.id },
                select: { campaignId: true },
              });
              if (mj) {
                await prisma.campaign.update({
                  where: { id: mj.campaignId },
                  data: { readCount: { increment: 1 } },
                });
              }
            }
            if (mapped === "DELIVERED") {
              const mj = await prisma.messageJob.findFirst({
                where: { whatsappMessageId: key.id },
                select: { campaignId: true },
              });
              if (mj) {
                await prisma.campaign.update({
                  where: { id: mj.campaignId },
                  data: { deliveredCount: { increment: 1 } },
                });
              }
            }
          }
        }
        break;
      }

      case "messages.upsert": {
        // Mensagens recebidas OU enviadas. Nos interessa fromMe=false (recebidas).
        const key = payload.data?.key;
        if (!key || key.fromMe) break;

        const number = jidToNumber(key.remoteJid);
        if (!number) break;

        // Descobre o owner via instancia (webhook nao carrega ownerId)
        const inst = instanceName
          ? await prisma.instance.findUnique({
              where: { evolutionInstance: instanceName },
              select: { ownerId: true },
            })
          : null;
        if (!inst) break;

        // Localiza ou cria contato
        let contact = await prisma.contact.findUnique({
          where: { ownerId_whatsapp: { ownerId: inst.ownerId, whatsapp: number } },
        });
        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              ownerId: inst.ownerId,
              whatsapp: number,
              name: payload.data?.pushName ?? null,
            },
          });
        }

        const text = extractText(payload.data?.message);
        const optOut = isOptOut(text);

        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            inConversation: true,
            lastRepliedAt: new Date(),
            ...(optOut
              ? {
                  isBlacklisted: true,
                  blacklistedAt: new Date(),
                  blacklistReason: `opt-out automatico: "${text.slice(0, 100)}"`,
                }
              : {}),
          },
        });
        break;
      }
    }

    if (record) {
      await prisma.webhookEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date() },
      });
    }
  } catch (err) {
    if (record) {
      await prisma.webhookEvent
        .update({
          where: { id: record.id },
          data: { processError: (err as Error).message },
        })
        .catch(() => undefined);
    }
    console.error("webhook processing error:", err);
  }

  return NextResponse.json({ ok: true });
}
