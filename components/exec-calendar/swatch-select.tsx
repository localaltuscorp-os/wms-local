"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hexColors } from "@/lib/exec-calendar/taxonomy";

export interface SwatchOption {
  value: string;
  label: string;
  hex: string;
}

/**
 * A dropdown whose options are COLOURED BOXES - a border in the item's colour
 * and a light fill of the same colour (asked 2026-09-18 for the category and
 * client pickers in the block editor). A native <select> can't style its
 * options, hence a popover list.
 *
 * Keyboard: Enter/Space/↓ opens, ↑/↓ move, Enter picks, Esc closes (without
 * also closing the drawer around it - see onKeyDown).
 */
export function SwatchSelect({
  value,
  options,
  onChange,
  placeholder,
  noneLabel,
  ariaLabel,
}: {
  value: string | null;
  options: readonly SwatchOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** When set, the list starts with a "no value" row with this label. */
  noneLabel?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rows: (SwatchOption | null)[] = noneLabel ? [null, ...options] : [...options];
  const current = options.find((o) => o.value === value) ?? null;
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const i = rows.findIndex((r) => (r?.value ?? null) === value);
    setActive(Math.max(0, i));
    // Only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (row: SwatchOption | null) => {
    onChange(row?.value ?? null);
    setOpen(false);
  };

  const c = current ? hexColors(current.hex) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="relative flex h-[38px] w-full items-center gap-2 rounded-lg border-2 pl-2.5 pr-9 text-left text-[13px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/30"
          style={
            c
              ? { borderColor: c.edge, background: c.bg, color: c.deep }
              : { borderColor: "var(--color-hairline)", background: "var(--color-surface-card)", color: "var(--color-ink-muted)" }
          }
        >
          {current && <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: current.hex, boxShadow: `inset 0 0 0 1px ${c!.edge}` }} />}
          <span className="truncate">{current?.label ?? noneLabel ?? placeholder ?? "Select"}</span>
          <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1.5"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          listRef.current?.focus();
        }}
      >
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          className="flex flex-col gap-1 outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(rows.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(rows[active] ?? null); }
            else if (e.key === "Escape") {
              // Marked handled so the editor drawer's own Esc listener leaves
              // the drawer open and only this list closes.
              e.preventDefault();
              setOpen(false);
            }
          }}
        >
          {rows.map((row, i) => {
            const on = (row?.value ?? null) === value;
            const rc = row ? hexColors(row.hex) : null;
            return (
              <button
                key={row?.value ?? "__none"}
                type="button"
                role="option"
                aria-selected={on}
                data-i={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(row)}
                className="flex w-full items-center gap-2 rounded-md border-2 px-2.5 py-1.5 text-left text-[12.5px] font-semibold transition"
                style={{
                  borderColor: rc ? rc.edge : "var(--color-hairline)",
                  background: rc ? (i === active ? rc.pale : rc.bg) : i === active ? "var(--color-surface-soft)" : "var(--color-surface-card)",
                  color: rc ? rc.deep : "var(--color-ink-muted)",
                }}
              >
                {row && <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: row.hex, boxShadow: `inset 0 0 0 1px ${rc!.edge}` }} />}
                <span className="min-w-0 flex-1 truncate">{row?.label ?? noneLabel}</span>
                {on && <Check size={14} strokeWidth={2.6} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
