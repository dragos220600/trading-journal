import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

/** App users — email + scrypt password hash, friends-scale auth. */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Cookie-backed sessions, revocable server-side. */
export const sessions = sqliteTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(), // ISO 8601
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Trading accounts (live, funded, prop-firm eval, sim...).
 * Every trade belongs to exactly one account so stats can be
 * filtered per account or aggregated across all of them.
 */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  broker: text("broker"),
  currency: text("currency").notNull().default("USD"),
  initialBalance: real("initial_balance").notNull().default(0),
  /** Fixed $ per 1R for this account; when set it defines every trade's
      R-multiple (netPnl / rValue), overriding stop-based R. */
  rValue: real("r_value"),

  /* Prop-firm guardrail rules (all optional; guardrail shows when
     trailingDrawdown is set) */
  trailingDrawdown: real("trailing_drawdown"), // $ distance below equity peak
  drawdownFreezeAt: real("drawdown_freeze_at"), // $ balance level where the threshold stops trailing (e.g. Apex PA: start + 100)
  profitTarget: real("profit_target"), // $ above starting balance (eval target)
  dailyLossLimit: real("daily_loss_limit"), // $ max loss per day
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * Instrument definitions. For futures/forex the contract specs
 * (tick size, tick value, point value) let us compute P&L and
 * R-multiples from raw prices.
 */
export const instruments = sqliteTable(
  "instruments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(), // e.g. "NQ", "EURUSD", "AAPL", "BTCUSDT"
    name: text("name"),
    assetClass: text("asset_class", {
      enum: ["futures", "forex", "stock", "option", "crypto"],
    }).notNull(),
    tickSize: real("tick_size"), // e.g. 0.25 for NQ
    tickValue: real("tick_value"), // $ per tick per contract, e.g. 5 for NQ
    pointValue: real("point_value"), // $ per full point per contract, e.g. 20 for NQ
    currency: text("currency").notNull().default("USD"),
  },
  (t) => [uniqueIndex("instruments_symbol_idx").on(t.symbol)],
);

/**
 * Playbook setups — the named strategies you trade
 * (e.g. "Opening Range Breakout", "Failed Auction Reversal").
 * Stats per setup tell you which edges actually pay.
 */
export const setups = sqliteTable(
  "setups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    rules: text("rules"), // markdown checklist of entry criteria
    color: text("color"), // hex accent for charts/badges
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [uniqueIndex("setups_user_name_idx").on(t.userId, t.name)],
);

/**
 * A trade: one round-trip position (may contain many fills).
 * Aggregate prices/P&L are stored denormalized for fast querying;
 * they are recomputed from executions whenever fills change.
 */
export const trades = sqliteTable(
  "trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id),
    setupId: integer("setup_id").references(() => setups.id),

    direction: text("direction", { enum: ["long", "short"] }).notNull(),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("closed"),

    // ISO 8601 timestamps (local exchange time of the fills)
    entryTime: text("entry_time").notNull(),
    exitTime: text("exit_time"),

    quantity: real("quantity").notNull(), // total size (contracts/shares/lots)
    avgEntryPrice: real("avg_entry_price").notNull(),
    avgExitPrice: real("avg_exit_price"),

    // Risk plan, captured at entry
    stopPrice: real("stop_price"),
    targetPrice: real("target_price"),
    plannedRiskAmount: real("planned_risk_amount"), // $ risked if stop hit

    fees: real("fees").notNull().default(0), // commissions + exchange fees
    grossPnl: real("gross_pnl"),
    netPnl: real("net_pnl"),
    rMultiple: real("r_multiple"), // netPnl / plannedRiskAmount

    // Review fields
    rating: integer("rating"), // 1-5 execution quality (process, not outcome)
    notes: text("notes"), // markdown
    followedPlan: integer("followed_plan", { mode: "boolean" }),

    importBatchId: integer("import_batch_id").references(
      () => importBatches.id,
    ),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("trades_account_idx").on(t.accountId),
    index("trades_entry_time_idx").on(t.entryTime),
    index("trades_setup_idx").on(t.setupId),
  ],
);

/**
 * Individual fills. Scale-ins/scale-outs are first-class:
 * a trade's aggregates derive from its executions.
 */
export const executions = sqliteTable(
  "executions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tradeId: integer("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    price: real("price").notNull(),
    quantity: real("quantity").notNull(),
    time: text("time").notNull(), // ISO 8601
    fee: real("fee").notNull().default(0),
    externalId: text("external_id"), // broker fill id, for import dedup
  },
  (t) => [
    index("executions_trade_idx").on(t.tradeId),
    uniqueIndex("executions_external_idx").on(t.externalId),
  ],
);

/**
 * Tags in categories: mistakes ("chased entry", "moved stop"),
 * emotions ("FOMO", "revenge"), market context ("trend day", "CPI day").
 * Tag-level stats reveal exactly what behavior costs you money.
 */
export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["mistake", "emotion", "context", "custom"],
    })
      .notNull()
      .default("custom"),
    color: text("color"),
  },
  (t) => [uniqueIndex("tags_name_category_idx").on(t.name, t.category)],
);

export const tradeTags = sqliteTable(
  "trade_tags",
  {
    tradeId: integer("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("trade_tags_idx").on(t.tradeId, t.tagId)],
);

/**
 * Daily journal: pre-market plan, session review, mood.
 * One entry per calendar date.
 */
export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    date: text("date").notNull(), // "YYYY-MM-DD"
    premarketPlan: text("premarket_plan"), // markdown
    review: text("review"), // markdown, end-of-day
    mood: integer("mood"), // 1-5
    sleepQuality: integer("sleep_quality"), // 1-5, optional wellness tracking
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("journal_entries_user_date_idx").on(t.userId, t.date)],
);

/**
 * Screenshots/chart captures attached to a trade or a daily entry.
 * Files live under data/attachments/; only the path is stored.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tradeId: integer("trade_id").references(() => trades.id, {
      onDelete: "cascade",
    }),
    journalEntryId: integer("journal_entry_id").references(
      () => journalEntries.id,
      { onDelete: "cascade" },
    ),
    filePath: text("file_path").notNull(),
    caption: text("caption"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("attachments_trade_idx").on(t.tradeId)],
);

/**
 * One row per CSV import, so imports can be reviewed and rolled back.
 */
export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  source: text("source").notNull(), // e.g. "tradovate", "ninjatrader", "mt5", "generic-csv"
  fileName: text("file_name"),
  tradeCount: integer("trade_count").notNull().default(0),
  importedAt: text("imported_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
