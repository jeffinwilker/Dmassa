/**
 * Auto-cleanup de midia:
 * quando todas as campanhas que referenciam uma MediaAsset estao em
 * estados terminais (COMPLETED / CANCELLED), o arquivo pode ser removido
 * do MinIO pra liberar disco. O registro no DB fica com deletedFromStorageAt
 * marcado (nao apagamos pra manter historico das campanhas).
 */
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";

const TERMINAL = new Set(["COMPLETED", "CANCELLED"]);

/**
 * Verifica se a midia pode ser deletada do storage e deleta se puder.
 * Retorna true se deletou.
 */
export async function maybeCleanupMedia(mediaAssetId: string): Promise<boolean> {
  const media = await prisma.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    include: {
      campaigns: { select: { id: true, status: true } },
    },
  });
  if (!media) return false;
  if (media.deletedFromStorageAt) return false;

  const hasActive = media.campaigns.some((c) => !TERMINAL.has(c.status));
  if (hasActive) return false;

  try {
    await deleteObject(media.key);
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { deletedFromStorageAt: new Date() },
    });
    console.log(`[cleanup] media ${media.id} (${media.fileName}) removida do storage`);
    return true;
  } catch (err) {
    console.warn(`[cleanup] falha ao deletar ${media.key}:`, (err as Error).message);
    return false;
  }
}

/**
 * Verifica se todos os jobs da campanha ja terminaram. Se sim, marca
 * a campanha como COMPLETED e dispara o cleanup da midia.
 */
export async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const remaining = await prisma.messageJob.count({
    where: {
      campaignId,
      status: { in: ["PENDING", "SCHEDULED", "SENDING"] },
    },
  });
  if (remaining > 0) return;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, mediaAssetId: true },
  });
  if (!campaign) return;
  if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") return;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  console.log(`[cleanup] campaign ${campaignId} marcada como COMPLETED`);

  if (campaign.mediaAssetId) {
    await maybeCleanupMedia(campaign.mediaAssetId);
  }
}
