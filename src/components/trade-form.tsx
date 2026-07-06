"use client";

import { useMemo, useState } from "react";
import { computeTradeMetrics } from "@/lib/trade-math";
import { formatMoney, formatR, formatSignedMoney, pnlColor } from "@/lib/format";
import { tradeOutcome } from "@/lib/outcome";
import { ScreenshotField } from "@/components/screenshot-field";
import { cn } from "@/lib/utils";

export interface TradeFormOption {
  id: number;
  label: string;
}

export interface TradeFormAccount {
  id: number;
  label: string;
  rValue: number | null;
}

export interface TradeFormInstrument {
  id: number;
  symbol: string;
  name: string | null;
  tickSize: number | null;
  pointValue: number | null;
}

export interface TradeFormTag {
  id: number;
  name: string;
  category: string;
}

export interface TradeFormDefaults {
  accountId?: number;
  instrumentId?: number;
  setupId?: number | null;
  direction?: "long" | "short";
  quantity?: number;
  entryTime?: string;
  exitTime?: string | null;
  avgEntryPrice?: number;
  avgExitPrice?: number | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  fees?: number;
  rating?: number | null;
  followedPlan?: boolean | null;
  notes?: string | null;
  tagIds?: number[];
}

const inputCls =
  "w-full rounded-md border border-ink-line bg-ink-card px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim";
const labelCls = "block text-xs font-medium text-text-muted mb-1.5";

const TAG_CATEGORY_LABELS: Record<string, string> = {
  mistake: "Mistakes",
  emotion: "Emotions",
  context: "Market context",
  custom: "Other",
};

export function TradeForm({
  action,
  accounts,
  instruments,
  setups,
  tags,
  defaults = {},
  submitLabel,
}: {
  action: (formData: FormData) => void;
  accounts: TradeFormAccount[];
  instruments: TradeFormInstrument[];
  setups: TradeFormOption[];
  tags: TradeFormTag[];
  defaults?: TradeFormDefaults;
  submitLabel: string;
}) {
  const [accountId, setAccountId] = useState(
    defaults.accountId ?? accounts[0]?.id,
  );
  const [instrumentId, setInstrumentId] = useState(
    defaults.instrumentId ?? instruments[0]?.id,
  );
  const [direction, setDirection] = useState<"long" | "short">(
    defaults.direction ?? "long",
  );
  const [quantity, setQuantity] = useState(String(defaults.quantity ?? 1));
  const [entryPrice, setEntryPrice] = useState(
    defaults.avgEntryPrice != null ? String(defaults.avgEntryPrice) : "",
  );
  const [exitPrice, setExitPrice] = useState(
    defaults.avgExitPrice != null ? String(defaults.avgExitPrice) : "",
  );
  const [stopPrice, setStopPrice] = useState(
    defaults.stopPrice != null ? String(defaults.stopPrice) : "",
  );
  const [fees, setFees] = useState(String(defaults.fees ?? 0));
  const [rating, setRating] = useState<number | null>(defaults.rating ?? null);

  const instrument = instruments.find((i) => i.id === instrumentId);
  const account = accounts.find((a) => a.id === accountId);
  const accountR = account?.rValue ?? null;

  const preview = useMemo(() => {
    const qty = Number(quantity);
    const entry = Number(entryPrice);
    if (!instrument || !qty || !entryPrice || Number.isNaN(entry)) return null;
    const metrics = computeTradeMetrics({
      direction,
      quantity: qty,
      avgEntryPrice: entry,
      avgExitPrice: exitPrice === "" ? null : Number(exitPrice),
      stopPrice: stopPrice === "" ? null : Number(stopPrice),
      pointValue: instrument.pointValue ?? 1,
      fees: Number(fees) || 0,
    });
    // Account-level fixed $/R takes precedence, matching the server
    const rMultiple =
      accountR != null && metrics.netPnl != null
        ? metrics.netPnl / accountR
        : metrics.rMultiple;
    return { ...metrics, rMultiple };
  }, [
    instrument,
    accountR,
    direction,
    quantity,
    entryPrice,
    exitPrice,
    stopPrice,
    fees,
  ]);

  const tagsByCategory = useMemo(() => {
    const groups = new Map<string, TradeFormTag[]>();
    for (const tag of tags) {
      const list = groups.get(tag.category) ?? [];
      list.push(tag);
      groups.set(tag.category, list);
    }
    return groups;
  }, [tags]);

  const defaultTagIds = new Set(defaults.tagIds ?? []);
  const step = instrument?.tickSize ?? 0.01;

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        {/* What was traded */}
        <fieldset className="card p-5">
          <legend className="eyebrow px-1">Position</legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="accountId" className={labelCls}>
                Account
              </label>
              <select
                id="accountId"
                name="accountId"
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className={inputCls}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="instrumentId" className={labelCls}>
                Symbol
              </label>
              <select
                id="instrumentId"
                name="instrumentId"
                value={instrumentId}
                onChange={(e) => setInstrumentId(Number(e.target.value))}
                className={inputCls}
              >
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={labelCls}>Side</span>
              <input type="hidden" name="direction" value={direction} />
              <div className="grid grid-cols-2 rounded-md border border-ink-line overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDirection("long")}
                  className={cn(
                    "px-3 py-2 text-sm font-semibold transition-colors",
                    direction === "long"
                      ? "bg-profit/15 text-profit"
                      : "bg-ink-card text-text-faint hover:text-text-muted",
                  )}
                >
                  Long
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("short")}
                  className={cn(
                    "px-3 py-2 text-sm font-semibold transition-colors",
                    direction === "short"
                      ? "bg-loss/15 text-loss"
                      : "bg-ink-card text-text-faint hover:text-text-muted",
                  )}
                >
                  Short
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="quantity" className={labelCls}>
                Contracts
              </label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={cn(inputCls, "num")}
              />
            </div>
          </div>
        </fieldset>

        {/* Entry / exit */}
        <fieldset className="card p-5">
          <legend className="eyebrow px-1">Entry & exit</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="entryTime" className={labelCls}>
                Entry time
              </label>
              <input
                id="entryTime"
                name="entryTime"
                type="datetime-local"
                required
                defaultValue={defaults.entryTime ?? ""}
                className={cn(inputCls, "num")}
              />
            </div>
            <div>
              <label htmlFor="exitTime" className={labelCls}>
                Exit time
              </label>
              <input
                id="exitTime"
                name="exitTime"
                type="datetime-local"
                defaultValue={defaults.exitTime ?? ""}
                className={cn(inputCls, "num")}
              />
            </div>
            <div>
              <label htmlFor="avgEntryPrice" className={labelCls}>
                Entry price
              </label>
              <input
                id="avgEntryPrice"
                name="avgEntryPrice"
                type="number"
                step={step}
                required
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className={cn(inputCls, "num")}
              />
            </div>
            <div>
              <label htmlFor="avgExitPrice" className={labelCls}>
                Exit price{" "}
                <span className="text-text-faint">(blank = still open)</span>
              </label>
              <input
                id="avgExitPrice"
                name="avgExitPrice"
                type="number"
                step={step}
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                className={cn(inputCls, "num")}
              />
            </div>
          </div>
        </fieldset>

        {/* Risk plan */}
        <fieldset className="card p-5">
          <legend className="eyebrow px-1">Risk plan</legend>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="stopPrice" className={labelCls}>
                Stop price
              </label>
              <input
                id="stopPrice"
                name="stopPrice"
                type="number"
                step={step}
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className={cn(inputCls, "num")}
              />
            </div>
            <div>
              <label htmlFor="targetPrice" className={labelCls}>
                Target price
              </label>
              <input
                id="targetPrice"
                name="targetPrice"
                type="number"
                step={step}
                defaultValue={defaults.targetPrice ?? ""}
                className={cn(inputCls, "num")}
              />
            </div>
            <div>
              <label htmlFor="fees" className={labelCls}>
                Fees & commissions
              </label>
              <input
                id="fees"
                name="fees"
                type="number"
                step="0.01"
                min="0"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className={cn(inputCls, "num")}
              />
            </div>
          </div>
        </fieldset>

        {/* Review */}
        <fieldset className="card p-5 space-y-4">
          <legend className="eyebrow px-1">Review</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="setupId" className={labelCls}>
                Setup
              </label>
              <select
                id="setupId"
                name="setupId"
                defaultValue={defaults.setupId ?? ""}
                className={inputCls}
              >
                <option value="">— none —</option>
                {setups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={labelCls}>
                Execution quality{" "}
                <span className="text-text-faint">(process, not outcome)</span>
              </span>
              <input type="hidden" name="rating" value={rating ?? ""} />
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    aria-label={`Rate ${n} of 5`}
                    className={cn(
                      "num h-9 w-9 rounded-md border text-sm font-semibold transition-colors",
                      rating != null && n <= rating
                        ? "border-accent-dim bg-accent/15 text-accent"
                        : "border-ink-line bg-ink-card text-text-faint hover:text-text-muted",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className={labelCls}>Followed the plan?</span>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 text-text-muted">
                <input
                  type="radio"
                  name="followedPlan"
                  value="yes"
                  defaultChecked={defaults.followedPlan === true}
                  className="accent-[var(--accent)]"
                />
                Yes
              </label>
              <label className="flex items-center gap-2 text-text-muted">
                <input
                  type="radio"
                  name="followedPlan"
                  value="no"
                  defaultChecked={defaults.followedPlan === false}
                  className="accent-[var(--accent)]"
                />
                No
              </label>
            </div>
          </div>

          {[...tagsByCategory.entries()].map(([category, categoryTags]) => (
            <div key={category}>
              <span className={labelCls}>
                {TAG_CATEGORY_LABELS[category] ?? category}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {categoryTags.map((tag) => (
                  <label key={tag.id} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="tagIds"
                      value={tag.id}
                      defaultChecked={defaultTagIds.has(tag.id)}
                      className="peer sr-only"
                    />
                    <span className="inline-block rounded-full border border-ink-line bg-ink-card px-2.5 py-1 text-xs text-text-muted transition-colors peer-checked:border-accent-dim peer-checked:bg-accent/15 peer-checked:text-accent">
                      {tag.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label htmlFor="notes" className={labelCls}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={defaults.notes ?? ""}
              placeholder="What did you see? Why did you take it? What would you do differently?"
              className={inputCls}
            />
          </div>
        </fieldset>

        {/* Chart screenshots */}
        <fieldset className="card p-5">
          <legend className="eyebrow px-1">Chart screenshots</legend>
          <ScreenshotField />
        </fieldset>

        <button
          type="submit"
          className="btn-accent px-5 py-2.5 text-sm"
        >
          {submitLabel}
        </button>
      </div>

      {/* Live preview */}
      <aside className="lg:sticky lg:top-8 h-fit card p-5">
        <p className="eyebrow mb-4">Preview</p>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">Planned risk</dt>
            <dd className="num font-semibold">
              {preview?.plannedRiskAmount != null
                ? formatMoney(preview.plannedRiskAmount)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Gross P&L</dt>
            <dd className={cn("num font-semibold", pnlColor(preview?.grossPnl))}>
              {preview?.grossPnl != null
                ? formatSignedMoney(preview.grossPnl)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Net P&L</dt>
            <dd className={cn("num font-semibold", pnlColor(preview?.netPnl))}>
              {preview?.netPnl != null
                ? formatSignedMoney(preview.netPnl)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between border-t border-ink-line pt-3">
            <dt className="text-text-muted">
              R multiple
              {accountR != null && (
                <span className="num block text-[10px] text-text-faint">
                  {formatMoney(accountR)} = 1R
                </span>
              )}
            </dt>
            <dd
              className={cn(
                "num text-lg font-semibold",
                pnlColor(preview?.rMultiple),
              )}
            >
              {preview?.rMultiple != null ? formatR(preview.rMultiple) : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Tag</dt>
            <dd>
              {preview ? (
                (() => {
                  const outcome = tradeOutcome(
                    preview.netPnl,
                    preview.netPnl == null ? "open" : "closed",
                  );
                  return (
                    <span className={cn("badge", outcome.cls)}>
                      {outcome.label}
                    </span>
                  );
                })()
              ) : (
                <span className="text-text-faint">—</span>
              )}
            </dd>
          </div>
        </dl>
        {instrument && (
          <p className="mt-4 text-xs text-text-faint">
            {instrument.symbol}: ${instrument.pointValue}/pt per contract, tick{" "}
            {instrument.tickSize}
          </p>
        )}
      </aside>
    </form>
  );
}
