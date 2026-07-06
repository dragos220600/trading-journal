"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILES = 4;

interface PendingShot {
  file: File;
  preview: string;
}

/**
 * Screenshot picker for the trade form. Images are held locally
 * (click / drop / Ctrl+V paste anywhere on the page) and submitted
 * with the form as name="screenshots" + name="screenshotCaptions".
 */
export function ScreenshotField() {
  const [shots, setShots] = useState<PendingShot[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<PendingShot[]>([]);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  const syncInput = (next: PendingShot[]) => {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    for (const shot of next) dt.items.add(shot.file);
    inputRef.current.files = dt.files;
  };

  const addFiles = (candidates: (File | null)[]) => {
    const images = candidates.filter(
      (f): f is File => !!f && f.type.startsWith("image/"),
    );
    if (images.length === 0) return;
    setShots((current) => {
      const next = [
        ...current,
        ...images.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        })),
      ].slice(0, MAX_FILES);
      syncInput(next);
      return next;
    });
  };

  const removeShot = (index: number) => {
    setShots((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      const next = current.filter((_, i) => i !== index);
      syncInput(next);
      return next;
    });
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = [...(e.clipboardData?.items ?? [])].filter((i) =>
        i.type.startsWith("image/"),
      );
      if (items.length > 0) addFiles(items.map((i) => i.getAsFile()));
    };
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
      for (const shot of shotsRef.current) URL.revokeObjectURL(shot.preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        name="screenshots"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
        }}
      />

      {shots.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {shots.map((shot, index) => (
            <figure
              key={shot.preview}
              className="relative rounded-lg border border-ink-line bg-ink-card overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.preview}
                alt={`Screenshot ${index + 1} ready to attach`}
                className="max-h-40 w-full object-cover"
              />
              <input
                name="screenshotCaptions"
                placeholder="Caption (optional) — e.g. 5m at entry"
                className="w-full border-t border-ink-line bg-transparent px-3 py-2 text-xs text-text-primary placeholder:text-text-faint focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeShot(index)}
                aria-label={`Remove screenshot ${index + 1}`}
                className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-ink-deep/80 text-text-muted border border-ink-line hover:text-loss transition-colors"
              >
                <X size={12} aria-hidden />
              </button>
            </figure>
          ))}
        </div>
      )}

      {shots.length < MAX_FILES && (
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
            addFiles([...(e.dataTransfer.files ?? [])]);
          }}
          className={cn(
            "w-full rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
            dragOver
              ? "border-accent bg-accent/5"
              : "border-ink-line hover:border-ink-line-bright hover:bg-ink-hover/40",
          )}
        >
          <span className="flex flex-col items-center gap-1.5 text-sm text-text-muted">
            <ImagePlus size={18} aria-hidden className="text-text-faint" />
            <span>
              Click, drop, or <span className="num">Ctrl+V</span> chart
              screenshots
            </span>
            <span className="num text-[10px] tracking-[0.14em] uppercase text-text-faint">
              up to {MAX_FILES} images · saved with the trade
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
