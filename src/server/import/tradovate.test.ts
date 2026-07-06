/**
 * Poor-man's unit tests for the import logic. Run: npx tsx src/server/import/tradovate.test.ts
 */
import assert from "node:assert/strict";
import {
  buildTrades,
  contractRoot,
  parseTimestamp,
  parseTradovateCsv,
  splitManualOverlaps,
  type ManualExecution,
  type ParsedFill,
} from "./tradovate";

/* timestamps */
assert.equal(parseTimestamp("2026-07-03T09:42:15"), "2026-07-03T09:42:15");
assert.equal(parseTimestamp("2026-07-03 09:42"), "2026-07-03T09:42:00");
assert.equal(parseTimestamp("07/03/2026 09:42:15"), "2026-07-03T09:42:15");
assert.equal(parseTimestamp("7/3/2026 1:05 PM"), "2026-07-03T13:05:00");
assert.equal(parseTimestamp("7/3/2026 12:05 AM"), "2026-07-03T00:05:00");
assert.equal(parseTimestamp("07/03/2026"), "2026-07-03T00:00:00");
assert.equal(parseTimestamp("garbage"), null);

/* contract roots */
assert.equal(contractRoot("NQZ5"), "NQ");
assert.equal(contractRoot("MNQH26"), "MNQ");
assert.equal(contractRoot("GCG6"), "GC");
assert.equal(contractRoot("MNQ"), "MNQ");
assert.equal(contractRoot("m2kz5"), "M2K");

/* FIFO builder */
function fill(
  side: "buy" | "sell",
  quantity: number,
  price: number,
  time: string,
  id?: string,
): ParsedFill {
  return {
    externalId: id ?? null,
    account: "APEX-1",
    root: "MNQ",
    contract: "MNQZ5",
    side,
    quantity,
    price,
    time,
  };
}

// simple round trip
{
  const trades = buildTrades([
    fill("buy", 2, 23000, "2026-07-03T09:00:00"),
    fill("sell", 2, 23010, "2026-07-03T09:05:00"),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, "long");
  assert.equal(trades[0].status, "closed");
  assert.equal(trades[0].quantity, 2);
  assert.equal(trades[0].avgEntryPrice, 23000);
  assert.equal(trades[0].avgExitPrice, 23010);
}

// scale in and out with weighted averages
{
  const trades = buildTrades([
    fill("buy", 2, 23000, "2026-07-03T09:00:00"),
    fill("buy", 2, 23004, "2026-07-03T09:01:00"),
    fill("sell", 1, 23010, "2026-07-03T09:05:00"),
    fill("sell", 3, 23020, "2026-07-03T09:06:00"),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].quantity, 4);
  assert.equal(trades[0].avgEntryPrice, 23002);
  assert.equal(trades[0].avgExitPrice, 23017.5);
  assert.equal(trades[0].executions.length, 4);
}

// position flip: long 2 -> sell 4 -> now short 2, covered later
{
  const trades = buildTrades([
    fill("buy", 2, 23000, "2026-07-03T09:00:00", "A"),
    fill("sell", 4, 23010, "2026-07-03T09:05:00", "B"),
    fill("buy", 2, 23005, "2026-07-03T09:10:00", "C"),
  ]);
  assert.equal(trades.length, 2);
  assert.equal(trades[0].direction, "long");
  assert.equal(trades[0].quantity, 2);
  assert.equal(trades[0].avgExitPrice, 23010);
  assert.equal(trades[1].direction, "short");
  assert.equal(trades[1].quantity, 2);
  assert.equal(trades[1].avgEntryPrice, 23010);
  assert.equal(trades[1].avgExitPrice, 23005);
  assert.equal(trades[1].executions[0].externalId, "B:flip");
}

// open position at end
{
  const trades = buildTrades([
    fill("buy", 2, 23000, "2026-07-03T09:00:00"),
    fill("sell", 1, 23010, "2026-07-03T09:05:00"),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].status, "open");
  assert.equal(trades[0].exitTime, null);
}

// separate accounts and symbols don't mix
{
  const trades = buildTrades([
    fill("buy", 1, 23000, "2026-07-03T09:00:00"),
    { ...fill("sell", 1, 23010, "2026-07-03T09:05:00"), account: "APEX-2" },
  ]);
  assert.equal(trades.length, 2);
  assert.equal(trades[0].status, "open");
  assert.equal(trades[1].status, "open");
}

/* CSV end-to-end parse (Tradovate Orders-style headers) */
{
  const csv = [
    "orderId,Account,Order ID,B/S,Contract,Product,avgPrice,filledQty,Fill Time,Status,Text,Type,Qty",
    "101,APEX-12345-68,101,Buy,MNQZ5,MNQ,23000.25,2,07/03/2026 09:42:15,Filled,,Market,2",
    "102,APEX-12345-68,102,Sell,MNQZ5,MNQ,23010.75,2,07/03/2026 09:55:03,Filled,,Limit,2",
    "103,APEX-12345-68,103,Buy,MNQZ5,MNQ,,0,,Canceled,,Limit,2",
  ].join("\n");

  const result = parseTradovateCsv(csv);
  assert.equal(result.fills.length, 2);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.fills[0].root, "MNQ");
  assert.equal(result.fills[0].quantity, 2);
  assert.equal(result.fills[0].price, 23000.25);
  assert.equal(result.fills[0].time, "2026-07-03T09:42:15");
  assert.equal(result.fills[0].account, "APEX-12345-68");

  const trades = buildTrades(result.fills);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].status, "closed");
}

/* manual-overlap protection */
{
  const accountIdByName = new Map([["APEX-1", 7]]);
  const manual: ManualExecution[] = [
    {
      accountId: 7,
      root: "MNQ",
      side: "buy",
      price: 23000.25,
      time: "2026-07-03T09:42:00",
      tickSize: 0.25,
    },
  ];

  // Same account+root+side, price within 2 ticks, 15s later → skipped
  const overlapping = fill("buy", 2, 23000.5, "2026-07-03T09:42:15");
  // Different side → kept
  const otherSide = fill("sell", 2, 23000.25, "2026-07-03T09:42:15");
  // Same everything but 5 minutes later → kept
  const laterTime = fill("buy", 2, 23000.25, "2026-07-03T09:47:30");
  // Same trade on a DIFFERENT account (copy trading) → kept
  const otherAccount = {
    ...fill("buy", 2, 23000.25, "2026-07-03T09:42:15"),
    account: "APEX-2",
  };

  const { kept, skipped } = splitManualOverlaps(
    [overlapping, otherSide, laterTime, otherAccount],
    manual,
    accountIdByName,
  );
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0], overlapping);
  assert.equal(kept.length, 3);
}

/* missing columns produce a clear warning */
{
  const result = parseTradovateCsv("Foo,Bar\n1,2");
  assert.equal(result.fills.length, 0);
  assert.match(result.warnings[0], /Could not find required column/);
}

console.log("All import tests passed.");
