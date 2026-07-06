"use client";

import { useActionState, useState } from "react";
import type { JournalSaveState } from "@/server/journal-actions";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-md border border-ink-line bg-ink-card px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim";

function ScoreRow({
  name,
  label,
  lowLabel,
  highLabel,
  defaultValue,
}: {
  name: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  defaultValue: number | null;
}) {
  const [score, setScore] = useState<number | null>(defaultValue);
  return (
    <div>
      <span className="block text-xs font-medium text-text-muted mb-1.5">
        {label}{" "}
        <span className="text-text-faint">
          ({lowLabel} → {highLabel})
        </span>
      </span>
      <input type="hidden" name={name} value={score ?? ""} />
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(score === n ? null : n)}
            aria-label={`${label} ${n} of 5`}
            className={cn(
              "num h-9 w-9 rounded-md border text-sm font-semibold transition-colors",
              score != null && n <= score
                ? "border-accent-dim bg-accent/15 text-accent"
                : "border-ink-line bg-ink-card text-text-faint hover:text-text-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function JournalEntryForm({
  action,
  defaults,
}: {
  action: (
    prev: JournalSaveState,
    formData: FormData,
  ) => Promise<JournalSaveState>;
  defaults: {
    premarketPlan: string | null;
    review: string | null;
    mood: number | null;
    sleepQuality: number | null;
  };
}) {
  const [state, formAction, pending] = useActionState(action, {
    savedAt: null,
  });

  return (
    <form action={formAction} className="space-y-6">
      <div className="card p-5 space-y-4">
        <p className="eyebrow text-accent">Pre-market</p>
        <div>
          <label
            htmlFor="premarketPlan"
            className="block text-xs font-medium text-text-muted mb-1.5"
          >
            Plan for the session
          </label>
          <textarea
            id="premarketPlan"
            name="premarketPlan"
            rows={5}
            defaultValue={defaults.premarketPlan ?? ""}
            placeholder={
              "Bias and key levels…\nWhat setups am I hunting today?\nMax loss / stop-trading point:"
            }
            className={inputCls}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ScoreRow
            name="sleepQuality"
            label="Sleep"
            lowLabel="rough"
            highLabel="rested"
            defaultValue={defaults.sleepQuality}
          />
          <ScoreRow
            name="mood"
            label="Mood"
            lowLabel="off"
            highLabel="sharp"
            defaultValue={defaults.mood}
          />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="eyebrow text-accent">End of day</p>
        <div>
          <label
            htmlFor="review"
            className="block text-xs font-medium text-text-muted mb-1.5"
          >
            Session review
          </label>
          <textarea
            id="review"
            name="review"
            rows={6}
            defaultValue={defaults.review ?? ""}
            placeholder={
              "How did I trade vs. the plan?\nBest decision · worst decision…\nOne thing to do better tomorrow:"
            }
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={cn("btn-accent px-5 py-2.5 text-sm", pending && "opacity-60")}
        >
          {pending ? "Saving…" : "Save entry"}
        </button>
        {state.savedAt && !pending && (
          <span className="text-xs text-profit">Saved ✓</span>
        )}
      </div>
    </form>
  );
}
