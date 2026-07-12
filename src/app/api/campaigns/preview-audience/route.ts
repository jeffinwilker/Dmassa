import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { buildAudienceWhere } from "@/lib/audience";

export const dynamic = "force-dynamic";

const schema = z.object({
  mode: z.enum(["ALL", "TAGS", "MANUAL"]).default("ALL"),
  tagIds: z.array(z.string()).default([]),
  requireAllTags: z.boolean().default(false),
  excludeBlacklisted: z.boolean().default(true),
  excludeInConversation: z.boolean().default(true),
});

export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalido" }, { status: 400 });

  const where = buildAudienceWhere(ownerId, parsed.data);

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
