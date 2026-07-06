# Ledger — Developer Documentation

Everything you need to know before changing this codebase. Read this and
`AGENTS.md` (the condensed conventions file) before implementing anything.

---

## 1. What this is

A private, multi-user trading journal for futures prop traders (Apex/Lucid
via Tradovate). Core loop: **import or log trades → review them (notes,
tags, screenshots, setups) → journal each day → read the analytics →
respect the prop-firm guardrail.**

Scope philosophy: the owner explicitly wants a **simple journal, not a
platform**. Features were deliberately parked (see §12). Prefer replacing
complexity over adding it.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | All routes `force-dynamic` — never prerender stale data |
| UI | React 19, Tailwind CSS v4 | Tokens via `@theme inline` in `globals.css` |
| Database | Drizzle ORM over **libSQL** | Turso in prod, `file:data/journal.db` locally |
| File storage | **Vercel Blob** in prod | Local `data/attachments/` fallback |
| Auth | Hand-rolled: scrypt + DB sessions | No external auth deps |
| Charts | Recharts (equity, weekday bars) + pure HTML (calendar, ladders, bar lists) | |
| CSV | PapaParse (import parse + export unparse) | |
| Icons | lucide-react | |

**Environment switch** (`src/db/index.ts`, `src/server/attachment-io.ts`):
if `TURSO_DATABASE_URL` is set → Turso; if `BLOB_READ_WRITE_TOKEN` is set →
Blob. Unset both → fully local. No other configuration.

### Environment variables (`.env.example`)

| Var | Purpose |
|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | hosted DB (prod) |
| `BLOB_READ_WRITE_TOKEN` | screenshot storage (injected by Vercel Blob store) |
| `REGISTRATION_CODE` | when set, /register requires this invite code |

---

## 3. Project structure

```
src/
  app/
    (auth)/login, (auth)/register   public pages, centered card layout
    (app)/                          everything behind requireUser()
      layout.tsx                    sidebar + account-balance calc
      loading.tsx                   instant navigation skeleton
      page.tsx                      dashboard (01 · Overview)
      trades/, playbook/, journal/, analytics/, import/, settings/
    api/attachments/[id]/route.ts   ownership-checked image serving
    api/export/trades/route.ts      per-user CSV export
  components/                       UI components (client & server)
    charts/                         equity-curve, weekday-bars, pnl-calendar, breakdown-list
  db/
    schema.ts                       ALL tables live here
    index.ts                        libsql client (env-driven)
    seed.ts                         idempotent instruments + tags seed
  lib/                              PURE functions only (no db, no react)
    trade-math.ts                   P&L / planned risk / stop-based R
    analytics.ts                    equity curve, breakdowns, sessions, hold time
    guardrail.ts                    trailing-drawdown math
    outcome.ts                      WIN/LOSE/BE/OPEN — the single definition
    format.ts                       money/R/price/date formatting + localToday/shiftDate
  server/                           server-only code
    auth.ts                         sessions, scrypt, requireUser, first-user claim
    auth-actions.ts                 login/register/signout server actions
    actions.ts                      accounts, setups, trades CRUD
    import-actions.ts               CSV import + undo batch
    journal-actions.ts              daily entries + day screenshots
    attachment-actions.ts           trade screenshots add/delete
    attachment-io.ts                Blob-or-file storage switch
    queries.ts                      shared read queries (form data)
    import/tradovate.ts             PURE csv parse + FIFO builder (+ .test.ts)
```

Rule of thumb: **`lib/` is pure and unit-testable, `server/` touches the
DB, pages compose them.** Tests are plain tsx scripts with node:assert:
`npx tsx src/server/import/tradovate.test.ts` and
`npx tsx src/lib/guardrail.test.ts`.

---

## 4. Data model (src/db/schema.ts)

- **users** — email (unique), scrypt `salt:hash`, name.
- **sessions** — token (pk) → userId, expiresAt; cookie `ledger_session`.
- **accounts** — userId, name, broker, `initialBalance`, `rValue`
  ($ per 1R), guardrail rules (`trailingDrawdown`, `drawdownFreezeAt`,
  `profitTarget`, `dailyLossLimit`), isArchived.
- **instruments** — GLOBAL (shared across users): symbol (unique), asset
  class, tickSize, tickValue, pointValue.
- **setups** — userId, name (unique per user), description, rules
  (newline-separated checklist), isArchived.
- **trades** — userId, accountId, instrumentId, setupId?, direction,
  status open/closed, entry/exit time+avg price, quantity, stop/target,
  plannedRiskAmount, fees, grossPnl, netPnl, rMultiple, rating 1-5,
  followedPlan, notes, importBatchId?.
- **executions** — fills; tradeId (cascade), side, price, qty, time,
  `externalId` = broker order ID (unique; NULL for manual trades).
- **tags** — GLOBAL; categories mistake/emotion/context/custom.
  **tradeTags** — join table (cascade).
- **journalEntries** — userId, date (unique per user), premarketPlan,
  review, mood 1-5, sleepQuality 1-5.
- **attachments** — tradeId? or journalEntryId? (cascade), `filePath`
  (bare filename locally OR full https Blob URL), caption.
- **importBatches** — userId, source, fileName, tradeCount; undo deletes
  its trades.

### Key invariants

1. **Trades aggregate from executions.** When fills change, recompute avg
   prices/P&L — never edit aggregates alone.
2. **R-multiple precedence:** if the account has `rValue`, R =
   netPnl / rValue (applies on log, import, edit, and retroactively via
   `updateAccountR`). Stop-based R (netPnl / plannedRiskAmount) is only
   the fallback when rValue is null.
3. **Outcome tag** (trades table "Tag" column, dashboard, detail) comes
   from `lib/outcome.ts` ONLY: WIN >0, LOSE <0, BE exactly 0, OPEN.
4. **userId scoping is mandatory** on every query and every id-based
   mutation (fetch with `and(eq(id), eq(userId))` before acting).
   Instruments and tags are intentionally global.
5. **Deleting**: a setup unlinks its trades (setupId → null), never
   deletes them. A trade deletes its attachment files (Blob or disk)
   before the DB cascade. Import undo removes only that batch's trades.
6. **Dates are local-time strings.** Use `localToday()` / `shiftDate()`
   from `lib/format.ts`. NEVER `new Date().toISOString()` for a date —
   UTC shifts the day in the evening.

---

## 5. Domain logic worth knowing

### Import pipeline (`server/import/tradovate.ts` + `import-actions.ts`)
1. Parse CSV with tolerant header aliases (handles Tradovate Orders/Fills
   exports: `B/S`, `avgPrice`, `filledQty`, `Fill Time`, `Product`,
   leading spaces, quoted thousands, US or ISO timestamps).
2. Drop non-Filled rows.
3. **Dedup** against the user's existing `executions.externalId`.
4. **Manual-overlap protection** (`splitManualOverlaps`): skip fills that
   match a manually-logged execution on the SAME account (root+side,
   price ≤ 2 ticks, time ±90s). Same-account scoping is deliberate:
   copy-traded prop accounts legitimately duplicate trades.
5. **FIFO position building**: fills group by (account, root); scale
   in/out become one trade with weighted averages; position flips split a
   fill; still-open positions import as status=open.
6. Unknown instrument roots are skipped with a warning; unseen account
   names auto-create accounts for the user.
7. Fees: Orders exports carry no commissions — the user supplies
   $/contract/side at import time.
Imports are strictly additive; each is a batch with one-click undo.

### Guardrail (`lib/guardrail.ts`)
Computed from CLOSED trades (approximation — can't see unrealized peaks):
equity walk from `initialBalance`, peak tracks highs, threshold =
peak − trailingDrawdown, capped at `drawdownFreezeAt` when set (Apex PA:
start + 100). Levels: red < 25% headroom, amber < 50%, else green.
Rendered by `components/guardrail-card.tsx` on the dashboard for accounts
with `trailingDrawdown` set.

### Auth (`server/auth.ts`)
- scrypt (`salt:hash` hex), timingSafeEqual verify. No reset flow —
  fix passwords by SQL if someone forgets.
- Sessions: 30-day httpOnly cookie, `secure` in production, revocable
  rows. `getCurrentUser` is wrapped in React `cache()` — layout and page
  share one lookup per request.
- **First registered user adopts all userId-NULL rows** (claimOrphanData).
- `REGISTRATION_CODE` gates signup when set (field appears automatically).

---

## 6. Design system — "TRADELOG terminal"

The reference images live in `Design templates/` (gitignored — local
only) and are the design authority.

- Flat near-black surfaces (`ink-*` tokens), 1px hairline borders, no
  gradients/shadows on cards. CYAN (`accent`) is the only identity color.
  Green/pink = profit/loss ONLY. `--warn` = guardrail caution only.
- Every numeral gets `.num` (IBM Plex Mono, tabular). Labels `.eyebrow`.
  Page headers: eyebrow `NN · Section` (01 Overview, 02 Execution log,
  03 Strategies, 04 Journal, 05 Deep dive, 06 Sync, 07 Configuration).
- Component classes in `globals.css` — use them, don't recompose
  utilities: `.card` `.card-tile` `.card-hover` `.btn-accent` `.btn-ghost`
  `.chip/.chip-active` `.badge-win/-loss/-scratch/-open/-warn` `.row-link`
  `.reveal` (+ `style={{"--i": n}}` stagger).
- Charts: large fills use validated `--profit-fill/--loss-fill/
  --accent-fill`; bright tokens only for 2px lines and text. Palette was
  validated for CVD/contrast — revalidate if changing chart colors.
- Responsive: sidebar becomes a hamburger drawer below `lg`; wide tables
  and the calendar scroll inside their cards (`overflow-x-auto`); page
  padding `px-4 py-6 sm:px-6 lg:px-10 lg:py-8`. Motion respects
  `prefers-reduced-motion` globally.

---

## 7. Performance rules (learned the hard way)

- Functions are pinned to **dub1** (`vercel.json`) because the Turso DB
  is in Ireland. If the DB region ever changes, change this too.
- **Parallelize independent queries** with `Promise.all` — every awaited
  query is a network round-trip in prod. The layout, form data, and all
  heavy pages already do this; keep the pattern.
- `getCurrentUser` is request-cached; don't add duplicate session reads.
- `(app)/loading.tsx` gives instant navigation feedback — keep it.
- `staleTimes.dynamic = 30` (next.config): recently visited pages render
  instantly from the client cache; `revalidatePath` still busts it after
  mutations.
- Cold starts on the free plan are ~1.3s; an external uptime ping every
  5 min (e.g. cron-job.org hitting /login) keeps functions warm.

---

## 8. Deployment & operations

- **Production**: Vercel project (auto-deploys `master` on push) +
  Turso DB + Blob store. Use the CLEAN production URL
  (`<project>.vercel.app`) — hashed deployment URLs are frozen snapshots
  and may sit behind Vercel SSO.
- Vercel Deployment Protection must be "Only Preview Deployments" or the
  public site redirects everyone to a Vercel login.
- **Schema changes**: edit `schema.ts`, then `npm run db:push` (needs
  Turso env vars in the shell for prod). KNOWN QUIRK: drizzle-kit push
  sometimes fails rebuilding the accounts table ("index already exists")
  — adding columns via a small `ALTER TABLE` script and re-running push
  is the workaround.
- **Seeding**: `npm run db:seed` — idempotent, env-driven.
- **Backups**: Turso has point-in-time restore on its dashboard; local
  file is `data/journal.db` (a pre-auth copy exists at
  `data/journal.backup-pre-auth.db`). Blob images are only in Blob.
- **Request body limit ~4.5MB on Vercel**: screenshots max 4MB each,
  ≤ ~3.5MB combined per trade-form submit, CSV imports similar. Enforced
  in `attachment-io.ts` and `screenshot-field.tsx`.
- **User management**: no admin UI. Reset a password by updating
  `users.password_hash` via Turso's SQL console (generate with
  `hashPassword` in a tsx script); delete sessions rows to force logout.

### Local development

```
npm run dev          # local, file DB, hot reload
npm run build && npm run start   # local production
npx tsx src/server/import/tradovate.test.ts   # unit tests
npx tsx src/lib/guardrail.test.ts
```

Windows notes: PowerShell eats backticks in inline `npx tsx -e "..."` —
write throwaway `.mts` scripts instead (top-level await needs `.mts`).
One-off DB scripts must use `@libsql/client` (better-sqlite3 was removed).

---

## 9. Privacy & git hygiene

The repo is PUBLIC. Gitignored on purpose — never commit:
- `data/` (database + screenshots), `.env*`
- `Orders.csv` (real broker export with account numbers)
- `Design templates/` (mockups showing real P&L)
- root images (`/*.png`, `/*.jpeg`, `/*.jpg`)

Commit messages end with the Co-Authored-By Claude trailer (see git log).

---

## 10. Feature inventory (done)

Logging with live P&L/R/tag preview and screenshot paste · trade dossier
page (metrics, price ladder, fills, review, screenshots, prev/next, day
link) · Tradovate import (dedup, overlap protection, FIFO, undo) · daily
journal (plan/review/mood/sleep, day trades, day screenshots) · playbook
with live per-setup stats and safe delete · analytics (stat tiles, equity
curve, weekday bars, sessions, hold time, calendar, setup/tag cost) ·
account-level $/R with retroactive recompute · prop-firm guardrail ·
CSV export · multi-user auth with invite code · responsive mobile UI.

## 11. Known limitations (accepted)

- No password reset / email verification (friends-scale; fix via SQL).
- Guardrail uses closed trades only — real-time unrealized drawdown is
  invisible to a journal.
- Importing a later export does NOT merge into previously-imported open
  positions (parked).
- Instruments/tags are shared across all users by design.
- drizzle-kit push quirk on accounts table (see §8).

## 12. Parked ideas (do not build without an explicit ask)

Trade-log/analytics filters (account, date range) · weekly review
auto-summary · read-only share links for trades · light theme ·
column-mapping UI for non-Tradovate CSVs · desktop shell · rate limiting
on login.
