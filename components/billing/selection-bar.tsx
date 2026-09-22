"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";

/**
 * The "N selected" strip for the Billing tables — same shape as the task
 * list's bulk bar (components/tasks/bulk-action-bar.tsx): red count chip, a
 * divider, pill buttons, and Clear pinned right. It replaces the per-row
 * three-dot menus: tick rows, then act on them here.
 */
export function SelectionBar({
  count,
  pending,
  onClear,
  children,
}: {
  count: number;
  pending?: boolean;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div
      className="wg-rise relative sticky top-[88px] z-30 mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden rounded-section border px-4 py-2.5 [scrollbar-width:thin]"
      style={{
        borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline-strong))",
        background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(250,251,252,0.86))",
        backdropFilter: "blur(16px) saturate(150%)",
        WebkitBackdropFilter: "blur(16px) saturate(150%)",
        boxShadow: "0 12px 32px -12px rgba(225, 6, 0, 0.18), 0 6px 20px -8px rgba(15,23,42,0.16)",
      }}
      role="region"
      aria-label="Actions for the selected rows"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      />
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[14px] font-bold text-ink-strong">
        {pending && <Loader2 size={14} className="animate-spin text-altus-red" />}
        <span
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-pill px-2 text-[12.5px] font-black tabular-nums text-white"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 3px 8px -3px rgba(225, 6, 0, 0.5)",
          }}
        >
          {count}
        </span>
        selected
      </span>

      <span className="mx-1 h-5 w-px shrink-0 bg-hairline" aria-hidden />

      {children}

      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-subtle transition-colors hover:text-ink-strong"
      >
        <X size={14} strokeWidth={2.4} />
        Clear
      </button>
    </div>
  );
}

/** A pill button in the bar. */
export const barBtn =
  "shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-soft shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-altus-red hover:text-altus-red hover:bg-altus-red/[0.04] transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40";

/** The destructive variant (Deactivate, Delete, Cancel). */
export const barBtnDanger =
  "shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-[#B91C1C] shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-[#B91C1C] hover:bg-[#B91C1C]/[0.05] transition-colors disabled:opacity-50 disabled:pointer-events-none";

/** Row / header selection state for a list of ids. */
export function useRowSelection(ids: string[]) {
  const [raw, setRaw] = React.useState<Set<string>>(new Set());
  // Only ids still in the list count as selected (a row filtered out or
  // deleted drops out), so the bar never acts on a row the user cannot see.
  const idKey = ids.join(",");
  const selected = React.useMemo(() => {
    const live = new Set(idKey ? idKey.split(",") : []);
    return new Set([...raw].filter((id) => live.has(id)));
  }, [raw, idKey]);

  const toggle = (id: string, on: boolean) =>
    setRaw(() => {
      const next = new Set(selected);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = !allOn && ids.some((id) => selected.has(id));
  const toggleAll = (on: boolean) => setRaw(on ? new Set(ids) : new Set());
  const clear = () => setRaw(new Set());
  return { selected, toggle, allOn, someOn, toggleAll, clear };
}
