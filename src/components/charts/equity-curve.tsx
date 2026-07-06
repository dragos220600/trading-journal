"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/analytics";
import { formatMoney, formatSignedMoney, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";

function CurveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: EquityPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as EquityPoint;
  return (
    <div className="rounded-md border border-ink-line bg-ink-card px-3 py-2 text-xs shadow-lg">
      <p className="text-text-faint mb-1">
        {point.date} · trade #{point.tradeId} · {point.symbol}
      </p>
      <p className="num">
        <span className="text-text-muted">Trade </span>
        <span className={cn("font-semibold", pnlColor(point.netPnl))}>
          {formatSignedMoney(point.netPnl)}
        </span>
      </p>
      <p className="num">
        <span className="text-text-muted">Equity </span>
        <span className="font-semibold text-text-primary">
          {formatMoney(point.equity)}
        </span>
      </p>
    </div>
  );
}

export function EquityCurve({ points }: { points: EquityPoint[] }) {
  // Anchor the curve at zero so the first trade reads as a change from flat
  const data = [
    {
      index: 0,
      date: points[0]?.date ?? "",
      tradeId: 0,
      symbol: "",
      netPnl: 0,
      equity: 0,
    },
    ...points,
  ];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
        >
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-fill)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--accent-fill)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--ink-line)"
            strokeWidth={1}
            vertical={false}
          />
          <XAxis
            dataKey="index"
            tickFormatter={(value: number) =>
              data[value]?.date ? data[value].date.slice(5) : ""
            }
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--ink-line)" }}
            interval="preserveStartEnd"
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(value: number) => `$${value.toLocaleString()}`}
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <ReferenceLine y={0} stroke="var(--text-faint)" strokeWidth={1} />
          <Tooltip
            content={<CurveTooltip />}
            cursor={{ stroke: "var(--text-faint)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#equityFill)"
            activeDot={{
              r: 4,
              fill: "var(--accent)",
              stroke: "var(--ink-raised)",
              strokeWidth: 2,
            }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
