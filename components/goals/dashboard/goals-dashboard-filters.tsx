"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CalendarDays, Users } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "@/components/layout/filters/filter-pill";
import { PageShell } from "@/components/layout/page-shell";
import type { RosterMember } from "@/components/goals/cascade/util";

const ALL_EMPS = "__all__";
type CalendarMode = "day" | "range" | "month" | "year";

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && b.every((id) => new Set(a).has(id));
}

function asDate(ymd: string) {
  return new Date(`${ymd}T12:00:00`);
}

function fiscalYearOf(date: Date) {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

function financialYearRange(startYear: number) {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

function monthRange(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  return { from: format(first, "yyyy-MM-dd"), to: format(last, "yyyy-MM-dd") };
}

function isWholeMonth(range: { from: string; to: string }) {
  const month = monthRange(asDate(range.from));
  return range.from === month.from && range.to === month.to;
}

function modeForRange(range: { from: string; to: string }, fyRange: { from: string; to: string }): CalendarMode {
  if (range.from === fyRange.from && range.to === fyRange.to) return "year";
  if (isWholeMonth(range)) return "month";
  return "day";
}

function calendarLabel(range: { from: string; to: string }, fyRange: { from: string; to: string }) {
  if (range.from === fyRange.from && range.to === fyRange.to) {
    return `FY ${fyRange.from.slice(0, 4)}–${fyRange.to.slice(2, 4)}`;
  }
  if (isWholeMonth(range)) return format(asDate(range.from), "MMMM yyyy");
  if (range.from === range.to) return format(asDate(range.from), "dd MMM yyyy");
  return `${format(asDate(range.from), "d MMM")} – ${format(asDate(range.to), "d MMM")}`;
}

/**
 * Goals dashboard controls. A calendar window can be one day, a custom date
 * range, a calendar month or a financial year.
 */
export function GoalsDashboardFilters({
  roster,
  selectedEmployeeIds,
  empsMode,
  viewedEmployeeId,
  myEmployeeId,
  range,
  fyStartYear,
  fyRange,
}: {
  roster: RosterMember[];
  selectedEmployeeIds: string[];
  empsMode: "self" | "all" | "specific";
  viewedEmployeeId: string;
  myEmployeeId: string;
  range: { from: string; to: string };
  fyStartYear: number;
  fyRange: { from: string; to: string };
}) {
  const router = useRouter();
  const [dateOpen, setDateOpen] = React.useState(false);
  const [calendarMode, setCalendarMode] = React.useState<CalendarMode>(() => modeForRange(range, fyRange));
  const [calendarMonth, setCalendarMonth] = React.useState(() => asDate(range.from));
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>();
  const [draftEmps, setDraftEmps] = React.useState<string[]>([]);

  const go = React.useCallback(
    (patch: { emps?: string[]; emp?: string; from?: string; to?: string; fy?: number }) => {
      const sp = new URLSearchParams();
      sp.set("fy", String(patch.fy ?? fyStartYear));

      const emp = patch.emp ?? viewedEmployeeId;
      if (emp !== myEmployeeId) sp.set("emp", emp);

      const emps = patch.emps ?? (empsMode === "all" ? [ALL_EMPS] : selectedEmployeeIds);
      if (emps.length === 1 && emps[0] === ALL_EMPS) sp.set("emps", "all");
      else if (!(emps.length === 1 && emps[0] === viewedEmployeeId)) sp.set("emps", emps.join(","));

      const from = patch.from ?? range.from;
      const to = patch.to ?? range.to;
      const fullYear = financialYearRange(patch.fy ?? fyStartYear);
      if (from !== fullYear.from) sp.set("from", from);
      if (to !== fullYear.to) sp.set("to", to);

      router.push(`/goals/dashboard?${sp.toString()}` as Route);
    },
    [router, fyStartYear, viewedEmployeeId, myEmployeeId, selectedEmployeeIds, empsMode, range],
  );

  const chooseDay = (day: Date | undefined) => {
    if (!day) return;
    const ymd = format(day, "yyyy-MM-dd");
    setCalendarMonth(day);
    setDateOpen(false);
    go({ from: ymd, to: ymd, fy: fiscalYearOf(day) });
  };

  const applyRange = () => {
    if (!draftRange?.from || !draftRange.to) return;
    const from = format(draftRange.from, "yyyy-MM-dd");
    const to = format(draftRange.to, "yyyy-MM-dd");
    setCalendarMonth(draftRange.from);
    setDateOpen(false);
    go({ from, to, fy: fiscalYearOf(draftRange.from) });
  };

  const applyMonth = () => {
    const next = monthRange(calendarMonth);
    setDateOpen(false);
    go({ ...next, fy: fiscalYearOf(calendarMonth) });
  };

  const chooseYear = (startYear: number) => {
    const next = financialYearRange(startYear);
    setCalendarMonth(asDate(next.from));
    setDateOpen(false);
    go({ ...next, fy: startYear });
  };

  const empOptions = React.useMemo(() => {
    const self = roster.find((person) => person.id === viewedEmployeeId);
    return [
      { value: ALL_EMPS, label: `All employees (${roster.length})` },
      ...(self ? [{ value: self.id, label: `${self.name} (You)` }] : []),
      ...roster.filter((person) => person.id !== viewedEmployeeId).map((person) => ({ value: person.id, label: person.name })),
    ];
  }, [roster, viewedEmployeeId]);
  const nameById = React.useMemo(() => new Map(roster.map((person) => [person.id, person.name] as const)), [roster]);
  const isAllEmps = empsMode === "all";
  const isSelfOnly = empsMode === "self";
  const appliedSelection = React.useCallback(() => (isAllEmps ? [ALL_EMPS] : selectedEmployeeIds), [isAllEmps, selectedEmployeeIds]);

  function onDraftChange(next: string[]) {
    if (next.includes(ALL_EMPS) && !isAllEmps) {
      setDraftEmps([ALL_EMPS]);
      return;
    }
    setDraftEmps(next.filter((value) => value !== ALL_EMPS));
  }

  const selectedDay = range.from === range.to ? asDate(range.from) : undefined;
  const yearOptions = Array.from({ length: 8 }, (_, offset) => fyStartYear - 3 + offset);

  return (
    <PageShell as="div" width="full" py={false} className="flex flex-wrap items-center gap-2 py-2">
      <Popover.Root
        open={dateOpen}
        onOpenChange={(open) => {
          setDateOpen(open);
          if (open) {
            setCalendarMode(modeForRange(range, fyRange));
            setCalendarMonth(asDate(range.from));
            setDraftRange({ from: asDate(range.from), to: asDate(range.to) });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Choose dashboard date"
            title="Choose day, range, month or financial year"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline-strong bg-surface-card px-2.5 text-left shadow-sm transition hover:border-altus-red/50 hover:bg-altus-red/[0.025]"
          >
            <CalendarDays size={16} className="shrink-0 text-altus-red" strokeWidth={2.2} />
            <span className="text-[12px] font-bold tabular-nums text-ink-strong">{calendarLabel(range, fyRange)}</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={10}
            collisionPadding={12}
            className="slim-scroll z-[100] w-[330px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-chip border border-hairline-strong bg-surface-card p-3"
            style={{ boxShadow: "0 16px 40px rgba(15, 23, 42, 0.14)" }}
          >
            <div className="mb-3 grid grid-cols-4 rounded-lg bg-slate-100 p-1" aria-label="Calendar selection mode">
              {(["day", "range", "month", "year"] as CalendarMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCalendarMode(mode)}
                  className={`rounded-md px-2 py-1.5 text-[12px] font-bold transition ${calendarMode === mode ? "bg-white text-altus-red shadow-sm" : "text-ink-subtle hover:text-ink-strong"}`}
                >
                  {mode === "year" ? "FY year" : mode}
                </button>
              ))}
            </div>

            {calendarMode === "day" && (
              <>
                <p className="mb-2 text-[12px] font-semibold text-ink-subtle">Select a specific day</p>
                <DayPicker
                  mode="single"
                  selected={selectedDay}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  onSelect={chooseDay}
                  captionLayout="dropdown"
                  navLayout="after"
                  startMonth={asDate(`${fyStartYear - 3}-04-01`)}
                  endMonth={asDate(`${fyStartYear + 4}-03-01`)}
                  showOutsideDays
                  weekStartsOn={1}
                />
              </>
            )}

            {calendarMode === "range" && (
              <div>
                <p className="mb-2 text-[12px] font-semibold text-ink-subtle">Choose a start and end date, then apply the range.</p>
                <DayPicker
                  mode="range"
                  selected={draftRange}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  onSelect={setDraftRange}
                  captionLayout="dropdown"
                  navLayout="after"
                  startMonth={asDate(`${fyStartYear - 3}-04-01`)}
                  endMonth={asDate(`${fyStartYear + 4}-03-01`)}
                  showOutsideDays
                  weekStartsOn={1}
                />
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-hairline pt-2">
                  <span className="min-w-0 truncate text-[11.5px] font-semibold text-ink-subtle">
                    {draftRange?.from && draftRange.to
                      ? `${format(draftRange.from, "dd MMM yyyy")} – ${format(draftRange.to, "dd MMM yyyy")}`
                      : draftRange?.from
                        ? `${format(draftRange.from, "dd MMM yyyy")} — choose an end date`
                        : "Select a range"}
                  </span>
                  <button
                    type="button"
                    onClick={applyRange}
                    disabled={!draftRange?.from || !draftRange.to}
                    className="shrink-0 rounded-lg bg-altus-red px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {calendarMode === "month" && (
              <div className="space-y-3">
                <p className="text-[12px] font-semibold text-ink-subtle">Choose a month and year, then apply it to the dashboard.</p>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                  Month
                  <select
                    value={calendarMonth.getMonth()}
                    onChange={(event) => setCalendarMonth(new Date(calendarMonth.getFullYear(), Number(event.target.value), 1, 12))}
                    className="mt-1 block w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-strong outline-none focus:border-altus-red"
                  >
                    {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{format(new Date(2026, month, 1), "MMMM")}</option>)}
                  </select>
                </label>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                  Year
                  <select
                    value={calendarMonth.getFullYear()}
                    onChange={(event) => setCalendarMonth(new Date(Number(event.target.value), calendarMonth.getMonth(), 1, 12))}
                    className="mt-1 block w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-strong outline-none focus:border-altus-red"
                  >
                    {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={applyMonth}
                  className="w-full rounded-lg bg-altus-red px-3 py-2 text-[13px] font-bold text-white transition hover:bg-[#b91c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
                >
                  View {format(calendarMonth, "MMMM yyyy")}
                </button>
              </div>
            )}

            {calendarMode === "year" && (
              <div className="space-y-3">
                <p className="text-[12px] font-semibold text-ink-subtle">Select a financial year (April to March)</p>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                  Financial year
                  <select
                    value={fyStartYear}
                    onChange={(event) => chooseYear(Number(event.target.value))}
                    className="mt-1 block w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-strong outline-none focus:border-altus-red"
                  >
                    {yearOptions.map((year) => <option key={year} value={year}>FY {year}–{String(year + 1).slice(2)}</option>)}
                  </select>
                </label>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <MultiSelect
        options={empOptions}
        selected={draftEmps}
        onChange={onDraftChange}
        onOpenChange={(open) => {
          if (open) setDraftEmps(appliedSelection());
          else if (!sameIds(draftEmps, appliedSelection())) go({ emps: draftEmps.length > 0 ? draftEmps : [viewedEmployeeId] });
        }}
        placeholder="All employees"
        renderTrigger={() => (
          <FilterPill
            icon={<Users size={16} strokeWidth={2} />}
            name="Employees"
            value={
              isAllEmps
                ? `All employees (${roster.length})`
                : isSelfOnly
                  ? "Only me"
                  : summarizeSelection(selectedEmployeeIds.map((id) => nameById.get(id) ?? "—"), "All employees")
            }
            active={!isSelfOnly}
          />
        )}
      />
    </PageShell>
  );
}
