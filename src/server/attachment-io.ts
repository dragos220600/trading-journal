import { del, put } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";

export const ATTACHMENTS_DIR = path.join(process.cwd(), "data", "attachments");

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// Vercel serverless caps request bodies around 4.5MB
const MAX_BYTES = 4 * 1024 * 1024;

const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Validates and stores an uploaded image. On Vercel (BLOB_READ_WRITE_TOKEN
 * set) it goes to Vercel Blob and the returned value is the blob URL;
 * locally it's written to data/attachments and the value is the bare
 * file name. Both forms are stored in attachments.filePath.
 */
export async function saveAttachmentFile(
  file: File,
  prefix: string,
): Promise<string> {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) throw new Error("Only PNG, JPEG, WebP, or GIF images.");
  if (file.size > MAX_BYTES) throw new Error("Image is larger than 4MB.");

  const fileName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;

  if (blobEnabled()) {
    const blob = await put(`attachments/${fileName}`, file, {
      access: "public",
      contentType: file.type,
    });
    return blob.url;
  }

  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ATTACHMENTS_DIR, fileName),
    Buffer.from(await file.arrayBuffer()),
  );
  return fileName;
}

/** Removes the stored image for an attachments.filePath value. */
export async function deleteAttachmentFile(filePath: string): Promise<void> {
  if (filePath.startsWith("http")) {
    try {
      await del(filePath);
    } catch {
      // blob already gone — nothing to do
    }
    return;
  }
  const target = path.resolve(ATTACHMENTS_DIR, filePath);
  if (target.startsWith(ATTACHMENTS_DIR) && fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
}
