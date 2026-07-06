<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Ledger — Trading Journal

Personal, local-first trading journal for a full-time day trader. Private by
design: all data stays in `data/journal.db` (SQLite, gitignored).

## Commands
- `npm run dev` — dev server at http://localhost:3000
- `npm run build` — production build (use to typecheck/verify)
- `npm run db:push` — apply `src/db/schema.ts` changes to the SQLite db
- `npm run db:studio` — browse the database

## Architecture
- Next.js App Router + TypeScript + Tailwind v4. Pages in `src/app/`.
- Data: Drizzle ORM over better-sqlite3. Schema in `src/db/schema.ts`,
  client in `src/db/index.ts` (server-only — never import into client components).
- Trades aggregate from `executions` (fills). When fills change, recompute
  the trade's avg prices, P&L, and R-multiple; don't edit aggregates directly.
- CSV import: pure parse/FIFO logic in `src/server/import/tradovate.ts`
  (tests: `npx tsx src/server/import/tradovate.test.ts`), DB writes in
  `src/server/import-actions.ts`. Dedup key is `executions.external_id`.
- Roadmap and data-model overview live in README.md — keep both current.

## Design system — "TRADELOG terminal" (from `Design templates/` images)
- The user's template images in `Design templates/` are the design authority.
- Tokens in `src/app/globals.css`; use the Tailwind names (`bg-ink-deep`,
  `text-text-muted`, `text-accent`, `text-profit`, `text-loss`), never raw
  hex. Surfaces are flat near-black with 1px `ink-line` borders — no
  gradients or shadows on cards.
- CYAN (`accent`) is the sole identity accent (buttons, active nav, links,
  equity curve). Green/pink mean profit/loss ONLY — never decorative.
- Every numeral gets `.num` (Plex Mono, tabular). Labels use `.eyebrow`
  (mono, uppercase, letterspaced). Page headers: eyebrow "NN · Section"
  (01 Overview, 02 Execution log, 03 Strategies, 04 Journal, 05 Deep dive,
  06 Sync, 07 Configuration), bold sans title, muted subtitle.
- Component classes: `.card`/`.card-tile` (flat panels), `.card-hover`,
  `.btn-accent`/`.btn-ghost`, `.chip`/`.chip-active` (filters),
  `.badge-win/-loss/-scratch/-open` (outcomes), `.row-link`, `.reveal` +
  `style={{--i: n}}`. Use these instead of re-composing utility strings.
- Sidebar: numbered nav items with bullet dot, outlined active state,
  ACCOUNT BALANCE card at the bottom (computed in `src/app/layout.tsx`).
- Chart fills use `--profit-fill/--loss-fill/--accent-fill` (validated) for
  large marks; bright tokens only for 2px lines and text. Everything
  respects `prefers-reduced-motion` (handled globally).
