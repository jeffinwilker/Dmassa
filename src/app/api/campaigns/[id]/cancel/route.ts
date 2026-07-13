import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { campaignQueue } from "@/lib/queue";
import { maybeCleanupMedia } from "@/lib/media-cleanup";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const campaign = await prisma.campaign.findFirst({ where: { id, ownerId } });
  if (!campaign) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  if (["COMPLETED", "CANCELLED"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Ja esta ${campaign.status}` },
      { status: 409 },
    );
  }

  // Marca CANCELLED (worker respeita esse status)
  await prisma.campaign.update({
    where: { id },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  // Marca MessageJob pendentes como SKIPPED e conta
  const pending = await prisma.messageJob.updateMany({
    where: {
      campaignId: id,
      status: { in: ["PENDING", "SCHEDULED"] },
    },
    data: { status: "SKIPPED", failedAt: new Date(), errorMessage: "cancelado pelo usuario" },
  });
  if (pending.count > 0) {
    await prisma.campaign.update({
      where: { id },
      data: { skippedCount: { increment: pending.count } },
    });
  }

  // Tenta remover jobs da fila BullMQ (best-effort)
  try {
    const queue = campaignQueue();
    const jobsInQueue = await queue.getJobs(["delayed", "waiting", "prioritized"], 0, -1);
    for (const j of jobsInQueue) {
      const data = j.data as { campaignId?: string };
      if (data?.campaignId === id) {
        await j.remove().catch(() => undefined);
      }
    }
  } catch (err) {
    console.warn("cancel: falha limpando fila:", (err as Error).message);
  }

  // Se essa campanha tinha midia e nao ha outras ativas usando, deleta do storage
  if (campaign.mediaAssetId) {
    await maybeCleanupMedia(campaign.mediaAssetId).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, skippedJobs: pending.count });
}
