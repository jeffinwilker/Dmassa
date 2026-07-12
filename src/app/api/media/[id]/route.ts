import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { deleteObject } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const asset = await prisma.mediaAsset.findFirst({ where: { id, ownerId } });
  if (!asset) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  // Se estiver em uso por campanha, nao deleta
  const usedBy = await prisma.campaign.count({ where: { mediaAssetId: id } });
  if (usedBy > 0) {
    return NextResponse.json(
      { error: `midia em uso em ${usedBy} campanha(s)` },
      { status: 409 },
    );
  }

  // Deleta do S3 (best-effort) e do DB
  try {
    await deleteObject(asset.key);
  } catch (err) {
    console.warn("S3 delete failed:", (err as Error).message);
  }
  await prisma.mediaAsset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
