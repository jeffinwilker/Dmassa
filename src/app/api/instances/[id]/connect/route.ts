import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { evolutionClient, EvolutionError } from "@/lib/evolution/client";

export const dynamic = "force-dynamic";

/**
 * Gera/renova o QR code e devolve o estado atual da conexao.
 * O front chama isso ao abrir o modal de QR e a cada N segundos ate conectar.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  const instance = await prisma.instance.findFirst({ where: { id, ownerId } });
  if (!instance) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  const evo = evolutionClient();

  // Confere o estado da conexao.
  let stateStr: string | undefined;
  try {
    const s = await evo.connectionState(instance.evolutionInstance);
    stateStr = s.instance?.state ?? s.state;
  } catch (err) {
    if (err instanceof EvolutionError && err.status === 404) {
      return NextResponse.json({ error: "Instancia nao existe mais no Evolution" }, { status: 410 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const statusMap = {
    open: "CONNECTED",
    connecting: "CONNECTING",
    close: "DISCONNECTED",
    refused: "ERROR",
  } as const;
  const dbStatus = statusMap[stateStr as keyof typeof statusMap] ?? "DISCONNECTED";

  // Se ainda nao conectado, busca QR fresco.
  let qr: string | null = null;
  if (dbStatus !== "CONNECTED") {
    try {
      const q = await evo.connect(instance.evolutionInstance);
      qr = q.base64 ?? null;
    } catch (err) {
      console.warn("connect falhou:", err);
    }
  }

  const updated = await prisma.instance.update({
    where: { id },
    data: {
      status: dbStatus,
      lastQrCode: qr ?? instance.lastQrCode,
      lastConnectionAt: dbStatus === "CONNECTED" ? new Date() : instance.lastConnectionAt,
    },
  });

  return NextResponse.json({
    instance: updated,
    qrcode: qr,
    state: stateStr,
  });
}
