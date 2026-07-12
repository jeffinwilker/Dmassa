import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(40).trim().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "cor deve ser hex #rrggbb")
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const tag = await prisma.contactTag.findFirst({ where: { id, ownerId } });
  if (!tag) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });

  // Se mudou o nome, checa colisao.
  if (parsed.data.name && parsed.data.name !== tag.name) {
    const dup = await prisma.contactTag.findUnique({
      where: { ownerId_name: { ownerId, name: parsed.data.name } },
    });
    if (dup) return NextResponse.json({ error: "Nome ja em uso" }, { status: 409 });
  }

  const updated = await prisma.contactTag.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ tag: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const tag = await prisma.contactTag.findFirst({
    where: { id, ownerId },
    include: { _count: { select: { contacts: true } } },
  });
  if (!tag) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  // Deletar tag remove os links (Cascade), mas nao os contatos.
  await prisma.contactTag.delete({ where: { id } });
  return NextResponse.json({ ok: true, unlinkedContacts: tag._count.contacts });
}
