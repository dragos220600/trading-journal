/**
 * P&L math for futures. All dollar amounts derive from the instrument's
 * pointValue ($ per full point per contract).
 */

export interface TradeMetricsInput {
  direction: "long" | "short";
  quantity: number;
  avgEntryPrice: number;
  avgExitPrice: number | null | undefined;
  stopPrice: number | null | undefined;
  pointValue: number;
  fees: number;
}

export interface TradeMetrics {
  grossPnl: number | null;
  netPnl: number | null;
  plannedRiskAmount: number | null;
  rMultiple: number | null;
}

export function computeTradeMetrics(input: TradeMetricsInput): TradeMetrics {
  const {
    direction,
    quantity,
    avgEntryPrice,
    avgExitPrice,
    stopPrice,
    pointValue,
    fees,
  } = input;

  const sign = direction === "long" ? 1 : -1;

  const plannedRiskAmount =
    stopPrice != null
      ? Math.abs(avgEntryPrice - stopPrice) * quantity * pointValue
      : null;

  if (avgExitPrice == null) {
    return { grossPnl: null, netPnl: null, plannedRiskAmount, rMultiple: null };
  }

  const grossPnl = (avgExitPrice - avgEntryPrice) * sign * quantity * pointValue;
  const netPnl = grossPnl - fees;
  const rMultiple =
    plannedRiskAmount != null && plannedRiskAmount > 0
      ? netPnl / plannedRiskAmount
      : null;

  return { grossPnl, netPnl, plannedRiskAmount, rMultiple };
}
