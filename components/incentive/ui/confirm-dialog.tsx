"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * THE MODULE'S ONE DESTRUCTIVE CONFIRMATION.
 *
 * The module had three standards at once: a silent delete (incentive entries),
 * the browser's blocking `confirm()` (the incentive table) and a typed-name
 * dialog (the Incentive Master). The Master's was the right one, so this is
 * that pattern, generalised:
 *
 *   · `confirmText` set  — the name must be typed before the button enables.
 *     For deletes that cannot be undone.
 *   · `confirmText` unset — a plain confirm. For reversible actions.
 *
 * It is presentation only. Every action it fronts still authorises itself on
 * the server; a dialog is not a permission.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Delete",
  confirmText,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  /** When set, the operator must type this exactly. */
  confirmText?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const ready = !confirmText || typed.trim() === confirmText.trim();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[140]" style={{ background: "rgba(15,23,42,0.45)" }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[150] w-[calc(100vw-24px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-surface-card p-5"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 inline-grid size-9 shrink-0 place-items-center rounded-xl"
              style={{
                background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                color: "var(--color-altus-red-deep)",
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-[16px] font-bold text-ink-strong">{title}</Dialog.Title>
              <Dialog.Description asChild>
                <div className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{body}</div>
              </Dialog.Description>
            </div>
          </div>

          {confirmText ? (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[13px] font-bold text-ink-strong">
                Type <span className="font-mono text-ink-soft">{confirmText}</span> to confirm
              </span>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-9 w-full rounded-pill border border-hairline bg-surface-card px-3.5 text-[13.5px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
              />
            </label>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:opacity-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || !ready}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold text-white transition-opacity disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              }}
            >
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
