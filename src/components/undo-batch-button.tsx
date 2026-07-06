"use client";

export function UndoBatchButton({
  batchId,
  tradeCount,
  action,
}: {
  batchId: number;
  tradeCount: number;
  action: (formData: FormData) => void;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Undo this import? Its ${tradeCount} trade${tradeCount === 1 ? "" : "s"} will be deleted.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={batchId} />
      <button
        type="submit"
        className="text-xs text-text-muted hover:text-loss transition-colors underline underline-offset-2"
      >
        Undo
      </button>
    </form>
  );
}
