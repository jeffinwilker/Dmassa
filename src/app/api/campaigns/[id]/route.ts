import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  text: z.string().max(4096).nullable().optional(),
  caption: z.string().max(1024).nullable().optional(),
  mediaAssetId: z.string().nullable().optional(),
  audience: z
    .object({
      mode: z.enum(["ALL", "TAGS", "MANUAL"]).optional(),
      tagIds: z.array(z.string()).optional(),
      requireAllTags: z.boolean().optional(),
      excludeBlacklisted: z.boolean().optional(),
      excludeInConversation: z.boolean().optional(),
    })
    .optional(),
  settings: z
    .object({
      delayMinSec: z.number().int().min(0).max(600).optional(),
      delayMaxSec: z.number().int().min(0).max(600).optional(),
      restEveryN: z.number().int().min(1).max(1000).optional(),
      restForSec: z.number().int().min(0).max(3600).optional(),
      allowedHourStart: z.number().int().min(0).max(23).optional(),
      allowedHourEnd: z.number().int().min(1).max(24).optional(),
      simulateTyping: z.boolean().optional(),
      shuffleContacts: z.boolean().optional(),
      validateBeforeSend: z.boolean().optional(),
    })
    .optional(),
  instances: z
    .object({
      useAll: z.boolean().optional(),
      ids: z.array(z.string()).optional(),
    })
    .optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const c = await prisma.campaign.findFirst({
    where: { id, ownerId },
    include: {
      media: true,
      instances: { include: { instance: true } },
    },
  });
  if (!c) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  return NextResponse.json({ campaign: c });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const existing = await prisma.campaign.findFirst({ where: { id, ownerId } });
  if (!existing) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  // Nao permitir edicao de conteudo apos RUNNING
  const isRunning = ["RUNNING", "COMPLETED"].includes(existing.status);
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  const data = parsed.data;

  if (isRunning && (data.text !== undefined || data.mediaAssetId !== undefined || data.audience || data.instances)) {
    return NextResponse.json(
      { error: "Nao e possivel editar conteudo/publico apos iniciar. Pause e clone." },
      { status: 409 },
    );
  }

  const update: Prisma.CampaignUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.text !== undefined) update.text = data.text;
  if (data.caption !== undefined) update.caption = data.caption;
  if (data.mediaAssetId !== undefined) {
    update.media = data.mediaAssetId
      ? { connect: { id: data.mediaAssetId } }
      : { disconnect: true };
  }
  if (data.audience?.mode !== undefined) update.audienceMode = data.audience.mode;
  if (data.audience?.tagIds !== undefined) update.audienceTagIds = data.audience.tagIds;
  if (data.audience?.requireAllTags !== undefined) update.audienceRequireAllTags = data.audience.requireAllTags;
  if (data.audience?.excludeBlacklisted !== undefined) update.excludeBlacklisted = data.audience.excludeBlacklisted;
  if (data.audience?.excludeInConversation !== undefined) update.excludeInConversation = data.audience.excludeInConversation;

  if (data.settings?.delayMinSec !== undefined) update.delayMinSec = data.settings.delayMinSec;
  if (data.settings?.delayMaxSec !== undefined) update.delayMaxSec = data.settings.delayMaxSec;
  if (data.settings?.restEveryN !== undefined) update.restEveryN = data.settings.restEveryN;
  if (data.settings?.restForSec !== undefined) update.restForSec = data.settings.restForSec;
  if (data.settings?.allowedHourStart !== undefined) update.allowedHourStart = data.settings.allowedHourStart;
  if (data.settings?.allowedHourEnd !== undefined) update.allowedHourEnd = data.settings.allowedHourEnd;
  if (data.settings?.simulateTyping !== undefined) update.simulateTyping = data.settings.simulateTyping;
  if (data.settings?.shuffleContacts !== undefined) update.shuffleContacts = data.settings.shuffleContacts;
  if (data.settings?.validateBeforeSend !== undefined) update.validateBeforeSend = data.settings.validateBeforeSend;

  if (data.instances?.useAll !== undefined) update.useAllInstances = data.instances.useAll;

  if (data.scheduledFor !== undefined) {
    update.scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null;
    update.status = data.scheduledFor ? "SCHEDULED" : "DRAFT";
  }

  // Substituicao completa das instancias (se enviado)
  if (data.instances?.ids !== undefined) {
    await prisma.campaignInstance.deleteMany({ where: { campaignId: id } });
    if (data.instances.ids.length) {
      await prisma.campaignInstance.createMany({
        data: data.instances.ids.map((instanceId) => ({ campaignId: id, instanceId })),
      });
    }
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: update,
    include: { media: true, instances: { include: { instance: true } } },
  });
  return NextResponse.json({ campaign: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const existing = await prisma.campaign.findFirst({ where: { id, ownerId } });
  if (!existing) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  if (existing.status === "RUNNING") {
    return NextResponse.json({ error: "Pause antes de excluir" }, { status: 409 });
  }
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
