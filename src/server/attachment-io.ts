import fs from "node:fs";
import path from "node:path";

export const ATTACHMENTS_DIR = path.join(process.cwd(), "data", "attachments");

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MAX_BYTES = 8 * 1024 * 1024; // 8MB per screenshot

/**
 * Validates and writes an uploaded image to data/attachments.
 * Returns the generated file name (bare basename, as stored in the DB).
 */
export async function saveAttachmentFile(
  file: File,
  prefix: string,
): Promise<string> {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) throw new Error("Only PNG, JPEG, WebP, or GIF images.");
  if (file.size > MAX_BYTES) throw new Error("Image is larger than 8MB.");

  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  fs.writeFileSync(
    path.join(ATTACHMENTS_DIR, fileName),
    Buffer.from(await file.arrayBuffer()),
  );
  return fileName;
}
