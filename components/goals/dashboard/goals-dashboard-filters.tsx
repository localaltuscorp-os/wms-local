"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Calendar, Users, RotateCcw } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "@/components/layout/filters/filter-pill";
import { PageShell } from "@/components/layout/page-shell";
import type { RosterMember } from "@/components/goals/cascade/util";

/**
 * THE GOALS DASHBOARD'S FILTER ROW — the first row of the frozen band.
 *
 * It does NOT pin itself. The caller wraps this and the section nav in one
 * `data-dashboard-stickybar` element, exactly as the WMS dashboard does, and
 * that wrapper is what pins. The reason is `DashboardSectionNav`: it measures
 * that single element to decide where a pill click lands a section. Two
 * separately-pinned bars would need their heights added up in a second place,
 * and the two sums would drift the moment either row wrapped.
 *
 * The controls are the WMS dashboard's own (`FilterPill`, `MultiSelect`,
 * `DayPicker`) rather than new ones, so the two dashboards filter the same way.
 *
 * ALL STATE LIVES IN THE URL. Every control writes a query param and lets the
 * server re-render; nothing here holds a copy of the filter. That is what makes
 * a filtered dashboard a shareable link, and it is why the multiselect can be
 * re-validated server-side against the roster — the client is never the
 * authority on who you may look at.
 */
/** Same ids, order-insensitive — so closing the menu without changing anything
 *  does not fire a navigation. */
function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** The synthetic "All employees" row. No employee has this id — it is
 *  intercepted before anything is written to the URL. */
const ALL_EMPS = "__all__";

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
  /** self = nobody chose (the default), all = `?emps=all`, specific = named. */
  empsMode: "self" | "all" | "specific";
  viewedEmployeeId: string;
  myEmployeeId: string;
  range: { from: string; to: string };
  fyStartYear: number;
  /** The financial year's own bounds — what "no date filter" means here. */
  fyRange: { from: string; to: string };
}) {
  const router = useRouter();

  /** Rewrite the URL with one set of params changed. Everything unnamed is
   *  carried through, so narrowing the dates never silently drops the people. */
  const go = React.useCallback(
    (patch: {
      emps?: string[];
      emp?: string;
      from?: string;
      to?: string;
    }) => {
      const sp = new URLSearchParams();
      sp.set("fy", String(fyStartYear));

      const emp = patch.emp ?? viewedEmployeeId;
      if (emp !== myEmployeeId) sp.set("emp", emp);

      /* YOU are the default, so "just me" is the absence of the parameter and
         everyone has to be written down. That is the opposite of how this read
         before the dashboard started opening on the viewer, and getting it
         backwards would mean a shared link silently re-scoped to whoever
         opened it. */
      const emps = patch.emps ?? (empsMode === "all" ? [ALL_EMPS] : selectedEmployeeIds);
      if (emps.length === 1 && emps[0] === ALL_EMPS) {
        sp.set("emps", "all");
      } else if (!(emps.length === 1 && emps[0] === viewedEmployeeId)) {
        sp.set("emps", emps.join(","));
      }

      const from = patch.from ?? range.from;
      const to = patch.to ?? range.to;
      if (from !== fyRange.from) sp.set("from", from);
      if (to !== fyRange.to) sp.set("to", to);

      router.push(`/goals/dashboard?${sp.toString()}` as Route);
    },
    [
      router,
      fyStartYear,
      viewedEmployeeId,
      myEmployeeId,
      selectedEmployeeIds,
      empsMode,
      range,
      fyRange,
    ],
  );

  /* ── The date range, edited as a DRAFT and committed once ──────────────
     Writing each click straight to the URL would refetch the whole dashboard
     on the FIRST click of a two-click gesture, and — because a committed
     `{from, to}` reads back as a COMPLETE range — day-picker would treat the
     next click as the start of a new one. The range could never be finished.
     Same fix as the WMS filter bar's calendar. */
  const [dateOpen, setDateOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(undefined);

  const applied = React.useMemo<DateRange>(
    () => ({
      from: new Date(`${range.from}T00:00:00`),
      to: new Date(`${range.to}T00:00:00`),
    }),
    [range.from, range.to],
  );

  function handleRange(r: DateRange | undefined) {
    setDraft(r);
    if (r?.from && r.to) {
      setDateOpen(false);
      go({ from: format(r.from, "yyyy-MM-dd"), to: format(r.to, "yyyy-MM-dd") });
    }
  }

  const isDefaultRange = range.from === fyRange.from && range.to === fyRange.to;
  const rangeLabel = isDefaultRange
    ? "Full year"
    : `${format(applied.from!, "d MMM")} – ${format(applied.to!, "d MMM yy")}`;

  /* Widest scope first, then YOU, then everyone else — so the two things you
     actually switch between are the top two rows and nobody has to hunt for
     their own name in a roster of fifty. */
  const empOptions = React.useMemo(() => {
    const self = roster.find((r) => r.id === viewedEmployeeId);
    return [
      { value: ALL_EMPS, label: `All employees (${roster.length})` },
      ...(self ? [{ value: self.id, label: `${self.name} (You)` }] : []),
      ...roster
        .filter((r) => r.id !== viewedEmployeeId)
        .map((r) => ({ value: r.id, label: r.name })),
    ];
  }, [roster, viewedEmployeeId]);
  const nameById = React.useMemo(
    () => new Map(roster.map((r) => [r.id, r.name] as const)),
    [roster],
  );
  const isAllEmps = empsMode === "all";
  /* Just you, and only because nothing was chosen — the state the page opens
     in. Worth naming separately from "you, picked deliberately" so the pill
     can stay quiet rather than shouting an active filter at every arrival. */
  const isSelfOnly = empsMode === "self";

  /* THE SELECTION IS A DRAFT WHILE THE MENU IS OPEN.

     It used to write the URL on every toggle, and each write re-rendered the
     page under the open menu — so the first name you ticked navigated, and a
     second one was never reachable. That is the "can't select any employees"
     bug. Now `onChange` only updates local state and the commit happens once,
     when the menu closes.

     `[]` is shown for the all-employees default rather than every id ticked:
     the pill reads "All employees", and ticking one name should narrow to that
     name, not untick 49 others one at a time. */
  const [draftEmps, setDraftEmps] = React.useState<string[]>([]);

  /** What the checkboxes should show for the CURRENTLY APPLIED scope. */
  const appliedSelection = React.useCallback(
    () => (isAllEmps ? [ALL_EMPS] : selectedEmployeeIds),
    [isAllEmps, selectedEmployeeIds],
  );

  /* "All employees" WINS when it was just ticked, because at that moment your
     own name is still ticked too (you are the default) — a plain "any real id
     present → those people" rule would read that as "just me" and swallow the
     click. Everything else falls through to the real ids. */
  function onDraftChange(next: string[]) {
    if (next.includes(ALL_EMPS) && !isAllEmps) {
      setDraftEmps([ALL_EMPS]);
      return;
    }
    setDraftEmps(next.filter((v) => v !== ALL_EMPS));
  }

  return (
    <PageShell as="div" width="full" py={false} className="flex flex-wrap items-center gap-2 py-2">
        {/* DATE RANGE */}
        <Popover.Root
          open={dateOpen}
          onOpenChange={(o) => {
            setDateOpen(o);
            // Seed from what is applied, so reopening shows the window you are
            // looking at rather than a blank slate.
            if (o) setDraft(applied);
            // Closed after only a start day: commit it as a single day rather
            // than discarding the click. Throwing away someone's input because
            // they did not finish the gesture is the more surprising outcome.
            else if (draft?.from && !draft.to) {
              const d = format(draft.from, "yyyy-MM-dd");
              go({ from: d, to: d });
            }
          }}
        >
          <Popover.Trigger asChild>
            <FilterPill
              icon={<Calendar size={16} strokeWidth={2} />}
              name="Date range"
              value={rangeLabel}
              active={!isDefaultRange}
            />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={10}
              collisionPadding={12}
              className="z-[100] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-chip border border-hairline-strong bg-surface-card p-3"
              style={{ boxShadow: "0 16px 40px rgba(15, 23, 42, 0.14)" }}
            >
              <DayPicker
                mode="range"
                // The draft while open, the applied range once closed — an
                // in-progress `{from, to: undefined}` has to survive the round
                // trip or the second click starts over instead of extending.
                selected={dateOpen ? draft : applied}
                onSelect={handleRange}
                defaultMonth={applied.from}
                numberOfMonths={2}
                showOutsideDays
                weekStartsOn={1}
              />
              {/* The only feedback between the first click and the second: the
                  pill behind still reads the OLD range, because nothing is
                  committed yet. */}
              <p className="mt-2 border-t border-hairline pt-2 text-center text-[12px] font-semibold text-ink-subtle">
                {draft?.from && draft.to
                  ? `${format(draft.from, "d MMM yyyy")} – ${format(draft.to, "d MMM yyyy")}`
                  : draft?.from
                    ? `${format(draft.from, "d MMM yyyy")} — pick an end date`
                    : "Pick a start date"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDateOpen(false);
                  go({ from: fyRange.from, to: fyRange.to });
                }}
                className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-bold text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
              >
                <RotateCcw size={12} strokeWidth={2.4} />
                Reset to the full year
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* EMPLOYEES — multiselect. Clearing it falls back to the viewed
            person rather than showing nothing, which is what an empty
            selection would otherwise mean. */}
        <MultiSelect
          options={empOptions}
          selected={draftEmps}
          onChange={onDraftChange}
          onOpenChange={(open) => {
            // Opening seeds the draft from what is applied; closing commits it.
            // Clearing everything falls back to you — the page's default —
            // rather than to an empty dashboard.
            if (open) setDraftEmps(appliedSelection());
            else if (!sameIds(draftEmps, appliedSelection())) {
              go({ emps: draftEmps.length > 0 ? draftEmps : [viewedEmployeeId] });
            }
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
                    : summarizeSelection(
                        selectedEmployeeIds.map((id) => nameById.get(id) ?? "—"),
                        "All employees",
                      )
              }
              // The default scope is not a filter, so it does not light up.
              active={!isSelfOnly}
            />
          )}
        />

        {/* A "Viewing: <person>" select used to sit here, pinned right. It is
            gone on request, and its job went with it rather than being lost:
            the dashboard now OPENS on you, and the Employees multiselect above
            is the single control for looking at anyone else. Two controls both
            answering "whose goals am I reading" was the confusion — and this
            one can say "everyone", which Viewing never could.

            `?emp=` still resolves the cascade the page centres on, so old
            links keep working; nothing writes it any more. */}
    </PageShell>
  );
}
