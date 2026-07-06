import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, like, lt } from "drizzle-orm";
import { ArrowLeft, ArrowRight, NotebookPen } from "lucide-react";
import { db } from "@/db";
import {
  accounts,
  attachments,
  executions,
  instruments,
  setups,
  tags,
  trades,
  tradeTags,
} from "@/db/schema";
import { deleteTrade } from "@/server/actions";
import { addAttachment, deleteAttachment } from "@/server/attachment-actions";
import { DeleteTradeButton } from "@/components/delete-trade-button";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { PriceLadder } from "@/components/price-ladder";
import {
  formatDateTime,
  formatMoney,
  formatPrice,
  formatR,
  formatSignedMoney,
  pnlColor,
} from "@/lib/format";
import { tradeOutcome } from "@/lib/outcome";
import { requireUser } from "@/server/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TAG_CATEGORY_LABELS: Record<string, string> = {
  mistake: "Mistakes",
  emotion: "Emotions",
  context: "Market context",
  custom: "Other",
};

function holdTime(entryTime: string, exitTime: string | null): string {
  if (!exitTime) return "still open";
  const minutes = Math.round(
    (new Date(exitTime).getTime() - new Date(entryTime).getTime()) / 60000,
  );
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const tradeId = Number(id);
  if (!Number.isFinite(tradeId)) notFound();

  const row = await db
    .select({
      trade: trades,
      symbol: instruments.symbol,
      instrumentName: instruments.name,
      tickSize: instruments.tickSize,
      pointValue: instruments.pointValue,
      setupName: setups.name,
      accountName: accounts.name,
      accountR: accounts.rValue,
    })
    .from(trades)
    .innerJoin(instruments, eq(trades.instrumentId, instruments.id))
    .innerJoin(accounts, eq(trades.accountId, accounts.id))
    .leftJoin(setups, eq(trades.setupId, setups.id))
    .where(and(eq(trades.id, tradeId), eq(trades.userId, user.id)))
    .get();

  if (!row) notFound();
  const {
    trade,
    symbol,
    instrumentName,
    tickSize,
    setupName,
    accountName,
    accountR,
  } = row;

  const fills = await db
    .select()
    .from(executions)
    .where(eq(executions.tradeId, tradeId))
    .orderBy(asc(executions.time))
    .all();

  const tradeTagRows = await db
    .select({ id: tags.id, name: tags.name, category: tags.category })
    .from(tradeTags)
    .innerJoin(tags, eq(tradeTags.tagId, tags.id))
    .where(eq(tradeTags.tradeId, tradeId))
    .all();
  const tagsByCategory = new Map<string, string[]>();
  for (const tag of tradeTagRows) {
    tagsByCategory.set(tag.category, [
      ...(tagsByCategory.get(tag.category) ?? []),
      tag.name,
    ]);
  }

  const attachmentRows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.tradeId, tradeId))
    .all();
  const addAttachmentWithId = addAttachment.bind(null, tradeId);

  // Chronological neighbors for prev/next navigation
  const prevTrade = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.userId, user.id), lt(trades.entryTime, trade.entryTime)))
    .orderBy(desc(trades.entryTime))
    .limit(1)
    .get();
  const nextTrade = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.userId, user.id), gt(trades.entryTime, trade.entryTime)))
    .orderBy(asc(trades.entryTime))
    .limit(1)
    .get();

  // Day context for the journal link
  const entryDate = trade.entryTime.slice(0, 10);
  const dayTrades = await db
    .select({ netPnl: trades.netPnl })
    .from(trades)
    .where(and(eq(trades.userId, user.id), like(trades.entryTime, `${entryDate}%`)))
    .all();
  const dayPnl =
    Math.round(dayTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0) * 100) / 100;

  const entryDayLabel = new Date(`${entryDate}T00:00:00`).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  );

  // Derived execution metrics
  const sign = trade.direction === "long" ? 1 : -1;
  const points =
    trade.avgExitPrice != null
      ? (trade.avgExitPrice - trade.avgEntryPrice) * sign
      : null;
  const ticks =
    points != null && tickSize ? Math.round(points / tickSize) : null;
  const perContract =
    trade.netPnl != null ? trade.netPnl / trade.quantity : null;

  const outcome = tradeOutcome(trade.netPnl, trade.status);

  const executionTiles: { label: string; value: string; className?: string; hint?: string }[] = [
    {
      label: "Entry",
      value: formatPrice(trade.avgEntryPrice, tickSize),
      hint: formatDateTime(trade.entryTime),
    },
    {
      label: "Exit",
      value:
        trade.avgExitPrice != null
          ? formatPrice(trade.avgExitPrice, tickSize)
          : "—",
      hint: trade.exitTime ? formatDateTime(trade.exitTime) : "still open",
    },
    {
      label: "Contracts",
      value: String(trade.quantity),
      hint: `${fills.length} fill${fills.length === 1 ? "" : "s"}`,
    },
    {
      label: "Hold time",
      value: holdTime(trade.entryTime, trade.exitTime),
      hint: "entry to exit",
    },
    {
      label: "Points captured",
      value:
        points != null
          ? `${points >= 0 ? "+" : ""}${formatPrice(points, tickSize)}`
          : "—",
      className: points != null ? pnlColor(points) : undefined,
      hint: ticks != null ? `${ticks >= 0 ? "+" : ""}${ticks} ticks` : undefined,
    },
    {
      label: "P&L / contract",
      value: perContract != null ? formatSignedMoney(perContract) : "—",
      className: perContract != null ? pnlColor(perContract) : undefined,
      hint: "net, per contract",
    },
    {
      label: "Gross P&L",
      value: trade.grossPnl != null ? formatSignedMoney(trade.grossPnl) : "—",
      className: trade.grossPnl != null ? pnlColor(trade.grossPnl) : undefined,
      hint: "before fees",
    },
    {
      label: "Fees",
      value: formatMoney(trade.fees),
      hint: "commissions + exchange",
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/trades"
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={14} aria-hidden /> Trade log
        </Link>
        <div className="flex gap-2">
          {prevTrade ? (
            <Link
              href={`/trades/${prevTrade.id}`}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 num text-xs"
            >
              <ArrowLeft size={12} aria-hidden /> prev
            </Link>
          ) : (
            <span className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 num text-xs opacity-40">
              <ArrowLeft size={12} aria-hidden /> prev
            </span>
          )}
          {nextTrade ? (
            <Link
              href={`/trades/${nextTrade.id}`}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 num text-xs"
            >
              next <ArrowRight size={12} aria-hidden />
            </Link>
          ) : (
            <span className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 num text-xs opacity-40">
              next <ArrowRight size={12} aria-hidden />
            </span>
          )}
        </div>
      </div>

      <header
        className="mb-6 flex flex-wrap items-start justify-between gap-4 reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div>
          <p className="eyebrow mb-2">
            02 · Trade #{trade.id} · {entryDayLabel}
          </p>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {symbol}
            <span
              className={cn(
                "badge",
                trade.direction === "long" ? "badge-win" : "badge-loss",
              )}
            >
              {trade.direction}
            </span>
            <span className={cn("badge", outcome.cls)}>{outcome.label}</span>
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            {instrumentName ?? symbol} · {accountName} ·{" "}
            {setupName ?? "no setup"}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("num text-4xl font-semibold", pnlColor(trade.netPnl))}>
            {trade.netPnl != null ? formatSignedMoney(trade.netPnl) : "—"}
          </p>
          <p className={cn("num mt-1 text-sm", pnlColor(trade.rMultiple))}>
            {trade.rMultiple != null
              ? accountR != null
                ? `${formatR(trade.rMultiple)} at ${formatMoney(accountR)} per R`
                : `${formatR(trade.rMultiple)} on ${
                    trade.plannedRiskAmount != null
                      ? formatMoney(trade.plannedRiskAmount)
                      : "—"
                  } risked`
              : "no R — set the account R value or log a stop"}
          </p>
        </div>
      </header>

      <div
        className="mb-8 flex flex-wrap gap-3 reveal"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <Link
          href={`/trades/${trade.id}/edit`}
          className="btn-ghost px-4 py-2 text-sm font-medium"
        >
          Edit
        </Link>
        <Link
          href={`/journal/${entryDate}`}
          className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm font-medium"
        >
          <NotebookPen size={14} aria-hidden /> Day journal
        </Link>
        <DeleteTradeButton tradeId={trade.id} action={deleteTrade} />
      </div>

      {/* Execution metrics */}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {executionTiles.map(({ label, value, className, hint }, i) => (
          <div
            key={label}
            className="card-tile px-4 py-3.5 reveal"
            style={{ "--i": Math.min(i + 2, 8) } as React.CSSProperties}
          >
            <p className="eyebrow mb-2">{label}</p>
            <p className={cn("num text-base font-semibold", className)}>
              {value}
            </p>
            {hint && (
              <p className="num mt-1 text-[11px] text-text-faint">{hint}</p>
            )}
          </div>
        ))}
      </section>

      {/* Risk plan + fills */}
      <section className="mb-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div
          className="card p-5 reveal"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          <p className="text-sm font-semibold">Price levels</p>
          <p className="num mb-4 text-xs text-text-faint">
            {trade.stopPrice != null || trade.targetPrice != null
              ? "the plan vs. what happened"
              : "no stop or target was logged"}
          </p>
          <PriceLadder
            entry={trade.avgEntryPrice}
            exit={trade.avgExitPrice}
            stop={trade.stopPrice}
            target={trade.targetPrice}
            tickSize={tickSize}
          />
        </div>

        <div
          className="card p-5 reveal"
          style={{ "--i": 5 } as React.CSSProperties}
        >
          <p className="text-sm font-semibold">Fills</p>
          <p className="num mb-3 text-xs text-text-faint">
            Every execution in this position
          </p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-line text-left">
                <th className="eyebrow py-2.5 pr-4 font-medium">Time</th>
                <th className="eyebrow py-2.5 pr-4 font-medium">Side</th>
                <th className="eyebrow py-2.5 pr-4 font-medium text-right">
                  Qty
                </th>
                <th className="eyebrow py-2.5 font-medium text-right">
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {fills.map((fill) => (
                <tr
                  key={fill.id}
                  className="border-b border-ink-line last:border-b-0"
                >
                  <td className="num py-2.5 pr-4 text-text-muted">
                    {formatDateTime(fill.time)}
                  </td>
                  <td
                    className={cn(
                      "num py-2.5 pr-4 text-xs font-semibold uppercase",
                      fill.side === "buy" ? "text-profit" : "text-loss",
                    )}
                  >
                    {fill.side}
                  </td>
                  <td className="num py-2.5 pr-4 text-right">
                    {fill.quantity}
                  </td>
                  <td className="num py-2.5 text-right">
                    {formatPrice(fill.price, tickSize)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </section>

      {/* Review */}
      <section
        className="mb-6 card p-5 reveal"
        style={{ "--i": 6 } as React.CSSProperties}
      >
        <p className="mb-4 text-sm font-semibold">Review</p>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Execution quality</p>
            {trade.rating != null ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        "h-1.5 w-5 rounded-full",
                        n <= trade.rating! ? "bg-accent" : "bg-ink-card",
                      )}
                      aria-hidden
                    />
                  ))}
                </div>
                <span className="num text-sm font-semibold">
                  {trade.rating}/5
                </span>
              </div>
            ) : (
              <p className="text-sm text-text-faint">not rated</p>
            )}
          </div>
          <div>
            <p className="eyebrow mb-2">Followed the plan</p>
            {trade.followedPlan == null ? (
              <p className="text-sm text-text-faint">—</p>
            ) : (
              <span
                className={cn(
                  "badge",
                  trade.followedPlan ? "badge-win" : "badge-loss",
                )}
              >
                {trade.followedPlan ? "yes" : "no"}
              </span>
            )}
          </div>
        </div>

        {tradeTagRows.length > 0 && (
          <div className="mb-5 space-y-3">
            {[...tagsByCategory.entries()].map(([category, names]) => (
              <div key={category}>
                <p className="eyebrow mb-1.5">
                  {TAG_CATEGORY_LABELS[category] ?? category}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {names.map((name) => (
                    <span key={name} className="badge badge-scratch">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <p className="eyebrow mb-2">Notes</p>
          {trade.notes ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {trade.notes}
            </p>
          ) : (
            <p className="text-sm text-text-faint">
              No notes yet —{" "}
              <Link
                href={`/trades/${trade.id}/edit`}
                className="text-accent hover:text-accent-soft"
              >
                add the story
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      {/* Screenshots */}
      <section
        className="mb-6 card p-5 reveal"
        style={{ "--i": 7 } as React.CSSProperties}
      >
        <p className="text-sm font-semibold">Screenshots</p>
        <p className="num mb-4 text-xs text-text-faint">
          {attachmentRows.length > 0
            ? `${attachmentRows.length} attached — click to open full size`
            : "attach the chart that made you take it"}
        </p>
        <AttachmentGallery
          items={attachmentRows.map((a) => ({ id: a.id, caption: a.caption }))}
          deleteAction={deleteAttachment}
        />
        <AttachmentUploader action={addAttachmentWithId} />
      </section>

      {/* Day context */}
      <Link
        href={`/journal/${entryDate}`}
        className="card card-hover flex items-center justify-between gap-4 px-5 py-4 reveal"
        style={{ "--i": 8 } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <NotebookPen size={16} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">{entryDayLabel}</p>
            <p className="num text-xs text-text-faint">
              day total{" "}
              <span className={cn("font-semibold", pnlColor(dayPnl))}>
                {formatSignedMoney(dayPnl)}
              </span>{" "}
              across {dayTrades.length}{" "}
              {dayTrades.length === 1 ? "trade" : "trades"}
            </p>
          </div>
        </div>
        <span className="num text-[10px] tracking-[0.14em] uppercase text-accent">
          Open journal →
        </span>
      </Link>
    </div>
  );
}
