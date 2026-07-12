import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(40).trim(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "cor deve ser hex #rrggbb")
    .default("#6366f1"),
});

export async function GET() {
  const ownerId = await getOwnerId();
  const tags = await prisma.contactTag.findMany({
    where: { ownerId },
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true } } },
  });
  return NextResponse.json({
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      createdAt: t.createdAt,
      contactCount: t._count.contacts,
    })),
  });
}

export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.contactTag.findUnique({
    where: { ownerId_name: { ownerId, name: parsed.data.name } },
  });
  if (existing) {
    return NextResponse.json({ error: "Ja existe uma tag com esse nome" }, { status: 409 });
  }

  const tag = await prisma.contactTag.create({
    data: { ownerId, name: parsed.data.name, color: parsed.data.color },
  });
  return NextResponse.json({ tag }, { status: 201 });
}
