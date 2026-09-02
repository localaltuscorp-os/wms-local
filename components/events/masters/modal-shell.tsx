"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Lightweight, keyboard-first modal. Portalled to `document.body` (the
 * display-scale lesson: never render an inline Radix-style overlay inside an
 * ancestor that might carry a CSS transform/zoom). Esc closes; the first focusable
 * child autofocuses; focus is trapped loosely by returning it to the opener.
 */
export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  accent,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  accent: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    // Autofocus the first field.
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        "input, select, textarea, button[data-autofocus]",
      );
      el?.focus();
    }, 20);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "color-mix(in srgb, #0b1220 44%, transparent)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="wg-modal-in relative mt-[6vh] w-full max-w-lg overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-2xl"
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: 19,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-[13px] font-medium text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-0.5 inline-flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft/50 px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
