import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  label: z.string().max(60).optional(),
  values: z.array(z.string().min(1).max(200)).min(1).max(200).optional(),
  description: z.string().max(300).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const existing = await prisma.spintaxVariable.findFirst({ where: { id, ownerId } });
  if (!existing) {
    // Nao permite editar variaveis de sistema
    return NextResponse.json({ error: "Variavel nao encontrada" }, { status: 404 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });

  const updated = await prisma.spintaxVariable.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ variable: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const existing = await prisma.spintaxVariable.findFirst({ where: { id, ownerId } });
  if (!existing) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });
  await prisma.spintaxVariable.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
