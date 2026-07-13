import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";

export const dynamic = "force-dynamic";

/** Remove da blacklist (contato volta a receber mensagens). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const contact = await prisma.contact.findFirst({ where: { id, ownerId } });
  if (!contact) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });

  await prisma.contact.update({
    where: { id },
    data: {
      isBlacklisted: false,
      blacklistedAt: null,
      blacklistReason: null,
    },
  });
  return NextResponse.json({ ok: true });
}
