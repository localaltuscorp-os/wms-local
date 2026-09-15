"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { SectionIcon } from "@/components/dashboard/section-icon";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD,
  DASHBOARD_CARD_PADDED,
} from "@/components/dashboard/section-chrome";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import { FUNCTION_VIEWS, inFunctionView, type FunctionView } from "@/lib/org/functions";
import type { PersonStats, SlotOutcome } from "@/lib/dcc/dashboard";
import type { SectionReport } from "@/lib/reports/section-report";
import { fmtPct, toneFill, toneText } from "./format";

/**
 * One DCC dashboard section: the shared header above, the shared card below,
 * folding together. The same recipe the Goals Dashboard uses, so the toolbar
 * order (share pair, the section's own controls, the fold toggle) matches every
 * section on the WMS Dashboard.
 */
export function DccSection({
  icon,
  title,
  subtitle,
  label,
  report,
  controls,
  padded = true,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Accessible name for the fold toggle, e.g. "the heatmap". */
  label: string;
  report?: () => SectionReport;
  controls?: React.ReactNode;
  /** Tables bleed to the card edge and pad their own toolbar. */
  padded?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <DashboardSectionHeader
        icon={<SectionIcon icon={icon} tone="red" />}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {report && <SectionDispatch report={report} />}
            {controls}
            <CollapseToggle expanded={open} onToggle={() => setOpen((v) => !v)} label={label} />
          </>
        }
      />
      <CollapsibleBody expanded={open}>
        <div className={`w-full ${padded ? DASHBOARD_CARD_PADDED : DASHBOARD_CARD}`}>{children}</div>
      </CollapsibleBody>
    </>
  );
}

/** A compliance bar with its percentage, coloured by the 80 / 60 thresholds. */
export function RateBar({ value, width = "w-24" }: { value: number | null; width?: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className={`h-2 ${width} overflow-hidden rounded-full bg-slate-100`}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value ?? 0}%`, background: toneFill(value) }}
        />
      </div>
      <span className={`w-10 text-right text-[13px] font-bold tabular-nums ${toneText(value)}`}>
        {fmtPct(value)}
      </span>
    </div>
  );
}

const OUTCOME_STYLE: Record<SlotOutcome | "open", { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-800" },
  notDone: { label: "Not done", cls: "bg-rose-100 text-rose-800" },
  na: { label: "NA", cls: "bg-slate-100 text-slate-600" },
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-800" },
  noted: { label: "Filled", cls: "bg-sky-100 text-sky-800" },
  unfilled: { label: "Missed", cls: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
  open: { label: "Open", cls: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200" },
};

/** An entry's outcome as a chip. An unfilled KPI on today's date reads "Open". */
export function OutcomeChip({ outcome, isToday }: { outcome: SlotOutcome; isToday: boolean }) {
  const s = OUTCOME_STYLE[outcome === "unfilled" && isToday ? "open" : outcome];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>
      {s.label}
    </span>
  );
}

/** A quiet "nothing here" line inside a card. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-10 text-center text-[13.5px] font-semibold text-slate-500">{children}</p>;
}

/**
 * Function tab + name search over a people list — the pair every per-person
 * section carries. Counts come from the full list, so a search never makes a
 * tab's count move under the cursor.
 */
export function usePeopleFilter(people: PersonStats[]) {
  const [view, setView] = React.useState<FunctionView>("all");
  const [query, setQuery] = React.useState("");

  const counts = React.useMemo(() => {
    const c = Object.fromEntries(FUNCTION_VIEWS.map((v) => [v, 0])) as Record<FunctionView, number>;
    for (const p of people) {
      for (const v of FUNCTION_VIEWS) if (inFunctionView(p.person.departments, v)) c[v]++;
    }
    return c;
  }, [people]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        inFunctionView(p.person.departments, view) &&
        (!q || p.person.name.toLowerCase().includes(q)),
    );
  }, [people, view, query]);

  return { view, setView, query, setQuery, counts, rows };
}

/** A sortable column heading for the DCC tables. */
export function SortHead<K extends string>({
  k,
  label,
  sort,
  onSort,
  align = "right",
  className = "",
}: {
  k: K;
  label: string;
  sort: { key: K; dir: "asc" | "desc" };
  onSort: (k: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-3 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex w-full items-center gap-1 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider transition-colors hover:text-slate-900 ${
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        } ${active ? "text-slate-900" : "text-slate-500"}`}
      >
        {label}
        <span aria-hidden className={active ? "text-[var(--color-altus-red)]" : "text-slate-300"}>
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

/** Click cycle: a new column starts at `firstDir`; the same column flips. */
export function nextSortState<K extends string>(
  cur: { key: K; dir: "asc" | "desc" },
  k: K,
  firstDir: "asc" | "desc" = "desc",
): { key: K; dir: "asc" | "desc" } {
  if (cur.key !== k) return { key: k, dir: firstDir };
  return { key: k, dir: cur.dir === "asc" ? "desc" : "asc" };
}

/** Compare two sortable values, nulls last in both directions. */
export function compareNullable(
  a: number | string | null,
  b: number | string | null,
  dir: "asc" | "desc",
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const c = a < b ? -1 : a > b ? 1 : 0;
  return dir === "asc" ? c : -c;
}
