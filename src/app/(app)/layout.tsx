import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, trades } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { localToday } from "@/lib/format";
import { Sidebar } from "@/components/sidebar";

function accountBalance(userId: number) {
  const active = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)))
    .all();
  const initial = active.reduce((s, a) => s + a.initialBalance, 0);
  if (active.length === 0) return { balance: 0, mtdPct: null };

  const activeTrades = db
    .select({ netPnl: trades.netPnl, entryTime: trades.entryTime })
    .from(trades)
    .where(
      inArray(
        trades.accountId,
        active.map((a) => a.id),
      ),
    )
    .all()
    .filter((t) => t.netPnl != null);

  const totalPnl = activeTrades.reduce((s, t) => s + t.netPnl!, 0);
  const thisMonth = localToday().slice(0, 7);
  const mtdPnl = activeTrades
    .filter((t) => t.entryTime.startsWith(thisMonth))
    .reduce((s, t) => s + t.netPnl!, 0);

  const balance = initial + totalPnl;
  const monthStart = balance - mtdPnl;
  const mtdPct = monthStart !== 0 ? (mtdPnl / Math.abs(monthStart)) * 100 : null;
  return { balance, mtdPct };
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { balance, mtdPct } = accountBalance(user.id);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        balance={balance}
        mtdPct={mtdPct}
        userLabel={user.name || user.email}
      />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
