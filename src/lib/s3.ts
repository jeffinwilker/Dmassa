import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let _client: S3Client | undefined;

export function s3Client() {
  if (_client) return _client;
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) throw new Error("S3_ENDPOINT nao configurada");
  _client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
    forcePathStyle: true, // necessario pra MinIO
  });
  return _client;
}

export function s3Bucket() {
  return process.env.S3_BUCKET || "dmassa-media";
}

/** URL publica do objeto (usada pelo Evolution ao enviar a midia). */
export function s3PublicUrl(key: string) {
  const base = (process.env.S3_PUBLIC_URL || "").replace(/\/$/, "");
  return `${base}/${key}`;
}

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  const client = s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return s3PublicUrl(key);
}

export async function deleteObject(key: string) {
  const client = s3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
    }),
  );
}
