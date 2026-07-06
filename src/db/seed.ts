/**
 * Idempotent seed: CME futures contract specs, starter tags, and a
 * first prop account. Run with `npm run db:seed` (safe to re-run).
 */
import { db } from "./index";
import { accounts, instruments, tags } from "./schema";

const FUTURES: (typeof instruments.$inferInsert)[] = [
  // symbol, name, tickSize, tickValue ($/tick), pointValue ($/point)
  { symbol: "ES", name: "E-mini S&P 500", assetClass: "futures", tickSize: 0.25, tickValue: 12.5, pointValue: 50 },
  { symbol: "MES", name: "Micro E-mini S&P 500", assetClass: "futures", tickSize: 0.25, tickValue: 1.25, pointValue: 5 },
  { symbol: "NQ", name: "E-mini Nasdaq-100", assetClass: "futures", tickSize: 0.25, tickValue: 5, pointValue: 20 },
  { symbol: "MNQ", name: "Micro E-mini Nasdaq-100", assetClass: "futures", tickSize: 0.25, tickValue: 0.5, pointValue: 2 },
  { symbol: "YM", name: "E-mini Dow", assetClass: "futures", tickSize: 1, tickValue: 5, pointValue: 5 },
  { symbol: "MYM", name: "Micro E-mini Dow", assetClass: "futures", tickSize: 1, tickValue: 0.5, pointValue: 0.5 },
  { symbol: "RTY", name: "E-mini Russell 2000", assetClass: "futures", tickSize: 0.1, tickValue: 5, pointValue: 50 },
  { symbol: "M2K", name: "Micro E-mini Russell 2000", assetClass: "futures", tickSize: 0.1, tickValue: 0.5, pointValue: 5 },
  { symbol: "GC", name: "Gold", assetClass: "futures", tickSize: 0.1, tickValue: 10, pointValue: 100 },
  { symbol: "MGC", name: "Micro Gold", assetClass: "futures", tickSize: 0.1, tickValue: 1, pointValue: 10 },
  { symbol: "CL", name: "Crude Oil", assetClass: "futures", tickSize: 0.01, tickValue: 10, pointValue: 1000 },
  { symbol: "MCL", name: "Micro Crude Oil", assetClass: "futures", tickSize: 0.01, tickValue: 1, pointValue: 100 },
  { symbol: "SI", name: "Silver", assetClass: "futures", tickSize: 0.005, tickValue: 25, pointValue: 5000 },
  { symbol: "NG", name: "Natural Gas", assetClass: "futures", tickSize: 0.001, tickValue: 10, pointValue: 10000 },
  { symbol: "6E", name: "Euro FX", assetClass: "futures", tickSize: 0.00005, tickValue: 6.25, pointValue: 125000 },
];

const TAGS: (typeof tags.$inferInsert)[] = [
  { name: "Chased entry", category: "mistake" },
  { name: "Moved stop", category: "mistake" },
  { name: "No stop", category: "mistake" },
  { name: "Oversized", category: "mistake" },
  { name: "Revenge trade", category: "mistake" },
  { name: "Early exit", category: "mistake" },
  { name: "Overtraded", category: "mistake" },
  { name: "Outside plan", category: "mistake" },
  { name: "FOMO", category: "emotion" },
  { name: "Fear", category: "emotion" },
  { name: "Greed", category: "emotion" },
  { name: "Tilt", category: "emotion" },
  { name: "Impatience", category: "emotion" },
  { name: "Hesitation", category: "emotion" },
  { name: "Trend day", category: "context" },
  { name: "Range day", category: "context" },
  { name: "News event", category: "context" },
  { name: "Open drive", category: "context" },
  { name: "Low volume", category: "context" },
];

db.insert(instruments).values(FUTURES).onConflictDoNothing().run();
db.insert(tags).values(TAGS).onConflictDoNothing().run();

const existingAccounts = db.select().from(accounts).all();
if (existingAccounts.length === 0) {
  db.insert(accounts)
    .values({ name: "Apex — Main", broker: "Tradovate (Apex)", currency: "USD" })
    .run();
}

console.log("Seed complete:");
console.log(`  instruments: ${db.select().from(instruments).all().length}`);
console.log(`  tags:        ${db.select().from(tags).all().length}`);
console.log(`  accounts:    ${db.select().from(accounts).all().length}`);
