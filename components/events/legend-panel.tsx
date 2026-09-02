"use client";

/**
 * Collapsible legend (design §5): every category → swatch + name + live count in
 * the visible range. Click a swatch to filter the calendar to that category
 * (multi-toggle); a search box narrows the list. An "Uncategorised" pseudo-row
 * covers events with no category.
 */
import * as React from "react";
import { ChevronDown, Search, X, Palette } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type { CalendarEvent, EventCategory } from "@/lib/monthly-events/types";
import { DEFAULT_EVENT_COLOR } from "./colors";

const UNCATEGORISED = "__none__";

interface LegendPanelProps {
  categories: EventCategory[];
  events: CalendarEvent[];
  /** Set of active category-id filters; empty = show all. */
  active: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function LegendPanel({
  categories,
  events,
  active,
  onToggle,
  onClear,
}: LegendPanelProps) {
  const [open, setOpen] = React.useState(true);
  const [query, setQuery] = React.useState("");

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      const k = e.categoryId ?? UNCATEGORISED;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [events]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = categories
      .map((c) => ({ id: c.id, name: c.name, color: c.color, count: counts.get(c.id) ?? 0 }))
      .filter((r) => !q || r.name.toLowerCase().includes(q));
    const noneCount = counts.get(UNCATEGORISED) ?? 0;
    if (noneCount > 0 && (!q || "uncategorised".includes(q))) {
      list.push({ id: UNCATEGORISED, name: "Uncategorised", color: DEFAULT_EVENT_COLOR, count: noneCount });
    }
    return list;
  }, [categories, counts, query]);

  return (
    <aside className="w-full shrink-0 rounded-2xl border border-hairline bg-surface-card md:w-64">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: 14 }}
        >
          Legend
        </span>
        <ChevronDown
          size={16}
          className={cn("text-ink-soft transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Local search — categories" title="Local search — filters only the list on this page" aria-label="Local search — categories — this page only"
              className="w-full rounded-chip border border-hairline bg-surface-soft py-1.5 pl-7 pr-2 text-[12.5px] text-ink-strong outline-none focus:border-hairline-strong"
            />
          </div>

          {active.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-altus-red"
              style={{ color: "var(--color-altus-red, #c8102e)" }}
            >
              <X size={11} /> Clear Filter ({active.size})
            </button>
          )}

          <ul className="max-h-[52vh] space-y-0.5 overflow-y-auto">
            {rows.map((r) => {
              const isActive = active.has(r.id);
              const dimmed = active.size > 0 && !isActive;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(r.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-soft",
                      isActive && "bg-surface-soft",
                      dimmed && "opacity-45",
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-[4px] ring-1 ring-black/10"
                      style={{ background: r.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-strong">
                      {r.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-soft px-1.5 text-[10.5px] font-bold text-ink-soft">
                      {r.count}
                    </span>
                  </button>
                </li>
              );
            })}
            {rows.length === 0 && (
              <li className="px-2 py-3 text-center text-[12px] text-ink-soft">No categories.</li>
            )}
          </ul>
        </div>
      )}
    </aside>
  );
}

export { UNCATEGORISED };

/* ─────────────────────────────────────────────────────────────────────────
   LegendDrawer — a FIXED right-edge tab that slides out an animated legend.
   Stays locked in place as the calendar scrolls; click to open / close.
   ───────────────────────────────────────────────────────────────────────── */
export function LegendDrawer({ categories, events, active, onToggle, onClear }: LegendPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      const k = e.categoryId ?? UNCATEGORISED;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [events]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = categories
      .map((c) => ({ id: c.id, name: c.name, color: c.color, count: counts.get(c.id) ?? 0 }))
      .filter((r) => !q || r.name.toLowerCase().includes(q));
    const noneCount = counts.get(UNCATEGORISED) ?? 0;
    if (noneCount > 0 && (!q || "uncategorised".includes(q))) {
      list.push({ id: UNCATEGORISED, name: "Uncategorised", color: DEFAULT_EVENT_COLOR, count: noneCount });
    }
    return list;
  }, [categories, counts, query]);

  return (
    <>
      {/* fixed right-edge tab (locked on scroll) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-l-2xl px-2.5 py-4 text-white transition-transform active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", writingMode: "vertical-rl", boxShadow: "-4px 8px 24px -10px rgba(15,23,42,0.5)" }}
      >
        <Palette size={15} strokeWidth={2.5} style={{ writingMode: "horizontal-tb" as React.CSSProperties["writingMode"] }} />
        <span className="text-[11px] font-black uppercase tracking-[0.18em]">Legend</span>
        {active.size > 0 && (
          <span className="rounded-full bg-white px-1.5 text-[10px] font-black text-[color:var(--color-altus-red)]" style={{ writingMode: "horizontal-tb" as React.CSSProperties["writingMode"] }}>
            {active.size}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
            />
            <motion.aside
              initial={{ x: 340, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 340, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed right-4 top-24 z-50 max-h-[calc(100vh-8rem)] w-72 overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <span className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: 15 }}>
                  Legend
                </span>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-ink-soft hover:bg-surface-soft hover:text-ink-strong" aria-label="Close legend">
                  <X size={16} />
                </button>
              </div>
              <div className="px-3 py-3">
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Local search — categories" title="Local search — filters only the list on this page" aria-label="Local search — categories — this page only"
                    className="w-full rounded-chip border border-hairline bg-surface-soft py-1.5 pl-7 pr-2 text-[12.5px] text-ink-strong outline-none focus:border-hairline-strong"
                  />
                </div>
                {active.size > 0 && (
                  <button type="button" onClick={onClear} className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--color-altus-red)" }}>
                    <X size={11} /> Clear Filter ({active.size})
                  </button>
                )}
                <ul className="max-h-[56vh] space-y-0.5 overflow-y-auto">
                  {rows.map((r) => {
                    const isActive = active.has(r.id);
                    const dimmed = active.size > 0 && !isActive;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => onToggle(r.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-soft",
                            isActive && "bg-surface-soft",
                            dimmed && "opacity-45",
                          )}
                        >
                          <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] ring-1 ring-black/10" style={{ background: r.color }} />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-strong">{r.name}</span>
                          <span className="shrink-0 rounded-full bg-surface-soft px-1.5 text-[10.5px] font-bold text-ink-soft">{r.count}</span>
                        </button>
                      </li>
                    );
                  })}
                  {rows.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-ink-soft">No categories.</li>}
                </ul>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
