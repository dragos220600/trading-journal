"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  formatDate,
  formatPrice,
  formatR,
  formatSignedMoney,
  pnlColor,
} from "@/lib/format";
import { tradeOutcome } from "@/lib/outcome";
import { cn } from "@/lib/utils";

export interface TradeRowData {
  id: number;
  entryTime: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  rMultiple: number | null;
  netPnl: number | null;
  status: string;
  tickSize: number | null;
  setupName: string | null;
  tags: string[];
}

const FILTERS = ["all", "winners", "losers", "long", "short"] as const;
type Filter = (typeof FILTERS)[number];

export function TradesTable({ rows }: { rows: TradeRowData[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "winners" && !(row.netPnl != null && row.netPnl > 0))
        return false;
      if (filter === "losers" && !(row.netPnl != null && row.netPnl < 0))
        return false;
      if (filter === "long" && row.direction !== "long") return false;
      if (filter === "short" && row.direction !== "short") return false;
      if (!q) return true;
      const haystack = [
        row.symbol,
        row.setupName ?? "",
        ...row.tags,
        tradeOutcome(row.netPnl, row.status).label,
        row.entryTime.slice(0, 10),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, filter]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-64">
          <Search
            size={14}
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol, setup, tag, date…"
            className="w-full rounded-lg border border-ink-line bg-ink-raised py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim"
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn("chip", filter === f && "chip-active")}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-line px-8 py-14 text-center">
          <p className="text-sm text-text-muted">
            {rows.length === 0
              ? "No trades logged yet. Log or import your first trades to start the record."
              : "Nothing matches this filter."}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-line text-left">
                <th className="eyebrow px-4 py-3 font-medium">Date</th>
                <th className="eyebrow px-4 py-3 font-medium">Symbol</th>
                <th className="eyebrow px-4 py-3 font-medium">Side</th>
                <th className="eyebrow px-4 py-3 font-medium text-right">
                  Qty
                </th>
                <th className="eyebrow px-4 py-3 font-medium text-right">
                  Entry
                </th>
                <th className="eyebrow px-4 py-3 font-medium text-right">
                  Exit
                </th>
                <th className="eyebrow px-4 py-3 font-medium text-right">R</th>
                <th className="eyebrow px-4 py-3 font-medium">Setup</th>
                <th className="eyebrow px-4 py-3 font-medium">Tag</th>
                <th className="eyebrow px-4 py-3 font-medium text-right">
                  P&L
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/trades/${row.id}`)}
                  className="row-link cursor-pointer border-b border-ink-line last:border-b-0"
                >
                  <td className="num px-4 py-3 text-text-muted">
                    <Link
                      href={`/trades/${row.id}`}
                      className="block -mx-4 -my-3 px-4 py-3"
                    >
                      {formatDate(row.entryTime)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                  <td
                    className={cn(
                      "num px-4 py-3 text-xs font-semibold uppercase",
                      row.direction === "long" ? "text-profit" : "text-loss",
                    )}
                  >
                    {row.direction}
                  </td>
                  <td className="num px-4 py-3 text-right">{row.quantity}</td>
                  <td className="num px-4 py-3 text-right">
                    {formatPrice(row.avgEntryPrice, row.tickSize)}
                  </td>
                  <td className="num px-4 py-3 text-right">
                    {row.avgExitPrice != null
                      ? formatPrice(row.avgExitPrice, row.tickSize)
                      : "—"}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-3 text-right",
                      pnlColor(row.rMultiple),
                    )}
                  >
                    {row.rMultiple != null ? formatR(row.rMultiple) : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {row.setupName ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const outcome = tradeOutcome(row.netPnl, row.status);
                      return (
                        <span className={cn("badge", outcome.cls)}>
                          {outcome.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-3 text-right font-semibold",
                      pnlColor(row.netPnl),
                    )}
                  >
                    {row.netPnl != null ? (
                      formatSignedMoney(row.netPnl)
                    ) : (
                      <span className="badge badge-open">open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
