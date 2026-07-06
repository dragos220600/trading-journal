/**
 * Pure aggregation functions for the analytics page. Everything takes
 * plain trade rows so it can be unit-tested without a database.
 */

export interface AnalyticsTrade {
  id: number;
  symbol: string;
  direction: "long" | "short";
  entryTime: string; // ISO
  exitTime: string | null;
  netPnl: number;
  setupName: string | null;
  rMultiple?: number | null;
}

export interface EquityPoint {
  index: number;
  date: string; // "YYYY-MM-DD"
  tradeId: number;
  symbol: string;
  netPnl: number;
  equity: number;
}

/** Cumulative net P&L, one point per closed trade in exit order. */
export function equityCurve(trades: AnalyticsTrade[]): EquityPoint[] {
  const ordered = [...trades].sort((a, b) =>
    (a.exitTime ?? a.entryTime).localeCompare(b.exitTime ?? b.entryTime),
  );
  let equity = 0;
  return ordered.map((t, index) => {
    equity += t.netPnl;
    return {
      index: index + 1,
      date: (t.exitTime ?? t.entryTime).slice(0, 10),
      tradeId: t.id,
      symbol: t.symbol,
      netPnl: t.netPnl,
      equity: Math.round(equity * 100) / 100,
    };
  });
}

export interface DayPnl {
  date: string; // "YYYY-MM-DD"
  netPnl: number;
  tradeCount: number;
}

/** Net P&L per calendar day (by entry date). */
export function dailyPnl(trades: AnalyticsTrade[]): Map<string, DayPnl> {
  const days = new Map<string, DayPnl>();
  for (const t of trades) {
    const date = t.entryTime.slice(0, 10);
    const day = days.get(date) ?? { date, netPnl: 0, tradeCount: 0 };
    day.netPnl = Math.round((day.netPnl + t.netPnl) * 100) / 100;
    day.tradeCount += 1;
    days.set(date, day);
  }
  return days;
}

export interface BreakdownRow {
  label: string;
  netPnl: number;
  tradeCount: number;
  winCount: number;
}

function breakdown(
  trades: AnalyticsTrade[],
  keyOf: (t: AnalyticsTrade) => string,
): BreakdownRow[] {
  const groups = new Map<string, BreakdownRow>();
  for (const t of trades) {
    const label = keyOf(t);
    const row =
      groups.get(label) ?? { label, netPnl: 0, tradeCount: 0, winCount: 0 };
    row.netPnl = Math.round((row.netPnl + t.netPnl) * 100) / 100;
    row.tradeCount += 1;
    if (t.netPnl > 0) row.winCount += 1;
    groups.set(label, row);
  }
  return [...groups.values()];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function byDayOfWeek(trades: AnalyticsTrade[]): BreakdownRow[] {
  const rows = breakdown(trades, (t) => {
    const day = new Date(`${t.entryTime.slice(0, 10)}T00:00:00`).getDay();
    return WEEKDAYS[day];
  });
  return rows.sort(
    (a, b) => WEEKDAYS.indexOf(a.label) - WEEKDAYS.indexOf(b.label),
  );
}

export function byHourOfDay(trades: AnalyticsTrade[]): BreakdownRow[] {
  const rows = breakdown(
    trades,
    (t) => `${t.entryTime.slice(11, 13)}:00`,
  );
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

export function bySymbol(trades: AnalyticsTrade[]): BreakdownRow[] {
  return breakdown(trades, (t) => t.symbol).sort((a, b) => b.netPnl - a.netPnl);
}

export function bySetup(trades: AnalyticsTrade[]): BreakdownRow[] {
  return breakdown(trades, (t) => t.setupName ?? "No setup").sort(
    (a, b) => b.netPnl - a.netPnl,
  );
}

export function byDirection(trades: AnalyticsTrade[]): BreakdownRow[] {
  return breakdown(trades, (t) => (t.direction === "long" ? "Long" : "Short"));
}

export interface SessionRow {
  label: string;
  window: string;
  netPnl: number;
  tradeCount: number;
  winRate: number;
}

const SESSIONS: { label: string; window: string; from: number; to: number }[] =
  [
    { label: "Pre-market", window: "before 09:30", from: 4 * 60, to: 9 * 60 + 30 },
    { label: "Open", window: "09:30–10:30", from: 9 * 60 + 30, to: 10 * 60 + 30 },
    { label: "Midday", window: "10:30–14:00", from: 10 * 60 + 30, to: 14 * 60 },
    { label: "Power hour", window: "14:00–16:00", from: 14 * 60, to: 16 * 60 },
    { label: "Evening", window: "16:00–20:00", from: 16 * 60, to: 20 * 60 },
    { label: "Overnight", window: "20:00–04:00", from: 20 * 60, to: 28 * 60 },
  ];

/** Win rate and net P&L per intraday window (only windows with trades). */
export function bySession(trades: AnalyticsTrade[]): SessionRow[] {
  const rows = SESSIONS.map((s) => ({ ...s, netPnl: 0, wins: 0, total: 0 }));
  for (const t of trades) {
    const minutes =
      Number(t.entryTime.slice(11, 13)) * 60 + Number(t.entryTime.slice(14, 16));
    const adjusted = minutes < 4 * 60 ? minutes + 24 * 60 : minutes;
    const row =
      rows.find((s) => adjusted >= s.from && adjusted < s.to) ??
      rows[rows.length - 1];
    row.netPnl = Math.round((row.netPnl + t.netPnl) * 100) / 100;
    if (t.netPnl > 0) row.wins += 1;
    row.total += 1;
  }
  return rows
    .filter((r) => r.total > 0)
    .map((r) => ({
      label: r.label,
      window: r.window,
      netPnl: r.netPnl,
      tradeCount: r.total,
      winRate: (r.wins / r.total) * 100,
    }));
}

export interface HoldTimeRow {
  label: string;
  winRate: number;
  avgR: number | null;
  avgPnl: number;
  tradeCount: number;
  share: number; // 0..1 of all closed trades
}

const HOLD_BUCKETS: { label: string; maxMinutes: number }[] = [
  { label: "< 5m (Scalp)", maxMinutes: 5 },
  { label: "5–30m (Intraday)", maxMinutes: 30 },
  { label: "30m–4h (Swing)", maxMinutes: 240 },
  { label: "> 4h (Position)", maxMinutes: Infinity },
];

/** Where the R comes from: performance by time-in-trade. */
export function byHoldTime(trades: AnalyticsTrade[]): HoldTimeRow[] {
  const withExit = trades.filter((t) => t.exitTime != null);
  const groups = HOLD_BUCKETS.map((b) => ({
    ...b,
    wins: 0,
    total: 0,
    pnl: 0,
    rSum: 0,
    rCount: 0,
  }));
  for (const t of withExit) {
    const minutes =
      (new Date(t.exitTime!).getTime() - new Date(t.entryTime).getTime()) /
      60000;
    const g = groups.find((b) => minutes < b.maxMinutes) ?? groups[3];
    if (t.netPnl > 0) g.wins += 1;
    g.total += 1;
    g.pnl += t.netPnl;
    if (t.rMultiple != null) {
      g.rSum += t.rMultiple;
      g.rCount += 1;
    }
  }
  return groups
    .filter((g) => g.total > 0)
    .map((g) => ({
      label: g.label,
      winRate: (g.wins / g.total) * 100,
      avgR: g.rCount > 0 ? g.rSum / g.rCount : null,
      avgPnl: g.pnl / g.total,
      tradeCount: g.total,
      share: withExit.length > 0 ? g.total / withExit.length : 0,
    }));
}

export interface SummaryStats {
  totalNetPnl: number;
  tradeCount: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  maxDrawdown: number;
  bestDay: DayPnl | null;
  worstDay: DayPnl | null;
}

export function summaryStats(trades: AnalyticsTrade[]): SummaryStats {
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const totalNetPnl =
    Math.round(trades.reduce((s, t) => s + t.netPnl, 0) * 100) / 100;
  const grossWin = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));

  const curve = equityCurve(trades);
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    maxDrawdown = Math.max(maxDrawdown, peak - point.equity);
  }

  const days = [...dailyPnl(trades).values()];
  const bestDay =
    days.length > 0
      ? days.reduce((a, b) => (b.netPnl > a.netPnl ? b : a))
      : null;
  const worstDay =
    days.length > 0
      ? days.reduce((a, b) => (b.netPnl < a.netPnl ? b : a))
      : null;

  return {
    totalNetPnl,
    tradeCount: trades.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: trades.length > 0 ? totalNetPnl / trades.length : null,
    avgWin: wins.length > 0 ? grossWin / wins.length : null,
    avgLoss: losses.length > 0 ? -grossLoss / losses.length : null,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    bestDay,
    worstDay,
  };
}
