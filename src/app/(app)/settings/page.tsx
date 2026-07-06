import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, instruments } from "@/db/schema";
import {
  createAccount,
  createInstrument,
  toggleAccountArchived,
  updateAccountR,
} from "@/server/actions";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-ink-line bg-ink-card px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim";

export default async function SettingsPage() {
  const user = await requireUser();
  const accountRows = db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, user.id))
    .orderBy(asc(accounts.isArchived), asc(accounts.name))
    .all();
  const instrumentRows = db
    .select()
    .from(instruments)
    .orderBy(asc(instruments.symbol))
    .all();

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-8">
        <p className="eyebrow mb-2">07 · Configuration</p>
        <h1 className="text-3xl font-bold tracking-tight">
          Accounts & instruments
        </h1>
      </header>

      {/* Accounts */}
      <section className="mb-12">
        <h2 className="eyebrow mb-3">Accounts</h2>
        <div className="card overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-line bg-ink-raised text-left">
                <th className="eyebrow px-4 py-2.5 font-semibold">Name</th>
                <th className="eyebrow px-4 py-2.5 font-semibold">Broker</th>
                <th className="eyebrow px-4 py-2.5 font-semibold text-right">
                  Starting balance
                </th>
                <th className="eyebrow px-4 py-2.5 font-semibold text-right">
                  R value ($)
                </th>
                <th className="eyebrow px-4 py-2.5 font-semibold text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {accountRows.map((account) => (
                <tr
                  key={account.id}
                  className={cn(
                    "border-b border-ink-line last:border-b-0",
                    account.isArchived && "opacity-50",
                  )}
                >
                  <td className="px-4 py-2.5 font-medium">{account.name}</td>
                  <td className="px-4 py-2.5 text-text-muted">
                    {account.broker ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 num text-right">
                    {formatMoney(account.initialBalance)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form
                      action={updateAccountR}
                      className="inline-flex items-center gap-1.5"
                    >
                      <input type="hidden" name="id" value={account.id} />
                      <input
                        name="rValue"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={account.rValue ?? ""}
                        placeholder="—"
                        aria-label={`R value for ${account.name}`}
                        className={cn(inputCls, "num w-24 py-1.5 text-right")}
                      />
                      <button
                        type="submit"
                        className="text-xs text-accent hover:text-accent-soft transition-colors underline underline-offset-2"
                      >
                        Set
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={toggleAccountArchived} className="inline">
                      <input type="hidden" name="id" value={account.id} />
                      <button
                        type="submit"
                        className="text-xs text-text-muted hover:text-text-primary transition-colors underline underline-offset-2"
                      >
                        {account.isArchived ? "Restore" : "Archive"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          action={createAccount}
          className="flex flex-wrap items-end gap-3 card p-4"
        >
          <div>
            <label
              htmlFor="account-name"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              Account name
            </label>
            <input
              id="account-name"
              name="name"
              required
              placeholder="Apex 150k #2"
              className={inputCls}
            />
          </div>
          <div>
            <label
              htmlFor="account-broker"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              Broker / firm
            </label>
            <input
              id="account-broker"
              name="broker"
              placeholder="Tradovate (Apex)"
              className={inputCls}
            />
          </div>
          <div>
            <label
              htmlFor="account-balance"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              Starting balance
            </label>
            <input
              id="account-balance"
              name="initialBalance"
              type="number"
              step="0.01"
              defaultValue="0"
              className={cn(inputCls, "num w-36")}
            />
          </div>
          <div>
            <label
              htmlFor="account-rvalue"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              R value ($) — 1R
            </label>
            <input
              id="account-rvalue"
              name="rValue"
              type="number"
              step="0.01"
              min="0"
              placeholder="200"
              className={cn(inputCls, "num w-28")}
            />
          </div>
          <button
            type="submit"
            className="btn-accent px-4 py-2 text-sm"
          >
            Add account
          </button>
          <p className="num w-full text-[11px] text-text-faint">
            R value defines 1R in dollars for the account — every trade&apos;s
            R-multiple is net P&L ÷ R value, on logging, import, and
            retroactively when you change it here. Leave empty to fall back
            to stop-based R.
          </p>
        </form>
      </section>

      {/* Instruments */}
      <section>
        <h2 className="eyebrow mb-3">Instruments</h2>
        <div className="card overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-line bg-ink-raised text-left">
                <th className="eyebrow px-4 py-2.5 font-semibold">Symbol</th>
                <th className="eyebrow px-4 py-2.5 font-semibold">Name</th>
                <th className="eyebrow px-4 py-2.5 font-semibold text-right">
                  Tick size
                </th>
                <th className="eyebrow px-4 py-2.5 font-semibold text-right">
                  Tick value
                </th>
                <th className="eyebrow px-4 py-2.5 font-semibold text-right">
                  $ / point
                </th>
              </tr>
            </thead>
            <tbody>
              {instrumentRows.map((instrument) => (
                <tr
                  key={instrument.id}
                  className="border-b border-ink-line last:border-b-0"
                >
                  <td className="px-4 py-2.5 font-semibold">
                    {instrument.symbol}
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">
                    {instrument.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 num text-right">
                    {instrument.tickSize ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 num text-right">
                    {instrument.tickValue != null
                      ? formatMoney(instrument.tickValue)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 num text-right">
                    {instrument.pointValue != null
                      ? formatMoney(instrument.pointValue)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          action={createInstrument}
          className="flex flex-wrap items-end gap-3 card p-4"
        >
          <div>
            <label
              htmlFor="instrument-symbol"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              Symbol
            </label>
            <input
              id="instrument-symbol"
              name="symbol"
              required
              placeholder="MBT"
              className={cn(inputCls, "w-24")}
            />
          </div>
          <div>
            <label
              htmlFor="instrument-name"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              Name
            </label>
            <input
              id="instrument-name"
              name="name"
              placeholder="Micro Bitcoin"
              className={inputCls}
            />
          </div>
          <div>
            <label
              htmlFor="instrument-ticksize"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              Tick size
            </label>
            <input
              id="instrument-ticksize"
              name="tickSize"
              type="number"
              step="any"
              required
              placeholder="0.25"
              className={cn(inputCls, "num w-28")}
            />
          </div>
          <div>
            <label
              htmlFor="instrument-tickvalue"
              className="block text-xs font-medium text-text-muted mb-1.5"
            >
              Tick value ($)
            </label>
            <input
              id="instrument-tickvalue"
              name="tickValue"
              type="number"
              step="any"
              required
              placeholder="1.25"
              className={cn(inputCls, "num w-28")}
            />
          </div>
          <button
            type="submit"
            className="btn-accent px-4 py-2 text-sm"
          >
            Add instrument
          </button>
        </form>
      </section>
    </div>
  );
}
