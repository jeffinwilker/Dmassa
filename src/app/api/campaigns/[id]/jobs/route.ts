import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, MessageJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

const VALID_STATUSES: MessageJobStatus[] = [
  "PENDING",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "SKIPPED",
];

export const dynamic = "force-dynamic";

const query = z.object({
  status: z.string().optional(), // separado por virgula
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const campaign = await prisma.campaign.findFirst({ where: { id, ownerId } });
  if (!campaign) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  const url = new URL(req.url);
  const parsed = query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalido" }, { status: 400 });
  const { status, page, pageSize } = parsed.data;

  const where: Prisma.MessageJobWhereInput = { campaignId: id };
  if (status) {
    const raw = status.split(",").filter(Boolean);
    const valid = raw.filter((s): s is MessageJobStatus =>
      VALID_STATUSES.includes(s as MessageJobStatus),
    );
    if (valid.length) where.status = { in: valid };
  }

  const [total, items] = await Promise.all([
    prisma.messageJob.count({ where }),
    prisma.messageJob.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, whatsapp: true } },
        instance: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    jobs: items,
  });
}
