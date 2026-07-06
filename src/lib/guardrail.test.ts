/**
 * Run: npx tsx src/lib/guardrail.test.ts
 */
import assert from "node:assert/strict";
import { computeGuardrail, type GuardrailRules } from "./guardrail";

const BASE: GuardrailRules = {
  initialBalance: 150000,
  trailingDrawdown: 5000,
  drawdownFreezeAt: null,
  profitTarget: 9000,
  dailyLossLimit: 2500,
};

const t = (netPnl: number, time: string) => ({ netPnl, time });

// Fresh account: threshold = start - drawdown, full headroom
{
  const s = computeGuardrail(BASE, [], "2026-07-06");
  assert.equal(s.balance, 150000);
  assert.equal(s.threshold, 145000);
  assert.equal(s.distanceToBreach, 5000);
  assert.equal(s.headroomRatio, 1);
  assert.equal(s.level, "green");
  assert.equal(s.breached, false);
}

// Peak trails the threshold up; pulling back from the peak shrinks headroom
{
  const s = computeGuardrail(
    BASE,
    [t(3000, "2026-07-01T10:00:00"), t(-2000, "2026-07-02T10:00:00")],
    "2026-07-06",
  );
  // peak 153000 → threshold 148000; balance 151000 → distance 3000 (0.6 → green)
  assert.equal(s.peak, 153000);
  assert.equal(s.threshold, 148000);
  assert.equal(s.distanceToBreach, 3000);
  assert.equal(s.level, "green");
}

// Amber under 50%, red under 25%, breached at or below the threshold
{
  const amber = computeGuardrail(
    BASE,
    [t(3000, "2026-07-01T10:00:00"), t(-3200, "2026-07-02T10:00:00")],
    "2026-07-06",
  ); // distance 1800 → 0.36
  assert.equal(amber.level, "amber");

  const red = computeGuardrail(
    BASE,
    [t(3000, "2026-07-01T10:00:00"), t(-4000, "2026-07-02T10:00:00")],
    "2026-07-06",
  ); // distance 1000 → 0.2
  assert.equal(red.level, "red");

  const breached = computeGuardrail(
    BASE,
    [t(3000, "2026-07-01T10:00:00"), t(-5200, "2026-07-02T10:00:00")],
    "2026-07-06",
  ); // balance 147800 < threshold 148000
  assert.equal(breached.breached, true);
  assert.equal(breached.level, "red");
  assert.equal(breached.headroomRatio, 0);
}

// Freeze level caps the threshold (Apex PA style: start + 100)
{
  const s = computeGuardrail(
    { ...BASE, drawdownFreezeAt: 150100 },
    [t(8000, "2026-07-01T10:00:00")], // peak 158000 → raw threshold 153000
    "2026-07-06",
  );
  assert.equal(s.threshold, 150100);
  assert.equal(s.frozen, true);
  assert.equal(s.distanceToBreach, 158000 - 150100);
}

// Profit target progress and remaining
{
  const s = computeGuardrail(BASE, [t(4500, "2026-07-01T10:00:00")], "2026-07-06");
  assert.equal(s.targetProgress, 0.5);
  assert.equal(s.targetRemaining, 4500);
}

// Daily loss limit: only today's losses eat into it
{
  const s = computeGuardrail(
    BASE,
    [
      t(-1000, "2026-07-05T10:00:00"), // yesterday — irrelevant
      t(-800, "2026-07-06T10:00:00"),
      t(300, "2026-07-06T12:00:00"),
    ],
    "2026-07-06",
  );
  assert.equal(s.dailyPnl, -500);
  assert.equal(s.dailyRemaining, 2000);
}

// A green day never increases the remaining loss allowance beyond the limit
{
  const s = computeGuardrail(
    BASE,
    [t(900, "2026-07-06T10:00:00")],
    "2026-07-06",
  );
  assert.equal(s.dailyRemaining, 2500);
}

console.log("All guardrail tests passed.");
