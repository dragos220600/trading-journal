"use client";

import { useActionState, useRef, useState } from "react";
import Papa from "papaparse";
import { FileUp } from "lucide-react";
import { importTradovateCsv, type ImportState } from "@/server/import-actions";
import { cn } from "@/lib/utils";

const initialState: ImportState = { status: "idle", messages: [] };

interface PreviewData {
  headers: string[];
  rows: string[][];
}

export function ImportForm() {
  const [state, formAction, pending] = useActionState(
    importTradovateCsv,
    initialState,
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (candidate: File | null | undefined) => {
    if (!candidate) return;
    setFile(candidate);
    Papa.parse(candidate, {
      preview: 5,
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data as string[][];
        if (data.length > 0) {
          setPreview({ headers: data[0], rows: data.slice(1) });
        }
      },
    });
  };

  // Keep the most informative columns for the preview card
  const previewColumns = (headers: string[]) => {
    const wanted = [
      "Fill Time",
      "Timestamp",
      "Contract",
      "Product",
      "B/S",
      "filledQty",
      "avgPrice",
    ];
    const picked: number[] = [];
    for (const name of wanted) {
      const i = headers.findIndex(
        (h) => h.trim().toLowerCase() === name.toLowerCase(),
      );
      if (i >= 0 && !picked.includes(i)) picked.push(i);
      if (picked.length === 5) break;
    }
    return picked.length > 0 ? picked : headers.slice(0, 5).map((_, i) => i);
  };

  return (
    <form action={formAction} className="space-y-4">
      {/* Drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped && inputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(dropped);
            inputRef.current.files = dt.files;
          }
          acceptFile(dropped);
        }}
        className={cn(
          "w-full rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-accent bg-accent/5"
            : "border-ink-line hover:border-ink-line-bright",
        )}
      >
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <FileUp size={18} aria-hidden />
        </span>
        <span className="block text-base font-semibold">
          {file ? file.name : "Drop your CSV here"}
        </span>
        <span className="mt-1 block text-sm text-text-muted">
          Tradovate Orders or Fills exports. Broker format auto-detected.
        </span>
        <span className="btn-accent mx-auto mt-5 inline-block px-4 py-2 text-sm">
          Browse Files
        </span>
        <span className="num mt-4 block text-[10px] tracking-[0.14em] uppercase text-text-faint">
          .csv · up to 4MB
        </span>
      </button>
      <input
        ref={inputRef}
        name="file"
        type="file"
        accept=".csv,text/csv"
        required
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />

      {/* Fee + submit */}
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div>
          <label
            htmlFor="import-fee"
            className="block text-xs font-medium text-text-muted mb-1.5"
          >
            Fees per contract, per side ($)
          </label>
          <input
            id="import-fee"
            name="feePerSide"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className="num w-36 rounded-md border border-ink-line bg-ink-card px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !file}
          className={cn(
            "btn-accent px-4 py-2 text-sm",
            (pending || !file) && "opacity-50",
          )}
        >
          {pending ? "Importing…" : "Import trades"}
        </button>
        <p className="num text-[11px] text-text-faint flex-1 min-w-48">
          The Orders export has no commissions — your all-in cost per contract
          per side is applied to every fill.
        </p>
      </div>

      {/* Preview */}
      {preview && state.status === "idle" && (
        <div className="card p-4">
          <p className="text-sm font-semibold">Preview</p>
          <p className="num mb-3 text-xs text-text-faint">
            First {preview.rows.length} rows of {file?.name}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-line text-left">
                  {previewColumns(preview.headers).map((i) => (
                    <th key={i} className="eyebrow py-2 pr-4 font-medium">
                      {preview.headers[i]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="border-b border-ink-line last:border-b-0"
                  >
                    {previewColumns(preview.headers).map((i) => (
                      <td key={i} className="num py-2 pr-4 text-text-muted">
                        {row[i] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {state.status === "success" && (
        <div className="card border-profit/30 p-4">
          <p className="eyebrow mb-2 text-profit">✓ Import complete</p>
          <p className="text-sm">
            <span className="num font-semibold">{state.created}</span> trade
            {state.created === 1 ? "" : "s"} created
            {state.duplicates ? (
              <span className="text-text-muted">
                {" "}
                · {state.duplicates} duplicate fill
                {state.duplicates === 1 ? "" : "s"} skipped
              </span>
            ) : null}
            {state.newAccounts && state.newAccounts.length > 0 ? (
              <span className="text-text-muted">
                {" "}
                · new account{state.newAccounts.length === 1 ? "" : "s"}:{" "}
                {state.newAccounts.join(", ")}
              </span>
            ) : null}
          </p>
          {state.messages.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-text-muted list-disc pl-4">
              {state.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="card border-loss/40 p-4">
          <p className="eyebrow mb-2 text-loss">Import failed</p>
          <ul className="space-y-1 text-sm text-text-muted">
            {state.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
