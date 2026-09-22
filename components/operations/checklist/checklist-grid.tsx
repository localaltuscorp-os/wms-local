"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  CHECK_STATUSES,
  checkStatusLabel,
  checkStatusStyle,
  checklistProgress,
  type CheckStatus,
  type ChecklistItemRow,
  type ChecklistPersonRow,
  type ChecklistRunRow,
} from "@/lib/operations/checklist";
import {
  ariaSort,
  describeSort,
  nextSort,
  sortChecklistRows,
  type SortKey,
  type SortState,
} from "@/lib/operations/checklist-sort";
import {
  OFFSET_MAX,
  OFFSET_MIN,
  PHASE_LABELS,
  PHASE_ORDER,
  compareRows,
  daysBetween,
  formatDMY,
  isSunday,
  phaseFor,
  targetDate,
  variance,
  type ChecklistPhase,
} from "@/lib/operations/checklist-dates";
import {
  FREQUENCIES,
  currentOccurrence,
  frequencyOf,
  frequencyText,
  reanchorRule,
  repeatText,
  ruleForFrequency,
  type Frequency,
} from "@/lib/operations/checklist-frequency";
import {
  dateFromYmd,
  detectPreset,
  humanSummary,
  presetOptions,
  ruleForPreset,
  type PresetKey,
} from "@/lib/recurrence/google-recurrence";
import {
  approverDisplay,
  selectableApproverChoices,
  canRuleOn,
  type ApproverActor,
} from "@/lib/status/approver-status";
import {
  createChecklistItem,
  removeChecklistItem,
  setChecklistApprover,
  setChecklistCheck,
  updateChecklistItem,
  updateChecklistRun,
} from "@/app/(app)/operations/checklist/actions";
import { ApproverChip } from "@/components/status/approver-chip";
import { ClientSelect } from "@/components/tasks/client-select";
import { SubjectSelect } from "@/components/tasks/subject-select";
import { CustomRecurrenceDialog } from "@/components/recurrence/custom-recurrence-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import { useAutoHeight } from "@/components/ui/use-auto-height";
import { ColumnGrip, headShadow, useColumnDrag, useSavedColumnOrder, type ColumnDragControl } from "@/components/ui/column-drag";
import { ChecklistTaskDialog } from "@/components/operations/checklist/checklist-task-dialog";
import { ChecklistBulkUpload } from "@/components/operations/checklist/checklist-bulk-upload";
import { CompactSelect } from "@/components/ui/compact-select";

const ACCENT_DEEP = "#A80400";

/** Today, as a calendar date, for the running-lateness figure. */
function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** DD/MM/YYYY HH:MM in IST — the Actual Date column. */
function formatActual(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** The calendar date a row was marked Done, for variance. */
function actualYmd(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

/** The date a row is set for — the event date plus its offset, or the typed date. */
function anchorOf(run: ChecklistRunRow, item: ChecklistItemRow): string | null {
  return run.isEvent ? targetDate(run.eventDate, item.offsetDays) : item.targetDate;
}

/**
 * The Target Date the row is measured against: its own date, or — for a
 * repeating row — the occurrence that is due now (or was due when it was done).
 */
function dueOf(run: ChecklistRunRow, item: ChecklistItemRow, today: string): string | null {
  return currentOccurrence(anchorOf(run, item), item.recurrenceRule, actualYmd(item.doneAt) ?? today);
}

/** The viewer, for deciding who may rule on a row (lib/status/approver-status.ts). */
export interface ChecklistViewer {
  id: string;
  /** Admin or super-admin. */
  isAdmin: boolean;
  /** Everyone below the viewer — the doers whose work they may rule on. */
  managedIds: string[];
}

export interface ChecklistGridProps {
  run: ChecklistRunRow;
  items: ChecklistItemRow[];
  people: ChecklistPersonRow[];
  canEdit: boolean;
  me: ChecklistViewer;
  /** The WMS Tasks client roster (Admin Panel → Clients). */
  clients: string[];
  /** The WMS Tasks subject roster (Admin Panel → Subjects). */
  subjects: string[];
  /** May this viewer add a client or subject to the roster from the picker? */
  canAddRoster: boolean;
}

/**
 * THE EVENT CHECKLIST GRID — in the WMS Tasks column order (account holder,
 * 2026-09-18): S. No. · Client · Subject · Task · Doer · Initiator · Target
 * Date · Frequency · Doer Status · Doer Notes · Actual Date · +/- Days ·
 * Approver Status · Approver Notes.
 *
 * Rows still group under Before / During / After by the SIGN of their offset,
 * and every date on an event checklist still derives from one number — the
 * run's event date — so moving the event moves the whole plan in one write.
 * Picking a Target Date on an event row stores it as days from the event.
 *
 * ── WHY EDITS SAVE PER CELL ──────────────────────────────────────────────
 * There is no Save button. A checklist is filled in over days by several
 * people, and a form that has to be submitted as a whole either loses one
 * person's work to another's refresh or quietly overwrites it. Each cell
 * commits on blur, shows its own state, and a failure reverts that cell alone.
 */
export function ChecklistGrid({
  run,
  items,
  people,
  canEdit,
  me,
  clients,
  subjects,
  canAddRoster,
}: ChecklistGridProps) {
  const router = useRouter();
  const today = todayYmd();

  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<ChecklistPhase>>(new Set());
  /* Null is the checklist's own order. Deliberately NOT persisted: a sort is a
     way of reading the list for a minute, and finding the grid still alphabetical
     next week would read as the plan itself having been rearranged. Collapse
     state is remembered because that IS a lasting preference. */
  const [sort, setSort] = React.useState<SortState>(null);

  /* Collapse state is a convenience, not data — a private window throws on
     localStorage access, so every touch is guarded and the page renders the
     same either way.

     THIS ONE HAS TO BE AN EFFECT. localStorage does not exist during the server
     render, so reading it in a lazy initialiser would have the server render
     every group open and the client render some collapsed — a hydration
     mismatch. Reading after mount is the hydration-safe order, and the one
     extra render it costs is a group closing, which is invisible. */
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`ops-checklist-collapsed:${run.id}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above: a lazy initialiser would desync hydration.
      if (raw) setCollapsed(new Set(JSON.parse(raw) as ChecklistPhase[]));
    } catch {
      /* no stored preference — open everything */
    }
  }, [run.id]);

  const togglePhase = (p: ChecklistPhase) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      try {
        window.localStorage.setItem(
          `ops-checklist-collapsed:${run.id}`,
          JSON.stringify([...next]),
        );
      } catch {
        /* not storable here — the session still works, it just won't persist */
      }
      return next;
    });
  };

  const toggleSort = React.useCallback(
    (k: SortKey) => setSort((cur) => nextSort(cur, k)),
    [],
  );

  /* ── Column order, dragged by each person (account holder, 2026-09-18:
     "drag the columns and adjust them as I want, like Tasks"). One order per
     employee for every checklist, kept in their browser — it is how they like
     to read the grid, not a property of one checklist. */
  const columns = useSavedColumnOrder(`altus.ops-checklist.columnOrder.v1:${me.id}`, COLUMN_KEYS);
  const drag = useColumnDrag(columns.order, columns.save);
  const cols = columns.order;

  /* ── Adding: the pop-up and the bulk upload, opened from a group's bar ── */
  const [adding, setAdding] = React.useState<ChecklistPhase | null>(null);
  const [bulkFor, setBulkFor] = React.useState<ChecklistPhase | null>(null);
  const groupLabel = (p: ChecklistPhase | null) => (p && run.isEvent ? PHASE_LABELS[p] : null);
  const openGroup = (p: ChecklistPhase) =>
    setCollapsed((prev) => {
      if (!prev.has(p)) return prev;
      const next = new Set(prev);
      next.delete(p);
      return next;
    });

  async function run_(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not save.");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  /* ── Grouping, then sorting INSIDE each group ───────────────────────────
     Phases are the plan's structure, not a convenience grouping: a task three
     days before the event and one ten days after are not comparable work, and
     interleaving them by doer name gives a list nobody can execute. So the sort
     runs per phase and the phases keep their order. */
  const nameById = React.useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people],
  );

  const grouped = React.useMemo(() => {
    const by = new Map<ChecklistPhase, ChecklistItemRow[]>();
    for (const p of PHASE_ORDER) by.set(p, []);
    for (const it of items) {
      // A non-event run has no phases — every row lands in one list.
      const phase = run.isEvent ? phaseFor(it.offsetDays) : "undated";
      by.get(phase)!.push(it);
    }
    const ctx = {
      nameOf: (id: string | null) => (id ? (nameById.get(id) ?? null) : null),
      targetOf: (r: ChecklistItemRow) => dueOf(run, r, today),
      varianceOf: (r: ChecklistItemRow) => variance(dueOf(run, r, today), actualYmd(r.doneAt), today),
      frequencyOf: (r: ChecklistItemRow) => frequencyText(r.recurrenceRule, anchorOf(run, r)),
      natural: compareRows,
    };
    for (const [phase, list] of by) by.set(phase, sortChecklistRows(list, sort, ctx));
    return by;
  }, [items, run, sort, nameById, today]);

  const overall = checklistProgress(items);

  /** Which groups get a header. Undated only appears when it has rows. */
  const phases: ChecklistPhase[] = run.isEvent
    ? PHASE_ORDER.filter((p) => p !== "undated" || (grouped.get(p)?.length ?? 0) > 0)
    : ["undated"];

  const colSpan = cols.length + (canEdit ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* ── The event moved banner ─────────────────────────────────────────── */}
      {run.calendarDate && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[13px]"
          style={{ borderColor: "#FCD34D", background: "#FFFBEB", color: "#92400E" }}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>
            This event moved to <b>{formatDMY(run.calendarDate)}</b> in Monthly Events Master.
            The checklist is still planned around {formatDMY(run.eventDate)}.
          </span>
          {canEdit && (
            <button
              type="button"
              className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: ACCENT_DEEP }}
              disabled={busy !== null}
              onClick={() =>
                run_("recalc", () =>
                  updateChecklistRun({ id: run.id, eventDate: run.calendarDate }),
                )
              }
            >
              Recalculate every date
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border px-4 py-3 text-[13px]"
          style={{ borderColor: "#FCA5A5", background: "#FEF2F2", color: "#991B1B" }}
        >
          {error}
        </div>
      )}

      {/* ── Summary strip ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-slate-600">
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: ACCENT_DEEP }} />
          {run.isEvent ? (
            <>
              <b className="text-slate-900">{run.eventTitle ?? run.title}</b>
              <span className="tabular-nums">{formatDMY(run.eventDate)}</span>
            </>
          ) : (
            <b className="text-slate-900">Standing checklist</b>
          )}
        </span>
        <span>
          <b className="text-slate-900 tabular-nums">
            {overall.done}/{overall.total}
          </b>{" "}
          done · {overall.pct}%
          {overall.ruledOut > 0 && (
            <span className="text-slate-400"> · {overall.ruledOut} cancelled or archived</span>
          )}
        </span>
      </div>

      {/* ── What the sort is doing, and how to undo it ──────────────────────
          A third click on the same header clears the sort, which nobody
          discovers on their own — so the state says so and offers the button.
          It also says "within each phase", which is the one thing about this
          sort that could otherwise surprise someone. */}
      {(sort || columns.reordered) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12.5px] text-slate-600">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {sort ? (
            <span>
              Sorted by <b className="font-semibold text-slate-800">{describeSort(sort, labelOfSortKey)}</b>
              {run.isEvent ? " within each phase" : ""}
            </span>
          ) : (
            <span>Columns in your own order — drag a heading by its grip to move it.</span>
          )}
          <span className="ml-auto flex gap-2">
            {sort && (
              <button
                type="button"
                onClick={() => setSort(null)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to plan order
              </button>
            )}
            {columns.reordered && (
              <button
                type="button"
                onClick={columns.reset}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3 w-3" /> Reset columns
              </button>
            )}
          </span>
        </div>
      )}

      {/* ── The grid ─────────────────────────────────────────────────────────
          ITS OWN SCROLL BOX, BOTH WAYS (account holder, 2026-09-18). Fourteen
          columns will not fit a screen, and a long checklist will not either —
          so the grid scrolls inside a box the height of the window, which keeps
          the sideways scrollbar on screen instead of under the last row, and the
          headings stay pinned while the rows move under them.

          FIXED COLUMN WIDTHS (`table-layout: fixed` + the colgroup below). Left
          to itself the browser handed the Task column whatever the others did
          not claim, and on a laptop that was one word per line. Every column now
          has the room its content needs, and the table is as wide as their sum. */}
      <div
        className="table-scroll table-scroll-bold overflow-auto rounded-2xl border border-slate-200 bg-white"
        style={{ maxHeight: "max(420px, calc(100vh - 275px))" }}
      >
        <table className="border-collapse text-[13px]" style={{ tableLayout: "fixed", width: tableWidth(cols, canEdit) }}>
          <colgroup>
            {cols.map((k) => (
              <col key={k} style={{ width: COLUMN_WIDTH[k] }} />
            ))}
            {canEdit && <col style={{ width: DELETE_COL }} />}
          </colgroup>
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {cols.map((k) => (
                <SortTh
                  key={k}
                  k={k}
                  sort={sort}
                  onSort={toggleSort}
                  drag={drag}
                  align={k === "var" ? "right" : "left"}
                  hint={
                    k === "target"
                      ? run.isEvent
                        ? "The day it is due, and how it repeats. On an event checklist it moves with the event."
                        : "The day it is due, and how it repeats."
                      : k === "var"
                        ? "Days between the target and the actual. Positive is late."
                        : undefined
                  }
                />
              ))}
              {canEdit && <th className={STICKY_HEAD} />}
            </tr>
          </thead>
          <tbody>
            {phases.map((phase) => {
              const rows = grouped.get(phase) ?? [];
              const isShut = collapsed.has(phase);
              const prog = checklistProgress(rows);

              return (
                <React.Fragment key={phase}>
                  {/* The group's bar: open / shut, and — account holder,
                      2026-09-18 — "+ Add" and Bulk upload right on it, instead
                      of a blank row at the foot of the group. A click anywhere
                      else on the bar still opens and shuts it. */}
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="cursor-pointer p-0"
                      style={{ background: "#FEF2F2" }}
                      onClick={() => togglePhase(phase)}
                    >
                      {/* Sticky, so the label and its buttons stay in view when
                          the grid is scrolled to the far columns. */}
                      <div className="sticky left-0 flex w-max items-center gap-2 px-3 py-1.5">
                        <button
                          type="button"
                          aria-expanded={!isShut}
                          className="inline-flex h-7 items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: ACCENT_DEEP }}
                        >
                          {isShut ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          {run.isEvent ? PHASE_LABELS[phase] : "All tasks"}
                          <span className="font-normal normal-case tracking-normal opacity-70">
                            · {rows.length} {rows.length === 1 ? "task" : "tasks"}
                            {rows.length > 0 && ` · ${prog.done} done`}
                          </span>
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdding(phase);
                              }}
                              title={`Add a task${run.isEvent ? ` to ${PHASE_LABELS[phase]}` : ""}`}
                              className="ml-2 inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-bold text-white shadow-sm hover:brightness-110"
                              style={{ background: "linear-gradient(135deg, #B91C1C, #A80400)" }}
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2.6} /> Add task
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBulkFor(phase);
                              }}
                              title="Add many tasks at once from an Excel sheet"
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-red-50"
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" /> Bulk upload
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {!isShut &&
                    rows.map((item, i) => (
                      <GridRow
                        key={item.id}
                        cols={cols}
                        item={item}
                        index={i + 1}
                        run={run}
                        people={people}
                        clients={clients}
                        subjects={subjects}
                        canAddRoster={canAddRoster}
                        canEdit={canEdit}
                        me={me}
                        today={today}
                        busy={busy}
                        onRun={run_}
                      />
                    ))}

                  {!isShut && rows.length === 0 && (
                    <tr>
                      <td colSpan={colSpan} className="px-3 py-3 text-slate-400">
                        <span className="sticky left-3">
                          Nothing here yet.{canEdit ? " Use + Add task or Bulk upload on the bar above." : ""}
                        </span>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <>
          <ChecklistTaskDialog
            open={adding !== null}
            onOpenChange={(o) => !o && setAdding(null)}
            target="run"
            isEvent={run.isEvent}
            eventDate={run.eventDate}
            defaultOffset={phaseOffset(adding, run.isEvent)}
            groupLabel={groupLabel(adding)}
            containerName={run.title}
            people={people}
            clients={clients}
            subjects={subjects}
            canAddRoster={canAddRoster}
            meId={me.id}
            onAdd={async (v) => {
              const res = await createChecklistItem({ runId: run.id, ...v });
              if (!res.ok) return res;
              if (adding) openGroup(adding);
              router.refresh();
              return { ok: true };
            }}
          />
          <ChecklistBulkUpload
            open={bulkFor !== null}
            onOpenChange={(o) => !o && setBulkFor(null)}
            target="run"
            ownerId={run.id}
            containerName={run.title}
            isEvent={run.isEvent}
            eventDate={run.eventDate}
            defaultOffset={phaseOffset(bulkFor, run.isEvent)}
            groupLabel={groupLabel(bulkFor)}
            people={people}
            subjects={subjects}
            clients={clients}
          />
        </>
      )}
    </div>
  );
}

/** The Day a task added from a group's bar starts on: the day before, of, or after the event. */
function phaseOffset(phase: ChecklistPhase | null, isEvent: boolean): number | null {
  if (!isEvent || !phase || phase === "undated") return null;
  return phase === "before" ? -1 : phase === "during" ? 0 : 1;
}

/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every column's width, in the WMS order. The widths are what the content
 * needs: a full name in a picker, a date and its repeat line, a sentence of
 * notes. Change one here and the header, the cells and the table's total width
 * all follow.
 */
const COLUMN_KEYS: readonly SortKey[] = [
  "sr",
  "client",
  "subject",
  "activity",
  "doer",
  "initiator",
  "target",
  "frequency",
  "done",
  "notes",
  "actual",
  "var",
  "approver",
  "approverNotes",
];

const COLUMN_WIDTH: Record<SortKey, number> = {
  sr: 76,
  client: 180,
  subject: 170,
  activity: 320,
  doer: 170,
  initiator: 170,
  target: 200,
  frequency: 150,
  done: 170,
  notes: 240,
  actual: 160,
  var: 110,
  approver: 180,
  approverNotes: 240,
};
const DELETE_COL = 52;

function tableWidth(cols: readonly SortKey[], canEdit: boolean): number {
  return cols.reduce((sum, k) => sum + COLUMN_WIDTH[k], 0) + (canEdit ? DELETE_COL : 0);
}

/** A heading cell pinned to the top of the scroll box. The line under it is a
 *  shadow, because a border on a sticky cell stays behind in a collapsed table. */
const STICKY_HEAD = "sticky top-0 z-20 bg-slate-50 px-0 py-0 shadow-[inset_0_-1px_0_rgb(226,232,240)]";

/**
 * The headings, spelled ONCE — the grid reads them, and so does the "Sorted by
 * …" banner, so a column cannot be called one thing in the header and another
 * in the sentence describing the sort. The words are WMS Tasks' own.
 */
const SORT_LABELS: Record<SortKey, string> = {
  sr: "S. No.",
  client: "Client",
  subject: "Subject",
  activity: "Task",
  doer: "Doer",
  initiator: "Initiator",
  target: "Target Date",
  frequency: "Frequency",
  done: "Doer Status",
  notes: "Doer Notes",
  actual: "Actual Date",
  var: "+/- Days",
  approver: "Approver Status",
  approverNotes: "Approver Notes",
};
const labelOfSortKey = (k: SortKey) => SORT_LABELS[k];

/**
 * A sortable column heading.
 *
 * The arrow is always in the DOM — faint until the column is the sorted one —
 * so the header does not change width when you sort it, and so a reader can see
 * which columns are sortable before clicking one.
 */
function SortTh({
  k,
  sort,
  onSort,
  drag,
  align = "left",
  hint,
}: {
  k: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
  /** The column drag — a grip to carry this column anywhere. */
  drag: ColumnDragControl<SortKey>;
  align?: "left" | "center" | "right";
  /** What the column means, on hover — for the ones that need saying. */
  hint?: string;
}) {
  const label = SORT_LABELS[k];
  const active = sort?.key === k;
  const dir = active ? sort!.dir : null;
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th
      scope="col"
      aria-sort={ariaSort(sort, k)}
      className={`${STICKY_HEAD} group/head`}
      {...drag.headProps(k)}
      style={{ boxShadow: headShadow(drag.edge(k)), opacity: drag.dragging === k ? 0.45 : 1 }}
    >
      <div className="flex items-center pl-1.5">
        <ColumnGrip label={label} {...drag.gripProps(k)} />
        <button
          type="button"
          onClick={() => onSort(k)}
          title={[
            hint,
            dir === "asc"
              ? `Sorted by ${label}, ascending — click for descending`
              : dir === "desc"
                ? `Sorted by ${label}, descending — click to clear`
                : `Sort by ${label}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          className={`flex min-w-0 flex-1 items-center gap-1 whitespace-nowrap py-2.5 pl-1 pr-3 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-slate-100 ${justify} ${
            active ? "text-slate-900" : "text-slate-500"
          }`}
        >
          <span>{label}</span>
          {dir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" style={{ color: ACCENT_DEEP }} />
          ) : dir === "desc" ? (
            <ArrowDown className="h-3 w-3 shrink-0" style={{ color: ACCENT_DEEP }} />
          ) : (
            <ArrowUpDown className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
          )}
        </button>
      </div>
    </th>
  );
}

/** A roster picker trimmed to sit in a grid cell. */
const CELL_PICKER =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-slate-200 focus:border-slate-300 focus:bg-white";

function GridRow({
  cols,
  item,
  index,
  run,
  people,
  clients,
  subjects,
  canAddRoster,
  canEdit,
  me,
  today,
  busy,
  onRun,
}: {
  /** The columns, in this person's order. */
  cols: readonly SortKey[];
  item: ChecklistItemRow;
  index: number;
  run: ChecklistRunRow;
  people: ChecklistPersonRow[];
  clients: string[];
  subjects: string[];
  canAddRoster: boolean;
  canEdit: boolean;
  me: ChecklistViewer;
  today: string;
  busy: string | null;
  onRun: (k: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const router = useRouter();
  const anchor = anchorOf(run, item);
  const due = dueOf(run, item, today);
  const actual = actualYmd(item.doneAt);
  const v = variance(due, actual, today);
  const running = v !== null && !actual;

  const rowKey = `row:${item.id}`;
  const rowBusy = busy === rowKey;
  const locked = !canEdit || busy !== null;
  const save = (patch: Record<string, unknown>) =>
    onRun(rowKey, () => updateChecklistItem({ id: item.id, ...patch }));

  /* WHO MAY RULE — the WMS Tasks rule, from this row's own two people. */
  const isDoer = !!item.doerId && item.doerId === me.id;
  const isSelfRaised = !!item.initiatorId && item.initiatorId === item.doerId;
  const actor: ApproverActor = {
    isAdmin: me.isAdmin,
    isInitiator: item.initiatorId === me.id && !isSelfRaised,
    isDoersManager: !isDoer && !!item.doerId && me.managedIds.includes(item.doerId),
    isDoer,
    isSelfRaised,
  };
  const ruledOut = item.approverStatus === "cancelled" || item.approverStatus === "archived";

  /** A picked date, stored the way this checklist keeps dates. */
  function saveSchedule(next: { date: string; rule: string | null }) {
    const patch: Record<string, unknown> = {};
    if (next.date !== anchor) {
      if (run.isEvent) {
        const off = run.eventDate ? daysBetween(run.eventDate, next.date) : null;
        if (off === null || off < OFFSET_MIN || off > OFFSET_MAX) {
          void onRun(rowKey, async () => ({
            ok: false,
            error: "Pick a date within a year either side of the event.",
          }));
          return;
        }
        patch.offsetDays = off;
      } else {
        patch.targetDate = next.date;
      }
    }
    if ((next.rule ?? null) !== (item.recurrenceRule ?? null)) patch.recurrenceRule = next.rule;
    if (Object.keys(patch).length > 0) void save(patch);
  }

  /* Every cell by its column, so the row follows the order this person has
     dragged the headings into. */
  const cells: Record<SortKey, React.ReactNode> = {
    sr: (
      <td key="sr" className="px-3 py-2 tabular-nums text-slate-400">{index}</td>
    ),
    client: (
      <td key="client" className="px-3 py-2">
        {locked ? (
          <span className={item.client ? "text-slate-700" : "text-slate-300"}>{item.client ?? "—"}</span>
        ) : (
          <ClientSelect
            value={item.client ?? ""}
            clients={clients}
            canAdd={canAddRoster}
            placeholder="—"
            onChange={(v2) => void save({ client: v2 })}
            className={CELL_PICKER}
          />
        )}
      </td>
    ),
    subject: (
      <td key="subject" className="px-3 py-2">
        {locked ? (
          <span className={item.category ? "text-slate-700" : "text-slate-300"}>{item.category ?? "—"}</span>
        ) : (
          <SubjectSelect
            value={item.category ?? ""}
            subjects={subjects}
            canAdd={canAddRoster}
            placeholder="—"
            onChange={(v2) => void save({ category: v2 })}
            className={CELL_PICKER}
          />
        )}
      </td>
    ),
    activity: (
      <td key="activity" className="px-3 py-2">
        <div className="relative">
          <TextCell
            value={item.title}
            disabled={locked}
            padForMic={canEdit}
            onCommit={(v2) => void save({ title: v2 })}
          />
          {/* In the cell's corner, but rendered OUTSIDE TextCell: that cell swaps
              to plain text whenever ANY row is saving, which would unmount a
              recording in progress. */}
          {canEdit && (
            <div className="absolute right-0.5 top-0.5">
              <VoiceNoteButton
                iconOnly
                compact
                label="Dictate with Voice"
                onText={(t) => void save({ title: `${item.title.trimEnd()} ${t}` })}
              />
            </div>
          )}
        </div>
        {item.jdEntryId && (
          <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            from JD
          </span>
        )}
      </td>
    ),
    doer: (
      <td key="doer" className="px-3 py-2">
        <PersonCell
          value={item.doerId}
          people={people}
          disabled={locked}
          onChange={(v2) => void save({ doerId: v2 })}
        />
      </td>
    ),
    initiator: (
      <td key="initiator" className="px-3 py-2">
        <PersonCell
          value={item.initiatorId}
          people={people}
          disabled={locked}
          onChange={(v2) => void save({ initiatorId: v2 })}
        />
      </td>
    ),
    target: (
      <td key="target" className="px-3 py-2">
        <TargetDateCell
          anchor={anchor}
          due={due}
          rule={item.recurrenceRule}
          run={run}
          offsetDays={item.offsetDays}
          disabled={locked}
          onSave={saveSchedule}
        />
      </td>
    ),
    frequency: (
      <td key="frequency" className="px-3 py-2">
        <FrequencyCell
          rule={item.recurrenceRule}
          anchor={anchor}
          disabled={locked}
          onPick={(f) => {
            if (!anchor) return;
            const rule = ruleForFrequency(f, anchor);
            if ((rule ?? null) !== (item.recurrenceRule ?? null)) void save({ recurrenceRule: rule });
          }}
        />
      </td>
    ),
    done: (
      <td key="done" className="px-3 py-2">
        <DoerStatusCell
          status={item.status}
          disabled={busy !== null}
          onSet={(s) =>
            onRun(rowKey, () => setChecklistCheck({ runId: run.id, itemId: item.id, status: s }))
          }
        />
      </td>
    ),
    notes: (
      <td key="notes" className="px-3 py-2">
        <NoteCell
          value={item.notes}
          placeholder="Add a note"
          disabled={busy !== null}
          onCommit={(v2) =>
            onRun(rowKey, () => setChecklistCheck({ runId: run.id, itemId: item.id, notes: v2 }))
          }
        />
      </td>
    ),
    actual: (
      <td key="actual" className="px-3 py-2 tabular-nums text-slate-600">
        {rowBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : (
          formatActual(item.doneAt)
        )}
      </td>
    ),
    var: (
      <td key="var" className="px-3 py-2 text-right">
        {ruledOut || v === null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <span
            className="inline-block rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
            style={
              v > 0
                ? { background: "rgba(185,28,28,0.10)", color: "#b91c1c" }
                : v < 0
                  ? { background: "rgba(22,128,61,0.10)", color: "#15803d" }
                  : { background: "rgba(100,116,139,0.10)", color: "#64748b" }
            }
            title={running ? "Still open — running late" : "Against the target date"}
          >
            {v > 0 ? `+${v}` : v} d{running ? "…" : ""}
          </span>
        )}
      </td>
    ),
    approver: (
      <td key="approver" className="px-3 py-2">
        <ApproverChip
          shown={approverDisplay(item.approverStatus, isSelfRaised)}
          choices={busy !== null ? [] : selectableApproverChoices(actor, item.status)}
          lockedTitle={
            isSelfRaised
              ? "The initiator is also the doer, so nobody approves this row. Only an admin can overrule."
              : "Only the initiator, the doer's manager or an admin can change this."
          }
          onPick={async (choice) => {
            /* The chip keeps its own busy state and error, so it saves directly
               rather than through the row's onRun — and refreshes the same way. */
            const res = await setChecklistApprover({ runId: run.id, itemId: item.id, status: choice });
            if (res.ok) router.refresh();
            return res.ok ? null : res.error;
          }}
        />
      </td>
    ),
    approverNotes: (
      <td key="approverNotes" className="px-3 py-2">
        <NoteCell
          value={item.approverNotes}
          placeholder={canRuleOn(actor) ? "Add a note" : "—"}
          disabled={busy !== null || !canRuleOn(actor)}
          onCommit={(v2) =>
            onRun(rowKey, () =>
              setChecklistApprover({ runId: run.id, itemId: item.id, approverNotes: v2 }),
            )
          }
        />
      </td>
    ),
  };

  return (
    <tr
      className={`border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60 ${
        ruledOut ? "opacity-60" : ""
      }`}
    >
      {cols.map((k) => cells[k])}

      {canEdit && (
        <td className="px-2 py-2">
          <button
            type="button"
            aria-label="Remove row"
            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
            disabled={busy !== null}
            onClick={() => {
              if (item.status !== "not_started" && !window.confirm("This row has been worked on. Remove it?")) {
                return;
              }
              void onRun(rowKey, () => removeChecklistItem({ id: item.id }));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

/* ── Cells ────────────────────────────────────────────────────────────────── */

function TextCell({
  value,
  disabled,
  padForMic = false,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  /** Leave room at the right for the Dictate mic sitting in the corner. */
  padForMic?: boolean;
  onCommit: (v: string) => void;
}) {
  /* The committed value is the source of truth; `draft` is what is being typed.
     Re-syncing during render (rather than in an effect) is React's documented
     way to reset derived state when the input changes — an effect would render
     the stale value once before correcting it. */
  const [draft, setDraft] = React.useState(value);
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  /* GROW TO THE TEXT. `rows={1}` on its own clips a task at one line, and the
     clipped half is usually the half that says what the task actually is.
     Sizing to scrollHeight in a layout effect means the first paint is already
     the right height, so the grid does not visibly reflow as rows settle. */
  const ref = React.useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, draft);

  if (disabled) return <span className="text-slate-700">{value}</span>;

  return (
    <textarea
      ref={ref}
      rows={1}
      style={{ overflow: "hidden" }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t && t !== value) onCommit(t);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        // Enter commits; Shift+Enter is a newline. Escape abandons the edit,
        // which is the only way back out of a half-typed cell.
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={`w-full resize-none rounded border border-transparent bg-transparent py-0.5 pl-1 text-[13px] text-slate-800 outline-none hover:border-slate-200 focus:border-slate-300 focus:bg-white ${
        padForMic ? "pr-8" : "pr-1"
      }`}
    />
  );
}

/**
 * A notes cell — Doer Notes and Approver Notes. Like TextCell, but clearing it
 * is allowed (it saves as no note), and a read-only one is plain text.
 */
function NoteCell({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string | null;
  placeholder: string;
  disabled: boolean;
  onCommit: (v: string | null) => void;
}) {
  const current = value ?? "";
  const [draft, setDraft] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  if (seen !== current) {
    setSeen(current);
    setDraft(current);
  }
  const ref = React.useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, draft);

  if (disabled) {
    return (
      <span className={`whitespace-pre-wrap ${value ? "text-slate-700" : "text-slate-300"}`}>
        {value || "—"}
      </span>
    );
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      style={{ overflow: "hidden" }}
      value={draft}
      maxLength={4000}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t !== current.trim()) onCommit(t || null);
        else setDraft(current);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(current);
          e.currentTarget.blur();
        }
      }}
      className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-300 hover:border-slate-200 focus:border-slate-300 focus:bg-white"
    />
  );
}

function PersonCell({
  value,
  people,
  disabled,
  onChange,
}: {
  value: string | null;
  people: ChecklistPersonRow[];
  disabled: boolean;
  onChange: (v: string | null) => void;
}) {
  const name = people.find((p) => p.id === value)?.name ?? null;

  if (disabled) {
    return <span className={name ? "text-slate-700" : "text-slate-300"}>{name ?? "—"}</span>;
  }

  return (
    <CompactSelect
      value={value ?? ""}
      onChange={(v) => onChange(v === "" ? null : v)}
      className="w-full min-w-[140px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-slate-800 hover:border-slate-200"
      aria-label="Person"
      options={people.map((p) => ({ value: p.id, label: p.name }))}
    />
  );
}

/** "3 days before the event" — what an event row's date means. */
function eventRelative(offsetDays: number | null): string | null {
  if (offsetDays === null) return null;
  if (offsetDays === 0) return "Event day";
  const n = Math.abs(offsetDays);
  return `${n} day${n === 1 ? "" : "s"} ${offsetDays < 0 ? "before" : "after"} the event`;
}

/**
 * TARGET DATE — the date, and Google Calendar's repeat menu about it.
 *
 * The same seven presets a WMS task's Schedule offers, spoken about the chosen
 * day ("Weekly on Friday"), and Custom… opening the same dialog. On an event
 * checklist the date is stored as days from the event, so it still moves when
 * the event does.
 *
 * The date commits on blur, not on every change: a date input reports a
 * half-typed year ("0002-09-18") as a change, and saving that would move the
 * row two thousand years.
 */
function TargetDateCell({
  anchor,
  due,
  rule,
  run,
  offsetDays,
  disabled,
  onSave,
}: {
  /** The row's own date. */
  anchor: string | null;
  /** What it is due on now — the current occurrence of a repeating row. */
  due: string | null;
  rule: string | null;
  run: ChecklistRunRow;
  offsetDays: number | null;
  disabled: boolean;
  onSave: (next: { date: string; rule: string | null }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [customOpen, setCustomOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(anchor ?? "");
  const [seen, setSeen] = React.useState(anchor ?? "");
  if (seen !== (anchor ?? "")) {
    setSeen(anchor ?? "");
    setDraft(anchor ?? "");
  }

  const repeat = repeatText(rule, anchor);
  const relative = run.isEvent ? eventRelative(offsetDays) : null;

  const face = (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`tabular-nums ${due ? "text-slate-700" : "text-slate-300"}`}>
        {formatDMY(due)}
        {isSunday(due) && (
          <span
            className="ml-1 rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
            style={{ background: "#FEF3C7", color: "#92400E" }}
            title="Falls on a Sunday"
          >
            Sun
          </span>
        )}
      </span>
      {relative && <span className="text-[11px] text-slate-400">{relative}</span>}
      {repeat && (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-700">
          <Repeat className="h-3 w-3" aria-hidden />
          {repeat}
        </span>
      )}
    </span>
  );

  if (disabled) return face;

  const commitDate = () => {
    const d = draft.trim();
    // A complete date in a sane range, or nothing — see the note above.
    if (!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(d) || d === anchor) {
      setDraft(anchor ?? "");
      return;
    }
    onSave({ date: d, rule: reanchorRule(rule, anchor, d) });
  };

  const anchorDate = anchor ? dateFromYmd(anchor) : null;
  const preset: PresetKey = anchorDate && rule ? detectPreset(rule, anchorDate) : "none";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full rounded border border-transparent px-1 py-0.5 text-left hover:border-slate-200 hover:bg-white"
            aria-label="Set the target date and how it repeats"
          >
            {face}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Target date
            </span>
            <input
              type="date"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDate}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDate();
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
            />
          </label>
          {run.isEvent && run.eventDate && (
            <p className="mt-1 text-[11px] text-slate-500">
              Event on {formatDMY(run.eventDate)}. {relative ?? "Not scheduled yet."}
            </p>
          )}

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Repeat
            </span>
            <select
              value={preset}
              disabled={!anchorDate}
              title={anchorDate ? undefined : "Pick the date first — the repeat is spoken about it."}
              onChange={(e) => {
                const key = e.target.value as PresetKey;
                if (!anchor || !anchorDate) return;
                if (key === "custom") {
                  setOpen(false);
                  setCustomOpen(true);
                  return;
                }
                onSave({ date: anchor, rule: key === "none" ? null : ruleForPreset(key, anchorDate) });
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] disabled:bg-slate-50"
            >
              {presetOptions(anchorDate ?? new Date()).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {preset === "custom" && anchorDate && (
            <p className="mt-1 text-[11px] font-semibold text-cyan-700">
              {humanSummary(rule, anchorDate)} ·{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => {
                  setOpen(false);
                  setCustomOpen(true);
                }}
              >
                Edit custom
              </button>
            </p>
          )}
        </PopoverContent>
      </Popover>

      {anchor && anchorDate && (
        <CustomRecurrenceDialog
          open={customOpen}
          onOpenChange={setCustomOpen}
          anchor={anchorDate}
          rule={rule}
          onDone={({ rule: next }) => onSave({ date: anchor, rule: next })}
        />
      )}
    </>
  );
}

/**
 * FREQUENCY — Daily / Weekly / Monthly / Quarterly / Yearly, read from the same
 * rule the Target Date sets, so the two cannot disagree. Picking one writes
 * the matching rule, spoken about the row's date.
 */
function FrequencyCell({
  rule,
  anchor,
  disabled,
  onPick,
}: {
  rule: string | null;
  anchor: string | null;
  disabled: boolean;
  onPick: (f: Frequency) => void;
}) {
  const f = frequencyOf(rule);
  const text = frequencyText(rule, anchor);
  if (disabled) return <span className={f === "once" ? "text-slate-400" : "text-slate-700"}>{text}</span>;

  return (
    <select
      value={f}
      disabled={!anchor}
      title={anchor ? undefined : "Set the Target Date first — the frequency counts from it."}
      onChange={(e) => onPick(e.target.value as Frequency)}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-slate-800 outline-none hover:border-slate-200 focus:border-slate-300 focus:bg-white disabled:text-slate-400"
    >
      {f === "custom" && (
        <option value="custom" disabled>
          {text}
        </option>
      )}
      {FREQUENCIES.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * DOER STATUS — the WMS Tasks six, as the WMS badge colours paint them. Anyone
 * in the room may set it: recording the work is the work.
 */
function DoerStatusCell({
  status,
  disabled,
  onSet,
}: {
  status: CheckStatus;
  disabled: boolean;
  onSet: (s: CheckStatus) => void;
}) {
  const tone = checkStatusStyle(status);
  return (
    <select
      value={status}
      disabled={disabled}
      aria-label="Doer Status"
      onChange={(e) => onSet(e.target.value as CheckStatus)}
      className="min-w-[124px] cursor-pointer rounded-full border px-2.5 py-1 text-[12.5px] font-bold outline-none disabled:cursor-default"
      style={{ background: tone.bg, color: tone.ink, borderColor: tone.border }}
    >
      {CHECK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {checkStatusLabel(s)}
        </option>
      ))}
    </select>
  );
}
