"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@/lib/utils";

export interface CompactOption {
  value: string;
  label: string;
  /** Greyed and unpickable — e.g. a name already taken elsewhere on this row. */
  disabled?: boolean;
  /** Heading this option sits under, drawn once per run of equal values —
   *  the `<optgroup>` this control replaces. Options must already be in
   *  group order; nothing is re-sorted, so the caller keeps control of it. */
  group?: string;
}

/**
 * A SMALL BOX, however long the list is.
 *
 * Manan, 2026-09-21: "when i click on this they give very huge — please make it
 * small size of box, and do this entire whole website."
 *
 * The control that provoked it was a native `<select>` over the employee
 * roster. A browser sizes that popup to its CONTENTS — thirty names is thirty
 * rows, floor to ceiling, over whatever you were reading. No stylesheet can cut
 * it down: the popup is drawn by the operating system, not the page, so a
 * `max-height` on the `<select>` reaches the closed box and nothing else. The
 * only fix is to stop asking the browser to draw the list.
 *
 * So this is a `<select>` in behaviour and a popover in construction:
 *
 *   · the PANEL is capped — about seven rows tall, then it scrolls. Ten options
 *     and a hundred open exactly the same size of box.
 *   · a SEARCH box appears past eight options, because scrolling a roster to
 *     find a name is the slow way and typing three letters is the fast one.
 *   · it is PORTALLED, so a table cell's `overflow` cannot clip it, and a row
 *     near the bottom of the window flips the panel up rather than off-screen.
 *
 * Keyboard parity with the control it replaces is the point, not a bonus —
 * these sit in dense tables people fill in by touch: ↑/↓ move, Enter picks,
 * Escape closes without changing anything, Home/End jump to the ends. Typing
 * FILTERS rather than jumping to the next matching initial, which is the better
 * trade on a list of full names where five people share a first letter.
 */
export function CompactSelect({
  value,
  onChange,
  options,
  /** The empty row's label, and what the closed box reads while unset. */
  placeholder = "—",
  /** Drop the empty row entirely — for a field that must hold a value. */
  required = false,
  disabled = false,
  className,
  style,
  "aria-label": ariaLabel,
  title,
  /** Panel width in px. The default suits a name; widen it for long labels. */
  panelWidth = 240,
  /** Match the trigger's width instead of `panelWidth` — for full-width fields. */
  matchTriggerWidth = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CompactOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Inline styles for the trigger — for a caller that measures its own width. */
  style?: React.CSSProperties;
  "aria-label"?: string;
  title?: string;
  panelWidth?: number;
  matchTriggerWidth?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Past this many, hunting by eye is slower than typing three letters.
  const searchable = options.length > 8;

  const rows = React.useMemo<CompactOption[]>(() => {
    const base = required ? options : [{ value: "", label: placeholder }, ...options];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    // The empty row survives every query: "clear this field" has to stay
    // reachable while something is typed, or clearing means closing and
    // reopening the box.
    return base.filter((o) => o.value === "" || o.label.toLowerCase().includes(q));
  }, [options, required, placeholder, query]);

  const selected = options.find((o) => o.value === value) ?? null;

  // The highlight is CLAMPED where it is read, not corrected in an effect.
  // A query can shorten the list under a highlight that was valid a keystroke
  // ago; clamping here keeps every render self-consistent, where an effect
  // would paint one frame pointing past the end of the list first.
  const hiSafe = Math.min(hi, Math.max(0, rows.length - 1));

  // Opening is a user event, so the state it resets belongs in the handler
  // rather than an effect keyed on `open` — no cascading render, and the
  // highlight starts ON the current value so ↑/↓ move from where the field is.
  function onOpenChange(next: boolean) {
    if (disabled) return;
    if (next) {
      setQuery("");
      const base = required ? options : [{ value: "", label: placeholder }, ...options];
      const at = base.findIndex((o) => o.value === value);
      setHi(at >= 0 ? at : 0);
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }
    setOpen(next);
  }

  // Scroll the highlighted row into view — a DOM effect, which is what effects
  // are for.
  React.useEffect(() => {
    if (open) {
      listRef.current?.querySelector<HTMLElement>(`[data-opt="${hiSafe}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }, [hiSafe, open]);

  function pick(o: CompactOption | undefined) {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(Math.min(rows.length - 1, hiSafe + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(Math.max(0, hiSafe - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setHi(0); }
    else if (e.key === "End") { e.preventDefault(); setHi(Math.max(0, rows.length - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(rows[hiSafe]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          style={style}
          aria-label={ariaLabel}
          title={title ?? selected?.label ?? placeholder}
          // Carries the caller's own classes, so it keeps the size, border and
          // hover of the field it replaces — a drop-in, not a restyle.
          className={cn(
            "inline-flex items-center gap-1 text-left disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          onKeyDown={(e) => {
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-ink-subtle")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            size={13}
            strokeWidth={2.4}
            aria-hidden
            className={cn("shrink-0 text-ink-subtle transition-transform", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => { if (searchable) e.preventDefault(); }}
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-xl border border-hairline bg-surface-card p-0"
        style={{
          width: matchTriggerWidth ? "var(--radix-popover-trigger-width)" : panelWidth,
          minWidth: matchTriggerWidth ? undefined : panelWidth,
          boxShadow: "0 18px 44px -18px rgba(15,23,42,0.32)",
        }}
      >
        {searchable && (
          <div className="flex items-center gap-2 border-b border-hairline px-2.5">
            <Search size={13} strokeWidth={2.4} className="shrink-0 text-ink-subtle" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHi(0); }}
              placeholder="Search…"
              aria-label="Search the list"
              className="h-8 w-full bg-transparent text-[12.5px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle"
            />
          </div>
        )}
        {/* THE CAP — about seven rows, then it scrolls. This is the whole point
            of the control: whatever the roster's length, the box is this big. */}
        <ul ref={listRef} role="listbox" className="slim-scroll max-h-[240px] overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-3 py-3 text-[12.5px] font-medium text-ink-subtle">No match.</li>
          )}
          {rows.map((o, i) => {
            const isSel = o.value === value;
            // One heading per RUN of equal groups, not per option — the caller
            // supplies them already grouped, exactly as <optgroup> required.
            const heading = o.group && o.group !== rows[i - 1]?.group ? o.group : null;
            return (
              <React.Fragment key={o.value || "__empty"}>
              {heading && (
                <li
                  role="presentation"
                  className="px-3 pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
                >
                  {heading}
                </li>
              )}
              <li
                data-opt={i}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => setHi(i)}
                // mousedown, not click: the trigger keeps focus and the row
                // commits before the popover's own dismissal can race it.
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                className={cn(
                  "mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
                  o.disabled && "cursor-not-allowed opacity-45",
                  o.value === "" && "text-ink-subtle",
                )}
                style={
                  i === hiSafe
                    ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" }
                    : isSel
                      ? { background: "color-mix(in srgb, var(--color-altus-red) 5%, transparent)" }
                      : undefined
                }
              >
                <span className="inline-flex w-3.5 shrink-0 justify-center">
                  {isSel && <Check size={12} strokeWidth={3} className="text-altus-red" aria-hidden />}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    isSel ? "font-bold text-altus-red-deep" : "font-medium text-ink-strong",
                  )}
                >
                  {o.label}
                </span>
              </li>
              </React.Fragment>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
