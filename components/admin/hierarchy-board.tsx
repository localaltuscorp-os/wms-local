"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { History, Move, Users2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import {
  moveEmployeeToManager,
  fetchManagerHistory,
} from "@/app/(admin)/admin/hierarchy/actions";

/**
 * THE REPORTING HIERARCHY, as a Kanban board.
 *
 * One column per manager, their reports as cards. Drag a card to another column
 * to change who that person reports to.
 *
 * ── DRAG IS THE AFFORDANCE, THE MENU IS THE MECHANISM ──────────────────────
 * Every card also carries a "Move to…" select, and it is not a fallback nobody
 * uses. Dragging cannot be done with a keyboard alone in any way a person would
 * discover, it is unreliable inside a horizontally-scrolling row on a phone, and
 * this board can be twelve columns wide — dragging from the first to the last
 * means dragging while the container scrolls. The select works everywhere, so
 * the board is fully usable without ever dragging anything.
 *
 * ── THE UNASSIGNED COLUMN IS A REAL DESTINATION ────────────────────────────
 * "No manager assigned" accepts drops, because removing somebody from a team is
 * a thing an admin needs to do and there is otherwise no target for it. It is
 * also where managers themselves legitimately sit (nobody manages them).
 */

export interface BoardPerson {
  id: string;
  name: string;
  email: string;
  department: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  managerId: string | null;
  reportCount: number;
}

export interface BoardColumn {
  managerId: string | null;
  managerName: string;
  managerEmail: string | null;
  reports: BoardPerson[];
}

interface Props {
  columns: BoardColumn[];
  /** Everyone who could be a manager — the "Move to…" options. */
  people: BoardPerson[];
  canEdit: boolean;
}

/** dnd-kit ids must be strings; the unassigned column has no uuid. */
const UNASSIGNED = "__unassigned__";
const colId = (managerId: string | null) => managerId ?? UNASSIGNED;
const fromColId = (id: string) => (id === UNASSIGNED ? null : id);

export function HierarchyBoard({ columns, people, canEdit }: Props) {
  const router = useRouter();
  const [dragging, setDragging] = useState<BoardPerson | null>(null);
  const [historyFor, setHistoryFor] = useState<BoardPerson | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryPeriod[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [, startTransition] = useTransition();

  /** Open the history dialog and load that person's periods. The fetch lives in
   *  the click handler, so the dialog itself stays a pure presenter. */
  function openHistory(person: BoardPerson) {
    setHistoryFor(person);
    setHistoryRows([]);
    setHistoryState("loading");
    void fetchManagerHistory(person.id).then(
      (res) => {
        if (res.ok) {
          setHistoryRows(res.periods);
          setHistoryState("ready");
        } else {
          setHistoryState("error");
        }
      },
      () => setHistoryState("error"),
    );
  }

  const sensors = useSensors(
    // A 6px threshold so a click on the card's own controls is not read as a
    // drag — the same constraint the ambassadors pipeline uses.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const nameOf = (id: string | null) =>
    id ? (byId.get(id)?.name ?? "Former employee") : "No manager assigned";

  function move(person: BoardPerson, managerId: string | null) {
    if ((person.managerId ?? null) === managerId) return;
    startTransition(async () => {
      const res = await moveEmployeeToManager({ employeeId: person.id, managerId });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: managerId
          ? `${person.name} now reports to ${nameOf(managerId)}.`
          : `${person.name} no longer reports to anyone.`,
      });
      router.refresh();
    });
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(byId.get(String(e.active.id)) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    const person = byId.get(String(e.active.id));
    setDragging(null);
    if (!person || !e.over) return;
    move(person, fromColId(String(e.over.id)));
  }

  return (
    <>
      <div
        className="mb-4 rounded-lg px-3.5 py-3 text-[13px] text-[#334155]"
        style={{ background: "rgba(15,23,42,0.035)", lineHeight: 1.6 }}
      >
        Moving someone changes their reporting manager everywhere at once — tasks,
        goals, DCC, KPI, approvals, manager and team dashboards all read this one
        relationship live. Reports about <strong>past</strong> months keep the
        manager who was in place then; the change applies from today forward.
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-3">
          {columns.map((c) => (
            <Column
              key={colId(c.managerId)}
              column={c}
              people={people}
              canEdit={canEdit}
              onMove={move}
              onHistory={openHistory}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
          {dragging ? (
            <div className="w-[248px] rotate-1">
              <CardBody person={dragging} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <HistoryDialog
        person={historyFor}
        rows={historyRows}
        state={historyState}
        nameOf={nameOf}
        onClose={() => setHistoryFor(null)}
      />
    </>
  );
}

function Column({
  column,
  people,
  canEdit,
  onMove,
  onHistory,
}: {
  column: BoardColumn;
  people: BoardPerson[];
  canEdit: boolean;
  onMove: (p: BoardPerson, managerId: string | null) => void;
  onHistory: (p: BoardPerson) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(column.managerId) });
  const isUnassigned = column.managerId === null;

  return (
    <section
      ref={setNodeRef}
      className="flex w-[268px] shrink-0 flex-col rounded-2xl border p-3 transition-colors"
      style={{
        borderColor: isOver ? "#E10600" : "#E2E8F0",
        background: isOver ? "rgba(225,6,0,0.03)" : isUnassigned ? "#F8FAFC" : "#fff",
      }}
    >
      <header className="mb-3 px-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[14px] font-semibold text-[#0F172A]">
            {column.managerName}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-[#F1F5F9] px-2 py-0.5 text-[11.5px] font-semibold text-[#64748B]">
            <Users2 size={11} strokeWidth={2.4} />
            {column.reports.length}
          </span>
        </div>
        {column.managerEmail && (
          <p className="truncate text-[12px] text-[#94A3B8]">{column.managerEmail}</p>
        )}
        {isUnassigned && (
          <p className="mt-1 text-[12px] text-[#94A3B8]" style={{ lineHeight: 1.45 }}>
            Nobody above them in the chart. Managers themselves normally sit here.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-2">
        {column.reports.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#E2E8F0] px-3 py-4 text-center text-[12.5px] text-[#94A3B8]">
            {canEdit ? "Drop somebody here" : "No reports"}
          </p>
        ) : (
          column.reports.map((p) => (
            <Card
              key={p.id}
              person={p}
              people={people}
              canEdit={canEdit}
              onMove={onMove}
              onHistory={onHistory}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Card({
  person,
  people,
  canEdit,
  onMove,
  onHistory,
}: {
  person: BoardPerson;
  people: BoardPerson[];
  canEdit: boolean;
  onMove: (p: BoardPerson, managerId: string | null) => void;
  onHistory: (p: BoardPerson) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: person.id,
    disabled: !canEdit,
  });

  /**
   * Who this person may be moved under.
   *
   * Excludes themselves, and excludes their own current manager (a no-op). It
   * does NOT try to exclude their descendants — that needs the transitive
   * downline, which is a server question, and `setReportingManager` refuses a
   * cycle with a clear message. Offering a choice that is then explained is
   * better than a filtered list that silently omits names an admin is looking
   * for.
   */
  const options = people
    .filter((p) => p.id !== person.id && p.id !== person.managerId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <article
      ref={setNodeRef}
      className="rounded-xl border border-[#E2E8F0] bg-white p-2.5"
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      <div
        {...(canEdit ? { ...attributes, ...listeners } : {})}
        className={canEdit ? "cursor-grab active:cursor-grabbing" : undefined}
      >
        <CardBody person={person} />
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {canEdit && (
          <label className="min-w-0 flex-1">
            <span className="sr-only">Move {person.name} to another manager</span>
            <select
              className="w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5 text-[12px] text-[#334155]"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                onMove(person, v === UNASSIGNED ? null : v);
                e.currentTarget.value = "";
              }}
            >
              <option value="">Move to…</option>
              {person.managerId && <option value={UNASSIGNED}>No manager</option>}
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => onHistory(person)}
          title="Reporting history"
          aria-label={`Reporting history for ${person.name}`}
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-[#CBD5E1] p-1.5 text-[#64748B] hover:text-[#0F172A]"
        >
          <History size={13} strokeWidth={2.2} />
        </button>
      </div>
    </article>
  );
}

function CardBody({ person }: { person: BoardPerson }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={person.name} avatarUrl={person.avatarUrl} size={30} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#0F172A]">{person.name}</p>
        <p className="truncate text-[11.5px] text-[#94A3B8]">
          {person.department ?? person.email}
        </p>
      </div>
      {person.reportCount > 0 && (
        <span
          className="ml-auto shrink-0 rounded-pill bg-[#EEF2FF] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#4338CA]"
          title={`${person.reportCount} people report to ${person.name}`}
        >
          <Move size={9} strokeWidth={2.6} className="mr-0.5 inline" />
          {person.reportCount}
        </span>
      )}
    </div>
  );
}

export interface HistoryPeriod {
  managerId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
}

/**
 * The reporting history for one person.
 *
 * A PURE PRESENTER — the fetch is kicked off by the click handler that opens it
 * (see `openHistory` in the board), not from inside this component. Loading data
 * as a side effect of rendering would mean either a setState during render or a
 * `useEffect` that the repo's lint rules refuse; doing it in the event handler
 * is where the work actually belongs, since it is caused by a click.
 *
 * Fetched on open rather than shipped with the board: the board already carries
 * the whole roster, and every employee's full history alongside it would be a
 * much larger payload for something read one card at a time.
 */
function HistoryDialog({
  person,
  rows,
  state,
  nameOf,
  onClose,
}: {
  person: BoardPerson | null;
  rows: HistoryPeriod[];
  state: "loading" | "ready" | "error";
  nameOf: (id: string | null) => string;
  onClose: () => void;
}) {
  if (!person) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Reporting history for ${person.name}`}
      onClick={onClose}
    >
      <div
        className="slim-scroll max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl text-[#0F172A]">{person.name}</h3>
        <p className="mb-4 text-[13.5px] text-[#64748B]" style={{ lineHeight: 1.55 }}>
          Who they reported to, and when. Reports about a past period read this,
          so an old month keeps the manager it actually had.
        </p>

        {state === "loading" && <p className="text-[13px] text-[#94A3B8]">Loading…</p>}
        {state === "error" && (
          <p className="text-[13px] text-[#A80400]">Could not load the history.</p>
        )}
        {state === "ready" && rows.length === 0 && (
          <p className="text-[13px] text-[#94A3B8]">No reporting history recorded yet.</p>
        )}

        {rows.length > 0 && (
          <ol className="space-y-2.5">
            {[...rows].reverse().map((r, i) => (
              <li key={`${r.effectiveFrom}-${i}`} className="flex gap-3 text-[13px]">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: r.effectiveTo ? "#94A3B8" : "var(--color-green)" }}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F172A]">{nameOf(r.managerId)}</p>
                  <p className="text-[12.5px] text-[#64748B]">
                    {r.effectiveFrom} → {r.effectiveTo ?? "now"}
                  </p>
                  {r.note && (
                    <p className="text-[12px] text-[#94A3B8]" style={{ lineHeight: 1.5 }}>
                      {r.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#CBD5E1] px-4 py-2 text-[14px] font-medium text-[#334155]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
