const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** "$1,250.00" / "-$430.50" */
export function formatMoney(value: number): string {
  return usd.format(value);
}

/** "+$1,250.00" / "-$430.50" — for P&L, where the sign is the message */
export function formatSignedMoney(value: number): string {
  return value >= 0 ? `+${usd.format(value)}` : usd.format(value);
}

/** "+1.8R" / "-1.0R" */
export function formatR(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}R`;
}

/** Price with enough decimals for the instrument's tick size. */
export function formatPrice(value: number, tickSize?: number | null): string {
  const decimals = tickSize
    ? Math.max(0, Math.min(6, String(tickSize).split(".")[1]?.length ?? 0))
    : 2;
  return value.toFixed(decimals);
}

/** "2026-07-03 09:42" from an ISO timestamp */
export function formatDateTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/** "2026-07-03" from an ISO timestamp */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Today's date as "YYYY-MM-DD" in LOCAL time (toISOString would give UTC). */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Shift a "YYYY-MM-DD" date by whole days, staying in local time. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Tailwind text color class for a P&L value. */
export function pnlColor(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-text-muted";
  return value > 0 ? "text-profit" : "text-loss";
}
