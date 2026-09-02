"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";

const GREEN = "var(--color-altus-red)";
const GREEN_DEEP = "var(--color-altus-red-deep)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Compact salary-month selector — replaces the old ~50-button wall. A row of
 * year chips + the 12 months of the selected year (months without sheet data
 * are dimmed), plus prev/next stepping through only the months that exist.
 */
export function SalaryMonthPicker({ months, selected }: { months: string[]; selected: string }) {
  // months: available "YYYY-MM", newest-first. Build a set + sorted list.
  const available = React.useMemo(() => new Set(months), [months]);
  const ordered = React.useMemo(() => [...months].sort(), [months]); // ascending
  const selYear = selected ? Number(selected.slice(0, 4)) : new Date().getFullYear();
  const [viewYear, setViewYear] = React.useState<number>(selYear);

  const years = React.useMemo(() => {
    const ys = new Set<number>();
    for (const m of months) ys.add(Number(m.slice(0, 4)));
    return [...ys].sort((a, b) => b - a); // newest first
  }, [months]);

  // prev/next across the full available list
  const idx = ordered.indexOf(selected);
  const prevMonth = idx > 0 ? ordered[idx - 1] : null; // older
  const nextMonth = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null; // newer

  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {/* year row + stepper */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <StepLink href={prevMonth ? `/salary?month=${prevMonth}` : null} label="Older month"><ChevronLeft size={16} strokeWidth={2.6} /></StepLink>
          <StepLink href={nextMonth ? `/salary?month=${nextMonth}` : null} label="Newer month"><ChevronRight size={16} strokeWidth={2.6} /></StepLink>
        </div>
        <div className="mx-1 h-5 w-px bg-hairline-strong" />
        {years.map((y) => {
          const on = y === viewYear;
          return (
            <button
              key={y}
              type="button"
              onClick={() => setViewYear(y)}
              className="tabular-nums rounded-xl px-3.5 py-1.5 text-[13px] font-black transition"
              style={
                on
                  ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, color: "#fff", boxShadow: `0 8px 18px -8px ${GREEN_DEEP}` }
                  : { background: "var(--color-surface-card)", color: "var(--color-ink-strong)", boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${GREEN} 24%, var(--color-hairline-strong))` }
              }
            >
              {y}
            </button>
          );
        })}
      </div>

      {/* month row for the viewed year */}
      <div className="flex flex-wrap gap-1.5">
        {MONTHS.map((mn, i) => {
          const ym = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
          const has = available.has(ym);
          const on = ym === selected;
          if (!has) {
            return (
              <span key={mn} className="tabular-nums rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-subtle/45" title="No payroll for this month" style={{ boxShadow: "inset 0 0 0 1.5px var(--color-hairline)" }}>
                {mn}
              </span>
            );
          }
          return (
            <Link
              key={mn}
              href={`/salary?month=${ym}` as Route}
              aria-current={on ? "page" : undefined}
              className="tabular-nums rounded-xl px-3.5 py-1.5 text-[12.5px] font-black transition"
              style={
                on
                  ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, color: "#fff", boxShadow: `0 8px 18px -8px ${GREEN_DEEP}` }
                  : { background: "var(--color-surface-card)", color: "var(--color-ink-strong)", boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${GREEN} 22%, var(--color-hairline-strong))` }
              }
            >
              {mn}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StepLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href) {
    return <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle/40" aria-disabled>{children}</span>;
  }
  return (
    <Link href={href as Route} aria-label={label} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-soft hover:text-ink-strong" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      {children}
    </Link>
  );
}
