/**
 * Prop-firm guardrail math. Computed from CLOSED trades only — the
 * journal can't see live unrealized peaks, so treat the numbers as a
 * close approximation of the firm's real-time trailing threshold.
 */

export interface GuardrailRules {
  initialBalance: number;
  trailingDrawdown: number; // $ distance the threshold trails below the peak
  drawdownFreezeAt: number | null; // balance level where trailing stops (e.g. Apex PA: start + 100)
  profitTarget: number | null; // $ above starting balance
  dailyLossLimit: number | null; // $ max loss per day
}

export interface GuardrailTrade {
  netPnl: number;
  /** ISO time used for ordering and day bucketing (exit preferred) */
  time: string;
}

export interface GuardrailStatus {
  balance: number;
  peak: number;
  threshold: number;
  /** $ of room left before the account is breached */
  distanceToBreach: number;
  /** distance as a share of the full drawdown (0..1), clamped */
  headroomRatio: number;
  breached: boolean;
  level: "green" | "amber" | "red";
  frozen: boolean; // threshold has hit the freeze level
  /** Profit target progress 0..1 (null when no target set) */
  targetProgress: number | null;
  targetRemaining: number | null;
  /** Daily loss limit ($ still allowed to lose today; null when unset) */
  dailyRemaining: number | null;
  dailyPnl: number;
}

export function computeGuardrail(
  rules: GuardrailRules,
  closedTrades: GuardrailTrade[],
  today: string, // "YYYY-MM-DD"
): GuardrailStatus {
  const ordered = [...closedTrades].sort((a, b) =>
    a.time.localeCompare(b.time),
  );

  let balance = rules.initialBalance;
  let peak = rules.initialBalance;
  for (const trade of ordered) {
    balance += trade.netPnl;
    if (balance > peak) peak = balance;
  }

  let threshold = peak - rules.trailingDrawdown;
  let frozen = false;
  if (rules.drawdownFreezeAt != null && threshold >= rules.drawdownFreezeAt) {
    threshold = rules.drawdownFreezeAt;
    frozen = true;
  }

  const distanceToBreach = balance - threshold;
  const headroomRatio = Math.max(
    0,
    Math.min(1, distanceToBreach / rules.trailingDrawdown),
  );
  const breached = distanceToBreach <= 0;

  const dailyPnl = ordered
    .filter((t) => t.time.startsWith(today))
    .reduce((s, t) => s + t.netPnl, 0);

  return {
    balance,
    peak,
    threshold,
    distanceToBreach,
    headroomRatio,
    breached,
    level: breached || headroomRatio < 0.25 ? "red" : headroomRatio < 0.5 ? "amber" : "green",
    frozen,
    targetProgress:
      rules.profitTarget != null && rules.profitTarget > 0
        ? Math.max(
            0,
            Math.min(1, (balance - rules.initialBalance) / rules.profitTarget),
          )
        : null,
    targetRemaining:
      rules.profitTarget != null
        ? Math.max(0, rules.initialBalance + rules.profitTarget - balance)
        : null,
    dailyRemaining:
      rules.dailyLossLimit != null
        ? Math.max(0, rules.dailyLossLimit + Math.min(0, dailyPnl))
        : null,
    dailyPnl,
  };
}
