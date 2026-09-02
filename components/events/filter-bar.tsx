"use client";

/**
 * Calendar filter bar (design §2 extension). A horizontal row above the grid
 * that narrows the visible events by Status, Source and two flags (obligation-
 * linked / locked), on top of the category legend on the left. Empty = show all;
 * each group is independent and combines (AND across groups, OR within a group).
 * Batch-TYPE filtering (PS/BSS/Conclave/Graduate) is the `Batch` source pill +
 * the category legend, since batch events carry their type as their category.
 */
import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { EventStatus, EventSource } from "@/db/enums";
import { cn } from "@/lib/utils";

export interface CalendarFilters {
  status: Set<EventStatus>;
  source: Set<EventSource>;
  obligationOnly: boolean;
  lockedOnly: boolean;
}

export function emptyFilters(): CalendarFilters {
  return { status: new Set(), source: new Set(), obligationOnly: false, lockedOnly: false };
}

export function filtersActiveCount(f: CalendarFilters): number {
  return f.status.size + f.source.size + (f.obligationOnly ? 1 : 0) + (f.lockedOnly ? 1 : 0);
}

const STATUS_OPTS: { id: EventStatus; label: string }[] = [
  { id: "confirmed", label: "Confirmed" },
  { id: "tentative", label: "Tentative" },
];
const SOURCE_OPTS: { id: EventSource; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "batch", label: "Batch" },
  { id: "obligation", label: "Obligation" },
];

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-all",
        active
          ? "text-white shadow-[0_6px_14px_-8px_var(--color-altus-red-deep)]"
          : "border-[1.5px] bg-surface-card text-ink-muted hover:text-ink-strong",
      )}
      style={
        active
          ? { background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }
          : { borderColor: "var(--color-hairline-strong)" }
      }
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-hairline-strong max-md:hidden" />;
}

export function FilterBar({
  filters,
  onToggleStatus,
  onToggleSource,
  onToggleFlag,
  onClear,
}: {
  filters: CalendarFilters;
  onToggleStatus: (s: EventStatus) => void;
  onToggleSource: (s: EventSource) => void;
  onToggleFlag: (flag: "obligationOnly" | "lockedOnly") => void;
  onClear: () => void;
}) {
  const count = filtersActiveCount(filters);
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 bg-surface-card px-4 py-2.5"
      style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 6px 20px -16px rgba(15,23,42,0.3)" }}
    >
      <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-black text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
        <SlidersHorizontal size={14} strokeWidth={2.6} />
        Filters
        {count > 0 && <span className="rounded-full bg-white px-1.5 text-[10.5px] font-black" style={{ color: "var(--color-altus-red)" }}>{count}</span>}
      </span>

      <Divider />
      <Group label="Status">
        {STATUS_OPTS.map((o) => (
          <Pill key={o.id} active={filters.status.has(o.id)} onClick={() => onToggleStatus(o.id)}>
            {o.label}
          </Pill>
        ))}
      </Group>

      <Divider />
      <Group label="Source">
        {SOURCE_OPTS.map((o) => (
          <Pill key={o.id} active={filters.source.has(o.id)} onClick={() => onToggleSource(o.id)}>
            {o.label}
          </Pill>
        ))}
      </Group>

      <Divider />
      <Group label="Only">
        <Pill active={filters.obligationOnly} onClick={() => onToggleFlag("obligationOnly")}>
          Obligation-linked
        </Pill>
        <Pill active={filters.lockedOnly} onClick={() => onToggleFlag("lockedOnly")}>
          Locked
        </Pill>
      </Group>

      {count > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="bg-surface-card ml-auto inline-flex items-center gap-1 rounded-lg border-[1.5px] px-2.5 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <X size={13} strokeWidth={2.6} />
          Clear ({count})
        </button>
      )}
    </div>
  );
}
