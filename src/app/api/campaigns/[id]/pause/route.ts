import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const campaign = await prisma.campaign.findFirst({ where: { id, ownerId } });
  if (!campaign) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  if (campaign.status !== "RUNNING") {
    return NextResponse.json(
      { error: `Nao pode pausar (status=${campaign.status})` },
      { status: 409 },
    );
  }
  await prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED", pausedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
