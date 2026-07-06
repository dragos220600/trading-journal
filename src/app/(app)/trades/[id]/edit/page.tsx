import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trades, tradeTags } from "@/db/schema";
import { updateTrade } from "@/server/actions";
import { requireUser } from "@/server/auth";
import { getTradeFormData } from "@/server/queries";
import { TradeForm } from "@/components/trade-form";

export const dynamic = "force-dynamic";

export default async function EditTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const tradeId = Number(id);
  if (!Number.isFinite(tradeId)) notFound();

  const trade = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, user.id)))
    .get();
  if (!trade) notFound();

  const tagRows = await db
    .select({ tagId: tradeTags.tagId })
    .from(tradeTags)
    .where(eq(tradeTags.tradeId, tradeId))
    .all();
  const tagIds = tagRows.map((r) => r.tagId);

  const formData = await getTradeFormData(user.id);
  const updateTradeWithId = updateTrade.bind(null, tradeId);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 max-w-5xl">
      <header className="mb-8">
        <p className="eyebrow mb-2">02 · Trade #{trade.id}</p>
        <h1 className="text-3xl font-bold tracking-tight">Edit trade</h1>
      </header>
      <TradeForm
        action={updateTradeWithId}
        accounts={formData.accounts}
        instruments={formData.instruments}
        setups={formData.setups}
        tags={formData.tags}
        defaults={{
          accountId: trade.accountId,
          instrumentId: trade.instrumentId,
          setupId: trade.setupId,
          direction: trade.direction,
          quantity: trade.quantity,
          entryTime: trade.entryTime,
          exitTime: trade.exitTime,
          avgEntryPrice: trade.avgEntryPrice,
          avgExitPrice: trade.avgExitPrice,
          stopPrice: trade.stopPrice,
          targetPrice: trade.targetPrice,
          fees: trade.fees,
          rating: trade.rating,
          followedPlan: trade.followedPlan,
          notes: trade.notes,
          tagIds,
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
