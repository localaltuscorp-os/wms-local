"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import type { SnapshotView } from "@/lib/queries/work-snapshots";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** Super-admin-only monitoring gallery: every snapshot captured during the task's
 *  work sessions, newest sessions grouped. Signed URLs are minted server-side. */
export function SnapshotGallery({ snapshots }: { snapshots: SnapshotView[] }) {
  const [zoom, setZoom] = React.useState<SnapshotView | null>(null);
  if (snapshots.length === 0) {
    return <p className="text-[13px] text-ink-muted">No monitoring snapshots captured for this task.</p>;
  }
  return (
    <>
      <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-3">
        {snapshots.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => s.url && setZoom(s)}
            className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-hairline bg-surface-soft"
          >
            {s.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.url} alt={`Snapshot at ${clock(s.capturedAt)}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <span className="grid h-full place-items-center text-ink-subtle"><ImageOff size={18} /></span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
              {clock(s.capturedAt)}
            </span>
          </button>
        ))}
      </div>
      {zoom?.url && (
        <div
          className="fixed inset-0 z-[9999] grid place-items-center bg-black/70 p-6"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url} alt={`Snapshot at ${clock(zoom.capturedAt)}`} className="max-h-[85vh] max-w-[90vw] rounded-xl" />
        </div>
      )}
    </>
  );
}
