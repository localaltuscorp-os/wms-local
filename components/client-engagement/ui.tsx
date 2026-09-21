"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Chevroned } from "@/components/ui/chevroned-select";
import { hhStatusMeta } from "@/lib/client-engagement/status";
import { DISPLAY, FIELD } from "./tokens";

/**
 * CLIENT ENGAGEMENT — the small shared COMPONENTS every tab uses: the status
 * pill, the dialog frame, the select, the toolbar. Style constants live in
 * ./tokens (a plain module) so server components can read them too; they are
 * re-exported here for the client components' convenience. A SERVER component
 * must import them from ./tokens, never from here.
 */

export { BTN_NEUTRAL, BTN_PRIMARY, CARD, CARD_SHADOW, DISPLAY, FIELD, LABEL, TD, TH, TONE_VAR } from "./tokens";

/** A native select wearing the app chevron (hidden OS arrow, right gutter). */
export function Select({
  value,
  onChange,
  children,
  className = "",
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Chevroned className={className}>
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} cursor-pointer appearance-none`}
        style={{ paddingRight: 36, appearance: "none", WebkitAppearance: "none" }}
      >
        {children}
      </select>
    </Chevroned>
  );
}

/** The business colour band as a pill. Standard shows nothing unless `showStandard`. */
export function HhStatusPill({ status, showStandard = false, small = false }: { status: string; showStandard?: boolean; small?: boolean }) {
  const meta = hhStatusMeta(status);
  if (!meta.bg) {
    if (!showStandard) return null;
    return (
      <span
        className={`inline-flex items-center whitespace-nowrap rounded-full border border-hairline-strong bg-surface-card font-bold text-ink-muted ${small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      >
        {meta.label}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-bold ${small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ background: meta.bg, color: meta.fg ?? undefined }}
    >
      {meta.label}
    </span>
  );
}

/** A left edge in the status colour, for rows and calendar blocks. */
export function statusEdge(status: string): string {
  return hhStatusMeta(status).bg ?? "var(--color-hairline-strong)";
}


/** Centered modal frame: Esc and the backdrop close it. */
export function CeDialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" role="dialog" aria-modal aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-[rgba(15,23,42,0.32)]" />
      <div
        className="relative my-6 w-full rounded-[20px] border border-hairline bg-surface-card"
        style={{ maxWidth: width, boxShadow: "0 30px 80px -30px rgba(15,23,42,0.45)" }}
      >
        <div className="flex items-start gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink-strong" style={DISPLAY}>
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** The inline error line forms show above their buttons. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      className="mt-3 rounded-xl px-3 py-2 text-[12.5px] font-semibold"
      style={{ color: "var(--color-red-deep)", background: "color-mix(in srgb, var(--color-red) 22%, transparent)" }}
      role="alert"
    >
      {message}
    </p>
  );
}

/** Segmented toggle (design-system recipe). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-pill border border-hairline-strong bg-surface-soft">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="inline-flex h-full items-center gap-1.5 whitespace-nowrap px-3 text-[12.5px] font-bold transition-colors"
            style={
              active
                ? {
                    background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    color: "#fff",
                    boxShadow: "0 6px 14px -8px var(--color-altus-red-deep)",
                  }
                : { color: "var(--color-ink-subtle)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Toolbar strip (design-system recipe). */
export function Toolbar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mb-3 flex flex-wrap items-center gap-2 rounded-section border border-hairline px-3 py-2 ${className}`}
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,251,252,0.72))",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 10px 26px -20px rgba(15,23,42,0.18)",
      }}
    >
      {children}
    </div>
  );
}
