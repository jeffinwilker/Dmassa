import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { extractNumbersFromText } from "@/lib/import-helpers";
import { normalizeWhatsappNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1),
  tagIds: z.array(z.string()).default([]),
  defaultCountry: z.string().default("55"),
});

export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "dados invalidos" }, { status: 400 });
  }

  const raw = extractNumbersFromText(parsed.data.text);
  const normalized = Array.from(
    new Set(raw.map((n) => normalizeWhatsappNumber(n, parsed.data.defaultCountry))),
  ).filter((n) => n.length >= 10);

  if (parsed.data.tagIds.length) {
    const found = await prisma.contactTag.findMany({
      where: { id: { in: parsed.data.tagIds }, ownerId },
      select: { id: true },
    });
    if (found.length !== parsed.data.tagIds.length) {
      return NextResponse.json({ error: "tag invalida" }, { status: 400 });
    }
  }

  const report = { totalDetected: normalized.length, created: 0, skipped: 0 };

  for (const wa of normalized) {
    const existing = await prisma.contact.findUnique({
      where: { ownerId_whatsapp: { ownerId, whatsapp: wa } },
    });
    if (existing) {
      // Aplica novas tags mesmo assim
      for (const tagId of parsed.data.tagIds) {
        await prisma.contactTagLink
          .create({ data: { contactId: existing.id, tagId } })
          .catch(() => undefined);
      }
      report.skipped++;
      continue;
    }
    await prisma.contact.create({
      data: {
        ownerId,
        whatsapp: wa,
        tags: parsed.data.tagIds.length
          ? { create: parsed.data.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
    });
    report.created++;
  }

  return NextResponse.json({ report });
}
