"use client";

export function DeleteTradeButton({
  tradeId,
  action,
}: {
  tradeId: number;
  action: (formData: FormData) => void;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this trade? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={tradeId} />
      <button
        type="submit"
        className="rounded-md border border-ink-line px-4 py-2 text-sm font-medium text-loss hover:bg-loss/10 transition-colors"
      >
        Delete
      </button>
    </form>
  );
}
