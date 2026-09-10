"use client";

import * as React from "react";
import { FileText, ImageIcon, Paperclip, Upload, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  CLAIM_ACCEPT_ATTR,
  CLAIM_ALLOWED_LABEL,
  CLAIM_MAX_FILES,
  checkClaimFile,
  formatBytes,
  isThumbnailable,
} from "@/lib/reimbursements/attachment-rules";

/**
 * Pick the documents for a reimbursement claim.
 *
 * ── PICKS, DOES NOT UPLOAD ─────────────────────────────────────────────────
 * The files are held locally until the claim is submitted, and the dialog
 * uploads them then (see `uploadClaimFiles`). Uploading on pick would leave
 * orphaned objects in storage every time somebody opened the form, changed
 * their mind and closed it.
 *
 * Files are vetted here with the SAME predicate the server uses, so a wrong
 * type is refused before anyone waits on an upload — but the client check is a
 * courtesy and the server's is the control.
 */
export function RbFilePicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const add = React.useCallback(
    (picked: FileList | File[] | null) => {
      if (!picked) return;
      const incoming = Array.from(picked);
      if (incoming.length === 0) return;

      const next = [...files];
      for (const f of incoming) {
        const check = checkClaimFile({ name: f.name, size: f.size });
        if (!check.ok) {
          fireToast({ message: check.error, type: "error" });
          continue;
        }
        // Same name AND same size AND same mtime — picking the same receipt
        // twice is an accident, not a request for two copies.
        if (next.some((e) => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified)) {
          continue;
        }
        if (next.length >= CLAIM_MAX_FILES) {
          fireToast({ message: `At most ${CLAIM_MAX_FILES} documents per claim.`, type: "error" });
          break;
        }
        next.push(f);
      }
      onChange(next);
    },
    [files, onChange],
  );

  const remove = (i: number) => onChange(files.filter((_, idx) => idx !== i));

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer?.files ?? null);
        }}
        className="rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors"
        style={{
          borderColor: dragging ? "#16a34a" : "var(--color-hairline-strong)",
          background: dragging ? "color-mix(in srgb, #16a34a 6%, transparent)" : "transparent",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CLAIM_ACCEPT_ATTR}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            // Reset so re-picking the same file fires `change` again.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="wg-btn inline-flex items-center gap-1.5 rounded-pill bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong disabled:opacity-50"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
        >
          <Upload size={15} strokeWidth={2.5} />
          {files.length > 0 ? "Add another" : "Choose files"}
        </button>
        <p className="mt-1.5 text-[12px] font-medium text-ink-subtle">
          Drag a bill in, or browse · {CLAIM_ALLOWED_LABEL} · up to 25 MB each
        </p>
      </div>

      {files.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${f.lastModified}`}
              className="flex items-center gap-2.5 rounded-lg bg-surface-soft px-2.5 py-2"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md text-ink-soft" style={{ background: "var(--color-surface-card)" }}>
                {isThumbnailable(f.name) ? (
                  <ImageIcon size={14} strokeWidth={2.4} aria-hidden />
                ) : (
                  <FileText size={14} strokeWidth={2.4} aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-ink-strong" title={f.name}>
                  {f.name}
                </span>
                <span className="block text-[11.5px] font-medium text-ink-subtle">
                  {formatBytes(f.size)}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(i)}
                aria-label={`Remove ${f.name}`}
                className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-black/[0.06] hover:text-ink-strong disabled:opacity-40"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The label the dialog puts above the picker. */
export function RbFilePickerLabel({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Paperclip size={13} strokeWidth={2.6} aria-hidden />
      Bill / Receipt
      {count > 0 && (
        <span className="tabular-nums text-[12px] font-bold text-ink-subtle">
          ({count})
        </span>
      )}
    </span>
  );
}
