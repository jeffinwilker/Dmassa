import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

const nameRe = /^[a-z][a-z0-9_]{1,39}$/;

const createSchema = z.object({
  name: z.string().min(2).max(40).regex(nameRe, "use snake_case: a-z, 0-9, _"),
  label: z.string().max(60).optional(),
  values: z.array(z.string().min(1).max(200)).min(1).max(200),
  description: z.string().max(300).optional(),
});

export async function GET() {
  const ownerId = await getOwnerId();
  const rows = await prisma.spintaxVariable.findMany({
    where: { OR: [{ ownerId }, { ownerId: null }] },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ variables: rows });
}

export async function POST(req: Request) {
  const ownerId = await getOwnerId();
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Conflito de nome dentro do owner OU com uma variavel de sistema.
  const conflict = await prisma.spintaxVariable.findFirst({
    where: {
      name: parsed.data.name,
      OR: [{ ownerId }, { ownerId: null }],
    },
  });
  if (conflict) {
    return NextResponse.json(
      {
        error: conflict.isSystem
          ? "Ja existe uma variavel de sistema com esse nome"
          : "Voce ja tem uma variavel com esse nome",
      },
      { status: 409 },
    );
  }

  const created = await prisma.spintaxVariable.create({
    data: {
      ownerId,
      name: parsed.data.name,
      label: parsed.data.label,
      values: parsed.data.values,
      description: parsed.data.description,
      isSystem: false,
    },
  });
  return NextResponse.json({ variable: created }, { status: 201 });
}
