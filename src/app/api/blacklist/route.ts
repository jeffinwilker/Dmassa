import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { normalizeWhatsappNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const listQuery = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  const ownerId = await getOwnerId();
  const url = new URL(req.url);
  const parsed = listQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalido" }, { status: 400 });
  const { q, page, pageSize } = parsed.data;

  const where = {
    ownerId,
    isBlacklisted: true,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { whatsapp: { contains: q.replace(/\D/g, "") } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: { blacklistedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        blacklistedAt: true,
        blacklistReason: true,
      },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items,
  });
}

const addSchema = z.object({
  whatsapp: z.string().min(6),
  reason: z.string().max(200).optional(),
  name: z.string().max(120).optional(),
});

/** Adiciona um numero à blacklist (cria contato se nao existir). */
export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  const parsed = addSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "dados invalidos" }, { status: 400 });

  const whatsapp = normalizeWhatsappNumber(parsed.data.whatsapp);
  if (!whatsapp) return NextResponse.json({ error: "numero invalido" }, { status: 400 });

  const existing = await prisma.contact.findUnique({
    where: { ownerId_whatsapp: { ownerId, whatsapp } },
  });

  const now = new Date();
  const contact = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: {
          isBlacklisted: true,
          blacklistedAt: now,
          blacklistReason: parsed.data.reason ?? "adicionado manualmente",
          name: parsed.data.name ?? existing.name,
        },
      })
    : await prisma.contact.create({
        data: {
          ownerId,
          whatsapp,
          name: parsed.data.name ?? null,
          isBlacklisted: true,
          blacklistedAt: now,
          blacklistReason: parsed.data.reason ?? "adicionado manualmente",
        },
      });

  return NextResponse.json({ contact }, { status: 201 });
}
