"use client";

import { Trash2 } from "lucide-react";

export function DeleteSetupButton({
  setupId,
  setupName,
  tradeCount,
  action,
}: {
  setupId: number;
  setupName: string;
  tradeCount: number;
  action: (formData: FormData) => void;
}) {
  const message =
    tradeCount > 0
      ? `Delete "${setupName}"? ${tradeCount} trade${tradeCount === 1 ? "" : "s"} use${tradeCount === 1 ? "s" : ""} it — they will be kept but marked "no setup".`
      : `Delete "${setupName}"?`;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={setupId} />
      <button
        type="submit"
        aria-label={`Delete setup ${setupName}`}
        title="Delete setup"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-line text-text-faint hover:text-loss hover:border-loss/40 transition-colors"
      >
        <Trash2 size={13} aria-hidden />
      </button>
    </form>
  );
}
