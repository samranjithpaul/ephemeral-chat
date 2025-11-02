import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;

let s3Client: S3Client | null = null;

if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_BUCKET_NAME) {
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });
  console.log("✓ AWS S3 client configured");
} else {
  console.warn("⚠ AWS S3 credentials not configured - file sharing will be unavailable");
}

export async function generateUploadUrl(
  filename: string,
  fileType: string,
  roomId: string
): Promise<{ uploadUrl: string; fileKey: string } | null> {
  if (!s3Client || !AWS_BUCKET_NAME) {
    throw new Error("S3 not configured");
  }

  const fileKey = `${roomId}/${uuidv4()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: fileKey,
    ContentType: fileType,
  });

  try {
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    return { uploadUrl, fileKey };
  } catch (error) {
    console.error("Error generating upload URL:", error);
    throw error;
  }
}

export async function generateDownloadUrl(
  fileKey: string
): Promise<string | null> {
  if (!s3Client || !AWS_BUCKET_NAME) {
    throw new Error("S3 not configured");
  }

  const command = new GetObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: fileKey,
  });

  try {
    const downloadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60, // 1 minute for viewing
    });

    return downloadUrl;
  } catch (error) {
    console.error("Error generating download URL:", error);
    throw error;
  }
}

export { s3Client };
