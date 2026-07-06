"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  accounts,
  executions,
  importBatches,
  instruments,
  trades,
} from "@/db/schema";
import { computeTradeMetrics } from "@/lib/trade-math";
import { requireUser } from "./auth";
import {
  buildTrades,
  parseTradovateCsv,
  splitManualOverlaps,
} from "./import/tradovate";

export interface ImportState {
  status: "idle" | "error" | "success";
  messages: string[];
  created?: number;
  openPositions?: number;
  duplicates?: number;
  skippedRows?: number;
  newAccounts?: string[];
}

export async function importTradovateCsv(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", messages: ["Choose a CSV file to import."] };
  }
  const feePerSide = z.coerce
    .number()
    .min(0)
    .catch(0)
    .parse(formData.get("feePerSide"));

  const text = await file.text();
  const parsed = parseTradovateCsv(text);

  if (parsed.fills.length === 0) {
    return {
      status: "error",
      messages:
        parsed.warnings.length > 0
          ? parsed.warnings
          : ["No filled orders found in the file."],
    };
  }

  // Dedup: skip fills whose order ID this user already imported
  const existingIds = new Set(
    db
      .select({ id: executions.externalId })
      .from(executions)
      .innerJoin(trades, eq(executions.tradeId, trades.id))
      .where(
        and(isNotNull(executions.externalId), eq(trades.userId, user.id)),
      )
      .all()
      .map((r) => r.id!),
  );
  const freshFills = parsed.fills.filter(
    (f) => !f.externalId || !existingIds.has(f.externalId),
  );
  const duplicates = parsed.fills.length - freshFills.length;

  if (freshFills.length === 0) {
    return {
      status: "error",
      messages: [
        `All ${duplicates} filled orders in this file were already imported.`,
      ],
    };
  }

  const warnings = [...parsed.warnings];

  // Overlap protection: fills that look like trades logged by hand
  // (manual executions have no broker order ID to dedup on)
  const manualExecutions = db
    .select({
      accountId: trades.accountId,
      root: instruments.symbol,
      side: executions.side,
      price: executions.price,
      time: executions.time,
      tickSize: instruments.tickSize,
    })
    .from(executions)
    .innerJoin(trades, eq(executions.tradeId, trades.id))
    .innerJoin(instruments, eq(trades.instrumentId, instruments.id))
    .where(and(isNull(executions.externalId), eq(trades.userId, user.id)))
    .all();
  const accountIdByName = new Map(
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .all()
      .map((a) => [a.name, a.id] as const),
  );
  const { kept, skipped: manualOverlaps } = splitManualOverlaps(
    freshFills,
    manualExecutions,
    accountIdByName,
  );
  if (manualOverlaps.length > 0) {
    warnings.push(
      `${manualOverlaps.length} fill(s) skipped — they match trades you logged ` +
        `manually (same account, symbol, side, price and time ±90s): ` +
        manualOverlaps
          .slice(0, 5)
          .map((f) => `${f.root} ${f.side} ${f.quantity} @ ${f.price}`)
          .join(", ") +
        (manualOverlaps.length > 5 ? ", …" : ""),
    );
  }
  if (kept.length === 0) {
    return {
      status: "error",
      messages: [
        ...warnings,
        "Nothing new to import — every fill was either already imported or matches a manually-logged trade.",
      ],
    };
  }

  const built = buildTrades(kept);

  // Map contract roots to instruments
  const instrumentRows = db.select().from(instruments).all();
  const instrumentBySymbol = new Map(
    instrumentRows.map((i) => [i.symbol.toUpperCase(), i]),
  );
  const unknownRoots = [
    ...new Set(
      built
        .map((t) => t.root)
        .filter((root) => !instrumentBySymbol.has(root)),
    ),
  ];
  if (unknownRoots.length > 0) {
    warnings.push(
      `Unknown instrument(s): ${unknownRoots.join(", ")} — their trades were skipped. ` +
        `Add them in Settings (with tick size/value) and import again.`,
    );
  }
  const importable = built.filter((t) => instrumentBySymbol.has(t.root));
  if (importable.length === 0) {
    const parts = ["No importable trades found."];
    if (duplicates > 0) {
      parts.push(`${duplicates} duplicate fill(s) were skipped.`);
    }
    return { status: "error", messages: [...warnings, parts.join(" ")] };
  }

  // Map account names, creating unseen ones (prop traders run many)
  const accountRows = db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, user.id))
    .all();
  const accountByName = new Map(accountRows.map((a) => [a.name, a]));
  const newAccounts: string[] = [];

  db.transaction(() => {
    for (const name of new Set(importable.map((t) => t.account))) {
      if (!accountByName.has(name)) {
        const inserted = db
          .insert(accounts)
          .values({ userId: user.id, name, broker: "Tradovate" })
          .returning()
          .get();
        accountByName.set(name, inserted);
        newAccounts.push(name);
      }
    }

    const batch = db
      .insert(importBatches)
      .values({
        userId: user.id,
        source: "tradovate",
        fileName: file.name,
        tradeCount: importable.length,
      })
      .returning()
      .get();

    for (const trade of importable) {
      const instrument = instrumentBySymbol.get(trade.root)!;
      const account = accountByName.get(trade.account)!;
      const sideCount = trade.executions.reduce((s, e) => s + e.quantity, 0);
      const fees = feePerSide * sideCount;

      const metrics = computeTradeMetrics({
        direction: trade.direction,
        quantity: trade.quantity,
        avgEntryPrice: trade.avgEntryPrice,
        avgExitPrice: trade.avgExitPrice,
        stopPrice: null,
        pointValue: instrument.pointValue ?? 1,
        fees,
      });

      // Account-level fixed $/R fills the R-multiple on import
      const rMultiple =
        account.rValue != null && metrics.netPnl != null
          ? metrics.netPnl / account.rValue
          : null;

      const inserted = db
        .insert(trades)
        .values({
          userId: user.id,
          accountId: account.id,
          instrumentId: instrument.id,
          direction: trade.direction,
          status: trade.status,
          entryTime: trade.entryTime,
          exitTime: trade.exitTime,
          quantity: trade.quantity,
          avgEntryPrice: trade.avgEntryPrice,
          avgExitPrice: trade.avgExitPrice,
          fees,
          grossPnl: metrics.grossPnl,
          netPnl: metrics.netPnl,
          rMultiple,
          importBatchId: batch.id,
        })
        .returning()
        .get();

      for (const execution of trade.executions) {
        db.insert(executions)
          .values({
            tradeId: inserted.id,
            side: execution.side,
            price: execution.price,
            quantity: execution.quantity,
            time: execution.time,
            fee: feePerSide * execution.quantity,
            externalId: execution.externalId,
          })
          .run();
      }
    }

  });

  revalidatePath("/trades");
  revalidatePath("/import");
  revalidatePath("/");

  const openPositions = importable.filter((t) => t.status === "open").length;
  if (openPositions > 0) {
    warnings.push(
      `${openPositions} position(s) were still open at the end of the file. ` +
        `If you closed them later, import the next export to complete them.`,
    );
  }
  if (parsed.skippedRows > 0) {
    warnings.push(
      `${parsed.skippedRows} row(s) skipped (canceled/rejected/unfilled orders).`,
    );
  }

  return {
    status: "success",
    messages: warnings,
    created: importable.length,
    openPositions,
    duplicates,
    skippedRows: parsed.skippedRows,
    newAccounts,
  };
}

export async function undoImportBatch(formData: FormData) {
  const user = await requireUser();
  const id = z.coerce.number().parse(formData.get("id"));
  const owned = db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(and(eq(importBatches.id, id), eq(importBatches.userId, user.id)))
    .get();
  if (!owned) throw new Error("Import batch not found");
  db.transaction(() => {
    const batchTrades = db
      .select({ id: trades.id })
      .from(trades)
      .where(eq(trades.importBatchId, id))
      .all();
    if (batchTrades.length > 0) {
      db.delete(trades).where(
        inArray(
          trades.id,
          batchTrades.map((t) => t.id),
        ),
      ).run();
    }
    db.delete(importBatches).where(eq(importBatches.id, id)).run();
  });
  revalidatePath("/trades");
  revalidatePath("/import");
  revalidatePath("/");
}
