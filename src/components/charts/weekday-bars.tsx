"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { BreakdownRow } from "@/lib/analytics";

/** Vertical P&L columns per weekday, value-labeled per the template. */
export function WeekdayBars({ rows }: { rows: BreakdownRow[] }) {
  const data = rows.map((r) => ({ day: r.label.toUpperCase(), pnl: r.netPnl }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 4, left: 8 }}>
          <XAxis
            dataKey="day"
            tick={{
              fill: "var(--text-faint)",
              fontSize: 10,
              fontFamily: "var(--font-plex-mono)",
            }}
            tickLine={false}
            axisLine={{ stroke: "var(--ink-line)" }}
          />
          <YAxis
            tickFormatter={(v: number) =>
              `${v < 0 ? "-" : "+"}$${Math.abs(v).toLocaleString()}`
            }
            tick={{
              fill: "var(--text-faint)",
              fontSize: 10,
              fontFamily: "var(--font-plex-mono)",
            }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <ReferenceLine y={0} stroke="var(--ink-line-bright)" strokeWidth={1} />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={44}>
            {data.map((entry) => (
              <Cell
                key={entry.day}
                fill={
                  entry.pnl >= 0 ? "var(--profit-fill)" : "var(--loss-fill)"
                }
              />
            ))}
            <LabelList
              dataKey="pnl"
              position="top"
              formatter={(value) =>
                `${Number(value) < 0 ? "-" : "+"}$${Math.abs(Number(value)).toLocaleString()}`
              }
              style={{
                fill: "var(--text-muted)",
                fontSize: 10,
                fontFamily: "var(--font-plex-mono)",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
