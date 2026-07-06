# Ledger — Personal Trading Journal

A private, local-first trading journal for a full-time day trader. No
subscriptions, no cloud, no one else's servers: all data lives in a SQLite
file on this machine, owned by you.

## Stack

- **Next.js 15** (App Router, TypeScript) — UI and local API routes
- **Tailwind CSS v4** — styling, with a custom "desk at night" token system
- **SQLite** via **better-sqlite3** + **Drizzle ORM** — data lives in `data/journal.db`
- **Recharts** (stats) + **lightweight-charts** (price/equity charts)
- **PapaParse** — CSV import from broker execution reports

## Running

```bash
npm run dev        # start at http://localhost:3000
npm run db:push    # apply schema changes to data/journal.db
npm run db:studio  # browse the database in Drizzle Studio
```

## Data model (src/db/schema.ts)

- `accounts` — live / funded / eval / sim accounts
- `instruments` — symbols with contract specs (tick size/value, point value)
- `trades` — round-trip positions with P&L, R-multiple, risk plan, rating, notes
- `executions` — individual fills; scale-ins/outs are first-class
- `setups` — the playbook: named strategies with rule checklists
- `tags` + `trade_tags` — mistakes, emotions, market context
- `journal_entries` — daily pre-market plan + end-of-day review + mood
- `attachments` — chart screenshots linked to trades or days
- `import_batches` — every CSV import is tracked and reversible

## Feature roadmap

### Phase 1 — Core logging (done)
- [x] Manual trade entry form with live P&L/R preview
- [x] Trade log table
- [x] Trade detail page: fills, notes, tags, rating; edit + delete
- [x] Screenshot attachments on trades (click / drop / Ctrl+V paste, captions)
- [x] Accounts & instruments management in Settings
- [x] Playbook: add setups with rule checklists

### Phase 2 — Import (done)
- [x] Tradovate CSV import with tolerant header detection (Orders/Fills exports)
- [x] Fill-to-trade matching (FIFO position building, scale in/out, reversals)
- [x] Dedup by order ID — re-importing the same file is safe
- [x] Auto-create unseen prop accounts from the CSV
- [x] Per-side fee input applied to imported fills
- [x] Batch history with one-click undo
- [ ] Merge later exports into previously-imported open positions
- [ ] Column-mapping UI for non-Tradovate CSVs

Import internals live in `src/server/import/tradovate.ts` (pure, tested via
`npx tsx src/server/import/tradovate.test.ts`); a sample of the expected CSV
shape is `src/server/import/fixtures/orders-sample.csv`.

### Phase 3 — Analytics (done)
- [x] Summary stats: net P&L, win rate, profit factor, expectancy, avg
      win/loss, max drawdown, best/worst day
- [x] Equity curve (cumulative net P&L per closed trade, crosshair tooltip)
- [x] Calendar heatmap (daily P&L, month-at-a-glance, magnitude-graded)
- [x] Breakdowns: day of week, hour of entry, direction, setup, symbol
- [x] Mistake/emotion tag cost report (populates as trades get tagged)
- [ ] Account and date-range filters across all analytics
- [ ] Per-setup expectancy on playbook cards

Chart aggregations are pure functions in `src/lib/analytics.ts`. Chart fill
colors were validated for the dark surface with the dataviz palette
validator; bright P&L tokens are reserved for lines and text.

### Phase 4 — Daily journal (done)
- [x] `/journal`: every trading day auto-listed with P&L, trade count, and
      journaled/mood status; "Today's entry" quick action
- [x] `/journal/[date]`: pre-market plan, end-of-day review, mood + sleep
      scores, that day's trades, day screenshots (click/drop/Ctrl+V paste),
      prev/next day navigation

### Scope is intentionally frozen

The app is feature-complete by design: import trades, browse the record,
journal each day, annotate with notes/tags/screenshots, and read the
analytics. The owner explicitly wants a simple journal, not a platform —
resist adding features. Leftover ideas (filters, light theme, desktop
shell) were considered and deliberately parked. If something is added
later, it should replace complexity, not add it.

## Design direction — "TRADELOG terminal"

Rebuilt to match the owner's reference images in `Design templates/` — they
are the design authority. Flat near-black surfaces with hairline borders,
**cyan** as the single identity accent (buttons, active nav, equity curve),
bright green/pink strictly for profit/loss, IBM Plex Mono for every numeral
and label. Numbered sections (01 · Overview … 07 · Configuration), an
outlined active nav state, an account-balance card in the sidebar, outcome
badges (winner/loser/scratch/open), filter chips, and value-labeled charts.
Tokens, chips, badges, and buttons live in `src/app/globals.css`; motion
(reveal staggers, count-ups, route fades) respects `prefers-reduced-motion`.

## Privacy

Everything is local. `data/` (the SQLite database and screenshot attachments)
is gitignored. Back it up by copying the folder.
