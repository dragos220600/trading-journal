import type { BreakdownRow } from "@/lib/analytics";
import { formatSignedMoney, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Horizontal diverging bar list: losses grow left, profits grow right
 * from a shared center baseline. Values are direct-labeled so the list
 * doubles as its own table view.
 */
export function BreakdownList({
  title,
  rows,
}: {
  title: string;
  rows: BreakdownRow[];
}) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)));

  return (
    <div className="card p-5">
      <p className="eyebrow mb-4">{title}</p>
      <div className="space-y-2.5">
        {rows.map((row) => {
          const widthPct = (Math.abs(row.netPnl) / maxAbs) * 100;
          const positive = row.netPnl >= 0;
          return (
            <div
              key={row.label}
              className="grid grid-cols-[5.5rem_1fr_6rem] items-center gap-3 text-sm"
            >
              <span className="truncate text-text-muted" title={row.label}>
                {row.label}
              </span>
              <div className="relative h-4">
                {/* center baseline */}
                <div className="absolute inset-y-0 left-1/2 w-px bg-ink-line" />
                <div
                  className={cn(
                    "absolute inset-y-0.5",
                    positive
                      ? "left-1/2 rounded-r bg-profit-fill"
                      : "right-1/2 rounded-l bg-loss-fill",
                  )}
                  style={{ width: `${widthPct / 2}%` }}
                />
              </div>
              <span
                className={cn(
                  "num text-right text-xs font-semibold",
                  pnlColor(row.netPnl),
                )}
                title={`${row.winCount}/${row.tradeCount} wins`}
              >
                {formatSignedMoney(row.netPnl)}
                <span className="ml-1 font-normal text-text-faint">
                  ({row.tradeCount})
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
