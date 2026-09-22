"use client";

import * as React from "react";
import { ChevronDown, MessageCircle, X } from "lucide-react";
import { whatsappHref } from "@/lib/hr/registers";

/** Shared pieces for the Address Book and the Asset Register. */

export const RED = "var(--color-altus-red)";
export const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red disabled:bg-surface-soft disabled:text-ink-muted";
/**
 * For a sideways-scrolling table wrapper: let the VERTICAL mouse wheel pass
 * through to the page. globals.css sets `overscroll-behavior: contain` on every
 * `overflow-x-auto` box in an unlayered rule, which traps the wheel; Tailwind's
 * `overscroll-y-auto` class loses to it (utilities are layered), so this must be
 * an inline style.
 */
export const PASS_VERTICAL_SCROLL: React.CSSProperties = { overscrollBehaviorY: "auto" };

/**
 * A native <select> with the app's own chevron. The browser's arrow is hidden
 * and a ChevronDown is drawn with a right gutter, so the icon never sits jammed
 * against the border. Inline styles on purpose, so no global CSS rule can undo
 * the hidden arrow or the gutter. Use this for EVERY dropdown here, never a bare <select>.
 */
export function NativeSelect({
  className = "",
  style,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const fullWidth = /\bw-full\b/.test(className);
  return (
    <span className={`relative ${fullWidth ? "block w-full" : "inline-block"}`}>
      <select
        {...props}
        className={`${className} cursor-pointer`}
        style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 36, ...style }}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={2.4}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </span>
  );
}

/** Toolbar filters (selects) — sized to their content, not stretched full width. */
export const FILTER = INPUT.replace("w-full", "w-auto");

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-[rgba(15,23,42,0.45)] p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] ${wide ? "w-[760px]" : "w-[520px]"} max-w-[96vw] overflow-y-auto rounded-2xl border border-hairline-strong bg-surface-card p-5 shadow-[0_40px_100px_rgba(15,23,42,0.35)]`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-black text-ink-strong">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink-strong">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {label}
        {required ? <span style={{ color: RED }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

/** Opens a WhatsApp chat with the number ready. Hidden when the number can't be dialled. */
export function WhatsAppButton({ phone, name }: { phone: string | null | undefined; name: string }) {
  const href = whatsappHref(phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Send ${name} a WhatsApp message`}
      aria-label={`Send ${name} a WhatsApp message`}
      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-white"
      style={{ background: "#16a34a" }}
    >
      <MessageCircle size={14} strokeWidth={2.4} /> WhatsApp
    </a>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count: number }[];
}) {
  return (
    <div role="tablist" className="inline-flex rounded-pill bg-surface-soft p-1" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.value)}
            className="rounded-pill px-4 py-1.5 text-[13px] font-bold transition"
            style={on ? { background: "#fff", color: "var(--color-ink-strong)", boxShadow: "0 1px 3px rgba(15,23,42,.12)" } : { color: "var(--color-ink-muted)" }}
          >
            {it.label} <span className="tabular-nums text-ink-subtle">({it.count})</span>
          </button>
        );
      })}
    </div>
  );
}

export const TH = "px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted whitespace-nowrap";
export const TD = "px-3 py-2.5 align-top text-[13.5px] text-ink-strong";
