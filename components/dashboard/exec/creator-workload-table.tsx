"use client";

import * as React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowLeftRight, ChevronDown, Loader2, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { SectionSearchBox } from "@/components/dashboard/section-chrome";
import { getCreatorWorkloadBoard } from "@/app/(app)/dashboard/creator-workload-actions";
import {
  DEFAULT_ACTIVITY_PERIOD,
  type ActivityPeriod,
  type ActivityTargets,
} from "@/lib/dashboard/manager-activity-contract";
import {
  WORKLOAD_FAMILIES,
  WORKLOAD_RELATIONS,
  cellTarget,
  totalTarget,
  grandTotalTarget,
  splitOf,
  sortWorkloadRows,
  type CreatorWorkloadBoard,
  type CreatorWorkloadRow,
  type WorkloadSortKey,
} from "@/lib/dashboard/creator-workload-contract";
// The cell, its palette, its tooltip sentence and its href live with the
// delegation board's, so the same figure cannot read two ways on one screen.
import {
  WorkloadCountCell,
  attainColor,
  SortHead,
  HEAD_MAIN,
  nextSortConfig,
  type SortConfig,
} from "./workload-cell";
import { PeriodRangePicker, periodLabel } from "./period-range-picker";
import { SectionDispatch } from "../section-dispatch";
import type { SectionReport } from "@/lib/reports/section-report";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD_PADDED,
  SECTION_CONTROL,
} from "../section-chrome";
import { DashboardSectionHeader } from "../section-header";

/* ────────────────────────────────────────────────────────────────────────
   CreatorWorkloadTable — "who is creating how much work".

   FLAT ON PURPOSE. The delegation board directly above it groups by manager
   and nests direct reports, which answers "how does this line behave". This
   one puts every employee on the same footing so they can be ranked against
   each other — a nesting here would make two people in different lines
   incomparable, which is the one thing the board exists to do.

   Every number is a count. Nothing here is a percentage of anything else.
   ──────────────────────────────────────────────────────────────────────── */

/* ── One employee row + its five-relation breakdown ───────────────────────── */

function EmployeeRow({
  row,
  targets,
  resolveAvatar,
  open,
  onToggle,
}: {
  row: CreatorWorkloadRow;
  targets: ActivityTargets;
  resolveAvatar: (id: string) => string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
        <td className="px-2 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={row.employeeName} avatarUrl={resolveAvatar(row.employeeId)} size={26} />
            <span className="min-w-0 truncate text-[13px] font-bold text-slate-900">
              {row.employeeName}
            </span>
          </span>
        </td>
        {WORKLOAD_FAMILIES.map((f) => (
          <td key={f.key} className="px-2 py-2.5 text-center">
            {/* The window's own quota for this family — see totalTarget. */}
            <WorkloadCountCell
              value={splitOf(row, f.key).total}
              target={totalTarget(targets, f.key)}
              creatorId={row.employeeId}
              creatorName={row.employeeName}
              family={f.key}
              relation="total"
            />
          </td>
        ))}
        <td className="px-2 py-2.5 text-center">
          {/* Hand-drawn rather than a WorkloadCountCell: this column spans all
              three families, so it has no single `family` to link or phrase a
              tooltip with. The x/y TYPOGRAPHY is copied exactly — same sizes,
              same weights, same opacity-80 on the denominator — so it reads as
              one column with the cells beside it. */}
          <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap leading-none">
            <span
              className="text-base font-black tabular-nums md:text-lg"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                color: attainColor(row.grandTotal, grandTotalTarget(targets)),
              }}
            >
              {row.grandTotal}
            </span>
            <span
              className="text-xs font-bold tabular-nums opacity-80 md:text-sm"
              style={{ color: attainColor(row.grandTotal, grandTotalTarget(targets)) }}
            >
              /{grandTotalTarget(targets)}
            </span>
          </span>
        </td>
        <td className="px-2 py-2.5 text-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} breakdown for ${row.employeeName}`}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
          >
            {open ? "Hide" : "Show"}
            <ChevronDown
              size={12}
              strokeWidth={3}
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </td>
      </tr>

      {open &&
        WORKLOAD_RELATIONS.map((rel) => (
          <tr key={rel.key} className="border-t border-slate-50 bg-slate-50/40">
            <td className="py-1.5 pl-10 pr-2">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[12px] font-bold text-slate-700">{rel.label}</span>
                <span className="truncate text-[10.5px] font-medium text-slate-400">
                  {rel.hint}
                </span>
              </span>
            </td>
            {WORKLOAD_FAMILIES.map((f) => {
              /* Quota where one exists; otherwise the person's own family
                 total, so the cell still reads x/y — "6 of the 150 they
                 created". Counterpart, Upward and Founder have no target by
                 design, and Downward has none for someone with no reports. */
              const quota = cellTarget(targets, f.key, rel.key, row.directReports);
              const famTotal = splitOf(row, f.key).total;
              return (
                <td key={f.key} className="px-2 py-1.5 text-center">
                  <WorkloadCountCell
                    value={splitOf(row, f.key)[rel.key]}
                    target={quota ?? famTotal}
                    denominator={quota != null ? "target" : "share"}
                    creatorId={row.employeeId}
                    creatorName={row.employeeName}
                    family={f.key}
                    relation={rel.key}
                  />
                </td>
              );
            })}
            {/* Upscaled with the rest, but it keeps `text-slate-400`: colour is what
                makes this subtotal subordinate to the counts beside it.
                A SHARE, never a target — this is one relation's slice of
                everything the person created, so it stays neutral like the
                cells it sums. */}
            <td className="px-2 py-1.5 text-center">
              <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap leading-none text-slate-400">
                <span className="text-base font-black tabular-nums md:text-lg">
                  {splitOf(row, "goals")[rel.key] +
                    splitOf(row, "tasks")[rel.key] +
                    splitOf(row, "commitments")[rel.key]}
                </span>
                <span className="text-xs font-bold tabular-nums opacity-80 md:text-sm">
                  /{row.grandTotal}
                </span>
              </span>
            </td>
            <td />
          </tr>
        ))}
    </>
  );
}

/* ── Transposed view ──────────────────────────────────────────────────────── */

/**
 * Families become rows, employees become columns. The same numbers, read the
 * other way: down a column is one person's mix, across a row is the whole org's
 * output in one family.
 */
function TransposedTable({
  rows,
  targets,
  resolveAvatar,
}: {
  rows: CreatorWorkloadRow[];
  /* Threaded in for the denominators. This view shows the same totals as the
     upright one, so it has to show the same fractions — a number that gains a
     denominator when you flip the table is two different figures. */
  targets: ActivityTargets;
  resolveAvatar: (id: string) => string | null;
}) {
  return (
    <div className="max-h-[600px] overflow-auto rounded-xl border border-slate-200/70">
      <table className="min-w-full border-collapse">
        <thead className="sticky top-0 z-10" style={{ background: "#f9fafb" }}>
          <tr>
            <th className={`${HEAD_MAIN} sticky left-0 z-20 bg-[#f9fafb] text-left`}>Category</th>
            {rows.map((r) => (
              <th key={r.employeeId} className={`${HEAD_MAIN} min-w-[92px] text-center`}>
                <span className="flex flex-col items-center gap-1">
                  <Avatar name={r.employeeName} avatarUrl={resolveAvatar(r.employeeId)} size={22} />
                  <span className="max-w-[88px] truncate normal-case">{r.employeeName}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WORKLOAD_FAMILIES.map((f) => (
            <tr key={f.key} className="border-t border-slate-100">
              <td className="sticky left-0 z-10 bg-white px-2 py-2.5 text-[12.5px] font-bold text-slate-800">
                {f.label}
              </td>
              {rows.map((r) => (
                <td key={r.employeeId} className="px-2 py-2.5 text-center">
                  <WorkloadCountCell
                    value={splitOf(r, f.key).total}
                    target={totalTarget(targets, f.key)}
                    creatorId={r.employeeId}
                    creatorName={r.employeeName}
                    family={f.key}
                    relation="total"
                  />
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50/60">
            <td className="sticky left-0 z-10 bg-slate-50 px-2 py-2.5 text-[12.5px] font-black text-slate-900">
              G.T.
            </td>
            {rows.map((r) => (
              <td key={r.employeeId} className="px-2 py-2.5 text-center">
                <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap leading-none">
                  <span
                    className="text-base font-black tabular-nums md:text-lg"
                    style={{ color: attainColor(r.grandTotal, grandTotalTarget(targets)) }}
                  >
                    {r.grandTotal}
                  </span>
                  <span
                    className="text-xs font-bold tabular-nums opacity-80 md:text-sm"
                    style={{ color: attainColor(r.grandTotal, grandTotalTarget(targets)) }}
                  >
                    /{grandTotalTarget(targets)}
                  </span>
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── The section ──────────────────────────────────────────────────────────── */

export function CreatorWorkloadTable({
  avatarById,
}: {
  avatarById: Record<string, string | null>;
}) {
  const [open, setOpen] = React.useState(true);
  const [period, setPeriod] = React.useState<ActivityPeriod>(DEFAULT_ACTIVITY_PERIOD);
  const [custom, setCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [query, setQuery] = React.useState("");
  const [isTransposed, setIsTransposed] = React.useState(false);
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = React.useState<SortConfig<WorkloadSortKey>>({
    key: "name",
    direction: "asc",
  });

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "ok"; board: CreatorWorkloadBoard; forWindow: ActivityPeriod }
    | { kind: "error"; message: string; forWindow: ActivityPeriod }
  >({ kind: "loading" });

  // Derived, not set in the effect: stamping each result with the window it was
  // fetched for means a stale response for the previous window is ignored at
  // render time, so switching period shows "loading" without an extra pass.
  const showLoading = state.kind === "loading" || state.forWindow !== period;

  React.useEffect(() => {
    let cancelled = false;
    void getCreatorWorkloadBoard(period, custom).then((res) => {
      if (cancelled) return;
      if ("error" in res) setState({ kind: "error", message: res.error, forWindow: period });
      else setState({ kind: "ok", board: res, forWindow: period });
    });
    return () => {
      cancelled = true;
    };
  }, [period, custom]);

  const resolveAvatar = React.useCallback(
    (id: string) => avatarById[id] ?? null,
    [avatarById],
  );

  const allRows = React.useMemo(
    () => (state.kind === "ok" ? state.board.rows : []),
    [state],
  );
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allRows.filter((r) => r.employeeName.toLowerCase().includes(q))
      : allRows;
    return sortWorkloadRows(filtered, sortConfig.key, sortConfig.direction);
  }, [allRows, query, sortConfig]);

  const targets = state.kind === "ok" ? state.board.targets : null;

  // Clicking the ACTIVE column flips it; clicking a new one starts it in the
  // direction that column is actually read in — names ascend A→Z, counts
  // descend so the busiest person is on top.
  // A new column starts ascending; clicking the column that is already
  // ascending flips it to descending. Shared with the delegation board so one
  // click means the same thing in both sections.
  const onSort = React.useCallback(
    (k: WorkloadSortKey) => setSortConfig((cur) => nextSortConfig(cur, k)),
    [],
  );

  const toggleRow = React.useCallback((id: string) => {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allRowsOpen = rows.length > 0 && openIds.size === rows.length;
  const toggleAllRows = React.useCallback(() => {
    setOpenIds((cur) =>
      cur.size === rows.length ? new Set() : new Set(rows.map((r) => r.employeeId)),
    );
  }, [rows]);

  // A fragment, not a nested flex: DashboardSectionHeader's actions slot is
  // already the flex row, and wrapping again put this section's gutter under
  // its own control rather than the dashboard's.
  /* Built on press, off the sorted+searched `rows` actually on screen. The
     five-category sub-rows are included only for the employees the reader had
     expanded, so the PDF is the view rather than the whole dataset. */
  const buildReport = React.useCallback((): SectionReport => {
    const out: SectionReport = {
      title: "Who Is Creating How Much Work",
      subtitle: targets
        ? `Targets for this window: ${targets.goals} goals · ${targets.tasks} tasks · ${targets.commitments} commitments`
        : undefined,
      meta: [
        { label: "Date Range", value: periodLabel(period, custom) },
        ...(targets
          ? [
              {
                label: "Working days",
                value: `${targets.workingDays} of ${targets.calendarDays}`,
              },
            ]
          : []),
        ...(query.trim() ? [{ label: "Search", value: query.trim() }] : []),
      ],
      summary: `${rows.length} ${rows.length === 1 ? "person" : "people"}`,
      columns: [
        { label: "Employee", weight: 3, align: "left" },
        ...WORKLOAD_FAMILIES.map((f) => ({
          label: f.label,
          weight: 1.6,
          align: "right" as const,
        })),
        { label: "Grand Total", weight: 1.2, align: "right" },
      ],
      rows: [],
      depth: [],
    };
    for (const row of rows) {
      out.rows.push([
        row.employeeName,
        ...WORKLOAD_FAMILIES.map((f) => String(splitOf(row, f.key).total)),
        String(row.grandTotal),
      ]);
      out.depth!.push(0);
      if (!openIds.has(row.employeeId) || !targets) continue;
      for (const rel of WORKLOAD_RELATIONS) {
        out.rows.push([
          rel.label,
          ...WORKLOAD_FAMILIES.map((f) => {
            const v = splitOf(row, f.key)[rel.key];
            const t = cellTarget(targets, f.key, rel.key, row.directReports);
            return t != null ? `${v} / ${t}` : String(v);
          }),
          "",
        ]);
        out.depth!.push(1);
      }
    }
    return out;
  }, [rows, targets, period, custom, query, openIds]);

  const controls = (
    <>
      <SectionDispatch report={buildReport} />
      <SectionSearchBox query={query} onQuery={setQuery} placeholder="Search employee..." />
      <PeriodRangePicker
        period={period}
        custom={custom}
        onChange={(p, c) => {
          setPeriod(p);
          setCustom(c);
        }}
        controlClassName={SECTION_CONTROL}
      />
      {rows.length > 0 && !isTransposed && (
        <button
          type="button"
          onClick={toggleAllRows}
          aria-pressed={allRowsOpen}
          title={allRowsOpen ? "Collapse every breakdown" : "Expand every breakdown"}
          className={SECTION_CONTROL}
        >
          {allRowsOpen ? "Collapse all" : "Expand all"}
        </button>
      )}
      {rows.length > 0 && (
        <button
          type="button"
          onClick={() => setIsTransposed((v) => !v)}
          aria-pressed={isTransposed}
          title={isTransposed ? "Back to employees as rows" : "Transpose: categories as rows"}
          className={`${SECTION_CONTROL} ${isTransposed ? "text-altus-red" : ""}`}
        >
          <ArrowLeftRight className="size-3.5" strokeWidth={2.6} aria-hidden />
          Transpose
        </button>
      )}
      <CollapseToggle
        expanded={open}
        onToggle={() => setOpen((v) => !v)}
        label="the workload board"
      />
    </>
  );

  const body = (
    <>
      {showLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={18} className="animate-spin" strokeWidth={2.4} />
          <span className="text-[13.5px] font-semibold">Loading workload…</span>
        </div>
      )}

      {!showLoading && state.kind === "error" && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <p className="text-[14px] font-bold text-ink-soft">Could not load the workload board</p>
          <p className="max-w-[320px] text-[12.5px] font-semibold text-ink-subtle">
            {state.message}
          </p>
        </div>
      )}

      {!showLoading && state.kind === "ok" && rows.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <Users size={22} strokeWidth={2} className="text-gray-400" />
          <p className="text-[14px] font-bold text-ink-soft">
            {query.trim() ? "No employee matches that search" : "No active employees yet"}
          </p>
          <p className="max-w-[280px] text-[12.5px] font-semibold text-ink-subtle">
            {query.trim()
              ? "Clear the search to see the whole roster."
              : "Add people in Admin → Employees to populate this board."}
          </p>
        </div>
      )}

      {!showLoading && state.kind === "ok" && rows.length > 0 && targets && (
        <Tooltip.Provider delayDuration={200} skipDelayDuration={300}>
          {isTransposed ? (
            <TransposedTable rows={rows} targets={targets} resolveAvatar={resolveAvatar} />
          ) : (
            <div className="max-h-[600px] overflow-auto rounded-xl border border-slate-200/70">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-10" style={{ background: "#f9fafb" }}>
                  <tr>
                    <SortHead
                      label="Employee"
                      sortKey="name"
                      sortConfig={sortConfig}
                      onSort={onSort}
                      align="left"
                      className={`${HEAD_MAIN} text-left`}
                    />
                    {WORKLOAD_FAMILIES.map((f) => (
                      <SortHead
                        key={f.key}
                        label={f.label}
                        sortKey={`${f.key}Count`}
                        sortConfig={sortConfig}
                        onSort={onSort}
                        className={`${HEAD_MAIN} text-center`}
                      />
                    ))}
                    <SortHead
                      label={<>Grand&nbsp;Total (G.T.)</>}
                      sortKey="grandTotal"
                      sortConfig={sortConfig}
                      onSort={onSort}
                      className={`${HEAD_MAIN} text-center`}
                    />
                    <th className={`${HEAD_MAIN} text-center`}>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <EmployeeRow
                      key={row.employeeId}
                      row={row}
                      targets={targets}
                      resolveAvatar={resolveAvatar}
                      open={openIds.has(row.employeeId)}
                      onToggle={() => toggleRow(row.employeeId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tooltip.Provider>
      )}
    </>
  );

  return (
    <section className="relative min-w-0" aria-label="Creator workload board">
      <DashboardSectionHeader
        icon={<SectionIcon icon={Users} tone="red" />}
        title="Who Is Creating How Much Work"
        subtitle={
          targets
            ? `Targets for this window: ${targets.goals} goals · ${targets.tasks} tasks · ${targets.commitments} commitments (${targets.workingDays} working of ${targets.calendarDays} days)`
            : "Targets scale with the selected period"
        }
        actions={controls}
      />
      {/* CARD INSIDE THE FOLD, not around it.

          It was the other way round, under a comment claiming that was "how
          every other fold on this dashboard behaves". It is not: six of the
          nine sections put CollapsibleBody outermost, so collapsing takes the
          section down to its header. Here the padded, bordered card stayed
          mounted with nothing in it — an empty outlined strip under the title,
          on this section and two others. That is the box that made a collapsed
          dashboard look ragged. */}
      <CollapsibleBody expanded={open}>
        <div className={`w-full max-w-none overflow-hidden ${DASHBOARD_CARD_PADDED}`}>
          {body}
        </div>
      </CollapsibleBody>
    </section>
  );
}
