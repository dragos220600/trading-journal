import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Level {
  label: string;
  price: number;
  className: string; // line + text color
}

/**
 * Vertical price scale showing where entry, exit, stop and target sat
 * relative to each other. Pure HTML — renders on the server.
 */
export function PriceLadder({
  entry,
  exit,
  stop,
  target,
  tickSize,
}: {
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  tickSize: number | null;
}) {
  const levels: Level[] = [
    { label: "Entry", price: entry, className: "text-accent border-accent" },
    exit != null && {
      label: "Exit",
      price: exit,
      className: "text-text-primary border-text-primary",
    },
    stop != null && {
      label: "Stop",
      price: stop,
      className: "text-loss border-loss",
    },
    target != null && {
      label: "Target",
      price: target,
      className: "text-profit border-profit",
    },
  ].filter(Boolean) as Level[];

  if (levels.length < 2) return null;

  const prices = levels.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  // 8% padding so the extreme labels don't clip
  const position = (price: number) => 8 + ((max - price) / span) * 84;

  // Nudge overlapping labels apart (sorted top→bottom)
  const sorted = [...levels].sort((a, b) => b.price - a.price);
  const tops: number[] = [];
  for (const level of sorted) {
    let top = position(level.price);
    const prev = tops[tops.length - 1];
    if (prev != null && top - prev < 11) top = prev + 11;
    tops.push(top);
  }

  return (
    <div className="relative h-56">
      {sorted.map((level, i) => (
        <div
          key={level.label}
          className="absolute inset-x-0"
          style={{ top: `${tops[i]}%` }}
        >
          <div
            className={cn(
              "border-t border-dashed opacity-40",
              level.className,
            )}
          />
          <div className="mt-1 flex items-baseline justify-between">
            <span
              className={cn(
                "num text-[10px] tracking-[0.14em] uppercase",
                level.className,
              )}
            >
              {level.label}
            </span>
            <span className={cn("num text-xs font-semibold", level.className)}>
              {formatPrice(level.price, tickSize)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
