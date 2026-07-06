import { asc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { db } from "@/db";
import { accounts, instruments, setups, trades } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const rows = await db
    .select({
      id: trades.id,
      account: accounts.name,
      symbol: instruments.symbol,
      direction: trades.direction,
      status: trades.status,
      quantity: trades.quantity,
      entryTime: trades.entryTime,
      exitTime: trades.exitTime,
      avgEntryPrice: trades.avgEntryPrice,
      avgExitPrice: trades.avgExitPrice,
      stopPrice: trades.stopPrice,
      targetPrice: trades.targetPrice,
      fees: trades.fees,
      grossPnl: trades.grossPnl,
      netPnl: trades.netPnl,
      rMultiple: trades.rMultiple,
      setup: setups.name,
      rating: trades.rating,
      followedPlan: trades.followedPlan,
      notes: trades.notes,
    })
    .from(trades)
    .innerJoin(accounts, eq(trades.accountId, accounts.id))
    .innerJoin(instruments, eq(trades.instrumentId, instruments.id))
    .leftJoin(setups, eq(trades.setupId, setups.id))
    .where(eq(trades.userId, user.id))
    .orderBy(asc(trades.entryTime))
    .all();

  const csv = Papa.unparse(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-trades-export.csv"`,
    },
  });
}
