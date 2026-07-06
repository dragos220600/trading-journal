import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Download, Plus } from "lucide-react";
import { db } from "@/db";
import { accounts, instruments, setups, trades } from "@/db/schema";
import { equityCurve, summaryStats, type AnalyticsTrade } from "@/lib/analytics";
import { computeGuardrail } from "@/lib/guardrail";
import { CountUp } from "@/components/count-up";
import { EquityCurve } from "@/components/charts/equity-curve";
import { GuardrailCard } from "@/components/guardrail-card";
import {
  formatPrice,
  formatSignedMoney,
  localToday,
  pnlColor,
  shiftDate,
} from "@/lib/format";
import { tradeOutcome } from "@/lib/outcome";
import { requireUser } from "@/server/auth";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();
  const rows = db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      entryTime: trades.entryTime,
      exitTime: trades.exitTime,
      direction: trades.direction,
      quantity: trades.quantity,
      avgEntryPrice: trades.avgEntryPrice,
      avgExitPrice: trades.avgExitPrice,
      netPnl: trades.netPnl,
      rMultiple: trades.rMultiple,
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
    }));

  const stats = summaryStats(closed);
  const curve = equityCurve(closed);

  // Prop-firm guardrails for accounts with a trailing drawdown configured
  const today = localToday();
  const guardrailAccounts = db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, user.id),
        eq(accounts.isArchived, false),
        isNotNull(accounts.trailingDrawdown),
      ),
    )
    .all();
  const guardrails = guardrailAccounts.map((account) => ({
    name: account.name,
    status: computeGuardrail(
      {
        initialBalance: account.initialBalance,
        trailingDrawdown: account.trailingDrawdown!,
        drawdownFreezeAt: account.drawdownFreezeAt,
        profitTarget: account.profitTarget,
        dailyLossLimit: account.dailyLossLimit,
      },
      rows
        .filter(
          (t) =>
            t.accountId === account.id &&
            t.status === "closed" &&
            t.netPnl != null,
        )
        .map((t) => ({ netPnl: t.netPnl!, time: t.exitTime ?? t.entryTime })),
      today,
    ),
  }));

  const thisMonth = localToday().slice(0, 7);
  const lastMonth = shiftDate(`${thisMonth}-01`, -1).slice(0, 7);
  const inMonth = (m: string) => closed.filter((t) => t.entryTime.startsWith(m));
  const monthStats = summaryStats(inMonth(thisMonth));
  const lastMonthStats = summaryStats(inMonth(lastMonth));

  const rTrades = rows.filter(
    (t) => t.status === "closed" && t.rMultiple != null,
  );
  const avgR =
    rTrades.length > 0
      ? rTrades.reduce((s, t) => s + t.rMultiple!, 0) / rTrades.length
      : null;

  const deltaLine = (
    current: number | null,
    previous: number | null,
    unit: string,
  ) => {
    if (current == null || previous == null) return "vs last month: n/a";
    const diff = current - previous;
    return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}${unit} vs last month`;
  };

  const tiles = [
    {
      label: "Net P&L (MTD)",
      value:
        inMonth(thisMonth).length > 0 ? (
          <CountUp value={monthStats.totalNetPnl} format="signedMoney" />
        ) : (
          "$0.00"
        ),
      className:
        inMonth(thisMonth).length > 0
          ? pnlColor(monthStats.totalNetPnl)
          : "text-text-faint",
      delta:
        lastMonthStats.tradeCount > 0
          ? `${formatSignedMoney(lastMonthStats.totalNetPnl)} last month`
          : "no trades last month",
      deltaClass: "text-text-faint",
    },
    {
      label: "Win rate",
      value:
        stats.winRate != null ? (
          <CountUp value={stats.winRate} format="percent" />
        ) : (
          "—"
        ),
      className: "text-profit",
      delta: deltaLine(monthStats.winRate, lastMonthStats.winRate, "pt"),
      deltaClass: "text-text-faint",
    },
    {
      label: "Profit factor",
      value:
        stats.profitFactor != null ? (
          <CountUp value={stats.profitFactor} format="number" />
        ) : (
          "—"
        ),
      className: "text-text-primary",
      delta: deltaLine(
        monthStats.profitFactor,
        lastMonthStats.profitFactor,
        "",
      ),
      deltaClass: "text-text-faint",
    },
    {
      label: "Avg R-multiple",
      value: avgR != null ? <CountUp value={avgR} format="r" /> : "—",
      className: avgR != null ? pnlColor(avgR) : "text-text-faint",
      delta:
        rTrades.length > 0
          ? `${rTrades.length} ${rTrades.length === 1 ? "trade" : "trades"} with R`
          : "set an account R value to track R",
      deltaClass: "text-text-faint",
    },
  ];

  // Top playbooks: win rate per setup
  const setupGroups = new Map<string, { wins: number; total: number }>();
  for (const t of closed) {
    const key = t.setupName ?? "No setup";
    const g = setupGroups.get(key) ?? { wins: 0, total: 0 };
    if (t.netPnl > 0) g.wins += 1;
    g.total += 1;
    setupGroups.set(key, g);
  }
  const topPlaybooks = [...setupGroups.entries()]
    .map(([name, g]) => ({ name, wr: (g.wins / g.total) * 100, total: g.total }))
    .sort((a, b) => b.wr - a.wr)
    .slice(0, 5);

  const recent = rows.slice(0, 5);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-6xl">
      <header
        className="mb-8 flex flex-wrap items-end justify-between gap-4 reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div>
          <p className="eyebrow mb-2">01 · Overview</p>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Welcome back.
            {stats.winRate != null &&
              ` Your edge is currently ${stats.winRate.toFixed(1)}%.`}
          </p>
        </div>
        <div className="flex gap-2.5">
          <a
            href="/api/export/trades"
            className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm font-medium"
            download
          >
            <Download size={14} aria-hidden /> Export
          </a>
          <Link
            href="/trades/new"
            className="btn-accent flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Plus size={14} aria-hidden /> New Trade
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <section
          className="card px-8 py-14 text-center reveal"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <p className="eyebrow mb-3 text-accent">No trades yet</p>
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            Start your record
          </h2>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-8">
            Import an execution report from your broker, or log a trade by
            hand. Every stat on this page builds from your own data — stored
            locally, owned by you.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/import" className="btn-accent px-4 py-2 text-sm">
              Import trades
            </Link>
            <Link
              href="/trades/new"
              className="btn-ghost px-4 py-2 text-sm font-medium"
            >
              Log a trade
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Stat tiles */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {tiles.map(({ label, value, className, delta, deltaClass }, i) => (
              <div
                key={label}
                className="card-tile card-hover px-5 py-4 reveal"
                style={{ "--i": i + 1 } as React.CSSProperties}
              >
                <p className="eyebrow mb-2.5">{label}</p>
                <p className={cn("num text-xl font-semibold", className)}>
                  {value}
                </p>
                <p className={cn("num mt-1.5 text-[11px]", deltaClass)}>
                  {delta}
                </p>
              </div>
            ))}
          </section>

          {/* Prop-firm guardrails */}
          {guardrails.length > 0 && (
            <section
              className="mb-6 grid gap-4 lg:grid-cols-2 reveal"
              style={{ "--i": 5 } as React.CSSProperties}
            >
              {guardrails.map(({ name, status }) => (
                <GuardrailCard key={name} accountName={name} status={status} />
              ))}
            </section>
          )}

          {/* Equity curve + top playbooks */}
          <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_320px]">
            <div
              className="card p-5 reveal"
              style={{ "--i": 5 } as React.CSSProperties}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">Equity Curve</p>
                  <p className="num mt-0.5 text-xs text-text-faint">
                    {closed.length} closed trades ·{" "}
                    {formatSignedMoney(stats.totalNetPnl)} net
                  </p>
                </div>
                <span className="chip">All time</span>
              </div>
              <EquityCurve points={curve} />
            </div>

            <div
              className="card p-5 reveal"
              style={{ "--i": 6 } as React.CSSProperties}
            >
              <div className="mb-5 flex items-center justify-between">
                <p className="text-sm font-semibold">Top Playbooks</p>
                <Link
                  href="/playbook"
                  className="num text-[10px] tracking-[0.14em] uppercase text-accent hover:text-accent-soft transition-colors"
                >
                  View all
                </Link>
              </div>
              <div className="space-y-4">
                {topPlaybooks.map((playbook) => (
                  <div key={playbook.name}>
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span className="text-text-primary">{playbook.name}</span>
                      <span
                        className={cn(
                          "num text-xs font-semibold",
                          playbook.wr >= 50 ? "text-profit" : "text-loss",
                        )}
                      >
                        {playbook.wr.toFixed(0)}% WR
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-ink-card overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          playbook.wr >= 50 ? "bg-profit-fill" : "bg-loss-fill",
                        )}
                        style={{ width: `${Math.max(4, playbook.wr)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Recent executions */}
          <section
            className="card p-5 reveal"
            style={{ "--i": 7 } as React.CSSProperties}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">Recent Executions</p>
                <p className="num mt-0.5 text-xs text-text-faint">
                  Latest {recent.length} trades · sorted by time
                </p>
              </div>
              <Link
                href="/trades"
                className="num text-[10px] tracking-[0.14em] uppercase text-accent hover:text-accent-soft transition-colors"
              >
                All trades ↗
              </Link>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-line text-left">
                  <th className="eyebrow py-2.5 pr-4 font-medium">Symbol</th>
                  <th className="eyebrow py-2.5 pr-4 font-medium">Side</th>
                  <th className="eyebrow py-2.5 pr-4 font-medium text-right">
                    Entry
                  </th>
                  <th className="eyebrow py-2.5 pr-4 font-medium text-right">
                    Exit
                  </th>
                  <th className="eyebrow py-2.5 pr-4 font-medium">Outcome</th>
                  <th className="eyebrow py-2.5 font-medium text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((trade) => {
                  const o = tradeOutcome(trade.netPnl, trade.status);
                  return (
                    <tr
                      key={trade.id}
                      className="row-link border-b border-ink-line last:border-b-0"
                    >
                      <td className="py-3 pr-4 font-semibold">
                        <Link
                          href={`/trades/${trade.id}`}
                          className="block -my-3 py-3"
                        >
                          {trade.symbol}
                        </Link>
                      </td>
                      <td
                        className={cn(
                          "num py-3 pr-4 text-xs font-semibold uppercase",
                          trade.direction === "long"
                            ? "text-profit"
                            : "text-loss",
                        )}
                      >
                        {trade.direction}
                      </td>
                      <td className="num py-3 pr-4 text-right">
                        {formatPrice(trade.avgEntryPrice, trade.tickSize)}
                      </td>
                      <td className="num py-3 pr-4 text-right">
                        {trade.avgExitPrice != null
                          ? formatPrice(trade.avgExitPrice, trade.tickSize)
                          : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={cn("badge", o.cls)}>{o.label}</span>
                      </td>
                      <td
                        className={cn(
                          "num py-3 text-right font-semibold",
                          pnlColor(trade.netPnl),
                        )}
                      >
                        {trade.netPnl != null
                          ? formatSignedMoney(trade.netPnl)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </section>
        </>
      )}
    </div>
  );
}
