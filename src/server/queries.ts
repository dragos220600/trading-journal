import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, instruments, setups, tags } from "@/db/schema";

/** Options needed by the trade entry/edit form, scoped to the user. */
export function getTradeFormData(userId: number) {
  const accountRows = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)))
    .orderBy(asc(accounts.name))
    .all();

  const instrumentRows = db
    .select()
    .from(instruments)
    .orderBy(asc(instruments.symbol))
    .all();

  const setupRows = db
    .select()
    .from(setups)
    .where(and(eq(setups.userId, userId), eq(setups.isArchived, false)))
    .orderBy(asc(setups.name))
    .all();

  const tagRows = db.select().from(tags).orderBy(asc(tags.name)).all();

  return {
    accounts: accountRows.map((a) => ({
      id: a.id,
      label: a.name,
      rValue: a.rValue,
    })),
    instruments: instrumentRows.map((i) => ({
      id: i.id,
      symbol: i.symbol,
      name: i.name,
      tickSize: i.tickSize,
      pointValue: i.pointValue,
    })),
    setups: setupRows.map((s) => ({ id: s.id, label: s.name })),
    tags: tagRows.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
    })),
  };
}
