import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instruments, journalEntries, trades } from "@/db/schema";
import { formatSignedMoney, localToday, pnlColor } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface DayRow {
  date: string;
  netPnl: number;
  tradeCount: number;
  hasPlan: boolean;
  hasReview: boolean;
  mood: number | null;
}

export default async function JournalPage() {
  const user = await requireUser();
  const tradeRows = await db
    .select({
      entryTime: trades.entryTime,
      netPnl: trades.netPnl,
      symbol: instruments.symbol,
    })
    .from(trades)
    .innerJoin(instruments, eq(trades.instrumentId, instruments.id))
    .where(eq(trades.userId, user.id))
    .all();

  const entryRows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.userId, user.id))
    .all();

  const days = new Map<string, DayRow>();
  for (const t of tradeRows) {
    const date = t.entryTime.slice(0, 10);
    const day =
      days.get(date) ??
      { date, netPnl: 0, tradeCount: 0, hasPlan: false, hasReview: false, mood: null };
    day.netPnl = Math.round((day.netPnl + (t.netPnl ?? 0)) * 100) / 100;
    day.tradeCount += 1;
    days.set(date, day);
  }
  for (const e of entryRows) {
    const day =
      days.get(e.date) ??
      { date: e.date, netPnl: 0, tradeCount: 0, hasPlan: false, hasReview: false, mood: null };
    day.hasPlan = !!e.premarketPlan;
    day.hasReview = !!e.review;
    day.mood = e.mood;
    days.set(e.date, day);
  }

  const sorted = [...days.values()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const today = localToday();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 max-w-4xl">
      <header
        className="mb-8 flex items-end justify-between reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div>
          <p className="eyebrow mb-2">04 · Journal</p>
          <h1 className="text-3xl font-bold tracking-tight">Trading days</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Every session — plan it before the bell, review it after.
          </p>
        </div>
        <Link href={`/journal/${today}`} className="btn-accent px-4 py-2 text-sm">
          Today&apos;s entry
        </Link>
      </header>

      {sorted.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-ink-line px-8 py-14 text-center reveal"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <p className="text-sm text-text-muted max-w-md mx-auto">
            No trading days yet. Days appear here automatically when you
            import or log trades — or start with today&apos;s pre-market plan.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((day, i) => (
            <Link
              key={day.date}
              href={`/journal/${day.date}`}
              className="card card-hover flex items-center gap-4 px-5 py-3.5 reveal"
              style={{ "--i": Math.min(i + 1, 8) } as React.CSSProperties}
            >
              <div className="w-32">
                <p className="num text-sm font-semibold">{day.date}</p>
                <p className="text-xs text-text-faint">
                  {new Date(`${day.date}T00:00:00`).toLocaleDateString(
                    "en-US",
                    { weekday: "long" },
                  )}
                </p>
              </div>
              <div className="flex-1 flex items-center gap-2 text-xs">
                {day.hasPlan && (
                  <span className="rounded-full border border-ink-line bg-ink-card px-2 py-0.5 text-text-muted">
                    plan
                  </span>
                )}
                {day.hasReview && (
                  <span className="rounded-full border border-ink-line bg-ink-card px-2 py-0.5 text-text-muted">
                    review
                  </span>
                )}
                {day.mood != null && (
                  <span className="rounded-full border border-ink-line bg-ink-card px-2 py-0.5 text-text-muted">
                    mood <span className="num text-accent">{day.mood}/5</span>
                  </span>
                )}
                {!day.hasPlan && !day.hasReview && day.tradeCount > 0 && (
                  <span className="text-text-faint">not journaled yet</span>
                )}
              </div>
              <div className="text-right">
                {day.tradeCount > 0 ? (
                  <>
                    <p
                      className={cn(
                        "num text-sm font-semibold",
                        pnlColor(day.netPnl),
                      )}
                    >
                      {formatSignedMoney(day.netPnl)}
                    </p>
                    <p className="text-xs text-text-faint">
                      {day.tradeCount}{" "}
                      {day.tradeCount === 1 ? "trade" : "trades"}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-text-faint">no trades</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
