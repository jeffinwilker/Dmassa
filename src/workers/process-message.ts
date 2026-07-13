/**
 * Processamento de UMA mensagem da campanha.
 *
 * Chamado pelo worker BullMQ para cada job da fila.
 * O producer (start da campanha) ja preparou o MessageJob no DB.
 */
import type { Instance, Campaign, MediaAsset } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evolutionClient, EvolutionError } from "@/lib/evolution/client";
import {
  loadSpintaxVariables,
  renderSpintax,
  type RenderContext,
} from "@/lib/spintax/render";
import type { CampaignJobData } from "@/lib/queue";
import { sleep, randInt } from "@/lib/utils";
import { maybeCompleteCampaign } from "@/lib/media-cleanup";

export async function processMessageJob(data: CampaignJobData): Promise<void> {
  const { messageJobId } = data;

  const job = await prisma.messageJob.findUnique({
    where: { id: messageJobId },
    include: {
      contact: true,
      campaign: { include: { media: true } },
      instance: true,
    },
  });

  if (!job) {
    console.warn(`[process] MessageJob ${messageJobId} nao existe`);
    return;
  }

  if (["SENT", "DELIVERED", "READ", "SKIPPED"].includes(job.status)) {
    return;
  }

  const campaign = job.campaign;
  if (["PAUSED", "CANCELLED", "COMPLETED"].includes(campaign.status)) {
    return;
  }

  if (job.contact.isBlacklisted) {
    await markSkipped(messageJobId, "contato em blacklist");
    return;
  }
  if (job.contact.inConversation) {
    await markSkipped(messageJobId, "contato em conversa ativa");
    return;
  }

  const instance = job.instance;
  if (!instance) {
    await markFailed(messageJobId, "sem instancia atribuida");
    return;
  }
  if (instance.status !== "CONNECTED") {
    await markFailed(messageJobId, `instancia ${instance.name} desconectada`);
    return;
  }

  if (!withinAllowedWindow(campaign.allowedHourStart, campaign.allowedHourEnd)) {
    await markSkipped(
      messageJobId,
      `fora da janela permitida (${campaign.allowedHourStart}h-${campaign.allowedHourEnd}h)`,
    );
    return;
  }

  await prisma.messageJob.update({
    where: { id: messageJobId },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });

  const evo = evolutionClient();
  const vars = await loadSpintaxVariables(campaign.ownerId);
  const ctx: RenderContext = {
    contact: {
      name: job.contact.name,
      whatsapp: job.contact.whatsapp,
      meta: job.contact.meta as Record<string, unknown> | null,
    },
    variables: vars,
  };
  const renderedText = campaign.text ? renderSpintax(campaign.text, ctx) : null;
  const renderedCaption = campaign.caption ? renderSpintax(campaign.caption, ctx) : undefined;

  // "digitando..." / "gravando audio..."
  if (campaign.simulateTyping && instance.status === "CONNECTED") {
    const presenceMs = randInt(2000, 5000);
    const presence: "composing" | "recording" =
      campaign.messageType === "AUDIO" ? "recording" : "composing";
    try {
      await evo.sendPresence(
        instance.evolutionInstance,
        { number: job.contact.whatsapp, presence, delay: presenceMs },
        instance.apiKey ?? undefined,
      );
      await sleep(presenceMs);
    } catch (err) {
      console.warn(`[process] sendPresence falhou:`, (err as Error).message);
    }
  }

  try {
    const key = await sendByType(
      instance,
      job.contact.whatsapp,
      campaign,
      renderedText,
      renderedCaption,
    );

    await prisma.messageJob.update({
      where: { id: messageJobId },
      data: {
        status: "SENT",
        renderedText,
        whatsappMessageId: key ?? null,
        sentAt: new Date(),
      },
    });
    await prisma.instance.update({
      where: { id: instance.id },
      data: { sentToday: { increment: 1 } },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { sentCount: { increment: 1 } },
    });
    // Se foi o ultimo, marca COMPLETED e deleta midia
    await maybeCompleteCampaign(campaign.id);
  } catch (err) {
    const message =
      err instanceof EvolutionError
        ? `[${err.status}] ${err.message}`
        : (err as Error).message;
    await prisma.messageJob.update({
      where: { id: messageJobId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorMessage: message.slice(0, 500),
      },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { failedCount: { increment: 1 } },
    });
    await maybeCompleteCampaign(campaign.id);
    throw err;
  }
}

// ---------- Helpers ---------------------------------------------------------

async function markSkipped(id: string, reason: string) {
  await prisma.messageJob.update({
    where: { id },
    data: { status: "SKIPPED", errorMessage: reason.slice(0, 500), failedAt: new Date() },
  });
  const j = await prisma.messageJob.findUnique({ where: { id }, select: { campaignId: true } });
  if (j) {
    await prisma.campaign.update({
      where: { id: j.campaignId },
      data: { skippedCount: { increment: 1 } },
    });
    await maybeCompleteCampaign(j.campaignId);
  }
}

async function markFailed(id: string, reason: string) {
  await prisma.messageJob.update({
    where: { id },
    data: { status: "FAILED", errorMessage: reason.slice(0, 500), failedAt: new Date() },
  });
  const j = await prisma.messageJob.findUnique({ where: { id }, select: { campaignId: true } });
  if (j) {
    await prisma.campaign.update({
      where: { id: j.campaignId },
      data: { failedCount: { increment: 1 } },
    });
    await maybeCompleteCampaign(j.campaignId);
  }
}

function withinAllowedWindow(start: number, end: number) {
  const now = new Date();
  const h = now.getHours();
  return h >= start && h < end;
}

type CampaignWithMedia = Campaign & { media: MediaAsset | null };

async function sendByType(
  instance: Instance,
  number: string,
  campaign: CampaignWithMedia,
  renderedText: string | null,
  renderedCaption: string | undefined,
): Promise<string | null> {
  const evo = evolutionClient();
  const instanceName = instance.evolutionInstance;
  const apiKey = instance.apiKey ?? undefined;

  switch (campaign.messageType) {
    case "TEXT": {
      const r = await evo.sendText(
        instanceName,
        { number, text: renderedText ?? "" },
        apiKey,
      );
      return r.key?.id ?? null;
    }
    case "IMAGE":
    case "VIDEO":
    case "DOCUMENT": {
      if (!campaign.media) throw new Error("campanha sem midia");
      const mediaType =
        campaign.messageType === "IMAGE"
          ? "image"
          : campaign.messageType === "VIDEO"
          ? "video"
          : "document";
      const r = await evo.sendMedia(
        instanceName,
        {
          number,
          mediaType,
          media: campaign.media.url,
          caption: renderedCaption,
          fileName: campaign.media.fileName,
          mimetype: campaign.media.mimeType,
        },
        apiKey,
      );
      return r.key?.id ?? null;
    }
    case "AUDIO": {
      if (!campaign.media) throw new Error("campanha sem audio");
      const r = await evo.sendWhatsAppAudio(
        instanceName,
        { number, audio: campaign.media.url },
        apiKey,
      );
      return r.key?.id ?? null;
    }
    case "LOCATION": {
      if (campaign.locationLat == null || campaign.locationLng == null) {
        throw new Error("localizacao sem coordenadas");
      }
      const r = await evo.sendLocation(
        instanceName,
        {
          number,
          latitude: campaign.locationLat,
          longitude: campaign.locationLng,
          name: campaign.locationName ?? undefined,
        },
        apiKey,
      );
      return r.key?.id ?? null;
    }
    case "CONTACT": {
      if (!campaign.contactVcard) throw new Error("contact sem vcard");
      const r = await evo.sendContact(
        instanceName,
        {
          number,
          contact: [
            {
              fullName: campaign.contactVcardName ?? "Contato",
              phoneNumber: campaign.contactVcard,
            },
          ],
        },
        apiKey,
      );
      return r.key?.id ?? null;
    }
    default:
      throw new Error(`tipo de mensagem nao suportado: ${campaign.messageType}`);
  }
}
