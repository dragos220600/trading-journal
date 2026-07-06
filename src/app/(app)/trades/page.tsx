import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { instruments, setups, tags, trades, tradeTags } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { TradesTable, type TradeRowData } from "@/components/trades-table";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const user = await requireUser();
  const rows = db
    .select({
      id: trades.id,
      entryTime: trades.entryTime,
      direction: trades.direction,
      quantity: trades.quantity,
      avgEntryPrice: trades.avgEntryPrice,
      avgExitPrice: trades.avgExitPrice,
      rMultiple: trades.rMultiple,
      netPnl: trades.netPnl,
      status: trades.status,
      symbol: instruments.symbol,
      tickSize: instruments.tickSize,
      setupName: setups.name,
    })
    .from(trades)
    .innerJoin(instruments, eq(trades.instrumentId, instruments.id))
    .leftJoin(setups, eq(trades.setupId, setups.id))
    .where(eq(trades.userId, user.id))
    .orderBy(desc(trades.entryTime))
    .all();

  const tagRows = db
    .select({ tradeId: tradeTags.tradeId, name: tags.name })
    .from(tradeTags)
    .innerJoin(tags, eq(tradeTags.tagId, tags.id))
    .innerJoin(trades, eq(tradeTags.tradeId, trades.id))
    .where(eq(trades.userId, user.id))
    .all();
  const tagsByTrade = new Map<number, string[]>();
  for (const { tradeId, name } of tagRows) {
    tagsByTrade.set(tradeId, [...(tagsByTrade.get(tradeId) ?? []), name]);
  }

  const tableRows: TradeRowData[] = rows.map((r) => ({
    ...r,
    tags: tagsByTrade.get(r.id) ?? [],
  }));

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-6xl">
      <header
        className="mb-6 flex flex-wrap items-end justify-between gap-4 reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div>
          <p className="eyebrow mb-2">02 · Execution log</p>
          <h1 className="text-3xl font-bold tracking-tight">Trades</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            {rows.length} total · filter by symbol, side, setup or tag.
          </p>
        </div>
        <Link
          href="/trades/new"
          className="btn-accent flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Plus size={14} aria-hidden /> Log Trade
        </Link>
      </header>

      <div className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
        <TradesTable rows={tableRows} />
      </div>
    </div>
  );
}
