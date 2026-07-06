"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachments, journalEntries, trades } from "@/db/schema";
import { requireUser } from "./auth";
import { deleteAttachmentFile, saveAttachmentFile } from "./attachment-io";

export async function addAttachment(tradeId: number, formData: FormData) {
  const user = await requireUser();
  const owned = await db
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

  const filePath = await saveAttachmentFile(file, `trade-${tradeId}`);
  await db.insert(attachments).values({ tradeId, filePath, caption }).run();

  revalidatePath(`/trades/${tradeId}`);
}

export async function deleteAttachment(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const row = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .get();
  if (!row) return;

  // Ownership via the attachment's parent (trade or journal entry)
  if (row.tradeId != null) {
    const owned = await db
      .select({ id: trades.id })
      .from(trades)
      .where(and(eq(trades.id, row.tradeId), eq(trades.userId, user.id)))
      .get();
    if (!owned) throw new Error("Not found");
  } else if (row.journalEntryId != null) {
    const owned = await db
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

  await db.delete(attachments).where(eq(attachments.id, id)).run();
  await deleteAttachmentFile(row.filePath);

  if (row.tradeId != null) revalidatePath(`/trades/${row.tradeId}`);
  if (row.journalEntryId != null) {
    const entry = await db
      .select({ date: journalEntries.date })
      .from(journalEntries)
      .where(eq(journalEntries.id, row.journalEntryId))
      .get();
    if (entry) revalidatePath(`/journal/${entry.date}`);
  }
}
