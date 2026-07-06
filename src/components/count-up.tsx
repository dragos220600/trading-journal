"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney, formatR, formatSignedMoney } from "@/lib/format";

type CountFormat = "signedMoney" | "money" | "percent" | "r" | "number";

function render(value: number, format: CountFormat): string {
  switch (format) {
    case "signedMoney":
      return formatSignedMoney(value);
    case "money":
      return formatMoney(value);
    case "percent":
      return `${value.toFixed(0)}%`;
    case "r":
      return formatR(value);
    case "number":
      return value.toFixed(2);
  }
}

/** Animates a numeric value from zero on mount (skipped for reduced motion). */
export function CountUp({
  value,
  format,
  durationMs = 900,
}: {
  value: number;
  format: CountFormat;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(() => render(value, format));
  const frame = useRef<number>(0);

  useEffect(() => {
    // Initial state already shows the final value — skip the animation
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(render(value * eased, format));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, format, durationMs]);

  return <span suppressHydrationWarning>{display}</span>;
}
