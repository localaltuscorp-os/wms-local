"use client";

import * as React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, Loader2, Users, ArrowLeftRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { SectionSearchBox } from "@/components/dashboard/section-chrome";
import { getManagerActivityBoard } from "@/app/(app)/dashboard/manager-activity-actions";
// From the CONTRACT module, not the query module. The query module is
// `server-only`, and these include VALUES — importing them from there puts a
// real module edge into the client graph and fails the production build. The
// types alone would have been fine; the constants are what broke it.
import {
  type ActivityTargets,
  type ManagerActivityBoard,
  type ManagerActivityRow,
  type MemberActivityRow,
  type ActivityPeriod,
  type CreatorSplits,
  DEFAULT_ACTIVITY_PERIOD,
} from "@/lib/dashboard/manager-activity-contract";
import {
  WORKLOAD_FAMILIES,
  WORKLOAD_RELATIONS,
  cellTarget,
  totalTarget,
  type WorkloadFamily,
} from "@/lib/dashboard/creator-workload-contract";
import {
  WorkloadCountCell,
  SortHead,
  HEAD_MAIN,
  HEAD_SUB,
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
   WHO IS DELEGATING, AND HOW MUCH.

   Three levels, and every one of them answers the same question about a
   different scope:

     MANAGER ROW    the whole line — the manager plus their direct reports —
                    against a target scaled to that many people.
     MEMBER ROW     one person in that line: what THEY created, split into
                    what they kept (Self Created) and what they handed on
                    (Delegated Out).
     CATEGORY ROW   where the handed-on work actually went: Self, Downward,
                    Counterpart, Upward, Founder.

   ── WHY THE COLUMNS CHANGED MEANING ──────────────────────────────────────
   The sub-columns used to be A / B / G.T., where A meant "delegated to this
   member BY this manager" and B meant "originated by anyone else". Renaming
   them Self Created / Delegated Out is not a relabelling, it is a reframing:
   those two are properties of an AUTHOR, not of a recipient. So every row on
   this board now reads as "what this person created", which is what makes the
   five category sub-rows decompose it exactly —

       Self Created  = Self
       Delegated Out = Downward + Counterpart + Upward + Founder

   — and it is what the section title asked for all along. The received-side
   numbers are still on the row (`goals`/`tasks`/`commitments`) and still feed
   the drill-downs; they are simply no longer what the columns show.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * THE BREAKDOWN COLUMN IS RESERVED, in both states.
 *
 * This is what made the collapse trigger vanish. The outer table is
 * `min-w-full` with auto layout inside a scroll box, so its columns are sized
 * from their content — and expanding a manager drops an eleven-column nested
 * table into a `colSpan` cell on the row below. That cell's content is far
 * wider than the six columns above it, the table grows to fit, and the
 * rightmost column is pushed past the right edge of the scroll box. The header
 * and the button were still rendered; they were simply off-screen, reachable
 * only by scrolling sideways, which reads exactly like a missing button.
 *
 * A fixed width on the header AND the cell keeps the column the same size
 * whether the row is open or shut, so the toggle stays where the reader left
 * it. The nested table scrolls inside its own container rather than widening
 * the one above it.
 */
const BREAKDOWN_COL = "w-36 min-w-[140px] text-right pr-6";

/** Delegated Out is everything the person created that was not for themselves. */
function delegatedOut(split: CreatorSplits[WorkloadFamily]): number {
  return split.total - split.self;
}

/** A roster's created total for one family, and the target for that many people. */
function rosterTotals(row: ManagerActivityRow, family: WorkloadFamily) {
  const actual = row.members.reduce((s, m) => s + m.created[family].total, 0);
  return { actual, headcount: row.members.length };
}

/* ── Sorting ──────────────────────────────────────────────────────────────
   The top-level table sorts managers; each expanded member table sorts its own
   members. Both use the same key space, so one comparator serves both.

   `<family>Count` is the family's whole total — it is the key behind BOTH the
   top-level family header and the nested "Total Goals / Tasks / Commitments"
   sub-header, because those two headers stand over the same number at two
   levels of the same table. `Self` and `Out` name the two sub-columns that
   only exist in the nested table.

   The brief also lists `goalsTarget` / `tasksTarget` / `commitmentsTarget` for
   sorting by attainment RATIO. They are not wired, because there is no header
   they would hang off: a family owns exactly one clickable header per level,
   and quietly making it sort by ratio while displaying a count would mean the
   column no longer sorts by the number in it. Adding a ratio sort needs a
   header to trigger it, which is a UI decision, not a wiring one. */

type FamilySlice = "Self" | "Out" | "Count";
type NumericKey = `${WorkloadFamily}${FamilySlice}` | "grandTotal";
type SortKey = "name" | NumericKey;

function sliceValue(created: CreatorSplits, key: NumericKey, grand: number): number {
  if (key === "grandTotal") return grand;
  const slice: FamilySlice = key.endsWith("Self")
    ? "Self"
    : key.endsWith("Out")
      ? "Out"
      : "Count";
  const family = key.slice(0, key.length - slice.length) as WorkloadFamily;
  const split = created[family];
  return slice === "Self" ? split.self : slice === "Out" ? delegatedOut(split) : split.total;
}

/* ── The five-category sub-rows under one member ──────────────────────────── */

function CategoryRows({
  member,
  targets,
  colSpanTail,
}: {
  member: MemberActivityRow;
  targets: ActivityTargets;
  /** How many trailing columns to blank out so the grid keeps its rhythm. */
  colSpanTail: number;
}) {
  return (
    <>
      {WORKLOAD_RELATIONS.map((rel) => (
        <tr key={rel.key} className="border-b border-gray-50 bg-gray-50/50 last:border-b-0">
          <td className="py-1 pl-10 pr-2">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[11.5px] font-bold text-slate-700">{rel.label}</span>
              <span className="truncate text-[10px] font-medium text-slate-400">{rel.hint}</span>
            </span>
          </td>
          {WORKLOAD_FAMILIES.map((f) => {
            const value = member.created[f.key][rel.key];
            /* Quota where one exists; otherwise this relation's slice of the
               person's own family total, so every sub-row reads x/y. See the
               `denominator` prop in workload-cell.tsx for why a share must not
               borrow the attainment palette. */
            const quota = cellTarget(targets, f.key, rel.key, member.directReports);
            const famTotal = member.created[f.key].total;
            const target = quota ?? famTotal;
            return (
              // A category is ONE number, so it sits under the family's middle
              // sub-column rather than being repeated across all three: three
              // copies of the same figure would imply three different cuts.
              <React.Fragment key={f.key}>
                <td className="border-l border-gray-100" />
                <td className="px-2 py-1 text-center">
                  <WorkloadCountCell
                    tone="red"
                    value={value}
                    target={target}
                    denominator={quota != null ? "target" : "share"}
                    creatorId={member.employeeId}
                    creatorName={member.employeeName}
                    family={f.key}
                    relation={rel.key}
                  />
                </td>
                <td />
              </React.Fragment>
            );
          })}
          <td colSpan={colSpanTail} />
        </tr>
      ))}
    </>
  );
}

/* ── One member row (+ its category rows) ─────────────────────────────────── */

function MemberRow({
  member,
  targets,
  resolveAvatar,
  open,
  onToggle,
}: {
  member: MemberActivityRow;
  targets: ActivityTargets;
  resolveAvatar: (id: string) => string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50/70">
        <td className="px-3 py-1.5">
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} the delegation split for ${member.employeeName}`}
              title={open ? "Hide delegation split" : "Show delegation split"}
              className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <ChevronDown
                size={13}
                strokeWidth={2.8}
                className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </button>
            <Avatar name={member.employeeName} avatarUrl={resolveAvatar(member.employeeId)} size={24} />
            <span
              className="truncate text-[12.5px] font-bold"
              style={{ color: "var(--color-ink-strong)" }}
              title={member.employeeName}
            >
              {member.isSelf ? "Self" : member.employeeName}
            </span>
            {member.isSelf && (
              <span className="shrink-0 rounded-pill bg-gray-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-gray-500">
                {member.employeeName}
              </span>
            )}
          </span>
        </td>

        {WORKLOAD_FAMILIES.map((f) => {
          const split = member.created[f.key];
          const out = delegatedOut(split);
          // Self Created carries the FLAT per-person rate — 3 goals a week,
          // 5 tasks a day, 5 commitments a day — not the window-multiplied
          // figure. Delegated Out carries the Downward quota, which does scale
          // with the window and this person's own headcount; it is the only
          // slice of "out" the business sets a number for.
          const selfTarget = cellTarget(targets, f.key, "self", member.directReports);
          const outTarget = cellTarget(targets, f.key, "downward", member.directReports);
          return (
            <React.Fragment key={f.key}>
              <td className="border-l border-gray-100 px-2 py-1.5 text-center">
                <WorkloadCountCell
                  tone="red"
                  value={split.self}
                  target={selfTarget}
                  creatorId={member.employeeId}
                  creatorName={member.employeeName}
                  family={f.key}
                  relation="self"
                />
              </td>
              <td className="px-2 py-1.5 text-center">
                <WorkloadCountCell
                  tone="red"
                  value={out}
                  target={outTarget}
                  creatorId={member.employeeId}
                  creatorName={member.employeeName}
                  family={f.key}
                  relation="delegated"
                />
              </td>
              <td className="px-2 py-1.5 text-center">
                {/* The window's family quota, NOT Self + Delegated Out. Adding
                    those two would compare a sum to neither denominator — the
                    Self rate is per-day and the Downward rate is per-window —
                    which is why this cell had none at all. `totalTarget` is a
                    single coherent number instead. */}
                <WorkloadCountCell
                  tone="red"
                  value={split.total}
                  target={totalTarget(targets, f.key)}
                  creatorId={member.employeeId}
                  creatorName={member.employeeName}
                  family={f.key}
                  relation="total"
                />
              </td>
            </React.Fragment>
          );
        })}

        <td className="border-l border-gray-100 px-2 py-1.5 text-center">
          {/* Standalone count, matched to the numerator scale beside it —
              size and weight in classes because an inline fontSize cannot
              carry a `md:` step and would override one. Brand red, with the
              rest of this board's figures. */}
          <span
            className="text-base font-black tabular-nums md:text-lg"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              color: "var(--color-altus-red)",
            }}
          >
            {member.createdTotal}
          </span>
        </td>
      </tr>
      {open && <CategoryRows member={member} targets={targets} colSpanTail={1} />}
    </>
  );
}

/* ── The nested member table under one manager ────────────────────────────── */

function MemberBreakdown({
  members,
  targets,
  resolveAvatar,
  openMembers,
  onToggleMember,
}: {
  members: MemberActivityRow[];
  targets: ActivityTargets;
  resolveAvatar: (id: string) => string | null;
  openMembers: ReadonlySet<string>;
  onToggleMember: (id: string) => void;
}) {
  // Each nested table sorts its OWN members. Local state on purpose: sorting
  // one manager's people is not a statement about anyone else's.
  const [sortConfig, setSortConfig] = React.useState<SortConfig<SortKey>>({
    key: "name",
    direction: "asc",
  });
  const onSort = React.useCallback(
    (k: SortKey) => setSortConfig((cur) => nextSortConfig(cur, k)),
    [],
  );

  const sorted = React.useMemo(() => {
    const { key: sortKey, direction } = sortConfig;
    if (!direction) return members;
    const flip = direction === "asc" ? 1 : -1;
    // Self always leads regardless of sort: it is the manager's own line, and
    // burying it among their reports loses the comparison the row exists for.
    const copy = [...members];
    copy.sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      if (sortKey === "name") return flip * a.employeeName.localeCompare(b.employeeName);
      const d =
        sliceValue(a.created, sortKey, a.createdTotal) -
        sliceValue(b.created, sortKey, b.createdTotal);
      return d !== 0 ? flip * d : a.employeeName.localeCompare(b.employeeName);
    });
    return copy;
  }, [members, sortConfig]);

  return (
    // `max-w-full` is the half that matters: an overflow container inside a
    // table cell will otherwise resolve to its content's width, which is what
    // let the nested grid stretch the table above it.
    <div className="max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full border-collapse">
        <thead>
          {/* Two header rows: the family spans its three sub-columns, so a
              sub-header is never read without knowing what it counts. */}
          <tr className="border-b border-gray-100">
            <SortHead
              label="Member"
              sortKey="name"
              sortConfig={sortConfig}
              onSort={onSort}
              align="left"
              className={`${HEAD_SUB} text-left`}
              rowSpan={2}
            />
            {WORKLOAD_FAMILIES.map((f) => (
              <th
                key={f.key}
                className={`${HEAD_MAIN} border-l border-gray-100 text-center`}
                colSpan={3}
              >
                {f.label}
              </th>
            ))}
            <SortHead
              label={<>Grand&nbsp;Total</>}
              sortKey="grandTotal"
              sortConfig={sortConfig}
              onSort={onSort}
              className={`${HEAD_MAIN} border-l border-gray-100 text-center`}
              rowSpan={2}
            />
          </tr>
          <tr className="border-b border-gray-200">
            {WORKLOAD_FAMILIES.map((f) => (
              <React.Fragment key={f.key}>
                <SortHead
                  label="Self Created"
                  sortKey={`${f.key}Self`}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  className={`${HEAD_SUB} border-l border-gray-100 text-center`}
                  title="Created by this person, for themselves"
                />
                <SortHead
                  label="Delegated Out"
                  sortKey={`${f.key}Out`}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  className={`${HEAD_SUB} text-center`}
                  title="Created by this person, for someone else"
                />
                <SortHead
                  label={f.totalLabel}
                  sortKey={`${f.key}Count`}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  className={`${HEAD_SUB} text-center`}
                  title="Self Created + Delegated Out"
                />
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((mem) => (
            <MemberRow
              key={mem.employeeId}
              member={mem}
              targets={targets}
              resolveAvatar={resolveAvatar}
              open={openMembers.has(mem.employeeId)}
              onToggle={() => onToggleMember(mem.employeeId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── One manager row ──────────────────────────────────────────────────────── */

function ManagerRow({
  row,
  targets,
  resolveAvatar,
  open,
  onToggle,
  openMembers,
  onToggleMember,
}: {
  row: ManagerActivityRow;
  targets: ActivityTargets;
  resolveAvatar: (id: string) => string | null;
  open: boolean;
  onToggle: () => void;
  openMembers: ReadonlySet<string>;
  onToggleMember: (id: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 transition-colors hover:bg-gray-50/80">
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2.5">
            <Avatar name={row.managerName} avatarUrl={resolveAvatar(row.managerId)} size={30} />
            <span className="min-w-0">
              <span
                className="block truncate text-[13.5px] font-bold"
                style={{ color: "var(--color-ink-strong)" }}
                title={row.managerName}
              >
                {row.managerName}
              </span>
              <span className="block text-[11px] font-semibold text-ink-subtle">
                {row.directReports} direct {row.directReports === 1 ? "report" : "reports"}
              </span>
            </span>
          </span>
        </td>

        {WORKLOAD_FAMILIES.map((f) => {
          // The manager ROW is the whole LINE — the manager plus their reports
          // — because that is the scope a manager is answerable for. Their own
          // personal line is the "Self" row inside the breakdown.
          //
          // The denominator is HEADCOUNT, not directReports: the numerator
          // already includes the manager's own output, and quoting it against
          // a quota for everyone-but-them would compare N people's work to
          // N-1 people's target.
          const { actual, headcount } = rosterTotals(row, f.key);
          const target = targets[f.key] * headcount;
          return (
            <td key={f.key} className="px-2 py-2.5 text-center">
              <WorkloadCountCell
                tone="red"
                value={actual}
                target={target}
                creatorId={row.managerId}
                creatorName={row.managerName}
                family={f.key}
                relation="total"
                sentence={`${row.managerName}'s line (${headcount} ${
                  headcount === 1 ? "person" : "people"
                }) created ${actual} ${f.noun} out of a target of ${target} in this window.`}
              />
            </td>
          );
        })}

        <td className="px-2 py-2.5 text-center">
          <span
            className="text-base font-black tabular-nums md:text-lg"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              color: "var(--color-altus-red)",
            }}
          >
            {row.members.reduce((s, m) => s + m.createdTotal, 0)}
          </span>
        </td>

        <td className={`${BREAKDOWN_COL} py-2.5`}>
          {/* Open state gets a filled chip and a real ChevronUp, not a rotated
              ChevronDown: at 13px a rotation is a weak signal, and this is the
              one control a reader hunts for when a row is already expanded. */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} the breakdown for ${row.managerName}`}
            title={open ? "Hide breakdown" : "Show breakdown"}
            className={`ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              open
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Breakdown
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
            )}
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          {/* One cell spanning the parent row: the nested table has its own
              column rhythm (eleven narrow numeric columns), and forcing it into
              the parent's six would squeeze both. */}
          {/* colSpan covers every column of the row above — name, the three
              families, Grand Total, Breakdown — so the expanded panel starts
              and ends exactly where that row does. */}
          <td colSpan={WORKLOAD_FAMILIES.length + 3} className="bg-gray-50/60 px-3 py-3">
            <MemberBreakdown
              members={row.members}
              targets={targets}
              resolveAvatar={resolveAvatar}
              openMembers={openMembers}
              onToggleMember={onToggleMember}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Transposed ───────────────────────────────────────────────────────────── */

/**
 * Categories become rows, managers become columns. Reads the SAME rows the
 * standard view does — nothing is recomputed, so the two orientations cannot
 * disagree about a number. Only the axes swap.
 *
 * THE BREAKDOWN IS NOT NESTED INSIDE A COLUMN. A manager's breakdown is an
 * eleven-column table of its own, and dropping that into one narrow manager
 * column would either blow the column out or crush the nested table. It renders
 * instead as a full-width row spanning every column, one per open manager,
 * titled with the manager it belongs to.
 */
function TransposedActivityTable({
  rows,
  targets,
  resolveAvatar,
  openIds,
  onToggleRow,
  openMembers,
  onToggleMember,
}: {
  rows: ManagerActivityRow[];
  targets: ActivityTargets;
  resolveAvatar: (id: string) => string | null;
  openIds: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  openMembers: ReadonlySet<string>;
  onToggleMember: (id: string) => void;
}) {
  // The first column is frozen: with a manager per column the grid scrolls
  // sideways, and a category label that scrolls out of view leaves a row of
  // bare numbers meaning nothing.
  const stickyHead = `${HEAD_MAIN} sticky left-0 z-20 text-left`;
  const stickyCell =
    "sticky left-0 z-10 bg-white px-3 py-2.5 text-[12.5px] font-bold text-ink-strong";

  return (
    <div className="max-h-[600px] overflow-auto">
      <table className="min-w-full border-collapse">
        <thead className="sticky top-0 z-30" style={{ background: "#f9fafb" }}>
          <tr>
            <th className={stickyHead} style={{ background: "#f9fafb" }}>
              Category
            </th>
            {rows.map((r) => (
              <th key={r.managerId} className={`${HEAD_MAIN} text-center`}>
                <span className="inline-flex flex-col items-center gap-1">
                  <Avatar name={r.managerName} avatarUrl={resolveAvatar(r.managerId)} size={26} />
                  <span className="max-w-[14ch] truncate normal-case" title={r.managerName}>
                    {r.managerName}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WORKLOAD_FAMILIES.map((f) => (
            <tr key={f.key} className="border-b border-gray-100 transition-colors hover:bg-gray-50/80">
              <td className={stickyCell}>{f.label}</td>
              {rows.map((r) => {
                const { actual, headcount } = rosterTotals(r, f.key);
                const target = targets[f.key] * headcount;
                return (
                  <td key={r.managerId} className="whitespace-nowrap px-2 py-2.5 text-center">
                    <WorkloadCountCell
                      tone="red"
                      value={actual}
                      target={target}
                      creatorId={r.managerId}
                      creatorName={r.managerName}
                      family={f.key}
                      relation="total"
                      sentence={`${r.managerName}'s line (${headcount} ${
                        headcount === 1 ? "person" : "people"
                      }) created ${actual} ${f.noun} out of a target of ${target} in this window.`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}

          <tr className="border-b border-gray-200 bg-gray-50/40">
            <td className={`${stickyCell} bg-gray-50`}>Grand Total</td>
            {rows.map((r) => (
              <td
                key={r.managerId}
                className="px-2 py-2.5 text-center text-base font-black tabular-nums md:text-lg"
                style={{ color: "var(--color-altus-red)" }}
              >
                {r.members.reduce((s, m) => s + m.createdTotal, 0)}
              </td>
            ))}
          </tr>

          <tr className="border-b border-gray-100">
            <td className={stickyCell}>Breakdown</td>
            {rows.map((r) => {
              const isOpen = openIds.has(r.managerId);
              return (
                <td key={r.managerId} className="px-2 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => onToggleRow(r.managerId)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Hide" : "Show"} the breakdown for ${r.managerName}`}
                    title={isOpen ? "Hide breakdown" : "Show breakdown"}
                    // Same two states as the standard view's trigger: an open
                    // row's control is filled and points UP, so the two
                    // orientations do not teach different affordances.
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                      isOpen
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
                    )}
                  </button>
                </td>
              );
            })}
          </tr>

          {rows
            .filter((r) => openIds.has(r.managerId))
            .map((r) => (
              <tr key={`breakdown-${r.managerId}`}>
                <td colSpan={rows.length + 1} className="bg-gray-50/60 px-3 py-3">
                  {/* Named, because in this orientation the breakdown is no
                      longer physically under its manager's column. */}
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                    {r.managerName}
                  </p>
                  <MemberBreakdown
                    members={r.members}
                    targets={targets}
                    resolveAvatar={resolveAvatar}
                    openMembers={openMembers}
                    onToggleMember={onToggleMember}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── The section ──────────────────────────────────────────────────────────── */

export function ManagerActivityTable({
  avatarById = {},
}: {
  avatarById?: Record<string, string | null>;
}) {
  const [period, setPeriod] = React.useState<ActivityPeriod>(DEFAULT_ACTIVITY_PERIOD);
  // The APPLIED range — only set on Apply, so dragging the date inputs never
  // refetches mid-edit.
  const [custom, setCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [open, setOpen] = React.useState(true);
  // Orientation is kept OUTSIDE the fetch state: transposing is a rendering
  // choice over a board already in hand and must never trigger a refetch.
  const [isTransposed, setIsTransposed] = React.useState(false);
  const [openIds, setOpenIds] = React.useState<ReadonlySet<string>>(new Set());
  // Which MEMBER rows have their five-category split open. Shared across both
  // orientations, so transposing does not silently close them.
  const [openMembers, setOpenMembers] = React.useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = React.useState("");
  const [sortConfig, setSortConfig] = React.useState<SortConfig<SortKey>>({
    key: "name",
    direction: "asc",
  });

  const [state, setState] = React.useState<
    | { kind: "loading"; forWindow?: ActivityPeriod }
    | { kind: "error"; message: string; forWindow: ActivityPeriod }
    | { kind: "ok"; board: ManagerActivityBoard; forWindow: ActivityPeriod }
  >({ kind: "loading" });

  // Derived, not set in the effect: stamping each result with the window it was
  // fetched for means a stale response for the previous window is ignored
  // during render, so switching shows "loading" without an extra render pass.
  const showLoading = state.kind === "loading" || state.forWindow !== period;

  React.useEffect(() => {
    let cancelled = false;
    void getManagerActivityBoard(period, custom).then((res) => {
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

  // The search matches the manager AND their members, so typing a report's name
  // surfaces the manager whose row contains them — otherwise searching for
  // someone who is not a manager returns nothing, which on a delegation board
  // is the wrong answer to an obvious question.
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allRows.filter(
          (r) =>
            r.managerName.toLowerCase().includes(q) ||
            r.members.some((m) => m.employeeName.toLowerCase().includes(q)),
        )
      : allRows;
    const { key: sortKey, direction } = sortConfig;
    if (!direction) return filtered;
    const flip = direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return flip * a.managerName.localeCompare(b.managerName);
      // Managers are ranked on their LINE's numbers, which is what their row
      // shows — ranking the row by the manager's personal output would sort a
      // column by a figure that is not in it.
      const val = (r: ManagerActivityRow) =>
        r.members.reduce((s, m) => s + sliceValue(m.created, sortKey, m.createdTotal), 0);
      const d = val(a) - val(b);
      return d !== 0 ? flip * d : a.managerName.localeCompare(b.managerName);
    });
  }, [allRows, query, sortConfig]);

  const targets = state.kind === "ok" ? state.board.targets : null;

  const onSort = React.useCallback(
    (k: SortKey) => setSortConfig((cur) => nextSortConfig(cur, k)),
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

  const toggleMember = React.useCallback((id: string) => {
    setOpenMembers((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Expand all opens BOTH levels. A control that opened the managers and left
  // every member still folded would need a second click on every row to reach
  // the thing it was pressed for.
  // `every`, not a size comparison. The open set survives filtering, so after
  // a search `openIds.size` can equal `rows.length` while naming managers the
  // search has hidden — the label would then read "Collapse all" over rows that
  // are all shut.
  const allRowsOpen = rows.length > 0 && rows.every((r) => openIds.has(r.managerId));
  const toggleAllRows = React.useCallback(() => {
    if (allRowsOpen) {
      setOpenIds(new Set());
      setOpenMembers(new Set());
      return;
    }
    setOpenIds(new Set(rows.map((r) => r.managerId)));
    setOpenMembers(new Set(rows.flatMap((r) => r.members.map((m) => m.employeeId))));
  }, [rows, allRowsOpen]);

  // A fragment, not a nested flex: DashboardSectionHeader's actions slot is
  // already the flex row, and wrapping again put this section's gutter under
  // its own control rather than the dashboard's.
  /* THE EXPORT SNAPSHOT — built when the button is pressed, never before.
     It walks `rows`, which is the SORTED, SEARCHED list actually on screen, and
     descends into the members and their five categories, so the PDF carries the
     reader's whole view rather than a fresh unfiltered query. */
  const buildReport = React.useCallback((): SectionReport => {
    const out: SectionReport = {
      title: "Who is delegating, and how much",
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
      summary: `${rows.length} ${rows.length === 1 ? "manager" : "managers"}`,
      columns: [
        { label: "Manager / Member", weight: 3, align: "left" },
        ...WORKLOAD_FAMILIES.flatMap((f) => [
          { label: `${f.label} - Self`, weight: 1.4, align: "right" as const },
          { label: `${f.label} - Out`, weight: 1.4, align: "right" as const },
          { label: f.totalLabel, weight: 1.3, align: "right" as const },
        ]),
        { label: "Grand Total", weight: 1.2, align: "right" },
      ],
      rows: [],
      depth: [],
    };
    const push = (cells: string[], depth: number) => {
      out.rows.push(cells);
      out.depth!.push(depth);
    };
    for (const row of rows) {
      const line = WORKLOAD_FAMILIES.flatMap((f) => {
        const { actual, headcount } = rosterTotals(row, f.key);
        return ["-", "-", `${actual} / ${targets ? targets[f.key] * headcount : 0}`];
      });
      push(
        [
          `${row.managerName} (${row.directReports} direct ${row.directReports === 1 ? "report" : "reports"})`,
          ...line,
          String(row.members.reduce((s, m) => s + m.createdTotal, 0)),
        ],
        0,
      );
      // Members and their categories only when the reader had them OPEN — the
      // export is a snapshot of the view, not of everything behind it.
      if (!openIds.has(row.managerId)) continue;
      for (const mem of row.members) {
        push(
          [
            mem.isSelf ? `Self - ${mem.employeeName}` : mem.employeeName,
            ...WORKLOAD_FAMILIES.flatMap((f) => {
              const split = mem.created[f.key];
              const selfT = cellTarget(targets!, f.key, "self", mem.directReports);
              const outT = cellTarget(targets!, f.key, "downward", mem.directReports);
              return [
                selfT != null ? `${split.self} / ${selfT}` : String(split.self),
                outT != null ? `${delegatedOut(split)} / ${outT}` : String(delegatedOut(split)),
                String(split.total),
              ];
            }),
            String(mem.createdTotal),
          ],
          1,
        );
        if (!openMembers.has(mem.employeeId)) continue;
        for (const rel of WORKLOAD_RELATIONS) {
          push(
            [
              rel.label,
              ...WORKLOAD_FAMILIES.flatMap((f) => {
                const v = mem.created[f.key][rel.key];
                const t = cellTarget(targets!, f.key, rel.key, mem.directReports);
                return ["", t != null ? `${v} / ${t}` : String(v), ""];
              }),
              "",
            ],
            2,
          );
        }
      }
    }
    return out;
  }, [rows, targets, period, custom, query, openIds, openMembers]);

  const controls = (
    <>
      <SectionDispatch report={buildReport} />
      <SectionSearchBox
        query={query}
        onQuery={setQuery}
        placeholder="Search manager or report..."
      />
      <PeriodRangePicker
        period={period}
        custom={custom}
        onChange={(p, c) => {
          setPeriod(p);
          setCustom(c);
        }}
        controlClassName={SECTION_CONTROL}
      />
      {rows.length > 0 && (
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
      {/* Transpose sits with the collapse control, the same place the Aging
          Heatmap and Status by Doer put theirs: both change the section's SHAPE
          rather than what it contains. */}
      {rows.length > 0 && (
        <button
          type="button"
          onClick={() => setIsTransposed((v) => !v)}
          aria-pressed={isTransposed}
          title={isTransposed ? "Back to managers as rows" : "Transpose: categories as rows"}
          className={`${SECTION_CONTROL} ${isTransposed ? "text-altus-red" : ""}`}
        >
          <ArrowLeftRight className="size-3.5" strokeWidth={2.6} aria-hidden />
          Transpose
        </button>
      )}
      <CollapseToggle
        expanded={open}
        onToggle={() => setOpen((v) => !v)}
        label="the activity board"
      />
    </>
  );

  const body = (
    <>
      {showLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={18} className="animate-spin" strokeWidth={2.4} />
          <span className="text-[13.5px] font-semibold">Loading activity…</span>
        </div>
      )}

      {!showLoading && state.kind === "error" && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <p className="text-[14px] font-bold text-ink-soft">Could not load the activity board</p>
          <p className="max-w-[320px] text-[12.5px] font-semibold text-ink-subtle">
            {state.message}
          </p>
        </div>
      )}

      {!showLoading && state.kind === "ok" && rows.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <Users size={22} strokeWidth={2} className="text-gray-400" />
          <p className="text-[14px] font-bold text-ink-soft">
            {query.trim()
              ? "No manager or report matches that search"
              : "No managers with direct reports yet"}
          </p>
          <p className="max-w-[280px] text-[12.5px] font-semibold text-ink-subtle">
            {query.trim()
              ? "Clear the search to see every line."
              : "Assign reporting lines in Admin → Employees to populate this board."}
          </p>
        </div>
      )}

      {!showLoading && state.kind === "ok" && rows.length > 0 && targets && (
        <Tooltip.Provider delayDuration={200} skipDelayDuration={300}>
          {isTransposed ? (
            <TransposedActivityTable
              rows={rows}
              targets={targets}
              resolveAvatar={resolveAvatar}
              openIds={openIds}
              onToggleRow={toggleRow}
              openMembers={openMembers}
              onToggleMember={toggleMember}
            />
          ) : (
            /* The 600px scroll box. `overflow-x-auto` alongside it because the
               table is `min-w-full` with a column per family, so on a narrow
               viewport it DOES exceed its card; the border and radius give the
               grid a visible boundary inside the card instead of letting rows
               reach the card's own edge. */
            <div className="max-h-[600px] overflow-auto rounded-xl border border-slate-200/70">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-10" style={{ background: "#f9fafb" }}>
                  <tr>
                    <SortHead
                      label="Manager / Initiator"
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
                    <th className={`${HEAD_MAIN} ${BREAKDOWN_COL}`}>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <ManagerRow
                      key={row.managerId}
                      row={row}
                      targets={targets}
                      resolveAvatar={resolveAvatar}
                      open={openIds.has(row.managerId)}
                      onToggle={() => toggleRow(row.managerId)}
                      openMembers={openMembers}
                      onToggleMember={toggleMember}
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
    <section className="relative min-w-0" aria-label="Manager activity board">
      <DashboardSectionHeader
        icon={<SectionIcon icon={Users} tone="blue" />}
        title="Who is delegating, and how much"
        subtitle={
          targets
            ? `Targets for this window: ${targets.goals} goals · ${targets.tasks} tasks · ${targets.commitments} commitments (${targets.workingDays} working of ${targets.calendarDays} days)`
            : "Targets scale with the selected period"
        }
        actions={controls}
      />
      <div className={`w-full max-w-none overflow-hidden ${DASHBOARD_CARD_PADDED}`}>
        {/* Card OUTSIDE, body inside: collapsed, this leaves the card shell as a
            thin empty bar under the header rather than removing it outright,
            which is how every other fold on this dashboard behaves. */}
        <CollapsibleBody expanded={open}>{body}</CollapsibleBody>
      </div>
    </section>
  );
}
