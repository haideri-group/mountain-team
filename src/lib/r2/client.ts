import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// --- Config ---

function getR2Config() {
  return {
    accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID || "",
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || "",
    publicUrl: (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, ""),
  };
}

export function isR2Configured(): boolean {
  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = getR2Config();
  return !!(accountId && accessKeyId && secretAccessKey && bucketName && publicUrl);
}

export function getR2PublicUrl(): string {
  return getR2Config().publicUrl;
}

// --- S3 Client (singleton) ---

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_client) return _client;

  const { accountId, accessKeyId, secretAccessKey } = getR2Config();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 not configured");
  }

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });

  return _client;
}

// --- Upload ---

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { bucketName, publicUrl } = getR2Config();

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=86400",
    }),
  );

  return `${publicUrl}/${key}`;
}

// --- Delete ---

export async function deleteFromR2(key: string): Promise<void> {
  const { bucketName } = getR2Config();

  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}
