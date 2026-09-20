"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check, Loader2, Lock } from "lucide-react";
import type { StatusBadgeStyle } from "@/lib/format";

/**
 * THE STATUS CONTROL — the coloured pill and the dotted menu, once.
 *
 * Manan, 2026-09-16: a screenshot of the Tasks doer picker — grey/indigo/
 * yellow/orange/red/green/sky dots down a white menu, the current row tinted
 * red with a tick — and "i want same for goals and project module, same colour
 * same".
 *
 * WHY THIS FILE EXISTS. The two modules were already sharing the *vocabulary*
 * (lib/status/axes.ts) and the *palette* (lib/format.ts). What they did not
 * share was the rendering: Tasks drew a Radix popover with a filled pill
 * trigger, while Goals and Project Plan drew a native `<select>` through
 * components/status/status-select.tsx. Same seven statuses, same seven hexes,
 * two completely different controls — and the native one showed the colour as
 * text on a white box, so the dots Manan is pointing at were not there at all.
 *
 * Copying the popover into status-select.tsx would have made a THIRD copy of a
 * thing that has already drifted once (see the header of status-select.tsx).
 * So the popover moves here and both callers render it.
 *
 * PRESENTATIONAL ONLY. No server action, no optimistic state, no toast — those
 * differ per module and stay with the callers. This owns the pill, the menu,
 * the roving focus and nothing else.
 */

/** One row of the menu: what it says, what it writes, what colour it is. */
export interface StatusListboxOption {
  value: string;
  label: string;
  /** Fill / ink / hairline / dot, already resolved. See `statusBadgeStyle`. */
  style: StatusBadgeStyle;
}

/**
 * Uniform pill geometry, shared by the trigger and the read-only badge so a
 * column of mixed rows reads as one column of identical chips.
 *
 * `min-w` rather than a hard `w-`: status labels are ADMIN-EDITABLE (the
 * `status_settings` table), so a fixed width would silently truncate a custom
 * label. 140px clears the longest built-in label with the dot, both gaps, the
 * chevron and the padding.
 *
 * `compact` drops the floor entirely — the Daily Goals day cards sit two of
 * these side by side in a ~210px column, where 140px each cannot fit.
 */
const SHELL_BASE =
  "inline-flex items-center rounded-pill font-bold tabular-nums whitespace-nowrap";
const SHELL_SIZE = {
  regular: "gap-1.5 px-3 py-1.5 text-[13px] min-w-[140px]",
  compact: "gap-1 px-2 py-[2px] text-[10.5px] min-w-0 flex-1",
} as const;

/**
 * The label takes the leftover space and centres itself INSIDE it — that keeps
 * the dot hard against the left padding and the chevron hard against the right
 * one at every label length. Centring the whole group instead would slide both
 * markers inward on a short label like "Done" and they would stop lining up
 * down the column.
 */
const SHELL_LABEL = "flex-1 text-center truncate";

function Dot({ color, compact }: { color: string; compact?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full shrink-0 ${compact ? "size-1" : "size-1.5"}`}
      style={{ background: color }}
    />
  );
}

/* ──────────────────────────── the read-only pill ──────────────────────────── */

export interface StatusBadgeProps {
  label: string;
  style: StatusBadgeStyle;
  /** Hover text — usually why this reader cannot change it. */
  title?: string;
  ariaLabel?: string;
  /** Draw the padlock that marks "you may read this axis, not set it". */
  locked?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * The static twin of the trigger, for a viewer who may not set this axis.
 *
 * It reserves the chevron's footprint even without a chevron, so a read-only
 * badge and an editable one centre their label on the same axis — the two
 * render side by side in the same column.
 */
export function StatusBadge({
  label,
  style,
  title,
  ariaLabel,
  locked,
  compact,
  className,
}: StatusBadgeProps) {
  return (
    <span
      aria-label={ariaLabel ?? label}
      title={title}
      className={`${SHELL_BASE} ${compact ? SHELL_SIZE.compact : SHELL_SIZE.regular} ${className ?? ""}`}
      style={{
        background: style.bg,
        color: style.ink,
        border: `1px solid ${style.border}`,
      }}
    >
      {locked ? (
        <Lock size={compact ? 9 : 10} strokeWidth={2.6} className="shrink-0" aria-hidden />
      ) : (
        <Dot color={style.dot} compact={compact} />
      )}
      <span className={SHELL_LABEL}>{label}</span>
      <span aria-hidden className={`shrink-0 ${compact ? "w-2.5" : "w-3"}`} />
    </span>
  );
}

/* ───────────────────────────── the picker ───────────────────────────── */

export interface StatusListboxProps {
  ariaLabel: string;
  /** Hover text on the trigger — what this axis means. */
  title?: string;
  /** The value shown. "" renders `placeholder` in `placeholderStyle`. */
  value: string;
  placeholder: string;
  /** Colours for the "" state — a neutral, since it names an absence. */
  placeholderStyle: StatusBadgeStyle;
  options: readonly StatusListboxOption[];
  /**
   * The row's own value when it is not in `options` — a legacy value someone
   * with more authority set. Rendered at the top of the menu so the pill never
   * misreports the row just because the list moved on.
   */
  orphan?: StatusListboxOption | null;
  /** A write is in flight: the chevron becomes a spinner and clicks are ignored. */
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onPick: (value: string) => void;
  className?: string;
}

export function StatusListbox({
  ariaLabel,
  title,
  value,
  placeholder,
  placeholderStyle,
  options,
  orphan,
  busy = false,
  disabled = false,
  compact,
  onPick,
  className,
}: StatusListboxProps) {
  const [open, setOpen] = React.useState(false);

  // The orphan sits FIRST so the selected row is always on screen when the menu
  // opens — it is the one value guaranteed not to be further down the list.
  const rows = React.useMemo<StatusListboxOption[]>(
    () => (orphan ? [orphan, ...options] : [...options]),
    [orphan, options],
  );

  const current = rows.find((o) => o.value === value) ?? null;
  const shownLabel = current?.label ?? placeholder;
  const shownStyle = current?.style ?? placeholderStyle;

  // Keyboard roving-focus for the hand-rolled listbox: Radix gives no roving
  // focus to arbitrary children, so we drive a single active option ourselves
  // and focus the <ul> on open (mouse behaviour is untouched).
  const listId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Seed the active option to the current value each time the menu opens, then
  // move focus into the list so arrow keys work immediately.
  React.useEffect(() => {
    if (!open) return;
    const sel = rows.findIndex((o) => o.value === value);
    setActiveIndex(sel >= 0 ? sel : 0);
    requestAnimationFrame(() => listRef.current?.focus());
  }, [open, rows, value]);

  // Keep the active option in view as it moves.
  React.useEffect(() => {
    if (!open) return;
    (listRef.current?.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, open]);

  function choose(next: string) {
    setOpen(false);
    if (next === value) return;
    onPick(next);
  }

  function listKeyDown(e: React.KeyboardEvent) {
    if (rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(rows.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const next = rows[activeIndex];
      if (next) choose(next.value);
    }
    // Esc is handled by Radix (closes + returns focus to the trigger).
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => !busy && !disabled && setOpen(next)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          // These sit inside rows that are themselves clickable (a task row
          // opens the task). Picking a status is not opening the row.
          onClick={(e) => e.stopPropagation()}
          disabled={busy || disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`${ariaLabel}: ${shownLabel}. Click to change.`}
          title={title}
          className={`${SHELL_BASE} ${compact ? SHELL_SIZE.compact : SHELL_SIZE.regular} transition-all hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 disabled:cursor-default ${className ?? ""}`}
          style={{
            background: shownStyle.bg,
            color: shownStyle.ink,
            border: `1px solid ${shownStyle.border}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
            cursor: busy ? "wait" : disabled ? "default" : "pointer",
            opacity: busy || disabled ? 0.7 : 1,
          }}
        >
          <Dot color={shownStyle.dot} compact={compact} />
          <span className={SHELL_LABEL}>{shownLabel}</span>
          {/* Both markers are the same size and `shrink-0`, so swapping the
              chevron for the spinner mid-save cannot nudge the label. */}
          {busy ? (
            <Loader2
              size={compact ? 10 : 12}
              strokeWidth={2.4}
              className="shrink-0"
              style={{ animation: "spinFast 0.8s linear infinite" }}
            />
          ) : (
            <ChevronDown size={compact ? 10 : 12} strokeWidth={2.6} className="shrink-0" />
          )}
        </button>
      </Popover.Trigger>
      {/* Portalled so the menu escapes the `overflow-hidden` these cells sit in
          — an absolutely-positioned list gets clipped to a sliver inside a
          horizontally-scrolling table. */}
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="slim-scroll z-[60] min-w-[200px] max-md:min-w-[170px] max-h-[280px] overflow-y-auto rounded-chip border bg-surface-card"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
          }}
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            aria-activedescendant={`${listId}-opt-${activeIndex}`}
            onKeyDown={listKeyDown}
            className="outline-none"
          >
            {rows.map((o, i) => {
              const sel = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={sel}
                  onClick={(e) => {
                    e.stopPropagation();
                    choose(o.value);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13.5px] cursor-pointer transition-colors"
                  style={{
                    background: sel
                      ? "color-mix(in srgb, var(--color-altus-red) 7%, transparent)"
                      : i === activeIndex
                        ? "var(--color-surface-soft)"
                        : "transparent",
                    fontWeight: sel ? 700 : 500,
                  }}
                  onMouseEnter={(e) => {
                    setActiveIndex(i);
                    if (!sel) e.currentTarget.style.background = "var(--color-surface-soft)";
                  }}
                  onMouseLeave={(e) => {
                    if (!sel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full shrink-0"
                    style={{
                      background: o.style.dot,
                      // Inset ring keeps light tones (yellow, light grey)
                      // visible on the white menu instead of a glow that washes
                      // them out.
                      boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.18)",
                    }}
                  />
                  <span className="flex-1" style={{ color: "var(--color-ink-strong)" }}>
                    {o.label}
                  </span>
                  {sel && (
                    <Check size={14} strokeWidth={2.6} style={{ color: "var(--color-altus-red)" }} />
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
