import { NextResponse } from "next/server";
import crypto from "node:crypto";
import type { MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/auth-owner";
import { uploadObject } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SIZE_MB = 90;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

const KIND_BY_MIME: Array<[RegExp, MediaKind]> = [
  [/^image\//, "IMAGE"],
  [/^video\//, "VIDEO"],
  [/^audio\//, "AUDIO"],
];

function detectKind(mime: string): MediaKind {
  for (const [re, kind] of KIND_BY_MIME) if (re.test(mime)) return kind;
  return "DOCUMENT";
}

function safeFilename(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

/**
 * POST multipart/form-data:
 *   - file: arquivo (max 90MB)
 */
export async function POST(req: Request) {
  const ownerId = await getOwnerId();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "form invalido" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `arquivo maior que ${MAX_SIZE_MB}MB` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const kind = detectKind(mime);
  const rand = crypto.randomBytes(6).toString("hex");
  const key = `${ownerId}/${kind.toLowerCase()}/${Date.now()}-${rand}-${safeFilename(file.name)}`;

  let url: string;
  try {
    url = await uploadObject(key, buffer, mime);
  } catch (err) {
    console.error("s3 upload failed:", err);
    return NextResponse.json(
      { error: `upload falhou: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      ownerId,
      kind,
      fileName: file.name,
      mimeType: mime,
      size: file.size,
      key,
      url,
    },
  });

  return NextResponse.json({ media: asset }, { status: 201 });
}
