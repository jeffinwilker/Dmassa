import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { normalizeWhatsappNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const listQuery = z.object({
  q: z.string().optional(),        // busca por nome
  wa: z.string().optional(),       // busca por numero
  tags: z.string().optional(),     // ids separados por virgula (AND)
  blacklisted: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

const createSchema = z.object({
  name: z.string().max(120).optional(),
  whatsapp: z.string().min(6),
  tagIds: z.array(z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  const ownerId = await getOwnerId();
  const url = new URL(req.url);
  const parsed = listQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Query invalida" }, { status: 400 });
  }
  const { q, wa, tags, blacklisted, page, pageSize } = parsed.data;

  const where: Prisma.ContactWhereInput = { ownerId };
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (wa) where.whatsapp = { contains: wa.replace(/\D/g, "") };
  if (blacklisted) where.isBlacklisted = blacklisted === "true";
  if (tags) {
    const tagIds = tags.split(",").filter(Boolean);
    if (tagIds.length) {
      // AND: contato precisa ter TODAS as tags
      where.AND = tagIds.map((tagId) => ({ tags: { some: { tagId } } }));
    }
  }

  const [total, items] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    contacts: items.map((c) => ({
      id: c.id,
      name: c.name,
      whatsapp: c.whatsapp,
      hasWhatsapp: c.hasWhatsapp,
      isBlacklisted: c.isBlacklisted,
      inConversation: c.inConversation,
      meta: c.meta,
      createdAt: c.createdAt,
      tags: c.tags.map((l) => ({ id: l.tag.id, name: l.tag.name, color: l.tag.color })),
    })),
  });
}

export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const whatsapp = normalizeWhatsappNumber(parsed.data.whatsapp);
  if (!whatsapp) {
    return NextResponse.json({ error: "Numero invalido" }, { status: 400 });
  }

  const existing = await prisma.contact.findUnique({
    where: { ownerId_whatsapp: { ownerId, whatsapp } },
  });
  if (existing) {
    return NextResponse.json({ error: "Contato ja existe", contactId: existing.id }, { status: 409 });
  }

  const contact = await prisma.contact.create({
    data: {
      ownerId,
      name: parsed.data.name || null,
      whatsapp,
      meta: (parsed.data.meta as Prisma.InputJsonValue) ?? undefined,
      tags: parsed.data.tagIds?.length
        ? { create: parsed.data.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: { tags: { include: { tag: true } } },
  });

  return NextResponse.json({ contact }, { status: 201 });
}
