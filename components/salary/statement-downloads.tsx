"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { CalendarRange, FileText, Wallet } from "lucide-react";

/**
 * WS-5 / WS-6 — Salary document download entry points (behind SALARY_STATEMENTS).
 *
 * Compact admin panel on the /salary page: pick an employee, then download
 *   • their Annual Salary Statement for the FY, and
 *   • their Combined "total earnings" document for the selected month
 *     (salary + attendance + incentive Target-vs-Paid + retention if paid).
 *
 * Only employees that carry a resolved employeeId on the sheet are selectable
 * (the attendance + incentive lookups key on it). Downloads are plain <a>
 * links to the nodejs PDF routes — no client fetch, keyboard-first.
 */
export interface StatementEmployee {
  id: string;
  name: string;
}

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

export function StatementDownloads({
  employees,
  month,
  monthLabel,
  fy,
  fyStartYear,
}: {
  employees: StatementEmployee[];
  /** "YYYY-MM" for the combined-earnings document. */
  month: string;
  /** "Apr 2026" style label for the button. */
  monthLabel: string;
  /** "FY 26-27" label for the annual-statement button. */
  fy: string;
  /** FY start calendar year passed to the annual-statement route. */
  fyStartYear: number;
}) {
  const sorted = useMemo(
    () => [...employees].sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );
  const [selected, setSelected] = useState<string>(sorted[0]?.id ?? "");

  const current = sorted.find((e) => e.id === selected);
  const disabled = !current;

  const annualHref = current
    ? (`/salary/annual-statement/${current.id}?year=${fyStartYear}` as Route)
    : ("#" as Route);
  const earningsHref = current
    ? (`/salary/earnings/${current.id}?month=${month}&name=${encodeURIComponent(current.name)}` as Route)
    : ("#" as Route);

  return (
    <section
      aria-label="Salary documents"
      className="wg-rise mb-5 rounded-2xl bg-surface-card px-5 py-4.5 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{ background: `color-mix(in srgb, ${GREEN} 10%, transparent)`, color: GREEN_DEEP }}
          aria-hidden
        >
          <FileText size={17} strokeWidth={2.4} />
        </span>
        <div>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            Statements &amp; documents
          </h2>
          <p className="text-[12px] font-medium text-ink-subtle">
            Annual salary statement &amp; combined total-earnings document
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <label className="sr-only" htmlFor="statement-employee">
          Employee
        </label>
        <select
          id="statement-employee"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-hairline bg-surface-card py-2.5 px-3.5 text-[14px] text-ink-strong min-w-[220px]"
        >
          {sorted.length === 0 && <option value="">No linked employees</option>}
          {sorted.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        <a
          href={disabled ? undefined : annualHref}
          aria-disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2.5 px-4 text-[14px] font-medium text-ink-strong hover:border-hairline-strong transition-colors aria-disabled:opacity-40 aria-disabled:pointer-events-none"
        >
          <CalendarRange size={15} strokeWidth={2.2} />
          Annual statement · {fy}
        </a>

        <a
          href={disabled ? undefined : earningsHref}
          aria-disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md py-2.5 px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 aria-disabled:opacity-40 aria-disabled:pointer-events-none"
          style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
        >
          <Wallet size={15} strokeWidth={2.2} />
          Total earnings · {monthLabel}
        </a>
      </div>
    </section>
  );
}
