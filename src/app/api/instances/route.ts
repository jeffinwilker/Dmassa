import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { evolutionClient, EvolutionError } from "@/lib/evolution/client";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  tier: z.enum(["STANDARD", "ENTERPRISE"]).default("STANDARD"),
  weight: z.number().int().min(1).max(100).default(1),
  maxPerDay: z.number().int().min(1).max(10000).default(500),
});

/** Converte um nome amigavel em identificador seguro pro Evolution. */
function slugifyInstanceName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function GET() {
  const ownerId = await getOwnerId();
  const instances = await prisma.instance.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ instances });
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
  const data = parsed.data;

  // Gera identificador unico da instancia no Evolution.
  const base = slugifyInstanceName(data.name) || "chip";
  let evolutionInstance = base;
  let n = 1;
  while (await prisma.instance.findUnique({ where: { evolutionInstance } })) {
    n += 1;
    evolutionInstance = `${base}-${n}`;
  }

  const evo = evolutionClient();
  const webhookUrl =
    process.env.WEBHOOK_URL ?? "http://host.docker.internal:3000/api/webhooks/evolution";

  let created;
  try {
    created = await evo.createInstance({
      instanceName: evolutionInstance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhookUrl,
      webhookByEvents: false,
      events: [
        "QRCODE_UPDATED",
        "CONNECTION_UPDATE",
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "SEND_MESSAGE",
      ],
    });
  } catch (err) {
    if (err instanceof EvolutionError) {
      return NextResponse.json(
        { error: `Falha ao criar no Evolution: ${err.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const apiKey =
    typeof created.hash === "string" ? created.hash : created.hash?.apikey ?? undefined;

  const instance = await prisma.instance.create({
    data: {
      ownerId,
      name: data.name,
      evolutionInstance,
      apiKey,
      tier: data.tier,
      weight: data.weight,
      maxPerDay: data.maxPerDay,
      status: "CONNECTING",
      lastQrCode: created.qrcode?.base64 ?? null,
    },
  });

  return NextResponse.json({ instance, qrcode: created.qrcode ?? null }, { status: 201 });
}
