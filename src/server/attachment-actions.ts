"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { attachments, journalEntries, trades } from "@/db/schema";
import { requireUser } from "./auth";
import { ATTACHMENTS_DIR, saveAttachmentFile } from "./attachment-io";

export async function addAttachment(tradeId: number, formData: FormData) {
  const user = await requireUser();
  const owned = db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, user.id)))
    .get();
  if (!owned) throw new Error("Trade not found");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const caption =
    z.string().trim().max(300).catch("").parse(formData.get("caption")) ||
    null;

  const fileName = await saveAttachmentFile(file, `trade-${tradeId}`);
  db.insert(attachments)
    .values({ tradeId, filePath: fileName, caption })
    .run();

  revalidatePath(`/trades/${tradeId}`);
}

export async function deleteAttachment(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const row = db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .get();
  if (!row) return;

  // Ownership via the attachment's parent (trade or journal entry)
  if (row.tradeId != null) {
    const owned = db
      .select({ id: trades.id })
      .from(trades)
      .where(and(eq(trades.id, row.tradeId), eq(trades.userId, user.id)))
      .get();
    if (!owned) throw new Error("Not found");
  } else if (row.journalEntryId != null) {
    const owned = db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.id, row.journalEntryId),
          eq(journalEntries.userId, user.id),
        ),
      )
      .get();
    if (!owned) throw new Error("Not found");
  }

  db.delete(attachments).where(eq(attachments.id, id)).run();

  // filePath is a bare generated basename, but resolve defensively anyway
  const target = path.resolve(ATTACHMENTS_DIR, row.filePath);
  if (target.startsWith(ATTACHMENTS_DIR) && fs.existsSync(target)) {
    fs.unlinkSync(target);
  }

  if (row.tradeId != null) revalidatePath(`/trades/${row.tradeId}`);
  if (row.journalEntryId != null) {
    const entry = db
      .select({ date: journalEntries.date })
      .from(journalEntries)
      .where(eq(journalEntries.id, row.journalEntryId))
      .get();
    if (entry) revalidatePath(`/journal/${entry.date}`);
  }
}
