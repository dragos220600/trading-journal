import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { GuardrailStatus } from "@/lib/guardrail";
import { formatMoney, formatSignedMoney, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL = {
  green: {
    badge: "badge-win",
    label: "safe",
    bar: "bg-profit-fill",
    text: "text-profit",
    Icon: ShieldCheck,
  },
  amber: {
    badge: "badge-warn",
    label: "caution",
    bar: "bg-warn-fill",
    text: "text-warn",
    Icon: ShieldAlert,
  },
  red: {
    badge: "badge-loss",
    label: "danger",
    bar: "bg-loss-fill",
    text: "text-loss",
    Icon: ShieldX,
  },
} as const;

export function GuardrailCard({
  accountName,
  status,
}: {
  accountName: string;
  status: GuardrailStatus;
}) {
  const level = LEVEL[status.level];
  const Icon = level.Icon;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon size={15} aria-hidden className={level.text} />
          <span className="truncate">{accountName}</span>
        </p>
        <span className={cn("badge", level.badge)}>
          {status.breached ? "breached" : level.label}
        </span>
      </div>

      {/* Distance-to-breach meter */}
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="eyebrow">Distance to breach</span>
        <span className={cn("num text-lg font-semibold", level.text)}>
          {formatMoney(Math.max(0, status.distanceToBreach))}
        </span>
      </div>
      <div className="mb-4 h-1.5 rounded-full bg-ink-card overflow-hidden">
        <div
          className={cn("h-full rounded-full", level.bar)}
          style={{ width: `${Math.max(2, status.headroomRatio * 100)}%` }}
        />
      </div>

      <dl className="space-y-2 text-xs">
        <div className="flex justify-between">
          <dt className="text-text-muted">Balance</dt>
          <dd className="num font-semibold">{formatMoney(status.balance)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-muted">
            Threshold{status.frozen ? " (frozen)" : " (trailing)"}
          </dt>
          <dd className="num">{formatMoney(status.threshold)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-muted">Today</dt>
          <dd className={cn("num font-semibold", pnlColor(status.dailyPnl))}>
            {formatSignedMoney(status.dailyPnl)}
            {status.dailyRemaining != null && (
              <span className="ml-1 font-normal text-text-faint">
                · {formatMoney(status.dailyRemaining)} loss room
              </span>
            )}
          </dd>
        </div>
      </dl>

      {status.targetProgress != null && (
        <div className="mt-4 border-t border-ink-line pt-3">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="eyebrow">Profit target</span>
            <span className="num text-xs">
              <span className="font-semibold text-text-primary">
                {(status.targetProgress * 100).toFixed(0)}%
              </span>
              {status.targetRemaining != null &&
                status.targetRemaining > 0 && (
                  <span className="text-text-faint">
                    {" "}
                    · {formatMoney(status.targetRemaining)} to go
                  </span>
                )}
            </span>
          </div>
          <div className="h-1 rounded-full bg-ink-card overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-fill"
              style={{ width: `${Math.max(2, status.targetProgress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
