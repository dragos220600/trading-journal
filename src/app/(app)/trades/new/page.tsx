import { createTrade } from "@/server/actions";
import { requireUser } from "@/server/auth";
import { getTradeFormData } from "@/server/queries";
import { TradeForm } from "@/components/trade-form";

export const dynamic = "force-dynamic";

export default async function NewTradePage() {
  const user = await requireUser();
  const formData = getTradeFormData(user.id);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-8 reveal" style={{ "--i": 0 } as React.CSSProperties}>
        <p className="eyebrow mb-2">02 · New execution</p>
        <h1 className="text-3xl font-bold tracking-tight">Log a trade</h1>
        <p className="mt-1.5 text-sm text-text-muted">
          P&L, risk and R-multiple compute live from the contract specs.
        </p>
      </header>
      <TradeForm
        action={createTrade}
        accounts={formData.accounts}
        instruments={formData.instruments}
        setups={formData.setups}
        tags={formData.tags}
        submitLabel="Save trade"
      />
    </div>
  );
}
