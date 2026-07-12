import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { evolutionClient, EvolutionError } from "@/lib/evolution/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const instance = await prisma.instance.findFirst({ where: { id, ownerId } });
  if (!instance) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  return NextResponse.json({ instance });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const instance = await prisma.instance.findFirst({ where: { id, ownerId } });
  if (!instance) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  const evo = evolutionClient();
  // Best-effort: se ja nao existe no Evolution, seguimos com a remocao local.
  try {
    await evo.logoutInstance(instance.evolutionInstance);
  } catch (err) {
    if (!(err instanceof EvolutionError) || err.status !== 404) {
      console.warn("logout falhou:", err);
    }
  }
  try {
    await evo.deleteInstance(instance.evolutionInstance);
  } catch (err) {
    if (!(err instanceof EvolutionError) || err.status !== 404) {
      console.warn("deleteInstance falhou:", err);
    }
  }

  await prisma.instance.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
