"use client";

import { X } from "lucide-react";

export interface GalleryAttachment {
  id: number;
  caption: string | null;
}

export function AttachmentGallery({
  items,
  deleteAction,
}: {
  items: GalleryAttachment[];
  deleteAction: (formData: FormData) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 mb-4">
      {items.map((attachment) => (
        <figure key={attachment.id} className="group relative card overflow-hidden">
          <a
            href={`/api/attachments/${attachment.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attachments/${attachment.id}`}
              alt={attachment.caption ?? "Trade screenshot"}
              loading="lazy"
              className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </a>
          {attachment.caption && (
            <figcaption className="px-3 py-2 text-xs text-text-muted border-t border-ink-line">
              {attachment.caption}
            </figcaption>
          )}
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm("Delete this screenshot?")) e.preventDefault();
            }}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <input type="hidden" name="id" value={attachment.id} />
            <button
              type="submit"
              aria-label="Delete screenshot"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-deep/80 text-text-muted hover:text-loss border border-ink-line backdrop-blur transition-colors"
            >
              <X size={14} aria-hidden />
            </button>
          </form>
        </figure>
      ))}
    </div>
  );
}
