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
    keyId?: string;               // Evolution v2 as vezes usa keyId direto
    remoteJid?: string;
    fromMe?: boolean;
    status?: string | number;     // SERVER_ACK, DELIVERY_ACK, READ, PLAYED, ou 1-5
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

/**
 * Mapa amplo dos possiveis valores de status da Evolution v2 / Baileys.
 * O Baileys emite:
 *   0=ERROR, 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
 * Evolution v2 tipicamente manda o nome (SERVER_ACK, etc), mas ha versoes
 * que mandam o numero e ha compat retroativa com sent/delivered/read.
 */
type OurStatus = "SENT" | "DELIVERED" | "READ";

const MSG_STATUS_MAP: Record<string, OurStatus> = {
  // Nomes antigos / customizados
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  played: "READ",
  // Nomes do Baileys/Evolution
  server_ack: "SENT",
  delivery_ack: "DELIVERED",
  // Numericos como string
  "2": "SENT",
  "3": "DELIVERED",
  "4": "READ",
  "5": "READ",
};

function mapMessageStatus(raw: string | number | undefined): OurStatus | null {
  if (raw == null) return null;
  const key = String(raw).toLowerCase().trim();
  return MSG_STATUS_MAP[key] ?? null;
}

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
        // Evolution v2 usa data.key.id OU data.keyId dependendo da versao
        const msgId = payload.data?.key?.id ?? payload.data?.keyId;
        const rawStatus = payload.data?.status;
        const mapped = mapMessageStatus(rawStatus);

        if (!msgId) {
          console.warn(`[webhook] ${event} sem msgId — payload:`, JSON.stringify(payload.data));
          break;
        }
        if (!mapped) {
          console.warn(`[webhook] ${event} status desconhecido "${rawStatus}" — msgId=${msgId}`);
          break;
        }

        // Le status anterior pra evitar duplicar incremento de contador
        const existing = await prisma.messageJob.findFirst({
          where: { whatsappMessageId: msgId },
          select: { id: true, status: true, campaignId: true },
        });
        if (!existing) {
          // Msg nossa mas nao achamos o job — pode ter sido deletado ou nao mapeado
          break;
        }

        // So progride status: PENDING -> SENT -> DELIVERED -> READ (nao regride)
        const rank: Record<string, number> = {
          PENDING: 0, SCHEDULED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4,
        };
        if ((rank[existing.status] ?? -1) >= rank[mapped]) break;

        const now = new Date();
        await prisma.messageJob.update({
          where: { id: existing.id },
          data: {
            status: mapped,
            deliveredAt: mapped === "DELIVERED" ? now : undefined,
            readAt: mapped === "READ" ? now : undefined,
          },
        });

        // Incrementa contadores da campanha (uma vez por transicao)
        if (mapped === "DELIVERED") {
          await prisma.campaign.update({
            where: { id: existing.campaignId },
            data: { deliveredCount: { increment: 1 } },
          });
        } else if (mapped === "READ") {
          await prisma.campaign.update({
            where: { id: existing.campaignId },
            data: {
              readCount: { increment: 1 },
              // Se pulou direto de SENT pra READ, tambem conta como entregue
              deliveredCount: existing.status === "SENT" ? { increment: 1 } : undefined,
            },
          });
        }
        break;
      }

      case "messages.upsert": {
        // Mensagens recebidas OU enviadas. Nos interessa fromMe=false (recebidas).
        const fromMe = payload.data?.key?.fromMe ?? payload.data?.fromMe;
        if (fromMe) break;

        const remoteJid = payload.data?.key?.remoteJid ?? payload.data?.remoteJid;
        const number = jidToNumber(remoteJid);
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
