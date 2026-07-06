/**
 * Tradovate CSV parsing and FIFO trade building. Pure functions — no
 * database access — so the logic is testable in isolation.
 *
 * Tradovate's web platform exports several CSVs (Orders, Fills,
 * Performance). Column names vary between them and between versions, so
 * headers are matched against alias lists after normalizing to lowercase
 * alphanumerics.
 */
import Papa from "papaparse";

export interface ParsedFill {
  externalId: string | null;
  account: string;
  /** Root symbol, e.g. "MNQ" (from Product column or parsed from contract code) */
  root: string;
  contract: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  /** ISO 8601 local time */
  time: string;
}

export interface ParseResult {
  fills: ParsedFill[];
  warnings: string[];
  /** Rows that were skipped because they were not filled orders */
  skippedRows: number;
}

export interface BuiltExecution {
  externalId: string | null;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  time: string;
}

export interface BuiltTrade {
  account: string;
  root: string;
  direction: "long" | "short";
  status: "open" | "closed";
  quantity: number;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  entryTime: string;
  exitTime: string | null;
  executions: BuiltExecution[];
}

/* ------------------------- header detection ------------------------- */

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Ordered by preference — first alias found wins. */
const COLUMN_ALIASES: Record<string, string[]> = {
  side: ["bs", "side", "buysell", "action"],
  contract: ["contract", "symbol", "instrument"],
  product: ["product"],
  quantity: ["filledqty", "fillqty", "cumqty", "qty", "quantity", "filled"],
  price: ["avgprice", "avgfillprice", "fillprice", "price"],
  time: ["filltime", "timestamp", "datetime", "placingtime", "time", "date"],
  status: ["status"],
  account: ["account"],
  orderId: ["orderid", "fillid", "id"],
};

function mapColumns(headers: string[]): {
  columns: Partial<Record<keyof typeof COLUMN_ALIASES, string>>;
  missing: string[];
} {
  const normalized = new Map<string, string>();
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (key && !normalized.has(key)) normalized.set(key, header);
  }

  const columns: Partial<Record<string, string>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const original = normalized.get(alias);
      if (original !== undefined) {
        columns[field] = original;
        break;
      }
    }
  }

  const required = ["side", "quantity", "price", "time"];
  const missing = required.filter((f) => columns[f] === undefined);
  if (columns.contract === undefined && columns.product === undefined) {
    missing.push("contract (or product)");
  }
  return { columns, missing };
}

/* --------------------------- value parsing --------------------------- */

/** "NQZ5" / "MNQH26" -> "NQ" / "MNQ". Already-bare roots pass through. */
export function contractRoot(contract: string): string {
  const code = contract.trim().toUpperCase();
  const match = code.match(/^([A-Z0-9]+?)[FGHJKMNQUVXZ]\d{1,2}$/);
  return match ? match[1] : code;
}

function parseSide(value: string): "buy" | "sell" | null {
  const v = value.trim().toLowerCase();
  if (v.startsWith("b")) return "buy"; // Buy, B, BOT
  if (v.startsWith("s")) return "sell"; // Sell, S, SLD
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Accepts ISO ("2026-07-03T09:42:15", "2026-07-03 09:42:15") and US
 * ("07/03/2026 09:42:15", "7/3/2026 9:42:15 AM") timestamps.
 * Returns "YYYY-MM-DDTHH:mm:ss" or null.
 */
export function parseTimestamp(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  let m = v.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${pad(+m[4])}:${m[5]}:${m[6] ?? "00"}`;
  }

  m = v.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i,
  );
  if (m) {
    let hours = +m[4];
    const meridiem = m[7]?.toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}T${pad(hours)}:${m[5]}:${m[6] ?? "00"}`;
  }

  // Date-only, e.g. "07/03/2026"
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}T00:00:00`;

  return null;
}

function parseNumber(value: string): number | null {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/* ----------------------------- CSV parse ----------------------------- */

export function parseTradovateCsv(csvText: string): ParseResult {
  const warnings: string[] = [];
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0 || parsed.data.length === 0) {
    return {
      fills: [],
      warnings: ["The file has no data rows — is it the right export?"],
      skippedRows: 0,
    };
  }

  const { columns, missing } = mapColumns(headers);
  if (missing.length > 0) {
    return {
      fills: [],
      warnings: [
        `Could not find required column(s): ${missing.join(", ")}. ` +
          `Found headers: ${headers.join(", ")}`,
      ],
      skippedRows: 0,
    };
  }

  const fills: ParsedFill[] = [];
  let skippedRows = 0;

  parsed.data.forEach((row, index) => {
    const status = columns.status ? row[columns.status]?.trim() : undefined;
    if (status && !/fill/i.test(status)) {
      skippedRows += 1; // Canceled, Rejected, Working...
      return;
    }

    const side = parseSide(row[columns.side!] ?? "");
    const quantity = parseNumber(row[columns.quantity!] ?? "");
    const price = parseNumber(row[columns.price!] ?? "");
    const time = parseTimestamp(row[columns.time!] ?? "");
    const contract =
      (columns.contract ? row[columns.contract]?.trim() : "") || "";
    const product = (columns.product ? row[columns.product]?.trim() : "") || "";
    const root = product ? product.toUpperCase() : contractRoot(contract);

    if (!side || !quantity || quantity <= 0 || price == null || !time || !root) {
      skippedRows += 1;
      if (side && quantity && quantity > 0) {
        warnings.push(`Row ${index + 2}: could not parse — skipped.`);
      }
      return;
    }

    fills.push({
      externalId: columns.orderId
        ? row[columns.orderId]?.trim() || null
        : null,
      account: (columns.account ? row[columns.account]?.trim() : "") || "Imported",
      root,
      contract: contract || root,
      side,
      quantity,
      price,
      time,
    });
  });

  return { fills, warnings, skippedRows };
}

/* ---------------------- manual-overlap protection -------------------- */

export interface ManualExecution {
  accountId: number;
  root: string;
  side: "buy" | "sell";
  price: number;
  time: string; // ISO
  tickSize: number | null;
}

const OVERLAP_WINDOW_MS = 90_000;

/**
 * Splits fills into those safe to import and those that appear to be the
 * same executions as manually-logged trades (no broker order ID to match
 * on, so we compare account + root + side + price ≈ + time ≈). Scoped to
 * the same account on purpose: identical trades copied across several
 * prop accounts are legitimate and must not be skipped.
 */
export function splitManualOverlaps(
  fills: ParsedFill[],
  manual: ManualExecution[],
  accountIdByName: Map<string, number>,
): { kept: ParsedFill[]; skipped: ParsedFill[] } {
  const kept: ParsedFill[] = [];
  const skipped: ParsedFill[] = [];

  for (const fill of fills) {
    const accountId = accountIdByName.get(fill.account);
    const overlaps =
      accountId != null &&
      manual.some((m) => {
        if (m.accountId !== accountId) return false;
        if (m.root !== fill.root.toUpperCase()) return false;
        if (m.side !== fill.side) return false;
        const priceTolerance = m.tickSize
          ? m.tickSize * 2
          : Math.abs(m.price) * 0.001;
        if (Math.abs(m.price - fill.price) > priceTolerance) return false;
        const timeDiff = Math.abs(
          new Date(m.time).getTime() - new Date(fill.time).getTime(),
        );
        return timeDiff <= OVERLAP_WINDOW_MS;
      });
    (overlaps ? skipped : kept).push(fill);
  }

  return { kept, skipped };
}

/* -------------------------- FIFO trade build ------------------------- */

/**
 * Groups fills by (account, root) and walks them chronologically,
 * building round-trip trades. Position flips split a fill into a
 * closing part and the opening part of the next trade.
 */
export function buildTrades(fills: ParsedFill[]): BuiltTrade[] {
  const groups = new Map<string, ParsedFill[]>();
  for (const fill of fills) {
    const key = `${fill.account} ${fill.root}`;
    const list = groups.get(key) ?? [];
    list.push(fill);
    groups.set(key, list);
  }

  const trades: BuiltTrade[] = [];

  for (const groupFills of groups.values()) {
    groupFills.sort((a, b) => a.time.localeCompare(b.time));

    let position = 0; // signed contracts, + long / - short
    let current: BuiltExecution[] = [];
    const { account, root } = groupFills[0];

    const closeTrade = (isOpen: boolean) => {
      if (current.length === 0) return;
      const direction = current[0].side === "buy" ? "long" : "short";
      const entrySide = current[0].side;
      const entries = current.filter((e) => e.side === entrySide);
      const exits = current.filter((e) => e.side !== entrySide);
      const entryQty = entries.reduce((s, e) => s + e.quantity, 0);
      const exitQty = exits.reduce((s, e) => s + e.quantity, 0);
      const avgEntryPrice =
        entries.reduce((s, e) => s + e.price * e.quantity, 0) / entryQty;
      const avgExitPrice =
        exitQty > 0
          ? exits.reduce((s, e) => s + e.price * e.quantity, 0) / exitQty
          : null;

      trades.push({
        account,
        root,
        direction,
        status: isOpen ? "open" : "closed",
        quantity: entryQty,
        avgEntryPrice,
        avgExitPrice,
        entryTime: current[0].time,
        exitTime: isOpen ? null : current[current.length - 1].time,
        executions: current,
      });
      current = [];
    };

    for (const fill of groupFills) {
      const signed = fill.side === "buy" ? fill.quantity : -fill.quantity;
      const next = position + signed;

      const crossesZero = position !== 0 && Math.sign(next) === -Math.sign(position);
      if (crossesZero) {
        // Split: |position| closes the current trade, the rest opens a new one
        const closingQty = Math.abs(position);
        const openingQty = fill.quantity - closingQty;
        current.push({
          externalId: fill.externalId,
          side: fill.side,
          price: fill.price,
          quantity: closingQty,
          time: fill.time,
        });
        closeTrade(false);
        current.push({
          externalId: fill.externalId ? `${fill.externalId}:flip` : null,
          side: fill.side,
          price: fill.price,
          quantity: openingQty,
          time: fill.time,
        });
        position = next;
        continue;
      }

      current.push({
        externalId: fill.externalId,
        side: fill.side,
        price: fill.price,
        quantity: fill.quantity,
        time: fill.time,
      });
      position = next;
      if (position === 0) closeTrade(false);
    }

    if (current.length > 0) closeTrade(true);
  }

  trades.sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  return trades;
}
