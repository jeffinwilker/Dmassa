import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Endpoint global de webhook do Evolution.
 * Nesta fase apenas persistimos os eventos e atualizamos status de instancia/mensagem.
 * O processamento profundo (opt-out, in-conversation, etc.) sera implementado na Fase 3.
 */

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    state?: string;
    key?: { id?: string; remoteJid?: string; fromMe?: boolean };
    status?: string;          // sent | delivered | read
    message?: unknown;
  };
}

const stateMap = {
  open: "CONNECTED",
  connecting: "CONNECTING",
  close: "DISCONNECTED",
  refused: "ERROR",
} as const;

export async function POST(req: Request) {
  // Protecao por token na query string (?token=...). Configure WEBHOOK_TOKEN
  // no .env e em WEBHOOK_URL (?token=SEU_TOKEN).
  const expected = process.env.WEBHOOK_TOKEN;
  if (expected) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("token");
    if (provided !== expected) {
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

  // Persiste o evento cru pra auditoria.
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
          }
        }
        break;
      }

      // messages.upsert (mensagens recebidas): sera tratado na Fase 3 (opt-out).
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
