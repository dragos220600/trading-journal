"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Screenshot uploader: click to pick, drag-and-drop, or just Ctrl+V a
 * chart copied from TradingView/Tradovate anywhere on the page.
 */
export function AttachmentUploader({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  const acceptFile = (candidate: File | null | undefined) => {
    if (!candidate || !candidate.type.startsWith("image/")) return;
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
  };

  // Paste a copied chart image from anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith("image/"),
      );
      if (item) acceptFile(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const submit = () => {
    if (!file || pending) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("caption", captionRef.current?.value ?? "");
    startTransition(async () => {
      await action(formData);
      setFile(null);
      setPreview(null);
      if (captionRef.current) captionRef.current.value = "";
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <div className="space-y-3">
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
          acceptFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "w-full rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dragOver
            ? "border-accent bg-accent/5"
            : "border-ink-line hover:border-ink-line-bright hover:bg-ink-hover/40",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Screenshot ready to attach"
            className="mx-auto max-h-48 rounded-md"
          />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-text-muted">
            <ImagePlus size={20} aria-hidden className="text-text-faint" />
            Click, drop, or <span className="num">Ctrl+V</span> a chart
            screenshot
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />

      {file && (
        <div className="flex gap-3">
          <input
            ref={captionRef}
            placeholder="Caption (optional) — e.g. 5m chart at entry"
            className="flex-1 rounded-md border border-ink-line bg-ink-card px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-dim focus:ring-1 focus:ring-accent-dim"
          />
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={cn("btn-accent px-4 py-2 text-sm", pending && "opacity-60")}
          >
            {pending ? "Saving…" : "Attach"}
          </button>
        </div>
      )}
    </div>
  );
}
