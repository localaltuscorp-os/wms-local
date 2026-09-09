"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { LookupSelect } from "@/components/ui/lookup-select";
import { hrMonthLabel } from "@/components/attendance/hr-record/hr-codes";

const FIELD =
  "h-11 rounded-xl border border-hairline bg-white px-3.5 text-[15px] font-semibold text-ink-strong outline-none transition-colors hover:border-hairline-strong focus-visible:ring-2 focus-visible:ring-[#E10600]/50 focus-visible:ring-offset-1";

interface Props {
  employees: { id: string; name: string }[];
  /** Currently selected employee id (validated server-side), or null. */
  selectedEmp: string | null;
  /** Months available for the selected employee, newest first ('YYYY-MM-01'). */
  months: string[];
  /** The month being shown ('YYYY-MM-01'), or null. */
  selectedMonth: string | null;
}

/**
 * Employee + month pickers for the read-only HR Record page. Purely
 * navigational — selection is expressed as `?emp=` / `?month=` and the
 * server page re-renders with the chosen record. Keyboard-first: the
 * employee combobox is the searchable LookupSelect, the month is a native
 * select flanked by older/newer steppers.
 */
export function HrRecordSelectors({ employees, selectedEmp, months, selectedMonth }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const navigate = React.useCallback(
    (emp: string | null, month: string | null) => {
      const qs = new URLSearchParams();
      if (emp) qs.set("emp", emp);
      if (emp && month) qs.set("month", month);
      startTransition(() => {
        router.push(`/attendance/hr-record${qs.size ? `?${qs.toString()}` : ""}` as Route);
      });
    },
    [router],
  );

  // months are newest-first: "older" walks forward in the array.
  const idx = selectedMonth ? months.indexOf(selectedMonth) : -1;
  const older = idx >= 0 ? months[idx + 1] ?? null : null;
  const newer = idx > 0 ? months[idx - 1] ?? null : null;

  const stepBtn =
    "wg-btn inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-white text-ink-muted transition-colors hover:border-hairline-strong hover:text-[#A80400] disabled:opacity-35 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-[#E10600]/50 focus-visible:ring-offset-1";

  return (
    <div
      className="flex flex-wrap items-end gap-3"
      aria-busy={isPending}
      style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 150ms ease" }}
    >
      <div className="min-w-[260px] flex-1 sm:max-w-[340px]">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Employee
        </span>
        <div>
          <LookupSelect
            label="employee"
            value={selectedEmp}
            options={employees}
            placeholder="Pick an employee…"
            className={`${FIELD} w-full`}
            onChange={(id) => navigate(id, null)}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="hr-month-picker"
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle"
        >
          Month
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={stepBtn}
            disabled={!older}
            aria-label={older ? `Older month — ${hrMonthLabel(older)}` : "No older month"}
            onClick={() => older && navigate(selectedEmp, older)}
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>
          <select
            id="hr-month-picker"
            className={`${FIELD} min-w-[190px] cursor-pointer appearance-none pr-9`}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
            }}
            value={selectedMonth ?? ""}
            disabled={!selectedEmp || months.length === 0}
            onChange={(e) => navigate(selectedEmp, e.target.value || null)}
          >
            {months.length === 0 && <option value="">No months on record</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {hrMonthLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={stepBtn}
            disabled={!newer}
            aria-label={newer ? `Newer month — ${hrMonthLabel(newer)}` : "No newer month"}
            onClick={() => newer && navigate(selectedEmp, newer)}
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
          {isPending && (
            <Loader2 size={18} className="animate-spin text-ink-subtle" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
