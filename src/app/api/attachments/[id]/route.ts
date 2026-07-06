import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { attachments, journalEntries, trades } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";

const ATTACHMENTS_DIR = path.join(process.cwd(), "data", "attachments");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isFinite(attachmentId)) {
    return new Response("Not found", { status: 404 });
  }

  const row = db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .get();
  if (!row) return new Response("Not found", { status: 404 });

  // Only the owner of the parent trade / journal entry may read it
  const owned =
    row.tradeId != null
      ? db
          .select({ id: trades.id })
          .from(trades)
          .where(and(eq(trades.id, row.tradeId), eq(trades.userId, user.id)))
          .get()
      : row.journalEntryId != null
        ? db
            .select({ id: journalEntries.id })
            .from(journalEntries)
            .where(
              and(
                eq(journalEntries.id, row.journalEntryId),
                eq(journalEntries.userId, user.id),
              ),
            )
            .get()
        : null;
  if (!owned) return new Response("Not found", { status: 404 });

  const target = path.resolve(ATTACHMENTS_DIR, row.filePath);
  if (!target.startsWith(ATTACHMENTS_DIR) || !fs.existsSync(target)) {
    return new Response("Not found", { status: 404 });
  }

  const contentType =
    CONTENT_TYPES[path.extname(target).toLowerCase()] ??
    "application/octet-stream";

  return new Response(new Uint8Array(fs.readFileSync(target)), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
