import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq, gt, isNull, and, count } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@/db";
import {
  accounts,
  importBatches,
  journalEntries,
  sessions,
  setups,
  trades,
  users,
} from "@/db/schema";

const SESSION_COOKIE = "ledger_session";
const SESSION_DAYS = 30;

/* --------------------------- passwords ----------------------------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

/* ---------------------------- sessions ----------------------------- */

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await db.insert(sessions).values({ token, userId, expiresAt }).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token)).run();
  cookieStore.delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: number;
  email: string;
  name: string | null;
}

/** Cached per request — layout and page share one session lookup. */
export const getCurrentUser = cache(
  async (): Promise<CurrentUser | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const row = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.token, token),
          gt(sessions.expiresAt, new Date().toISOString()),
        ),
      )
      .get();
    return row ?? null;
  },
);

/** Page/layout guard — redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/* ------------------------ first-user data claim --------------------- */

/**
 * Rows created before auth existed have userId NULL. The first user to
 * register adopts them, so the original journal keeps its history.
 */
export async function claimOrphanData(userId: number) {
  const row = await db.select({ c: count() }).from(users).get();
  if ((row?.c ?? 0) !== 1) return;

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ userId })
      .where(isNull(accounts.userId))
      .run();
    await tx.update(trades).set({ userId }).where(isNull(trades.userId)).run();
    await tx.update(setups).set({ userId }).where(isNull(setups.userId)).run();
    await tx
      .update(journalEntries)
      .set({ userId })
      .where(isNull(journalEntries.userId))
      .run();
    await tx
      .update(importBatches)
      .set({ userId })
      .where(isNull(importBatches.userId))
      .run();
  });
}
