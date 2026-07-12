import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { parseFileToTable } from "@/lib/import-helpers";
import { normalizeWhatsappNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mappingSchema = z.object({
  name: z.string().optional(),         // nome da coluna do arquivo
  whatsapp: z.string().min(1),         // obrigatorio
  metaColumns: z.array(z.string()).optional(),
});

/**
 * POST multipart/form-data:
 *   - file: CSV ou XLSX
 *   - mapping: JSON string do mappingSchema
 *   - tagIds: JSON string de array (tags para aplicar em todos)
 *   - upsert: "true" | "false" (default false: pula se ja existe)
 *   - defaultCountry: DDI padrao pra numeros sem codigo (default 55)
 */
export async function POST(req: Request) {
  const ownerId = await getOwnerId();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "form invalido" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "arquivo maior que 20MB" }, { status: 400 });
  }

  const mappingRaw = String(form.get("mapping") ?? "");
  const tagIdsRaw = String(form.get("tagIds") ?? "[]");
  const upsert = String(form.get("upsert") ?? "false") === "true";
  const defaultCountry = String(form.get("defaultCountry") ?? "55");

  let mapping: z.infer<typeof mappingSchema>;
  let tagIds: string[];
  try {
    mapping = mappingSchema.parse(JSON.parse(mappingRaw));
    tagIds = z.array(z.string()).parse(JSON.parse(tagIdsRaw));
  } catch (err) {
    return NextResponse.json(
      { error: "mapping/tagIds invalidos", detail: (err as Error).message },
      { status: 400 },
    );
  }

  // Valida tags pertencem ao owner
  if (tagIds.length) {
    const found = await prisma.contactTag.findMany({
      where: { id: { in: tagIds }, ownerId },
      select: { id: true },
    });
    if (found.length !== tagIds.length) {
      return NextResponse.json({ error: "alguma tag nao pertence ao owner" }, { status: 400 });
    }
  }

  let table;
  try {
    table = await parseFileToTable(file);
  } catch (err) {
    return NextResponse.json(
      { error: `falha ao ler arquivo: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (!table.columns.includes(mapping.whatsapp)) {
    return NextResponse.json(
      { error: `coluna "${mapping.whatsapp}" nao existe no arquivo` },
      { status: 400 },
    );
  }

  const report = {
    totalRows: table.rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
    errors: [] as { row: number; reason: string }[],
  };

  // Buffer pra inserts em lote
  const seen = new Set<string>();

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const rawWa = row[mapping.whatsapp];
    const wa = normalizeWhatsappNumber(rawWa ?? "", defaultCountry);
    if (!wa || wa.length < 10) {
      report.invalid++;
      if (report.errors.length < 20) {
        report.errors.push({ row: i + 2, reason: "numero invalido" });
      }
      continue;
    }
    if (seen.has(wa)) {
      report.skipped++;
      continue;
    }
    seen.add(wa);

    const name = mapping.name ? String(row[mapping.name] ?? "").trim() || null : null;

    const meta: Record<string, string> = {};
    for (const col of mapping.metaColumns ?? []) {
      if (col in row && row[col] !== "") meta[col] = String(row[col]);
    }

    try {
      const existing = await prisma.contact.findUnique({
        where: { ownerId_whatsapp: { ownerId, whatsapp: wa } },
      });

      if (existing) {
        if (!upsert) {
          // Ainda aplica novas tags mesmo pulando update de campos.
          if (tagIds.length) {
            for (const tagId of tagIds) {
              await prisma.contactTagLink
                .create({ data: { contactId: existing.id, tagId } })
                .catch(() => undefined); // ignora se ja existe
            }
          }
          report.skipped++;
          continue;
        }
        const updateData: Prisma.ContactUpdateInput = {};
        if (name && name !== existing.name) updateData.name = name;
        if (Object.keys(meta).length) {
          // merge com meta existente
          const merged = { ...(existing.meta as Record<string, unknown> | null ?? {}), ...meta };
          updateData.meta = merged as Prisma.InputJsonValue;
        }
        await prisma.contact.update({ where: { id: existing.id }, data: updateData });
        if (tagIds.length) {
          for (const tagId of tagIds) {
            await prisma.contactTagLink
              .create({ data: { contactId: existing.id, tagId } })
              .catch(() => undefined);
          }
        }
        report.updated++;
      } else {
        await prisma.contact.create({
          data: {
            ownerId,
            name,
            whatsapp: wa,
            meta: Object.keys(meta).length ? (meta as Prisma.InputJsonValue) : undefined,
            tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
          },
        });
        report.created++;
      }
    } catch (err) {
      report.invalid++;
      if (report.errors.length < 20) {
        report.errors.push({ row: i + 2, reason: (err as Error).message });
      }
    }
  }

  return NextResponse.json({ report });
}
