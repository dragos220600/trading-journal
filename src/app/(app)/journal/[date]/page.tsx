import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { attachments, instruments, journalEntries, trades } from "@/db/schema";
import {
  addJournalAttachment,
  saveJournalEntry,
} from "@/server/journal-actions";
import { deleteAttachment } from "@/server/attachment-actions";
import { requireUser } from "@/server/auth";
import { JournalEntryForm } from "@/components/journal-entry-form";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { AttachmentUploader } from "@/components/attachment-uploader";
import {
  formatDateTime,
  formatR,
  formatSignedMoney,
  pnlColor,
  shiftDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function JournalDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const user = await requireUser();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const entry = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, user.id), eq(journalEntries.date, date)))
    .get();

  const dayTrades = await db
    .select({
      id: trades.id,
      entryTime: trades.entryTime,
      direction: trades.direction,
      netPnl: trades.netPnl,
      rMultiple: trades.rMultiple,
      symbol: instruments.symbol,
    })
    .from(trades)
    .innerJoin(instruments, eq(trades.instrumentId, instruments.id))
    .where(and(eq(trades.userId, user.id), like(trades.entryTime, `${date}%`)))
    .all();

  const dayPnl =
    Math.round(dayTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0) * 100) / 100;

  const attachmentRows = entry
    ? await db
        .select()
        .from(attachments)
        .where(eq(attachments.journalEntryId, entry.id))
        .all()
    : [];

  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const saveAction = saveJournalEntry.bind(null, date);
  const attachAction = addJournalAttachment.bind(null, date);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/journal"
          className="text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          ← All days
        </Link>
        <div className="flex gap-2 num text-sm">
          <Link
            href={`/journal/${shiftDate(date, -1)}`}
            className="btn-ghost px-3 py-1.5"
          >
            ← prev
          </Link>
          <Link
            href={`/journal/${shiftDate(date, 1)}`}
            className="btn-ghost px-3 py-1.5"
          >
            next →
          </Link>
        </div>
      </div>

      <header
        className="mb-8 flex flex-wrap items-end justify-between gap-4 reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <div>
          <p className="eyebrow mb-2">04 · Journal · {date}</p>
          <h1 className="text-3xl font-bold tracking-tight">{weekday}</h1>
        </div>
        {dayTrades.length > 0 && (
          <div className="text-right">
            <p className={cn("num text-2xl font-semibold", pnlColor(dayPnl))}>
              {formatSignedMoney(dayPnl)}
            </p>
            <p className="text-xs text-text-faint">
              {dayTrades.length} {dayTrades.length === 1 ? "trade" : "trades"}
            </p>
          </div>
        )}
      </header>

      <div
        className="mb-8 reveal"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <JournalEntryForm
          action={saveAction}
          defaults={{
            premarketPlan: entry?.premarketPlan ?? null,
            review: entry?.review ?? null,
            mood: entry?.mood ?? null,
            sleepQuality: entry?.sleepQuality ?? null,
          }}
        />
      </div>

      {dayTrades.length > 0 && (
        <section
          className="mb-8 reveal"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <p className="eyebrow mb-3">Trades this day</p>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {dayTrades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="row-link border-b border-ink-line last:border-b-0"
                  >
                    <td className="px-4 py-3 num text-text-muted">
                      <Link
                        href={`/trades/${trade.id}`}
                        className="block -mx-4 -my-3 px-4 py-3"
                      >
                        {formatDateTime(trade.entryTime).slice(11)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-semibold">{trade.symbol}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "num rounded px-1.5 py-0.5 text-xs font-semibold uppercase",
                          trade.direction === "long"
                            ? "bg-profit/10 text-profit"
                            : "bg-loss/10 text-loss",
                        )}
                      >
                        {trade.direction}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 num text-right font-semibold",
                        pnlColor(trade.netPnl),
                      )}
                    >
                      {trade.netPnl != null
                        ? formatSignedMoney(trade.netPnl)
                        : "open"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 num text-right",
                        pnlColor(trade.rMultiple),
                      )}
                    >
                      {trade.rMultiple != null ? formatR(trade.rMultiple) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <p className="eyebrow mb-3">Day screenshots</p>
        <AttachmentGallery
          items={attachmentRows.map((a) => ({ id: a.id, caption: a.caption }))}
          deleteAction={deleteAttachment}
        />
        <AttachmentUploader action={attachAction} />
      </section>
    </div>
  );
}
