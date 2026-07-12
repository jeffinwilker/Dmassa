import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

const schema = z.object({
  mode: z.enum(["ALL", "TAGS", "MANUAL"]).default("ALL"),
  tagIds: z.array(z.string()).default([]),
  requireAllTags: z.boolean().default(false),
  excludeBlacklisted: z.boolean().default(true),
  excludeInConversation: z.boolean().default(true),
});

/**
 * POST /api/campaigns/preview-audience
 * Retorna o total de contatos e uma amostra baseado no filtro.
 */
export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalido" }, { status: 400 });
  const data = parsed.data;

  const where = buildWhere(ownerId, data);

  const [total, sample] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, whatsapp: true },
    }),
  ]);

  return NextResponse.json({ total, sample });
}

export function buildWhere(
  ownerId: string,
  a: {
    mode: "ALL" | "TAGS" | "MANUAL";
    tagIds: string[];
    requireAllTags: boolean;
    excludeBlacklisted: boolean;
    excludeInConversation: boolean;
  },
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { ownerId };
  if (a.excludeBlacklisted) where.isBlacklisted = false;
  if (a.excludeInConversation) where.inConversation = false;

  if (a.mode === "TAGS" && a.tagIds.length) {
    if (a.requireAllTags) {
      where.AND = a.tagIds.map((tagId) => ({ tags: { some: { tagId } } }));
    } else {
      where.tags = { some: { tagId: { in: a.tagIds } } };
    }
  }
  // MANUAL: sem filtro aqui — o start le da tabela CampaignContact.
  return where;
}
