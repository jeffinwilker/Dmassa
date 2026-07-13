import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(200),
});

// Igual ao verify em login/route.ts — compat com hash scrypt legado
function verifyLegacyScrypt(pw: string, stored: string) {
  const [tag, saltHex, hashHex] = stored.split(":");
  if (tag !== "scrypt") return false;
  const derived = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  return derived.toString("hex") === hashHex;
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "dados invalidos" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!user) return NextResponse.json({ error: "usuario nao encontrado" }, { status: 404 });

  const ok = user.passwordHash.startsWith("scrypt:")
    ? verifyLegacyScrypt(parsed.data.currentPassword, user.passwordHash)
    : await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({ error: "senha atual incorreta" }, { status: 401 });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  return NextResponse.json({ ok: true });
}
