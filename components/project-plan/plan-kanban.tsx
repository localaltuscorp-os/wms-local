"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, User, Loader2, CircleDashed } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { USER_TASK_STATUSES, type TaskStatus } from "@/db/enums";
import {
  INITIATOR_COLUMN_LABEL,
  INITIATOR_COLUMN_ORDER,
  INITIATOR_COLUMN_TONE,
  NO_VERDICT_COL,
  initiatorColumnFor,
  type InitiatorColId,
  type StatusAxis,
} from "@/lib/status/axes";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import { KIND_LABEL, isExecutable, refFor, levelTextStyle, formatPlanDate } from "@/lib/project-plan/levels";
import {
  canSetPlanStatus,
  effectivePlanStatus,
  isRestrictedStatus,
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  type PlanActor,
} from "@/lib/project-plan/status";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { setPlanNodeStatus } from "@/app/(app)/project-plan/actions";
import { planActorFor, workingStatusOf } from "./plan-status-cell";
import type { PlanRow } from "./plan-board";

/**
 * Project Plan — Kanban.
 *
 * The SAME column model as the WMS board (`USER_TASK_STATUSES`, same labels
 * from `STATUS_LABELS_FALLBACK`), because the cards ARE WMS tasks: an Action /
 * Sub-Action / Sub-Sub-Action with an owner and a target date is one `tasks`
 * row, and dragging a card here calls the same `setTaskStatus` action the WMS
 * board calls. Move a card here and it moves on the WMS board too — there is
 * one record, not a copy.
 *
 * The extra first column, "Not scheduled", holds the executable rows that are
 * not tasks yet — the signal that they still need an owner and a date.
 *
 * CONTAINERS ARE ON THE BOARD TOO (brief §11). A Project, a Milestone and a
 * Result each carry their own status in `project_nodes.status`, so they belong
 * on a status board as much as an action does — and dragging one calls
 * `setPlanNodeStatus`, the SAME action the table's status cell calls, which
 * re-checks the permission before it writes. There is no second status store
 * behind this board: every card is a row that already exists.
 *
 * A card whose row carries a restricted verdict (Approved / On Hold /
 * Cancelled) shows that verdict as a badge and refuses to be dragged. The
 * verdict outranks a progress report, so moving such a card between working
 * columns would be writing a status nobody would then see.
 */

const UNSCHEDULED = "__unscheduled__" as const;
type ColId = TaskStatus | typeof UNSCHEDULED | InitiatorColId;

/**
 * THE BOARD HAS TWO AXES (2026-09-14), the same pair Tasks and Goals have —
 * see lib/status/axes.ts. The toggle above the board picks which question the
 * columns answer:
 *
 *   doer       where is this work?      Not Read … Done · Abandoned
 *   initiator  what do we do about it?  No Verdict · Approved · Not Approved ·
 *                                       On Hold · Archived
 *
 * "Not scheduled" belongs to the DOER axis only. It means "this row is not a
 * WMS task yet", which is a fact about the work, not a ruling on it — an
 * unscheduled row can perfectly well be Approved.
 */
const DOER_COLUMNS: ColId[] = [UNSCHEDULED, ...USER_TASK_STATUSES];
const VERDICT_COLUMNS: ColId[] = [...INITIATOR_COLUMN_ORDER];

function columnsFor(axis: StatusAxis): ColId[] {
  return axis === "doer" ? DOER_COLUMNS : VERDICT_COLUMNS;
}

const ACCENT = "#E10600";
const ACCENT_SOFT = "#F8C8C7";

/** Column tint — done reads green, on-hold amber, the rest neutral. */
function columnTone(col: ColId): string {
  if (col === UNSCHEDULED) return "#94A3B8";
  if (col in INITIATOR_COLUMN_TONE) {
    return INITIATOR_COLUMN_TONE[col as InitiatorColId];
  }
  if (col === "done") return "#16A34A";
  if (col === "need_info") return "#7C3AED";
  if (col === "abandoned") return "#78716C";
  return "#334155";
}

function columnLabel(col: ColId): string {
  if (col === UNSCHEDULED) return "Not scheduled";
  if (col in INITIATOR_COLUMN_LABEL) {
    return INITIATOR_COLUMN_LABEL[col as InitiatorColId];
  }
  return STATUS_LABELS_FALLBACK[col as TaskStatus] ?? col;
}

/** A card: one executable plan row, plus the context the table gives it. */
export interface KanbanCard {
  node: PlanRow;
  ref: string;
  path: string[];
}

/**
 * Which column a card sits in.
 *
 *   Executable + task  → the task's status, the shared WMS record
 *   Executable, no task→ "Not scheduled"
 *   Container          → project_nodes.status, defaulting to Not Started
 *
 * A restricted verdict does NOT get its own column: it is a ruling layered over
 * the progress report underneath, and the card keeps its place in the flow with
 * the verdict shown as a badge.
 */
function columnFor(node: PlanRow, axis: StatusAxis): ColId {
  if (axis === "initiator") {
    // The verdict, and only the verdict. `is_archived` outranks it, exactly as
    // it does everywhere else — see effectiveInitiatorStatus.
    return initiatorColumnFor({
      approvalStatus: node.approvalStatus,
      // ALWAYS false here, and that is not an oversight: the plan query filters
      // `is_archived = false` (lib/queries/project-plan.ts), so an archived node
      // never reaches this board. The Archived column therefore renders empty
      // and exists as a DROP TARGET — dropping there runs the same archive path
      // the table's status picker has always run.
      archived: false,
    });
  }
  if (isExecutable(node.kind) && !node.task) return UNSCHEDULED;
  // `workingStatusOf` is the one place that knows a task's status is the record
  // on an executable row and the node's own column on a container.
  return (workingStatusOf(node) as TaskStatus | null) ?? "not_started";
}

export function PlanKanban({
  cards,
  me,
  downlineSet,
  axis = "doer",
}: {
  cards: KanbanCard[];
  me: { id: string; isAdmin: boolean };
  downlineSet: ReadonlySet<string>;
  /** Which question the columns answer. See columnsFor(). */
  axis?: StatusAxis;
}) {
  const router = useRouter();
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<ColId | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const COLUMNS = React.useMemo(() => columnsFor(axis), [axis]);

  const byColumn = React.useMemo(() => {
    const m = new Map<ColId, KanbanCard[]>();
    for (const col of COLUMNS) m.set(col, []);
    // Where a card goes when its own column is not on this board — a deprecated
    // status, say. Never nowhere: a card that vanishes is worse than a card in
    // the wrong place, because nobody goes looking for it.
    const fallback: ColId = axis === "doer" ? "not_started" : NO_VERDICT_COL;
    for (const c of cards) {
      (m.get(columnFor(c.node, axis)) ?? m.get(fallback)!).push(c);
    }
    return m;
  }, [cards, axis, COLUMNS]);

  function onDrop(col: ColId) {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (!id) return;

    const card = cards.find((c) => c.node.id === id);
    if (!card) return;
    const node = card.node;

    if (col === UNSCHEDULED) {
      fireToast({
        message: "A row already in WMS can't go back to “Not scheduled” — clear its owner or target date instead.",
        type: "info",
      });
      return;
    }
    if (col === NO_VERDICT_COL) {
      // Un-deciding is not a decision, and there is no value to write for it.
      fireToast({
        message: "There is no “no verdict” to set — pick Approved, Not Approved, On Hold or Archived.",
        type: "info",
      });
      return;
    }
    if (columnFor(node, axis) === col) return;

    // The picker's own rule, run before the request so the refusal reads the
    // same here as it does in the table. The server re-runs it regardless.
    const actor = planActorFor(node, me, downlineSet);
    const verdict = canSetPlanStatus(actor, col);
    if (!verdict.ok) {
      fireToast({ message: verdict.reason, type: "error" });
      return;
    }

    setBusyId(id);
    void (async () => {
      try {
        // An executable row with a task goes through setTaskStatus directly,
        // for its optimistic lock: the card is holding an `updatedAt` from the
        // last render, and that token is what refuses a write over someone
        // else's change. Everything else — containers, and executable rows not
        // in WMS yet — goes through setPlanNodeStatus.
        // On the INITIATOR axis every column is a ruling on the NODE, never a
        // progress report on its task — so it always goes through
        // setPlanNodeStatus, which owns the verdict column and the archive
        // cascade. Only the doer axis has the shared-task shortcut.
        const res =
          axis === "doer" && isExecutable(node.kind) && node.task
            ? await setTaskStatus(node.task.id, col as TaskStatus, node.task.updatedAt)
            : await setPlanNodeStatus({ id: node.id, status: col });
        setBusyId(null);
        if (!res.ok) {
          const r = res as { error?: string; message?: string };
          fireToast({
            message:
              r.error === "stale"
                ? "Someone else changed this first — refreshing."
                : r.message ?? r.error ?? "Couldn't move that card.",
            type: "error",
          });
          router.refresh();
          return;
        }
        router.refresh();
      } catch {
        setBusyId(null);
        fireToast({
          message: "Couldn't move that card — your session may have expired. Sign in again and retry.",
          type: "error",
        });
        router.refresh();
      }
    })();
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-hairline-strong bg-white px-6 py-16 text-center">
        <p className="text-[15px] font-bold text-ink-strong">Nothing to show on the board.</p>
        <p className="mt-1 text-[13.5px] font-medium text-ink-muted">
          Add a project, or an action under a result, and it appears here.
        </p>
      </div>
    );
  }

  return (
    /* SCROLLS ON BOTH AXES, inside its own box — the same shape the hierarchy
       table uses. Sideways because six columns are wider than most screens,
       and DOWN because a column with thirty cards used to simply run off the
       bottom: the board had `overflow-x-auto` only, so the page chrome above it
       had to scroll away before you could reach the end of a column, and inside
       a full-screen flex parent there was no page scroll to fall back on.
       Each column scrolls its own cards (below), so the headers stay put. */
    <div
      className="overflow-auto pb-2"
      style={{ height: "calc(100vh - 300px)", minHeight: 320 }}
    >
      <div className="flex h-full items-stretch gap-3" style={{ minWidth: COLUMNS.length * 268 }}>
        {COLUMNS.map((col) => {
          const list = byColumn.get(col) ?? [];
          const tone = columnTone(col);
          const isOver = overCol === col;
          return (
            <section
              key={col}
              onDragOver={(e) => {
                // preventDefault is what makes a drop target droppable at all.
                e.preventDefault();
                setOverCol(col);
              }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => onDrop(col)}
              className="flex h-full w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border bg-surface-soft transition-colors"
              style={{
                borderColor: isOver ? ACCENT : "var(--color-hairline-strong)",
                background: isOver ? ACCENT_SOFT : undefined,
              }}
            >
              {/* shrink-0 so the header keeps its height while the card list
                  below takes the rest and scrolls under it. */}
              <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-2.5">
                <span className="size-2 rounded-full" style={{ background: tone }} aria-hidden />
                <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink-strong">
                  {columnLabel(col)}
                </h3>
                <span className="rounded-pill bg-white px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-ink-muted">
                  {list.length}
                </span>
              </header>

              <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2 [scrollbar-width:thin]">
                {list.length === 0 && (
                  <p className="px-1 py-6 text-center text-[12px] font-medium text-ink-subtle">
                    {col === UNSCHEDULED ? "Everything here is in WMS." : "Nothing here."}
                  </p>
                )}
                {list.map((c) => {
                  const node = c.node;
                  const verdict = node.approvalStatus && isRestrictedStatus(node.approvalStatus)
                    ? node.approvalStatus
                    : null;
                  const actor = planActorFor(node, me, downlineSet);
                  // WHAT MAY BE DRAGGED, per axis.
                  //
                  // Doer: unscheduled executable rows have nothing to set a
                  // status ON; a row under a verdict is not in the working flow
                  // (the ruling outranks the report); and a viewer with no say
                  // over this row cannot move it anywhere.
                  //
                  // Initiator: none of those apply. A row's verdict is exactly
                  // what this board changes, so carrying one cannot disqualify
                  // it — and the No Verdict column is the queue an initiator is
                  // here to clear, so its cards MUST be draggable. The only
                  // question is authority, asked once against any verdict since
                  // the rule does not vary between the four.
                  const draggable =
                    axis === "initiator"
                      ? canSetPlanStatus(actor, "approved").ok
                      : !verdict &&
                        (isExecutable(node.kind) ? Boolean(node.task) : true) &&
                        canSetPlanStatus(
                          actor,
                          columnFor(node, axis) === UNSCHEDULED
                            ? "not_started"
                            : columnFor(node, axis),
                        ).ok;
                  return (
                    <article
                      key={c.node.id}
                      draggable={draggable}
                      onDragStart={() => setDragId(c.node.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      title={
                        draggable
                          ? "Drag to another column to change its status"
                          : verdict
                            ? `${PLAN_STATUS_LABEL[verdict]} — an owner/admin verdict outranks the working flow.`
                            : isExecutable(node.kind) && !node.task
                              ? "Give this row an owner and a target date to put it in WMS"
                              : "Only the doer, their supervisor or the project owner can move this."
                      }
                      className={`rounded-lg border border-hairline-strong bg-white p-2.5 transition-shadow ${
                        draggable ? "cursor-grab active:cursor-grabbing hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,0.3)]" : "cursor-default"
                      }`}
                      style={{ opacity: dragId === c.node.id ? 0.5 : 1 }}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                          style={{ background: ACCENT_SOFT, color: ACCENT }}
                        >
                          {c.ref}
                        </span>
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                          {KIND_LABEL[node.kind]}
                        </span>
                        {verdict && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              background: `color-mix(in srgb, ${PLAN_STATUS_TONE[verdict]} 15%, transparent)`,
                              color: PLAN_STATUS_TONE[verdict],
                            }}
                          >
                            {PLAN_STATUS_LABEL[verdict]}
                          </span>
                        )}
                        {busyId === node.id && <Loader2 size={12} className="ml-auto animate-spin text-ink-subtle" />}
                      </div>

                      {/* Set the way its level is set everywhere else in the
                          module — brief §5, from the one shared style table. */}
                      <p className="leading-snug text-ink-strong" style={levelTextStyle(node.kind)}>
                        {node.name || <span className="font-medium text-ink-subtle">(no name yet)</span>}
                      </p>

                      {c.path.length > 0 && (
                        <p className="mt-1 truncate text-[11px] font-medium text-ink-subtle" title={c.path.join(" › ")}>
                          {c.path.join(" › ")}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-semibold text-ink-muted">
                        {node.ownerName && (
                          <span className="inline-flex items-center gap-1">
                            <User size={11} /> {node.ownerName}
                          </span>
                        )}
                        {node.targetDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={11} /> {formatPlanDate(node.targetDate)}
                          </span>
                        )}
                        {isExecutable(node.kind) && !node.task && (
                          <span className="inline-flex items-center gap-1 text-ink-subtle">
                            <CircleDashed size={11} /> not in WMS
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Flatten a plan tree to cards — EVERY row, container or not.
 *
 * Containers are included because they carry their own status (brief §11): a
 * board that showed only actions would leave a Milestone marked Follow Up with
 * nowhere to be seen, and the person who set it wondering where it went. The
 * card's own level badge and typography are what keep the two kinds legible
 * side by side.
 *
 * Numbering comes from the SAME `refFor` the table uses, so a card and its row
 * can never disagree about a reference — a second copy of the numbering rules
 * here would drift the first time either changed.
 */
export function kanbanCards(
  nodes: PlanRow[],
  path: string[] = [],
  out: KanbanCard[] = [],
  parentRef: string | null = null,
): KanbanCard[] {
  nodes.forEach((n, i) => {
    const ref = refFor(n.kind, i + 1, parentRef);
    out.push({ node: n, ref, path });
    kanbanCards(n.children, [...path, n.name], out, ref);
  });
  return out;
}
