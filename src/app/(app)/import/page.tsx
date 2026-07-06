import { desc, eq } from "drizzle-orm";
import { Link2 } from "lucide-react";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { undoImportBatch } from "@/server/import-actions";
import { ImportForm } from "@/components/import-form";
import { UndoBatchButton } from "@/components/undo-batch-button";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";

export const dynamic = "force-dynamic";

const FORMATS = [
  {
    name: "Tradovate",
    detail: "Orders / Fills CSV",
    status: "supported",
  },
  {
    name: "Generic CSV",
    detail: "side, qty, price, time + symbol columns",
    status: "supported",
  },
  {
    name: "Broker APIs",
    detail: "live sync",
    status: "not planned — local-first",
  },
] as const;

export default async function ImportPage() {
  const user = await requireUser();
  const batches = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.userId, user.id))
    .orderBy(desc(importBatches.importedAt))
    .limit(15)
    .all();
  const lastBatch = batches[0];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-5xl">
      <header
        className="mb-6 reveal"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <p className="eyebrow mb-2">06 · Sync</p>
        <h1 className="text-3xl font-bold tracking-tight">Import</h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Bring your fills in from Tradovate. Re-importing the same file is
          safe — fills you already imported and fills matching
          manually-logged trades are skipped automatically.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
          <ImportForm />
        </div>

        <div className="space-y-4">
          <div
            className="card p-5 reveal"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            <p className="text-sm font-semibold">Last Import</p>
            {lastBatch ? (
              <>
                <p className="num mb-4 text-xs text-text-faint">
                  {formatDateTime(lastBatch.importedAt)}
                </p>
                <dl className="space-y-2.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="eyebrow">Source</dt>
                    <dd className="num uppercase">{lastBatch.source}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="eyebrow">File</dt>
                    <dd className="num truncate">{lastBatch.fileName ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="eyebrow">Trades added</dt>
                    <dd className="num">{lastBatch.tradeCount}</dd>
                  </div>
                </dl>
                <p className="num mt-4 border-t border-ink-line pt-3 text-[11px] tracking-[0.1em] uppercase text-profit">
                  ✓ All records deduplicated
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Nothing imported yet.
              </p>
            )}
          </div>

          <div
            className="card p-5 reveal"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <p className="text-sm font-semibold mb-1">Formats</p>
            <p className="num mb-3 text-xs text-text-faint">
              What the importer understands
            </p>
            <ul className="space-y-3">
              {FORMATS.map((format) => (
                <li key={format.name} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-card text-text-faint">
                    <Link2 size={12} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{format.name}</span>
                    <span className="num block text-[11px] text-text-faint">
                      {format.detail}
                    </span>
                  </span>
                  <span
                    className={
                      format.status === "supported"
                        ? "badge badge-win"
                        : "badge badge-scratch"
                    }
                  >
                    {format.status === "supported" ? "ready" : "n/a"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {batches.length > 0 && (
        <section
          className="mt-8 reveal"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          <p className="eyebrow mb-3">Import history</p>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-line text-left">
                  <th className="eyebrow px-4 py-2.5 font-medium">When</th>
                  <th className="eyebrow px-4 py-2.5 font-medium">File</th>
                  <th className="eyebrow px-4 py-2.5 font-medium text-right">
                    Trades
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-ink-line last:border-b-0"
                  >
                    <td className="num px-4 py-2.5 text-text-muted">
                      {formatDateTime(batch.importedAt)}
                    </td>
                    <td className="px-4 py-2.5">{batch.fileName ?? "—"}</td>
                    <td className="num px-4 py-2.5 text-right">
                      {batch.tradeCount}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <UndoBatchButton
                        batchId={batch.id}
                        tradeCount={batch.tradeCount}
                        action={undoImportBatch}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
