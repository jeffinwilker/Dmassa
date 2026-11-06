import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { evolutionClient, EvolutionError } from "@/lib/evolution/client";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    tier: z.enum(["STANDARD", "ENTERPRISE"]).optional(),
    weight: z.number().int().min(1).max(100).optional(),
    maxPerDay: z.number().int().min(1).max(10000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Nada para atualizar" });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const instance = await prisma.instance.findFirst({ where: { id, ownerId } });
  if (!instance) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await prisma.instance.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ instance: updated });
}

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
