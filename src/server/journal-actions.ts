"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachments, journalEntries } from "@/db/schema";
import { requireUser } from "./auth";
import { saveAttachmentFile } from "./attachment-io";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface JournalSaveState {
  savedAt: string | null;
}

function getOrCreateEntry(userId: number, date: string) {
  const existing = db
    .select()
    .from(journalEntries)
    .where(
      and(eq(journalEntries.userId, userId), eq(journalEntries.date, date)),
    )
    .get();
  if (existing) return existing;
  return db
    .insert(journalEntries)
    .values({ userId, date })
    .returning()
    .get();
}

export async function saveJournalEntry(
  date: string,
  _prev: JournalSaveState,
  formData: FormData,
): Promise<JournalSaveState> {
  const user = await requireUser();
  if (!DATE_RE.test(date)) throw new Error("Invalid date");

  const optionalScore = z.coerce.number().min(1).max(5).optional();
  const data = {
    premarketPlan:
      z.string().trim().catch("").parse(formData.get("premarketPlan")) || null,
    review: z.string().trim().catch("").parse(formData.get("review")) || null,
    mood: optionalScore.parse(formData.get("mood") || undefined) ?? null,
    sleepQuality:
      optionalScore.parse(formData.get("sleepQuality") || undefined) ?? null,
  };

  const entry = getOrCreateEntry(user.id, date);
  db.update(journalEntries)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(journalEntries.id, entry.id))
    .run();

  revalidatePath("/journal");
  revalidatePath(`/journal/${date}`);
  return { savedAt: new Date().toISOString() };
}

/* ------------------------- day screenshots ------------------------- */

export async function addJournalAttachment(date: string, formData: FormData) {
  const user = await requireUser();
  if (!DATE_RE.test(date)) throw new Error("Invalid date");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const caption =
    z.string().trim().max(300).catch("").parse(formData.get("caption")) ||
    null;

  const entry = getOrCreateEntry(user.id, date);
  const fileName = await saveAttachmentFile(file, `day-${date}`);

  db.insert(attachments)
    .values({ journalEntryId: entry.id, filePath: fileName, caption })
    .run();

  revalidatePath(`/journal/${date}`);
}
