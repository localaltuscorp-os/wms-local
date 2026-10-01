"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Chevroned } from "@/components/ui/chevroned-select";
import { hhStatusMeta } from "@/lib/client-engagement/status";
import { CE_DAY_END_MIN, CE_DAY_START_MIN } from "@/lib/client-engagement/constants";
import { parseClockInput, toClock } from "@/lib/client-engagement/schedule";
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
  highlighted,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /**
   * A red ring around the field — used to show WHICH filter a KPI-card click
   * just changed (asked 2026-09-28: "make sure the filter changed is
   * highlighted so the user knows what changed and what to change to go
   * back"), so the source of an unexpected filter is never a mystery.
   */
  highlighted?: boolean;
}) {
  return (
    <Chevroned className={className}>
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} cursor-pointer appearance-none ${highlighted ? "ring-2 ring-offset-1" : ""}`}
        style={{
          paddingRight: 36,
          appearance: "none",
          WebkitAppearance: "none",
          ...(highlighted ? ({ "--tw-ring-color": "var(--color-altus-red)" } as React.CSSProperties) : {}),
        }}
      >
        {children}
      </select>
    </Chevroned>
  );
}

const QUARTER_HOURS = Array.from({ length: (CE_DAY_END_MIN - CE_DAY_START_MIN) / 15 + 1 }, (_, i) => CE_DAY_START_MIN + i * 15);

/**
 * A TYPABLE time field — "11:47 am" or "23:15", not just a fixed slot list
 * (asked 2026-09-26: the old dropdown only offered fixed increments). A
 * datalist still offers quarter-hour picks for a quick click, but any minute
 * inside the window can be typed. Reverts to the last valid value on blur if
 * what's there doesn't parse or falls outside `min`/`max`.
 */
export function TimeField({
  value,
  onChange,
  ariaLabel,
  min = CE_DAY_START_MIN,
  max = CE_DAY_END_MIN,
  className = "",
}: {
  /** Minutes since midnight. */
  value: number;
  onChange: (min: number) => void;
  ariaLabel: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [text, setText] = React.useState(() => toClock(value));
  // The value can change from outside (e.g. "Call duration" moving "To").
  // Adjusted during render rather than in an effect (React's own pattern for
  // this — https://react.dev/learn/you-might-not-need-an-effect) so the typed
  // text stays in sync without an extra render pass.
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(toClock(value));
  }
  const id = React.useId();

  function commit(raw: string) {
    const parsed = parseClockInput(raw);
    if (parsed === null || parsed < min || parsed > max) {
      setText(toClock(value));
      return;
    }
    onChange(parsed);
    setText(toClock(parsed));
  }

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        list={id}
        className={`${FIELD} ${className}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }}
        aria-label={ariaLabel}
        placeholder="e.g. 11:47 AM"
      />
      <datalist id={id}>
        {QUARTER_HOURS.filter((t) => t >= min && t <= max).map((t) => (
          <option key={t} value={toClock(t)} />
        ))}
      </datalist>
    </>
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

const subscribeToPortalReady = (callback: () => void) => {
  const timer = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timer);
};
const getPortalReady = () => true;
const getPortalServerSnapshot = () => false;

/** Centered modal frame: Esc and the backdrop close it. */
export function CeDialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
  portal = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** Isolate account forms from transformed and clipped page ancestors. */
  portal?: boolean;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const portalReady = React.useSyncExternalStore(
    subscribeToPortalReady,
    getPortalReady,
    getPortalServerSnapshot,
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    if (!portal || !portalReady) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    const initial = dialog?.querySelector<HTMLElement>("[autofocus]") ?? focusables()[0];
    initial?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = focusables();
      if (!controls.length) { event.preventDefault(); dialog?.focus(); return; }
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", onKeyDown);
    return () => {
      dialog?.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [portal, portalReady]);

  const frame = (
    <div className={`fixed inset-0 ${portal ? "z-[10000] grid place-items-center overflow-hidden p-3 sm:p-5" : "z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"}`}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`${portal ? "absolute bg-[rgba(15,23,42,0.48)]" : "fixed bg-[rgba(15,23,42,0.32)]"} inset-0 cursor-default`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={portal ? dialogRef : undefined}
        tabIndex={portal ? -1 : undefined}
        className={portal
          ? "relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card sm:max-h-[calc(100dvh-2.5rem)]"
          : "relative my-6 w-full rounded-[20px] border border-hairline bg-surface-card"}
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
        <div className={`px-5 py-4 ${portal ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}`}>{children}</div>
        {footer ? <div className={`flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-5 py-3 ${portal ? "shrink-0 bg-surface-card" : ""}`}>{footer}</div> : null}
      </div>
    </div>
  );

  return portal && portalReady ? createPortal(frame, document.body) : frame;
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
