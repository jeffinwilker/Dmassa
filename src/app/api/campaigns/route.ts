import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

const messageType = z.enum([
  "TEXT",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "CONTACT",
  "LOCATION",
]);

const audienceSchema = z.object({
  mode: z.enum(["ALL", "TAGS", "MANUAL"]).default("ALL"),
  tagIds: z.array(z.string()).default([]),
  requireAllTags: z.boolean().default(false),
  excludeBlacklisted: z.boolean().default(true),
  excludeInConversation: z.boolean().default(true),
});

const settingsSchema = z.object({
  delayMinSec: z.number().int().min(0).max(600).default(5),
  delayMaxSec: z.number().int().min(0).max(600).default(15),
  restEveryN: z.number().int().min(1).max(1000).default(20),
  restForSec: z.number().int().min(0).max(3600).default(600),
  allowedHourStart: z.number().int().min(0).max(23).default(8),
  allowedHourEnd: z.number().int().min(1).max(24).default(20),
  simulateTyping: z.boolean().default(true),
  shuffleContacts: z.boolean().default(true),
  validateBeforeSend: z.boolean().default(true),
});

const instancesSchema = z.object({
  useAll: z.boolean().default(true),
  ids: z.array(z.string()).default([]),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  messageType: messageType.default("TEXT"),
  text: z.string().max(4096).optional(),
  caption: z.string().max(1024).optional(),
  mediaAssetId: z.string().optional(),
  contactVcard: z.string().optional(),
  contactVcardName: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  locationName: z.string().optional(),
  audience: audienceSchema.default({}),
  settings: settingsSchema.default({}),
  instances: instancesSchema.default({}),
  scheduledFor: z.string().datetime().optional(),
});

function toPrismaData(
  ownerId: string,
  data: z.infer<typeof createSchema>,
): Prisma.CampaignCreateInput {
  return {
    ownerId,
    name: data.name,
    messageType: data.messageType,
    text: data.text,
    caption: data.caption,
    media: data.mediaAssetId ? { connect: { id: data.mediaAssetId } } : undefined,
    contactVcard: data.contactVcard,
    contactVcardName: data.contactVcardName,
    locationLat: data.locationLat,
    locationLng: data.locationLng,
    locationName: data.locationName,
    audienceMode: data.audience.mode,
    audienceTagIds: data.audience.tagIds,
    audienceRequireAllTags: data.audience.requireAllTags,
    excludeBlacklisted: data.audience.excludeBlacklisted,
    excludeInConversation: data.audience.excludeInConversation,
    delayMinSec: data.settings.delayMinSec,
    delayMaxSec: data.settings.delayMaxSec,
    restEveryN: data.settings.restEveryN,
    restForSec: data.settings.restForSec,
    allowedHourStart: data.settings.allowedHourStart,
    allowedHourEnd: data.settings.allowedHourEnd,
    simulateTyping: data.settings.simulateTyping,
    shuffleContacts: data.settings.shuffleContacts,
    validateBeforeSend: data.settings.validateBeforeSend,
    useAllInstances: data.instances.useAll,
    scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
    status: data.scheduledFor ? "SCHEDULED" : "DRAFT",
    instances:
      !data.instances.useAll && data.instances.ids.length
        ? { create: data.instances.ids.map((instanceId) => ({ instanceId })) }
        : undefined,
  };
}

export async function GET() {
  const ownerId = await getOwnerId();
  const campaigns = await prisma.campaign.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      messageType: true,
      totalContacts: true,
      sentCount: true,
      deliveredCount: true,
      readCount: true,
      failedCount: true,
      skippedCount: true,
      scheduledFor: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.settings.delayMaxSec < data.settings.delayMinSec) {
    return NextResponse.json(
      { error: "delayMax deve ser >= delayMin" },
      { status: 400 },
    );
  }
  if (data.settings.allowedHourEnd <= data.settings.allowedHourStart) {
    return NextResponse.json(
      { error: "janela de horario invalida" },
      { status: 400 },
    );
  }

  // Validacao por tipo
  if (data.messageType === "TEXT" && !data.text?.trim()) {
    return NextResponse.json({ error: "texto obrigatorio para tipo TEXT" }, { status: 400 });
  }
  if (
    ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(data.messageType) &&
    !data.mediaAssetId
  ) {
    return NextResponse.json({ error: "midia obrigatoria para esse tipo" }, { status: 400 });
  }
  if (data.messageType === "LOCATION" && (data.locationLat == null || data.locationLng == null)) {
    return NextResponse.json({ error: "lat/lng obrigatorios" }, { status: 400 });
  }

  // Verifica que mediaAsset pertence ao owner
  if (data.mediaAssetId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: data.mediaAssetId, ownerId },
    });
    if (!asset) return NextResponse.json({ error: "midia nao encontrada" }, { status: 400 });
  }

  // Verifica que tags e instancias pertencem ao owner
  if (data.audience.tagIds.length) {
    const found = await prisma.contactTag.findMany({
      where: { id: { in: data.audience.tagIds }, ownerId },
      select: { id: true },
    });
    if (found.length !== data.audience.tagIds.length) {
      return NextResponse.json({ error: "tag(s) invalida(s)" }, { status: 400 });
    }
  }
  if (!data.instances.useAll && data.instances.ids.length) {
    const found = await prisma.instance.findMany({
      where: { id: { in: data.instances.ids }, ownerId },
      select: { id: true },
    });
    if (found.length !== data.instances.ids.length) {
      return NextResponse.json({ error: "instancia(s) invalida(s)" }, { status: 400 });
    }
  }

  const campaign = await prisma.campaign.create({
    data: toPrismaData(ownerId, data),
    include: { instances: true, media: true },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
