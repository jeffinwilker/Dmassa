import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

/**
 * Retomar campanha pausada: apenas muda status. Os jobs que ficaram na fila
 * BullMQ continuam programados; os que estao PENDING/SCHEDULED serao processados
 * quando dispararem (o worker checa status e ignora se PAUSED).
 * Se voce quer re-enfileirar novos contatos que apareceram, chame POST /start.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const campaign = await prisma.campaign.findFirst({ where: { id, ownerId } });
  if (!campaign) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  if (campaign.status !== "PAUSED") {
    return NextResponse.json(
      { error: `Nao pode retomar (status=${campaign.status})` },
      { status: 409 },
    );
  }
  await prisma.campaign.update({
    where: { id },
    data: { status: "RUNNING", pausedAt: null },
  });
  return NextResponse.json({ ok: true });
}
