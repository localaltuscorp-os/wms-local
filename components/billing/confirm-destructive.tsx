"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * The destructive-action dialog, lifted from the shared admin DataTable so
 * Billing asks the same question in the same voice.
 *
 * NOT only for deletes: `heading`, `body` and `confirmLabel` are overridable,
 * which is what lets "reset this list to its defaults" ask here rather than
 * through a browser confirm() that would look like a different application.
 */
export function ConfirmDelete({
  count,
  noun,
  busy,
  accent,
  subject,
  heading,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  count: number;
  noun: string;
  busy: boolean;
  /**
   * Names the one thing being destroyed, shown instead of the count.
   * "Purchase Contact" is a better warning than "1 option selected" when
   * there is exactly one and the user picked it by name.
   */
  subject?: string;
  /** Override for a destructive action that is not literally a delete. */
  heading?: string;
  body?: string;
  confirmLabel?: string;
  /**
   * The screen's accent, so the dialog belongs to the screen it opened from
   * rather than introducing a colour of its own. Passed in rather than
   * hardcoded red: this table is shared, and each module has its own hue.
   */
  accent: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm delete"
    >
      <div
        className="w-full max-w-[460px] rounded-section bg-surface-card px-6 py-6"
        style={{
          border: "1px solid var(--color-ink-strong)",
          boxShadow: `0 3px 0 0 ${accent}, 0 30px 60px -20px rgba(15,23,42,0.4)`,
        }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="shrink-0 grid place-items-center rounded-full"
            style={{
              width: 38,
              height: 38,
              background: `color-mix(in srgb, ${accent} 10%, transparent)`,
              color: accent,
            }}
          >
            <AlertTriangle size={19} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2
              className="font-bold text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 18 }}
            >
              {heading ?? "Are you sure you want to permanently delete this?"}
            </h2>
            <p className="mt-1.5 text-ink-muted" style={{ fontSize: 13.5 }}>
              {body ?? "This cannot be restored later."}
            </p>
            {/* What is about to go, stated separately from the warning rather
                than buried in it — the name (or the count) is exactly what a
                mis-click gets wrong. */}
            <p className="mt-2 font-semibold text-ink-soft" style={{ fontSize: 13 }}>
              {subject ? `"${subject}"` : `${count} ${count === 1 ? noun : `${noun}s`} selected.`}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-chip px-4 h-10 text-[14px] font-semibold text-ink-soft border border-hairline disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-chip px-5 h-10 text-[14px] font-bold text-white disabled:opacity-60"
            style={{ background: accent }}
          >
            {busy ? "Working…" : (confirmLabel ?? "Delete permanently")}
          </button>
        </div>
      </div>
    </div>
  );
}
