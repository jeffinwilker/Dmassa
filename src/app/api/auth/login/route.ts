import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Compat com o seed antigo baseado em scrypt (formato "scrypt:salt:hash").
// Se um dia trocarmos para so bcrypt, apagar.
function verifyLegacyScrypt(pw: string, stored: string) {
  const [tag, saltHex, hashHex] = stored.split(":");
  if (tag !== "scrypt") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("node:crypto") as typeof import("node:crypto");
    const derived = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
    return derived.toString("hex") === hashHex;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    // Delay pequeno pra dificultar enumeracao.
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
  }

  const ok = user.passwordHash.startsWith("scrypt:")
    ? verifyLegacyScrypt(password, user.passwordHash)
    : await bcrypt.compare(password, user.passwordHash);

  if (!ok) {
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name ?? undefined;
  session.role = user.role;
  await session.save();

  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
