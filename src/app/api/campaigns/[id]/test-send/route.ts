import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { evolutionClient, EvolutionError } from "@/lib/evolution/client";
import { loadSpintaxVariables, renderSpintax } from "@/lib/spintax/render";
import { normalizeWhatsappNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const schema = z.object({
  number: z.string().min(6),
  instanceId: z.string().optional(), // se nao passar, pega primeira conectada
});

/**
 * Envia UMA mensagem de teste pra o numero informado usando o conteudo
 * atual da campanha. Nao usa a fila, nao materializa nada — envio direto,
 * pra o usuario ver como fica antes de disparar em massa.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerId },
    include: { media: true },
  });
  if (!campaign) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });

  const number = normalizeWhatsappNumber(parsed.data.number);
  if (!number) return NextResponse.json({ error: "numero invalido" }, { status: 400 });

  // Escolhe instancia
  const instance = parsed.data.instanceId
    ? await prisma.instance.findFirst({
        where: { id: parsed.data.instanceId, ownerId, status: "CONNECTED" },
      })
    : await prisma.instance.findFirst({
        where: { ownerId, status: "CONNECTED" },
        orderBy: { weight: "desc" },
      });
  if (!instance) {
    return NextResponse.json({ error: "sem instancia conectada" }, { status: 400 });
  }

  // Renderiza spintax usando um contato "ficticio"
  const vars = await loadSpintaxVariables(ownerId);
  const rendered = campaign.text
    ? renderSpintax(campaign.text, {
        contact: { name: "Teste", whatsapp: number, meta: {} },
        variables: vars,
      })
    : null;
  const caption = campaign.caption
    ? renderSpintax(campaign.caption, {
        contact: { name: "Teste", whatsapp: number, meta: {} },
        variables: vars,
      })
    : undefined;

  const evo = evolutionClient();
  try {
    let key: string | null | undefined;
    switch (campaign.messageType) {
      case "TEXT": {
        const r = await evo.sendText(
          instance.evolutionInstance,
          { number, text: rendered ?? "" },
          instance.apiKey ?? undefined,
        );
        key = r.key?.id;
        break;
      }
      case "IMAGE":
      case "VIDEO":
      case "DOCUMENT": {
        if (!campaign.media) throw new Error("campanha sem midia");
        const r = await evo.sendMedia(
          instance.evolutionInstance,
          {
            number,
            mediaType:
              campaign.messageType === "IMAGE"
                ? "image"
                : campaign.messageType === "VIDEO"
                ? "video"
                : "document",
            media: campaign.media.url,
            caption,
            fileName: campaign.media.fileName,
            mimetype: campaign.media.mimeType,
          },
          instance.apiKey ?? undefined,
        );
        key = r.key?.id;
        break;
      }
      case "AUDIO": {
        if (!campaign.media) throw new Error("campanha sem audio");
        const r = await evo.sendWhatsAppAudio(
          instance.evolutionInstance,
          { number, audio: campaign.media.url },
          instance.apiKey ?? undefined,
        );
        key = r.key?.id;
        break;
      }
      case "LOCATION": {
        if (campaign.locationLat == null || campaign.locationLng == null) {
          throw new Error("localizacao sem coordenadas");
        }
        const r = await evo.sendLocation(
          instance.evolutionInstance,
          {
            number,
            latitude: campaign.locationLat,
            longitude: campaign.locationLng,
            name: campaign.locationName ?? undefined,
          },
          instance.apiKey ?? undefined,
        );
        key = r.key?.id;
        break;
      }
      default:
        throw new Error(`tipo nao suportado: ${campaign.messageType}`);
    }
    return NextResponse.json({ ok: true, sentTo: number, whatsappMessageId: key });
  } catch (err) {
    const msg =
      err instanceof EvolutionError
        ? `[${err.status}] ${err.message}`
        : (err as Error).message;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
