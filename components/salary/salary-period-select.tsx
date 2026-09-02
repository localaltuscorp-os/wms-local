"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Compact payroll period selector — two dropdowns that sit INSIDE the salary
 * header, between the title and the export buttons.
 *
 * It replaces a ~17-button wall (5 year chips + 12 month chips) that owned two
 * full rows under the heading. The buttons made every month one click away, but
 * at the cost of pushing the payroll table itself below the fold, and they were
 * the main reason the header sprawled.
 *
 * MONTHS ARE FILTERED TO THE SELECTED YEAR and only offered when a sheet exists
 * for them — the same rule the old grid encoded by dimming unavailable chips.
 * Offering an empty month would navigate to a page that can only say "no rows".
 *
 * Changing either dropdown pushes `?month=YYYY-MM`, so the server component
 * re-reads and the URL stays shareable. Nothing is held in local state that the
 * URL doesn't already carry.
 */
export function SalaryPeriodSelect({
  months,
  selected,
}: {
  /** Available "YYYY-MM" sheets, newest-first. */
  months: string[];
  /** The month currently in view, "YYYY-MM". */
  selected: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const selYear = selected.slice(0, 4);
  const selMonth = selected.slice(5, 7);

  const years = React.useMemo(() => {
    const ys = new Set<string>();
    for (const m of months) ys.add(m.slice(0, 4));
    return [...ys].sort((a, b) => Number(b) - Number(a)); // newest first
  }, [months]);

  /** The months that actually have a sheet in the selected year, newest-first. */
  const monthsOfYear = React.useMemo(
    () =>
      months
        .filter((m) => m.startsWith(selYear))
        .map((m) => m.slice(5, 7))
        .sort((a, b) => Number(b) - Number(a)),
    [months, selYear],
  );

  function go(ym: string) {
    if (!ym || ym === selected) return;
    setPending(true);
    router.push(`/salary?month=${ym}`);
  }

  /** Switching year keeps the same month where that year has one, so moving
   *  2026-07 → 2025 lands on 2025-07 rather than resetting to December. */
  function onYear(y: string) {
    const sameMonth = `${y}-${selMonth}`;
    go(months.includes(sameMonth) ? sameMonth : months.find((m) => m.startsWith(y)) ?? sameMonth);
  }

  return (
    <div className="flex shrink-0 items-center gap-2" aria-busy={pending}>
      <Select
        value={selYear}
        onValueChange={onYear}
        ariaLabel="Payroll year"
        unstyled
        className={FIELD}
        options={years.map((y) => ({ value: y, label: y }))}
      />
      <Select
        value={selMonth}
        onValueChange={(m) => go(`${selYear}-${m}`)}
        ariaLabel="Payroll month"
        unstyled
        className={FIELD}
        options={monthsOfYear.map((m) => ({
          value: m,
          label: MONTHS[Number(m) - 1] ?? m,
        }))}
      />
    </div>
  );
}

/** The app's compact trigger language (same string ViewingSelect uses), passed
 *  with `unstyled` so the heavy default gdd-trigger doesn't fight the header. */
const FIELD = [
  "h-9 cursor-pointer rounded-lg border border-hairline-strong bg-surface-card px-3",
  "text-[13px] font-bold tabular-nums text-ink-strong transition-colors",
  "hover:border-[color-mix(in_srgb,var(--color-altus-red)_35%,var(--color-hairline-strong))]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40",
].join(" ");
