import { and, asc, eq } from "drizzle-orm";
import { Plus, Target } from "lucide-react";
import { db } from "@/db";
import { setups, trades } from "@/db/schema";
import { createSetup, deleteSetup } from "@/server/actions";
import { DeleteSetupButton } from "@/components/delete-setup-button";
import { requireUser } from "@/server/auth";
import { formatR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-md border border-ink-line bg-ink-card px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim";

interface SetupStats {
  winRate: number | null;
  profitFactor: number | null; // Infinity when there are wins but no losses
  avgR: number | null;
  tradeCount: number;
}

export default async function PlaybookPage() {
  const user = await requireUser();
  const setupRows = db
    .select()
    .from(setups)
    .where(and(eq(setups.userId, user.id), eq(setups.isArchived, false)))
    .orderBy(asc(setups.name))
    .all();

  const allTradeRows = db
    .select({
      setupId: trades.setupId,
      netPnl: trades.netPnl,
      rMultiple: trades.rMultiple,
      status: trades.status,
    })
    .from(trades)
    .where(eq(trades.userId, user.id))
    .all();
  const closedTradeRows = allTradeRows.filter(
    (t) => t.status === "closed" && t.netPnl != null,
  );

  /** Total trades referencing the setup (incl. open) — for the delete confirm. */
  const referencedCount = (setupId: number) =>
    allTradeRows.filter((t) => t.setupId === setupId).length;

  const statsFor = (setupId: number): SetupStats => {
    const own = closedTradeRows.filter((t) => t.setupId === setupId);
    if (own.length === 0)
      return { winRate: null, profitFactor: null, avgR: null, tradeCount: 0 };
    const wins = own.filter((t) => t.netPnl! > 0);
    const grossWin = wins.reduce((s, t) => s + t.netPnl!, 0);
    const grossLoss = Math.abs(
      own.filter((t) => t.netPnl! < 0).reduce((s, t) => s + t.netPnl!, 0),
    );
    const rTrades = own.filter((t) => t.rMultiple != null);
    return {
      winRate: (wins.length / own.length) * 100,
      profitFactor:
        grossLoss > 0
          ? grossWin / grossLoss
          : grossWin > 0
            ? Infinity
            : null,
      avgR:
        rTrades.length > 0
          ? rTrades.reduce((s, t) => s + t.rMultiple!, 0) / rTrades.length
          : null,
      tradeCount: own.length,
    };
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-6xl">
      <header
        className="mb-6 flex flex-wrap items-end justify-between gap-4 reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div>
          <p className="eyebrow mb-2">03 · Strategies</p>
          <h1 className="text-3xl font-bold tracking-tight">Playbook</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Every strategy you trade — with rules, checklist and live edge.
          </p>
        </div>
        <a
          href="#new-setup"
          className="btn-accent flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Plus size={14} aria-hidden /> New Setup
        </a>
      </header>

      {setupRows.length === 0 ? (
        <div
          className="mb-8 rounded-xl border border-dashed border-ink-line px-8 py-10 text-center reveal"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Name the setups you actually trade — each trade you log links to
            one, so the journal shows you which edges pay and which don&apos;t.
          </p>
        </div>
      ) : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {setupRows.map((setup, i) => {
            const stats = statsFor(setup.id);
            const rules = (setup.rules ?? "")
              .split("\n")
              .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
              .filter(Boolean);
            return (
              <article
                key={setup.id}
                className="card card-hover p-5 reveal"
                style={{ "--i": Math.min(i + 1, 6) } as React.CSSProperties}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Target
                      size={15}
                      aria-hidden
                      className={cn(
                        stats.winRate == null
                          ? "text-text-faint"
                          : stats.winRate >= 50
                            ? "text-profit"
                            : "text-loss",
                      )}
                    />
                    {setup.name}
                  </h2>
                  <div className="flex items-center gap-2">
                    {stats.winRate != null ? (
                      <span
                        className={cn(
                          "badge",
                          stats.winRate >= 50 ? "badge-win" : "badge-loss",
                        )}
                      >
                        {stats.winRate.toFixed(0)}% WR
                      </span>
                    ) : (
                      <span className="badge badge-scratch">no trades</span>
                    )}
                    <DeleteSetupButton
                      setupId={setup.id}
                      setupName={setup.name}
                      tradeCount={referencedCount(setup.id)}
                      action={deleteSetup}
                    />
                  </div>
                </div>
                {setup.description && (
                  <p className="mb-4 text-sm text-text-muted">
                    {setup.description}
                  </p>
                )}

                <div className="mb-4 grid grid-cols-3 gap-3 border-t border-ink-line pt-4">
                  <div>
                    <p className="eyebrow mb-1">Profit factor</p>
                    <p className="num text-sm font-semibold">
                      {stats.profitFactor == null
                        ? "—"
                        : stats.profitFactor === Infinity
                          ? "∞"
                          : stats.profitFactor.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow mb-1">Avg R</p>
                    <p className="num text-sm font-semibold">
                      {stats.avgR != null ? formatR(stats.avgR) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow mb-1">Trades</p>
                    <p className="num text-sm font-semibold">
                      {stats.tradeCount}
                    </p>
                  </div>
                </div>

                {rules.length > 0 && (
                  <div>
                    <p className="eyebrow mb-2">Entry checklist</p>
                    <ul className="space-y-1.5">
                      {rules.map((rule) => (
                        <li
                          key={rule}
                          className="flex items-start gap-2 text-sm text-text-muted"
                        >
                          <span
                            className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent"
                            aria-hidden
                          />
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <form
        id="new-setup"
        action={createSetup}
        className="card p-5 space-y-4 max-w-xl scroll-mt-8"
      >
        <p className="eyebrow text-accent">Add a setup</p>
        <div>
          <label
            htmlFor="setup-name"
            className="block text-xs font-medium text-text-muted mb-1.5"
          >
            Name
          </label>
          <input
            id="setup-name"
            name="name"
            required
            placeholder="Opening Range Breakout"
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="setup-description"
            className="block text-xs font-medium text-text-muted mb-1.5"
          >
            Description
          </label>
          <input
            id="setup-description"
            name="description"
            placeholder="Break of the first 15-minute range with volume"
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="setup-rules"
            className="block text-xs font-medium text-text-muted mb-1.5"
          >
            Entry rules (one per line)
          </label>
          <textarea
            id="setup-rules"
            name="rules"
            rows={4}
            placeholder={"Wait for 15-min range to form\nEnter on break + retest\nStop below range midpoint"}
            className={inputCls}
          />
        </div>
        <button type="submit" className="btn-accent px-4 py-2 text-sm">
          Add setup
        </button>
      </form>
    </div>
  );
}
