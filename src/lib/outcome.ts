/**
 * The single definition of a trade's outcome tag, used everywhere:
 * WIN (net > 0), LOSE (net < 0), BE (net exactly 0), OPEN (no exit yet).
 */
export interface Outcome {
  label: "win" | "lose" | "be" | "open";
  cls: string; // badge class from globals.css
}

export function tradeOutcome(
  netPnl: number | null | undefined,
  status?: string,
): Outcome {
  if (status === "open" || netPnl == null)
    return { label: "open", cls: "badge-open" };
  if (netPnl > 0) return { label: "win", cls: "badge-win" };
  if (netPnl < 0) return { label: "lose", cls: "badge-loss" };
  return { label: "be", cls: "badge-scratch" };
}
