import type { DayPnl } from "@/lib/analytics";
import { formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Diverging fill: profit/loss fill color, opacity graded by magnitude
 * relative to the biggest day shown. Zero/no-trade days stay on the
 * neutral surface (the diverging midpoint reads as "nothing").
 */
function cellStyle(netPnl: number, maxAbs: number): React.CSSProperties {
  if (netPnl === 0 || maxAbs === 0) return {};
  const intensity = 0.15 + 0.55 * Math.min(1, Math.abs(netPnl) / maxAbs);
  const fill = netPnl > 0 ? "var(--profit-fill)" : "var(--loss-fill)";
  return {
    backgroundColor: `color-mix(in oklab, ${fill} ${Math.round(intensity * 100)}%, var(--ink-card))`,
  };
}

function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first column index
  const leadingBlanks = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(leadingBlanks).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function PnlCalendar({ days }: { days: Map<string, DayPnl> }) {
  const dates = [...days.keys()].sort();
  if (dates.length === 0) return null;

  // Every month between first and last traded date
  const months: { year: number; month: number }[] = [];
  const [firstYear, firstMonth] = dates[0].split("-").map(Number);
  const [lastYear, lastMonth] = dates[dates.length - 1].split("-").map(Number);
  for (
    let y = firstYear, m = firstMonth - 1;
    y < lastYear || (y === lastYear && m <= lastMonth - 1);
    m === 11 ? (y++, (m = 0)) : m++
  ) {
    months.push({ year: y, month: m });
  }

  const maxAbs = Math.max(...[...days.values()].map((d) => Math.abs(d.netPnl)));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {months.map(({ year, month }) => (
        <div key={`${year}-${month}`}>
          <p className="text-sm font-semibold mb-2">
            {MONTH_NAMES[month]}{" "}
            <span className="num text-text-faint">{year}</span>
          </p>
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAY_HEADERS.map((weekday) => (
              <div
                key={weekday}
                className="eyebrow py-1 text-center !text-[10px]"
              >
                {weekday}
              </div>
            ))}
            {monthGrid(year, month).map((date, i) => {
              if (!date) return <div key={i} />;
              const day = days.get(date);
              return (
                <div
                  key={date}
                  style={day ? cellStyle(day.netPnl, maxAbs) : undefined}
                  title={
                    day
                      ? `${date}: ${formatSignedMoney(day.netPnl)} over ${day.tradeCount} trade${day.tradeCount === 1 ? "" : "s"}`
                      : date
                  }
                  className={cn(
                    "min-h-14 rounded-sm border border-ink-line p-1.5",
                    !day && "opacity-45",
                  )}
                >
                  <p className="num text-[10px] text-text-faint">
                    {Number(date.slice(8))}
                  </p>
                  {day && (
                    <>
                      <p className="num text-xs font-semibold text-text-primary">
                        {formatSignedMoney(day.netPnl)}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {day.tradeCount} trade{day.tradeCount === 1 ? "" : "s"}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
