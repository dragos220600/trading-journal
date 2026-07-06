import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instruments, setups, tags, trades, tradeTags } from "@/db/schema";
import {
  byDayOfWeek,
  byHoldTime,
  bySession,
  bySetup,
  dailyPnl,
  equityCurve,
  summaryStats,
  type AnalyticsTrade,
  type BreakdownRow,
} from "@/lib/analytics";
import { EquityCurve } from "@/components/charts/equity-curve";
import { WeekdayBars } from "@/components/charts/weekday-bars";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { BreakdownList } from "@/components/charts/breakdown-list";
import { requireUser } from "@/server/auth";
import {
  formatMoney,
  formatR,
  formatSignedMoney,
  pnlColor,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const rows = db
    .select({
      id: trades.id,
      direction: trades.direction,
      entryTime: trades.entryTime,
      exitTime: trades.exitTime,
      netPnl: trades.netPnl,
      rMultiple: trades.rMultiple,
      status: trades.status,
      symbol: instruments.symbol,
      setupName: setups.name,
    })
    .from(trades)
    .innerJoin(instruments, eq(trades.instrumentId, instruments.id))
    .leftJoin(setups, eq(trades.setupId, setups.id))
    .where(eq(trades.userId, user.id))
    .all();

  const closed: AnalyticsTrade[] = rows
    .filter((t) => t.status === "closed" && t.netPnl != null)
    .map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      netPnl: t.netPnl!,
      setupName: t.setupName,
      rMultiple: t.rMultiple,
    }));

  if (closed.length === 0) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-6xl">
        <header className="mb-8">
          <p className="eyebrow mb-2">05 · Deep dive</p>
          <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        </header>
        <div className="rounded-xl border border-dashed border-ink-line px-8 py-14 text-center">
          <p className="text-sm text-text-muted max-w-md mx-auto">
            No closed trades yet.{" "}
            <Link href="/import" className="text-accent hover:text-accent-soft">
              Import
            </Link>{" "}
            or{" "}
            <Link
              href="/trades/new"
              className="text-accent hover:text-accent-soft"
            >
              log
            </Link>{" "}
            trades and the equity curve, calendar, and breakdowns build
            themselves.
          </p>
        </div>
      </div>
    );
  }

  // Mistake/emotion tag cost
  const tagRows = db
    .select({
      tradeId: tradeTags.tradeId,
      tagName: tags.name,
      category: tags.category,
    })
    .from(tradeTags)
    .innerJoin(tags, eq(tradeTags.tagId, tags.id))
    .innerJoin(trades, eq(tradeTags.tradeId, trades.id))
    .where(eq(trades.userId, user.id))
    .all();
  const closedById = new Map(closed.map((t) => [t.id, t]));
  const tagPnl = new Map<string, BreakdownRow>();
  for (const { tradeId, tagName, category } of tagRows) {
    if (category !== "mistake" && category !== "emotion") continue;
    const trade = closedById.get(tradeId);
    if (!trade) continue;
    const row =
      tagPnl.get(tagName) ??
      { label: tagName, netPnl: 0, tradeCount: 0, winCount: 0 };
    row.netPnl = Math.round((row.netPnl + trade.netPnl) * 100) / 100;
    row.tradeCount += 1;
    if (trade.netPnl > 0) row.winCount += 1;
    tagPnl.set(tagName, row);
  }
  const tagCost = [...tagPnl.values()].sort((a, b) => a.netPnl - b.netPnl);

  const stats = summaryStats(closed);
  const curve = equityCurve(closed);
  const days = dailyPnl(closed);
  const sessions = bySession(closed);
  const holdTime = byHoldTime(closed);

  const tiles: { label: string; value: string; className?: string; hint?: string }[] = [
    {
      label: "Net P&L",
      value: formatSignedMoney(stats.totalNetPnl),
      className: pnlColor(stats.totalNetPnl),
      hint: `${stats.tradeCount} closed trades`,
    },
    {
      label: "Win rate",
      value: stats.winRate != null ? `${stats.winRate.toFixed(0)}%` : "—",
      hint: `${closed.filter((t) => t.netPnl > 0).length}W · ${closed.filter((t) => t.netPnl < 0).length}L`,
    },
    {
      label: "Profit factor",
      value: stats.profitFactor != null ? stats.profitFactor.toFixed(2) : "—",
      hint: "gross win / gross loss",
    },
    {
      label: "Expectancy",
      value:
        stats.expectancy != null ? formatSignedMoney(stats.expectancy) : "—",
      className:
        stats.expectancy != null ? pnlColor(stats.expectancy) : undefined,
      hint: "per trade",
    },
    {
      label: "Avg win",
      value: stats.avgWin != null ? formatMoney(stats.avgWin) : "—",
      className: "text-profit",
      hint: "mean winner",
    },
    {
      label: "Avg loss",
      value: stats.avgLoss != null ? formatMoney(stats.avgLoss) : "—",
      className: "text-loss",
      hint: "mean loser",
    },
    {
      label: "Max drawdown",
      value: stats.maxDrawdown > 0 ? formatMoney(-stats.maxDrawdown) : "—",
      className: stats.maxDrawdown > 0 ? "text-loss" : undefined,
      hint: "peak to trough",
    },
    {
      label: "Best / worst day",
      value:
        stats.bestDay && stats.worstDay
          ? `${formatSignedMoney(stats.bestDay.netPnl)} / ${formatSignedMoney(stats.worstDay.netPnl)}`
          : "—",
      hint: "single-day range",
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-6xl">
      <header
        className="mb-6 reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <p className="eyebrow mb-2">05 · Deep dive</p>
        <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Where your edge actually lives — by day, session and hold time.
        </p>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {tiles.map(({ label, value, className, hint }, i) => (
          <div
            key={label}
            className="card-tile card-hover px-5 py-4 reveal"
            style={{ "--i": Math.min(i + 1, 6) } as React.CSSProperties}
          >
            <p className="eyebrow mb-2.5">{label}</p>
            <p className={cn("num text-lg font-semibold", className)}>
              {value}
            </p>
            {hint && (
              <p className="num mt-1 text-[11px] text-text-faint">{hint}</p>
            )}
          </div>
        ))}
      </section>

      <section
        className="mb-6 card p-5 reveal"
        style={{ "--i": 6 } as React.CSSProperties}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="eyebrow">Equity curve — cumulative net P&L</p>
          <span className="chip">All time</span>
        </div>
        <EquityCurve points={curve} />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div
          className="card p-5 reveal"
          style={{ "--i": 7 } as React.CSSProperties}
        >
          <p className="text-sm font-semibold">P&L by Day of Week</p>
          <p className="num mb-2 text-xs text-text-faint">
            Cumulative net · all sessions
          </p>
          <WeekdayBars rows={byDayOfWeek(closed)} />
        </div>

        <div
          className="card p-5 reveal"
          style={{ "--i": 8 } as React.CSSProperties}
        >
          <p className="text-sm font-semibold">By Session</p>
          <p className="num mb-5 text-xs text-text-faint">
            Win rate and net P&L per intraday window
          </p>
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.label}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span title={session.window}>{session.label}</span>
                  <span className="num text-xs">
                    <span className="text-text-faint">
                      {session.winRate.toFixed(0)}%{" "}
                    </span>
                    <span
                      className={cn("font-semibold", pnlColor(session.netPnl))}
                    >
                      {formatSignedMoney(session.netPnl)}
                    </span>
                  </span>
                </div>
                <div className="h-1 rounded-full bg-ink-card overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      session.netPnl >= 0 ? "bg-profit-fill" : "bg-loss-fill",
                    )}
                    style={{ width: `${Math.max(4, session.winRate)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="mb-6 card p-5 reveal"
        style={{ "--i": 9 } as React.CSSProperties}
      >
        <p className="text-sm font-semibold">By Hold Time</p>
        <p className="num mb-4 text-xs text-text-faint">
          Where your R comes from
        </p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-line text-left">
              <th className="eyebrow py-2.5 pr-4 font-medium">Bucket</th>
              <th className="eyebrow py-2.5 pr-4 font-medium text-right">
                Win rate
              </th>
              <th className="eyebrow py-2.5 pr-4 font-medium text-right">
                Avg R
              </th>
              <th className="eyebrow py-2.5 pr-4 font-medium text-right">
                Avg P&L
              </th>
              <th className="eyebrow py-2.5 font-medium w-1/3">
                Distribution
              </th>
            </tr>
          </thead>
          <tbody>
            {holdTime.map((bucket) => (
              <tr
                key={bucket.label}
                className="border-b border-ink-line last:border-b-0"
              >
                <td className="py-3 pr-4">{bucket.label}</td>
                <td className="num py-3 pr-4 text-right">
                  {bucket.winRate.toFixed(0)}%
                </td>
                <td
                  className={cn(
                    "num py-3 pr-4 text-right",
                    bucket.avgR != null
                      ? pnlColor(bucket.avgR)
                      : "text-text-faint",
                  )}
                >
                  {bucket.avgR != null ? formatR(bucket.avgR) : "—"}
                </td>
                <td
                  className={cn(
                    "num py-3 pr-4 text-right font-semibold",
                    pnlColor(bucket.avgPnl),
                  )}
                >
                  {formatSignedMoney(bucket.avgPnl)}
                </td>
                <td className="py-3">
                  <div className="h-1 rounded-full bg-ink-card overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        bucket.avgPnl >= 0 ? "bg-profit-fill" : "bg-loss-fill",
                      )}
                      style={{ width: `${Math.max(3, bucket.share * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <section
        className="mb-6 card p-5 reveal"
        style={{ "--i": 10 } as React.CSSProperties}
      >
        <p className="eyebrow mb-4">Daily P&L calendar</p>
        <PnlCalendar days={days} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BreakdownList title="By setup" rows={bySetup(closed)} />
        {tagCost.length > 0 ? (
          <BreakdownList title="Mistake & emotion cost" rows={tagCost} />
        ) : (
          <div className="rounded-xl border border-dashed border-ink-line p-5 flex items-center">
            <p className="text-sm text-text-muted">
              Tag your trades with mistakes and emotions (edit any trade) and
              this panel shows exactly what each behavior costs you.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
