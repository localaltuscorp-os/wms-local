"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Users,
  Building2,
  Repeat,
  CreditCard,
  CircleDot,
  CalendarDays,
  CalendarRange,
  RotateCcw,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

interface Option {
  value: string;
  label: string;
}

interface Props {
  /** value = employee NAME (engine filters `employees` against `responsibleName`). */
  employees: { id: string; name: string }[];
  /** value = entity NAME (engine filters `entities` against `entityName`). */
  entities: { id: string; name: string }[];
  /** value = payment-mode NAME (engine filters `modes` against `expectedModeName`). */
  modes: { id: string; name: string }[];
  /** value = cycle KEY (e.g. "subscription"), label = human. */
  cycles: { value: string; label: string }[];
}

// Status options map to the derived installment `state`
// (not_due | due_soon | overdue | paid).
const STATUS_OPTIONS: Option[] = [
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due Soon (≤7 days)" },
  { value: "not_due", label: "Not Due" },
  { value: "paid", label: "Paid" },
];

// Month-of-year options. Values are "01".."12" and match dueDate's month
// component regardless of year (engine compares against dueDate.slice(5, 7)).
const MONTH_OPTIONS: Option[] = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, i) => ({ value: String(i + 1).padStart(2, "0"), label }));

// Year options: last 3 calendar years through next 2 (matches the engine's
// `years` filter, which compares against dueDate.slice(0, 4)).
function yearOptions(): Option[] {
  const now = new Date().getUTCFullYear();
  const out: Option[] = [];
  for (let y = now + 2; y >= now - 3; y--) {
    out.push({ value: String(y), label: String(y) });
  }
  return out;
}

const split = (v: string | null): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

export function OutstandingFilterBar({ employees, entities, modes, cycles }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Roster → name-valued options (engine matches denormalized *Name fields).
  const employeeOptions: Option[] = React.useMemo(
    () => employees.map((e) => ({ value: e.name, label: e.name })),
    [employees],
  );
  const entityOptions: Option[] = React.useMemo(
    () => entities.map((e) => ({ value: e.name, label: e.name })),
    [entities],
  );
  const modeOptions: Option[] = React.useMemo(
    () => modes.map((m) => ({ value: m.name, label: m.name })),
    [modes],
  );
  const years = React.useMemo(yearOptions, []);

  // Current selections read straight from the URL — the page re-renders on
  // every navigation, so these stay the single source of truth.
  const emp = split(searchParams.get("emp"));
  const entity = split(searchParams.get("entity"));
  const cycle = split(searchParams.get("cycle"));
  const mode = split(searchParams.get("mode"));
  const status = split(searchParams.get("status"));
  const month = split(searchParams.get("month"));
  const year = split(searchParams.get("year"));

  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Auto-apply: write a param and navigate. No Apply button — the repo moved
  // to auto-apply filters.
  function setParam(key: string, values: string[]) {
    const sp = new URLSearchParams(searchParams.toString());
    if (values.length > 0) sp.set(key, values.join(","));
    else sp.delete(key);
    startTransition(() => router.push(`${pathname}?${sp.toString()}` as never));
  }

  function reset() {
    startTransition(() => router.push(pathname as never));
  }

  const activeCount =
    (emp.length > 0 ? 1 : 0) +
    (entity.length > 0 ? 1 : 0) +
    (cycle.length > 0 ? 1 : 0) +
    (mode.length > 0 ? 1 : 0) +
    (status.length > 0 ? 1 : 0) +
    (month.length > 0 ? 1 : 0) +
    (year.length > 0 ? 1 : 0);

  return (
    <div
      className="sticky top-[96px] max-md:top-[72px] z-40 border-b border-hairline print:hidden"
      style={{
        backgroundColor: "rgba(250, 251, 252, 0.82)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
      }}
    >
      <div className="mx-auto max-w-[1600px] px-12 py-2.5 max-md:px-4">
        {/* Mobile-only header (Filters label + show/hide). */}
        <div className="hidden max-sm:flex max-sm:w-full max-sm:items-center max-sm:gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-table-head mr-1"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            <SlidersHorizontal size={14} strokeWidth={2.4} />
            Filters
            {activeCount > 0 && (
              <span
                className="ml-1 inline-flex items-center justify-center rounded-full text-white"
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  minWidth: 18,
                  height: 18,
                  padding: "0 6px",
                  background: "var(--color-altus-red)",
                }}
              >
                {activeCount}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            className="hidden max-sm:inline-flex items-center gap-1.5 filter-chip ml-auto"
            aria-expanded={sheetOpen}
          >
            {sheetOpen ? "Hide" : "Show"} filters
          </button>
        </div>

        <div
          className={`flex items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-3 max-sm:mt-3 ${
            sheetOpen ? "" : "max-sm:hidden"
          }`}
        >
          <div className="flex-1 min-w-0 overflow-x-auto nav-scroll max-sm:flex-none max-sm:overflow-visible">
            <div className="flex items-center gap-2 w-max max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-3">
              {/* Employees → emp (by name) */}
              <div className="filter-chip max-sm:w-full">
                <Users size={16} className="text-ink-subtle" strokeWidth={2} />
                <MultiSelect
                  options={employeeOptions}
                  selected={emp}
                  onChange={(v) => setParam("emp", v)}
                  placeholder="All Employees"
                  className="min-w-[6.5rem] !text-[14px]"
                />
              </div>

              {/* Entities → entity (by name) */}
              <div className="filter-chip max-sm:w-full">
                <Building2 size={16} className="text-ink-subtle" strokeWidth={2} />
                <MultiSelect
                  options={entityOptions}
                  selected={entity}
                  onChange={(v) => setParam("entity", v)}
                  placeholder="All Entities"
                  className="min-w-[6rem] !text-[14px]"
                />
              </div>

              {/* Cycles → cycle (by key) */}
              <div className="filter-chip max-sm:w-full">
                <Repeat size={16} className="text-ink-subtle" strokeWidth={2} />
                <MultiSelect
                  options={cycles}
                  selected={cycle}
                  onChange={(v) => setParam("cycle", v)}
                  placeholder="All Cycles"
                  className="min-w-[5.5rem] !text-[14px]"
                />
              </div>

              {/* Payment modes → mode (by name) */}
              <div className="filter-chip max-sm:w-full">
                <CreditCard size={16} className="text-ink-subtle" strokeWidth={2} />
                <MultiSelect
                  options={modeOptions}
                  selected={mode}
                  onChange={(v) => setParam("mode", v)}
                  placeholder="All Modes"
                  className="min-w-[5.5rem] !text-[14px]"
                />
              </div>

              {/* Status → status (state code) */}
              <div className="filter-chip max-sm:w-full">
                <CircleDot size={16} className="text-ink-subtle" strokeWidth={2} />
                <MultiSelect
                  options={STATUS_OPTIONS}
                  selected={status}
                  onChange={(v) => setParam("status", v)}
                  placeholder="All Statuses"
                  className="min-w-[5.5rem] !text-[14px]"
                />
              </div>

              {/* Months → month (01..12, any year) */}
              <div className="filter-chip max-sm:w-full">
                <CalendarDays size={16} className="text-ink-subtle" strokeWidth={2} />
                <MultiSelect
                  options={MONTH_OPTIONS}
                  selected={month}
                  onChange={(v) => setParam("month", v)}
                  placeholder="All Months"
                  className="min-w-[5.5rem] !text-[14px]"
                />
              </div>

              {/* Year → year (YYYY) */}
              <div className="filter-chip max-sm:w-full">
                <CalendarRange size={16} className="text-ink-subtle" strokeWidth={2} />
                <MultiSelect
                  options={years}
                  selected={year}
                  onChange={(v) => setParam("year", v)}
                  placeholder="All Years"
                  className="min-w-[5rem] !text-[14px]"
                />
              </div>
            </div>
          </div>

          {/* Pinned actions */}
          <div className="flex items-center gap-2 shrink-0 max-sm:w-full max-sm:flex-wrap max-sm:mt-1">
            <button
              type="button"
              onClick={(e) => {
                const icon = e.currentTarget.querySelector("svg");
                if (icon) {
                  icon.style.transition =
                    "transform 450ms cubic-bezier(.4, 1.4, .5, 1)";
                  icon.style.transform = "rotate(-360deg)";
                  setTimeout(() => {
                    if (icon) {
                      icon.style.transition = "none";
                      icon.style.transform = "rotate(0deg)";
                    }
                  }, 480);
                }
                reset();
              }}
              className="inline-flex items-center gap-1.5 text-chip text-ink-subtle hover:text-ink-strong transition-colors px-3 py-2 rounded-chip"
              aria-label="Reset filters"
            >
              <RotateCcw size={14} strokeWidth={2.2} />
              Reset
            </button>
            <span
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-chip text-ink-subtle transition-opacity"
              style={{ opacity: isPending ? 1 : 0 }}
            >
              <Loader2 size={14} strokeWidth={2.2} className="animate-spin" />
              Updating…
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
