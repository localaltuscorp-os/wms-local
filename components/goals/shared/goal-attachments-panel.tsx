"use client";

/**
 * GoalAttachmentsPanel — the upload / list / view / delete UI for a goal's
 * evidence gallery (the 0142 documents-gallery via detail-actions). Factored
 * out of GoalDetailRow so the SAME panel can sit inside the Quarterly Goals
 * detail screen's Edit popup too, instead of duplicating the fetch/upload/
 * remove logic in two places. Uses the lightweight `listGoalAttachments`
 * (not the full goalDetailBundle) since this panel only ever needs the file
 * gallery.
 */

import * as React from "react";
import { Eye, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import {
  listGoalAttachments,
  uploadGoalAttachment,
  removeGoalAttachment,
  type DetailAttachment,
} from "@/app/(app)/goals/cascade/detail-actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

function fmtBytes(n: number | null): string {
  if (!n) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

export interface GoalAttachmentsPanelProps {
  goalId: string;
  canWrite: boolean;
  /** Which engine this goal lives in — cascade `goals` (default) or weekly_goals. */
  nodeKind?: "cascade" | "weekly";
  /** Show the per-file "View" (open in new tab) button. Off on the Quarterly
   *  Goals TABLE (first screen) by request — on everywhere else, including
   *  the standalone /goals/[id] full-detail screen and its Edit popup. */
  showView?: boolean;
  className?: string;
}

export function GoalAttachmentsPanel({ goalId, canWrite, nodeKind = "cascade", showView = true, className }: GoalAttachmentsPanelProps) {
  const [atts, setAtts] = React.useState<DetailAttachment[] | null>(null); // null = loading
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let live = true;
    listGoalAttachments({ id: goalId, kind: nodeKind }).then((res) => {
      if (!live) return;
      setAtts(res.ok ? res.attachments : []);
    });
    return () => {
      live = false;
    };
  }, [goalId, nodeKind]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("nodeId", goalId);
    fd.set("nodeKind", nodeKind);
    fd.set("file", file);
    const res = await uploadGoalAttachment(fd);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      setAtts((prev) => [res.attachment, ...(prev ?? [])]);
      fireToast({ message: "File attached", type: "success" });
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  }

  async function remove(id: string) {
    const prev = atts;
    setAtts((p) => (p ?? []).filter((a) => a.id !== id));
    const res = await removeGoalAttachment({ id });
    if (!res.ok) {
      setAtts(prev ?? null);
      fireToast({ message: res.error, type: "error" });
    }
  }

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.07em] text-ink-soft">
          <Paperclip size={13} className="text-altus-red" /> Attachments
          {atts && atts.length > 0 && <span className="tabular-nums text-ink-subtle">· {atts.length}</span>}
        </p>
        {canWrite && (
          <>
            <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold text-altus-red transition-colors hover:bg-altus-red hover:text-white disabled:opacity-60",
                FOCUS_RING,
              )}
              style={{ borderColor: "var(--color-altus-red)" }}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} strokeWidth={2.6} />}
              Upload
            </button>
          </>
        )}
      </div>

      {atts === null ? (
        <p className="flex items-center gap-2 py-2 text-[12.5px] text-ink-subtle">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </p>
      ) : atts.length === 0 ? (
        <p className="rounded-lg border px-3 py-3 text-[12.5px] text-ink-subtle" style={{ borderColor: "var(--color-hairline-strong)" }}>
          No files yet — attach evidence, briefs or screenshots.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {atts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <FileText size={14} className="shrink-0 text-ink-subtle" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-strong" title={a.title}>
                {a.title}
              </span>
              {a.sizeBytes != null && <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{fmtBytes(a.sizeBytes)}</span>}
              {showView && a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View ${a.title}`}
                  title="View"
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] font-bold text-altus-red-deep transition-colors hover:bg-altus-red hover:text-white",
                    FOCUS_RING,
                  )}
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)" }}
                >
                  <Eye size={13} /> View
                </a>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  aria-label={`Remove ${a.title}`}
                  className={cn("grid size-6 shrink-0 place-items-center rounded-md text-altus-red hover:bg-altus-red hover:text-white", FOCUS_RING)}
                >
                  <Trash2 size={12} strokeWidth={2.4} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
