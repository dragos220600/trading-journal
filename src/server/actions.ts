"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  accounts,
  attachments,
  executions,
  instruments,
  setups,
  trades,
  tradeTags,
} from "@/db/schema";
import { computeTradeMetrics } from "@/lib/trade-math";
import { requireUser } from "./auth";
import { ATTACHMENTS_DIR, saveAttachmentFile } from "./attachment-io";
import fs from "node:fs";
import path from "node:path";

/* ----------------------------- accounts ----------------------------- */

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  broker: z.string().trim().optional(),
  initialBalance: z.coerce.number().default(0),
  rValue: z.coerce.number().positive().optional(),
});

export async function createAccount(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => v !== ""),
  );
  const data = accountSchema.parse(raw);
  db.insert(accounts)
    .values({
      userId: user.id,
      name: data.name,
      broker: data.broker || null,
      initialBalance: data.initialBalance,
      rValue: data.rValue ?? null,
    })
    .run();
  revalidatePath("/settings");
}

/**
 * Sets the account's fixed $-per-R and recomputes the R-multiple of every
 * trade on that account. Clearing the value falls back to stop-based R.
 */
export async function updateAccountR(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const rawValue = String(formData.get("rValue") ?? "").trim();
  const rValue =
    rawValue === "" ? null : z.coerce.number().positive().parse(rawValue);

  const owned = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
    .get();
  if (!owned) throw new Error("Account not found");

  db.transaction(() => {
    db.update(accounts).set({ rValue }).where(eq(accounts.id, id)).run();

    const accountTrades = db
      .select({
        id: trades.id,
        netPnl: trades.netPnl,
        plannedRiskAmount: trades.plannedRiskAmount,
      })
      .from(trades)
      .where(eq(trades.accountId, id))
      .all();

    for (const trade of accountTrades) {
      let rMultiple: number | null = null;
      if (trade.netPnl != null) {
        if (rValue != null) {
          rMultiple = trade.netPnl / rValue;
        } else if (
          trade.plannedRiskAmount != null &&
          trade.plannedRiskAmount > 0
        ) {
          rMultiple = trade.netPnl / trade.plannedRiskAmount;
        }
      }
      db.update(trades)
        .set({ rMultiple })
        .where(eq(trades.id, trade.id))
        .run();
    }
  });

  revalidatePath("/settings");
  revalidatePath("/trades");
  revalidatePath("/analytics");
  revalidatePath("/");
}

/** Prop-firm guardrail rules — all optional, empty clears a rule. */
export async function updateAccountRules(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const owned = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
    .get();
  if (!owned) throw new Error("Account not found");

  const optional = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw === "" ? null : z.coerce.number().positive().parse(raw);
  };
  const initialBalance = z.coerce
    .number()
    .min(0)
    .parse(formData.get("initialBalance"));

  db.update(accounts)
    .set({
      initialBalance,
      trailingDrawdown: optional("trailingDrawdown"),
      drawdownFreezeAt: optional("drawdownFreezeAt"),
      profitTarget: optional("profitTarget"),
      dailyLossLimit: optional("dailyLossLimit"),
    })
    .where(eq(accounts.id, id))
    .run();

  revalidatePath("/settings");
  revalidatePath("/");
}

export async function renameAccount(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const name = z.string().trim().min(1).parse(formData.get("name"));
  db.update(accounts)
    .set({ name })
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
    .run();
  revalidatePath("/settings");
}

export async function toggleAccountArchived(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const account = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
    .get();
  if (!account) throw new Error("Account not found");
  db.update(accounts)
    .set({ isArchived: !account.isArchived })
    .where(eq(accounts.id, id))
    .run();
  revalidatePath("/settings");
}

/* ---------------------------- instruments --------------------------- */

const instrumentSchema = z.object({
  symbol: z.string().trim().min(1).toUpperCase(),
  name: z.string().trim().optional(),
  assetClass: z
    .enum(["futures", "forex", "stock", "option", "crypto"])
    .default("futures"),
  tickSize: z.coerce.number().positive(),
  tickValue: z.coerce.number().positive(),
});

export async function createInstrument(formData: FormData) {
  const data = instrumentSchema.parse(Object.fromEntries(formData));
  const pointValue = data.tickValue / data.tickSize;
  db.insert(instruments)
    .values({
      symbol: data.symbol,
      name: data.name || null,
      assetClass: data.assetClass,
      tickSize: data.tickSize,
      tickValue: data.tickValue,
      pointValue,
    })
    .run();
  revalidatePath("/settings");
}

/* ------------------------------ setups ------------------------------ */

const setupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  rules: z.string().trim().optional(),
});

export async function createSetup(formData: FormData) {
  const user = await requireUser();
  const data = setupSchema.parse(Object.fromEntries(formData));
  db.insert(setups)
    .values({
      userId: user.id,
      name: data.name,
      description: data.description || null,
      rules: data.rules || null,
    })
    .run();
  revalidatePath("/playbook");
  revalidatePath("/trades/new");
}

/**
 * Deletes a setup. Trades that used it are kept — they just lose the
 * setup label (their setupId becomes null).
 */
export async function deleteSetup(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const owned = db
    .select({ id: setups.id })
    .from(setups)
    .where(and(eq(setups.id, id), eq(setups.userId, user.id)))
    .get();
  if (!owned) throw new Error("Setup not found");
  db.transaction(() => {
    db.update(trades)
      .set({ setupId: null })
      .where(eq(trades.setupId, id))
      .run();
    db.delete(setups).where(eq(setups.id, id)).run();
  });
  revalidatePath("/playbook");
  revalidatePath("/trades");
  revalidatePath("/analytics");
  revalidatePath("/");
}

/* ------------------------------ trades ------------------------------ */

const tradeSchema = z.object({
  accountId: z.coerce.number(),
  instrumentId: z.coerce.number(),
  setupId: z.coerce.number().optional(),
  direction: z.enum(["long", "short"]),
  quantity: z.coerce.number().positive(),
  entryTime: z.string().min(1, "Entry time is required"),
  exitTime: z.string().optional(),
  avgEntryPrice: z.coerce.number(),
  avgExitPrice: z.coerce.number().optional(),
  stopPrice: z.coerce.number().optional(),
  targetPrice: z.coerce.number().optional(),
  fees: z.coerce.number().default(0),
  rating: z.coerce.number().min(1).max(5).optional(),
  followedPlan: z.enum(["yes", "no"]).optional(),
  notes: z.string().trim().optional(),
});

function parseTradeForm(formData: FormData) {
  const raw: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "tagIds") continue; // multi-value, handled separately
    if (value !== "") raw[key] = value; // empty inputs = field not provided
  }
  const data = tradeSchema.parse(raw);
  const tagIds = formData
    .getAll("tagIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  return { data, tagIds };
}

function tradeRowFromForm(userId: number, data: z.infer<typeof tradeSchema>) {
  const instrument = db
    .select()
    .from(instruments)
    .where(eq(instruments.id, data.instrumentId))
    .get();
  if (!instrument) throw new Error("Instrument not found");

  // The account (and setup, if any) must belong to the signed-in user
  const account = db
    .select({ rValue: accounts.rValue })
    .from(accounts)
    .where(and(eq(accounts.id, data.accountId), eq(accounts.userId, userId)))
    .get();
  if (!account) throw new Error("Account not found");
  if (data.setupId != null) {
    const setup = db
      .select({ id: setups.id })
      .from(setups)
      .where(and(eq(setups.id, data.setupId), eq(setups.userId, userId)))
      .get();
    if (!setup) throw new Error("Setup not found");
  }

  const metrics = computeTradeMetrics({
    direction: data.direction,
    quantity: data.quantity,
    avgEntryPrice: data.avgEntryPrice,
    avgExitPrice: data.avgExitPrice ?? null,
    stopPrice: data.stopPrice ?? null,
    pointValue: instrument.pointValue ?? 1,
    fees: data.fees,
  });

  // Account-level fixed $/R takes precedence over stop-based R
  const rMultiple =
    account.rValue != null && metrics.netPnl != null
      ? metrics.netPnl / account.rValue
      : metrics.rMultiple;

  return {
    userId,
    accountId: data.accountId,
    instrumentId: data.instrumentId,
    setupId: data.setupId ?? null,
    direction: data.direction,
    status: (data.avgExitPrice != null ? "closed" : "open") as
      | "open"
      | "closed",
    entryTime: data.entryTime,
    exitTime: data.exitTime || null,
    quantity: data.quantity,
    avgEntryPrice: data.avgEntryPrice,
    avgExitPrice: data.avgExitPrice ?? null,
    stopPrice: data.stopPrice ?? null,
    targetPrice: data.targetPrice ?? null,
    plannedRiskAmount: metrics.plannedRiskAmount,
    fees: data.fees,
    grossPnl: metrics.grossPnl,
    netPnl: metrics.netPnl,
    rMultiple,
    rating: data.rating ?? null,
    followedPlan:
      data.followedPlan === undefined ? null : data.followedPlan === "yes",
    notes: data.notes || null,
    updatedAt: new Date().toISOString(),
  };
}

/** Manual trades get one entry fill and (if closed) one exit fill. */
function writeManualExecutions(
  tradeId: number,
  row: ReturnType<typeof tradeRowFromForm>,
) {
  db.delete(executions).where(eq(executions.tradeId, tradeId)).run();
  const entrySide = row.direction === "long" ? "buy" : "sell";
  db.insert(executions)
    .values({
      tradeId,
      side: entrySide,
      price: row.avgEntryPrice,
      quantity: row.quantity,
      time: row.entryTime,
    })
    .run();
  if (row.avgExitPrice != null) {
    db.insert(executions)
      .values({
        tradeId,
        side: entrySide === "buy" ? "sell" : "buy",
        price: row.avgExitPrice,
        quantity: row.quantity,
        time: row.exitTime ?? row.entryTime,
      })
      .run();
  }
}

/** Screenshots attached in the trade form (name="screenshots"). */
async function saveFormScreenshots(tradeId: number, formData: FormData) {
  const files = formData
    .getAll("screenshots")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const captions = formData.getAll("screenshotCaptions").map(String);

  for (const [index, file] of files.entries()) {
    const fileName = await saveAttachmentFile(file, `trade-${tradeId}`);
    db.insert(attachments)
      .values({
        tradeId,
        filePath: fileName,
        caption: captions[index]?.trim() || null,
      })
      .run();
  }
}

function writeTradeTags(tradeId: number, tagIds: number[]) {
  db.delete(tradeTags).where(eq(tradeTags.tradeId, tradeId)).run();
  if (tagIds.length > 0) {
    db.insert(tradeTags)
      .values(tagIds.map((tagId) => ({ tradeId, tagId })))
      .run();
  }
}

export async function createTrade(formData: FormData) {
  const user = await requireUser();
  const { data, tagIds } = parseTradeForm(formData);
  const row = tradeRowFromForm(user.id, data);

  const tradeId = db.transaction(() => {
    const inserted = db.insert(trades).values(row).returning().get();
    writeManualExecutions(inserted.id, row);
    writeTradeTags(inserted.id, tagIds);
    return inserted.id;
  });
  await saveFormScreenshots(tradeId, formData);

  revalidatePath("/trades");
  revalidatePath("/");
  redirect(`/trades/${tradeId}`);
}

export async function updateTrade(tradeId: number, formData: FormData) {
  const user = await requireUser();
  const owned = db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, user.id)))
    .get();
  if (!owned) throw new Error("Trade not found");

  const { data, tagIds } = parseTradeForm(formData);
  const row = tradeRowFromForm(user.id, data);

  db.transaction(() => {
    db.update(trades).set(row).where(eq(trades.id, tradeId)).run();
    writeManualExecutions(tradeId, row);
    writeTradeTags(tradeId, tagIds);
  });
  await saveFormScreenshots(tradeId, formData);

  revalidatePath("/trades");
  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/");
  redirect(`/trades/${tradeId}`);
}

export async function deleteTrade(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const owned = db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, user.id)))
    .get();
  if (!owned) throw new Error("Trade not found");

  // The DB cascade removes attachment rows — unlink their files first
  const tradeAttachments = db
    .select({ filePath: attachments.filePath })
    .from(attachments)
    .where(eq(attachments.tradeId, id))
    .all();
  for (const { filePath } of tradeAttachments) {
    const target = path.resolve(ATTACHMENTS_DIR, filePath);
    if (target.startsWith(ATTACHMENTS_DIR) && fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }

  db.delete(trades).where(eq(trades.id, id)).run();
  revalidatePath("/trades");
  revalidatePath("/");
  redirect("/trades");
}
