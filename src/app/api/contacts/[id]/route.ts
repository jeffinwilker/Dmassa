import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { normalizeWhatsappNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  whatsapp: z.string().min(6).optional(),
  isBlacklisted: z.boolean().optional(),
  blacklistReason: z.string().max(200).nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  tagIds: z.array(z.string()).optional(), // substitui completamente as tags
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const c = await prisma.contact.findFirst({
    where: { id, ownerId },
    include: { tags: { include: { tag: true } } },
  });
  if (!c) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  return NextResponse.json({ contact: c });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const existing = await prisma.contact.findFirst({ where: { id, ownerId } });
  if (!existing) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }
  const data = parsed.data;

  const update: Prisma.ContactUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.meta !== undefined) update.meta = data.meta as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

  if (data.whatsapp !== undefined) {
    const wa = normalizeWhatsappNumber(data.whatsapp);
    if (!wa) return NextResponse.json({ error: "Numero invalido" }, { status: 400 });
    if (wa !== existing.whatsapp) {
      const dup = await prisma.contact.findUnique({
        where: { ownerId_whatsapp: { ownerId, whatsapp: wa } },
      });
      if (dup) return NextResponse.json({ error: "Ja existe contato com esse numero" }, { status: 409 });
      update.whatsapp = wa;
    }
  }

  if (data.isBlacklisted !== undefined) {
    update.isBlacklisted = data.isBlacklisted;
    update.blacklistedAt = data.isBlacklisted ? new Date() : null;
    if (data.blacklistReason !== undefined) update.blacklistReason = data.blacklistReason;
  }

  // Substituicao completa de tags (se enviado)
  if (data.tagIds) {
    await prisma.contactTagLink.deleteMany({ where: { contactId: id } });
    if (data.tagIds.length) {
      await prisma.contactTagLink.createMany({
        data: data.tagIds.map((tagId) => ({ contactId: id, tagId })),
      });
    }
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: update,
    include: { tags: { include: { tag: true } } },
  });

  return NextResponse.json({ contact });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const existing = await prisma.contact.findFirst({ where: { id, ownerId } });
  if (!existing) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
