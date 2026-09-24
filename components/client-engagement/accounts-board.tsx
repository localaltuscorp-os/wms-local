"use client";

import * as React from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowRightLeft, GripVertical, Plus, Search, UserPlus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { ceAssignAccount } from "@/app/(app)/operations/client-engagement/actions";
import { accountLabel, CE_CATEGORIES, categoryNeedsBatch } from "@/lib/client-engagement/constants";
import { isInactiveAccount, lifecycleLabel } from "@/lib/client-engagement/status";
import { formatDuration } from "@/lib/client-engagement/schedule";
import type { Load, MemberCapacity } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { AccountDialog } from "./account-dialog";
import { TransferDialog } from "./transfer-dialog";
import { BTN_PRIMARY, CARD, CARD_SHADOW, DISPLAY, FIELD, HhStatusPill, Select, statusEdge, Toolbar } from "./ui";

/**
 * OVERVIEW — every account, by category, split Active | Inactive.
 *
 * Categories are the brief's numbered sections (1 Retainer … 5 Corporate; the
 * Reference Pipeline is its own tab). Inside each, the left pane is ACTIVE
 * accounts in one swimlane per person (Unassigned first, because that pool is
 * the thing to act on), and the right pane is INACTIVE / ON HOLD, also by
 * person, so a paused client still shows whose they are.
 */

type Tab = (typeof CE_CATEGORIES)[number]["code"];

export function AccountsBoard({
  accounts,
  members,
  capacity,
  loads,
  callCounts,
  canManage,
  myMemberId,
  initialTab,
  referencesSlot,
}: {
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  capacity: MemberCapacity[];
  loads: Record<string, Load>;
  /** Scheduled calls per account (any week) — a transfer moves them. */
  callCounts: Record<string, number>;
  canManage: boolean;
  myMemberId: string | null;
  initialTab?: string;
  /** The Reference Pipeline, rendered by the page, shown as the sixth tab. */
  referencesSlot: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<Tab | "references">(
    initialTab === "references" || CE_CATEGORIES.some((c) => c.code === initialTab) ? (initialTab as Tab) : "ps",
  );
  const [query, setQuery] = React.useState("");
  const [batch, setBatch] = React.useState("");
  const [memberFilter, setMemberFilter] = React.useState("");
  const [editing, setEditing] = React.useState<CeAccountRow | "new" | null>(null);
  const [moving, setMoving] = React.useState<CeAccountRow | null>(null);

  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name] as const)), [members]);
  const batches = React.useMemo(
    () => [...new Set(accounts.map((a) => a.batchCode).filter((b): b is string => Boolean(b)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [accounts],
  );

  const counts = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of accounts) out[a.category] = (out[a.category] ?? 0) + 1;
    return out;
  }, [accounts]);

  const category = tab === "references" ? null : CE_CATEGORIES.find((c) => c.code === tab)!;
  const cohortBatches = category?.batch ? [...new Set(accounts.filter((a) => a.category === category.code && a.batchCode).map((a) => a.batchCode!))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];

  const q = query.trim().toLowerCase();
  const inTab = category
    ? accounts.filter(
        (a) =>
          a.category === category.code &&
          (!batch || a.batchCode === batch) &&
          (!memberFilter || (memberFilter === "none" ? !a.assignedTo : a.assignedTo === memberFilter)) &&
          (!q || `${a.fullName} ${a.organization ?? ""} ${a.batchCode ?? ""} ${a.tags.join(" ")}`.toLowerCase().includes(q)),
      )
    : [];
  const active = inTab.filter((a) => !isInactiveAccount(a));
  const inactive = inTab.filter((a) => isInactiveAccount(a));

  const canEdit = (a: CeAccountRow) => canManage || (myMemberId !== null && a.assignedTo === myMemberId);

  return (
    <>
      {/* Category tabs — the brief's numbered sections. */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
        {CE_CATEGORIES.map((c, i) => (
          <TabButton key={c.code} active={tab === c.code} onClick={() => { setTab(c.code); setBatch(""); }} num={i + 1} label={c.section} count={counts[c.code] ?? 0} />
        ))}
        <TabButton active={tab === "references"} onClick={() => setTab("references")} num={6} label="Reference Pipeline" />
      </div>

      {tab === "references" ? (
        referencesSlot
      ) : (
        <>
          <Toolbar>
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} strokeWidth={2.4} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                className={`${FIELD} pl-9`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Local search — ${category!.section.toLowerCase()}`}
                title="Local search — filters only the list on this page"
              />
            </div>
            {category!.batch ? (
              <Select value={batch} onChange={setBatch} ariaLabel="Cohort" className="w-[150px] shrink-0">
                <option value="">All cohorts</option>
                {cohortBatches.map((b) => (
                  <option key={b} value={b}>
                    {category!.label}
                    {b}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select value={memberFilter} onChange={setMemberFilter} ariaLabel="Team member" className="w-[170px] shrink-0">
              <option value="">Everyone</option>
              <option value="none">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
              <Plus size={14} strokeWidth={2.8} /> Add {category!.group === "P" ? "participant" : category!.group === "A" ? "ambassador" : "client"}
            </button>
          </Toolbar>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Pane title="Active" count={active.length} tone="green">
              <Lanes
                accounts={active}
                members={members}
                memberName={memberName}
                loads={loads}
                canManage={canManage}
                onOpen={setEditing}
                onMove={setMoving}
                emptyText={`No active ${category!.section.toLowerCase()}${q || batch || memberFilter ? " match these filters" : " yet"}.`}
                showIdle
              />
            </Pane>
            <Pane title="Inactive / On hold" count={inactive.length} tone="amber">
              <Lanes
                accounts={inactive}
                members={members}
                memberName={memberName}
                loads={loads}
                canManage={canManage}
                onOpen={setEditing}
                onMove={setMoving}
                emptyText="Nothing inactive or on hold."
                inactive
              />
            </Pane>
          </div>
        </>
      )}

      {editing ? (
        <AccountDialog
          account={editing === "new" ? null : editing}
          defaultCategory={category?.code}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          batches={batches}
          canManage={canManage}
          canEdit={editing === "new" ? true : canEdit(editing)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {moving ? (
        <TransferDialog
          accountId={moving.id}
          label={accountLabel(moving.fullName, moving.batchCode)}
          currentMemberId={moving.assignedTo}
          capacity={capacity}
          hasCalls={(callCounts[moving.id] ?? 0) > 0}
          onClose={() => setMoving(null)}
        />
      ) : null}
    </>
  );
}

function TabButton({ active, onClick, num, label, count }: { active: boolean; onClick: () => void; num: number; label: string; count?: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3 text-[12.5px] font-bold transition-colors"
      style={
        active
          ? {
              borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
              background: "color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card))",
              color: "var(--color-altus-red-deep)",
            }
          : { borderColor: "var(--color-hairline)", background: "var(--color-surface-card)", color: "var(--color-ink-soft)" }
      }
    >
      <span className="text-[11px] font-black opacity-60">{num}.</span>
      {label}
      {count !== undefined ? (
        <span
          className="rounded-full px-1.5 text-[11px] tabular-nums"
          style={{ background: active ? "color-mix(in srgb, var(--color-altus-red) 14%, transparent)" : "var(--color-surface-soft)" }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Pane({ title, count, tone, children }: { title: string; count: number; tone: "green" | "amber"; children: React.ReactNode }) {
  return (
    <section className={`${CARD} min-w-0 p-3`} style={CARD_SHADOW}>
      <header className="mb-2.5 flex items-center gap-2 px-1">
        <span className="size-2 rounded-full" style={{ background: `var(--color-${tone}-deep)` }} />
        <h2 className="text-[15px] font-extrabold text-ink-strong" style={DISPLAY}>
          {title}
        </h2>
        <span className="rounded-full bg-surface-soft px-2 py-px text-[11.5px] font-bold tabular-nums text-ink-muted">{count}</span>
      </header>
      {children}
    </section>
  );
}

function Lanes({
  accounts,
  members,
  memberName,
  loads,
  canManage,
  onOpen,
  onMove,
  emptyText,
  inactive = false,
  showIdle = false,
}: {
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  memberName: Map<string, string>;
  loads: Record<string, Load>;
  canManage: boolean;
  onOpen: (a: CeAccountRow) => void;
  onMove: (a: CeAccountRow) => void;
  emptyText: string;
  inactive?: boolean;
  /** List the people carrying nothing here, so spare hands are visible. */
  showIdle?: boolean;
}) {
  /* Memoised because `dropLanes` below derives from it: a fresh array every
     render would make that memo recompute every render, which is the same as
     not having one. */
  const lanes = React.useMemo(() => {
    const out: { id: string | null; name: string; rows: CeAccountRow[] }[] = [];
    const unassigned = accounts.filter((a) => !a.assignedTo || !memberName.has(a.assignedTo));
    if (unassigned.length) out.push({ id: null, name: "Unassigned", rows: unassigned });
    for (const m of members) {
      const rows = accounts.filter((a) => a.assignedTo === m.id);
      if (rows.length) out.push({ id: m.id, name: m.name, rows });
    }
    return out;
  }, [accounts, members, memberName]);

  const idle = showIdle ? members.filter((m) => !accounts.some((a) => a.assignedTo === m.id)) : [];

  /* ── DRAG AND DROP ──────────────────────────────────────────────────────
     Dropping a card on a lane is the SAME operation as the Assign / Transfer
     button beside it — both call `ceAssignAccount`, which is manager-gated on
     the server, moves the account's scheduled calls with it, reports clashes
     and writes the audit row. Drag is a faster way to reach it, never a second
     way of doing it, so there is no second code path to keep in step.

     The button STAYS. Drag is unavailable to keyboard-only use in any
     satisfying way here, and on touch it competes with scrolling — the button
     is the accessible path and the only one that offers "Return to
     Unassigned". */
  const [dragging, setDragging] = React.useState<CeAccountRow | null>(null);
  const [saving, setSaving] = React.useState(false);

  // 6px before a drag starts, so a click on the card's own buttons is still a
  // click; touch waits 220ms so a finger can scroll the board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const UNASSIGNED_LANE = "__unassigned__";

  /* WHILE DRAGGING, EVERY ACTIVE MEMBER IS A LANE. Lanes are otherwise built
     only from people who already carry something, which left nowhere to drop
     somebody's FIRST account — the one case where the drag is most useful. */
  const dropLanes = React.useMemo(() => {
    if (!dragging) return lanes;
    const shown = new Set(lanes.map((l) => l.id));
    const extra = members
      .filter((m) => m.isActive && !shown.has(m.id))
      .map((m) => ({ id: m.id as string | null, name: m.name, rows: [] as CeAccountRow[] }));
    const withUnassigned = shown.has(null)
      ? lanes
      : [{ id: null as string | null, name: "Unassigned", rows: [] as CeAccountRow[] }, ...lanes];
    return [...withUnassigned, ...extra];
  }, [dragging, lanes, members]);

  function onDragStart(e: DragStartEvent) {
    const a = accounts.find((x) => x.id === String(e.active.id));
    if (a) setDragging(a);
  }

  async function onDragEnd(e: DragEndEvent) {
    const account = dragging;
    setDragging(null);
    if (!account || !e.over) return;

    const overId = String(e.over.id);
    const to = overId === UNASSIGNED_LANE ? null : overId;
    if ((account.assignedTo ?? null) === to) return;

    setSaving(true);
    const res = await ceAssignAccount(account.id, to);
    setSaving(false);

    // The action's verdict is reported, never assumed. It refuses a return to
    // Unassigned while calls are still booked, and it counts the calls that now
    // clash with the new owner's calendar — the same wording the dialog uses,
    // because it is the same answer.
    if (!res.ok) {
      fireToast({ message: res.error, type: "error", duration: 9000 });
      return;
    }
    const name = to === null ? "Unassigned" : (memberName.get(to) ?? "someone");
    fireToast({
      message: res.clashes
        ? `Moved to ${name}. ${res.clashes} call${res.clashes === 1 ? "" : "s"} now overlap their calendar. Re-time them there.`
        : `Moved to ${name}`,
      type: res.clashes ? "info" : "success",
      duration: res.clashes ? 9000 : undefined,
    });
  }

  if (!lanes.length) {
    return (
      <p className="rounded-xl border border-dashed border-hairline-strong px-3 py-6 text-center text-[12.5px] font-medium text-ink-subtle">
        {emptyText}
      </p>
    );
  }

  const board = (
    <div className="grid items-start gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
      {(canManage ? dropLanes : lanes).map((lane) => (
        <Lane key={lane.id ?? UNASSIGNED_LANE} lane={lane} droppable={canManage} dropId={lane.id ?? UNASSIGNED_LANE}>
          {lane.rows.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              load={loads[a.id]}
              inactive={inactive}
              canManage={canManage}
              draggable={canManage && !saving}
              laneId={lane.id}
              onOpen={onOpen}
              onMove={onMove}
            />
          ))}
        </Lane>
      ))}
    </div>
  );

  return (
    <>
      {canManage ? (
        <DndContext
          /* A STATED id, because dnd-kit numbers its own accessibility ids from
             a module counter that runs independently on the server and in the
             browser: without this the markup hydrates with
             aria-describedby="DndDescribedBy-0" against "-4" and React throws
             the whole subtree away (seen 2026-09-22). */
          id="ce-accounts-board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          {board}
          {/* The ghost under the cursor. Rendered outside the lanes so no lane
              clips it, and deliberately plain: it says what is being moved, it
              is not a second copy of the card. */}
          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
            {dragging ? (
              <div
                className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-card py-1.5 pl-2.5 pr-3 shadow-lg"
                style={{ borderLeft: `3px solid ${statusEdge(dragging.hhStatus)}` }}
              >
                <GripVertical size={13} className="text-ink-subtle" />
                <span className="truncate text-[13px] font-bold text-ink-strong">
                  {accountLabel(dragging.fullName, dragging.batchCode)}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        board
      )}
      {idle.length ? (
        <p className="mt-2.5 px-1 text-[11.5px] font-medium text-ink-subtle">
          Carrying none here: {idle.map((m) => m.name).join(", ")}
        </p>
      ) : null}
    </>
  );
}

/** One owner's column, and - when the viewer may assign - a drop target. */
function Lane({
  lane,
  dropId,
  droppable,
  children,
}: {
  lane: { id: string | null; name: string; rows: CeAccountRow[] };
  dropId: string;
  droppable: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled: !droppable });
  const unassigned = lane.id === null;
  return (
    <div
      ref={setNodeRef}
      className="min-w-0 rounded-xl border transition-colors"
      style={{
        // `isOver` is the only thing that says "let go here". Without it, a drop
        // onto one of several identically-coloured columns is a guess.
        borderColor: isOver
          ? "var(--color-altus-red)"
          : unassigned
            ? "color-mix(in srgb, var(--color-altus-red) 30%, transparent)"
            : "var(--color-hairline)",
        background: isOver
          ? "color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card))"
          : unassigned
            ? "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))"
            : "var(--color-surface-soft)",
        borderStyle: unassigned ? "dashed" : "solid",
      }}
    >
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2">
        {unassigned ? <UserPlus size={13} strokeWidth={2.4} className="text-altus-red" /> : null}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-ink-soft">{lane.name}</span>
        <span className="text-[11.5px] font-bold tabular-nums text-ink-subtle">{lane.rows.length}</span>
      </div>
      {/* min-h keeps an EMPTY lane a usable target: a header with nothing under
          it gives a drag nowhere to aim. */}
      <ul className={`grid gap-1 px-1.5 pb-1.5 ${lane.rows.length ? "" : "min-h-[44px]"}`}>{children}</ul>
    </div>
  );
}

/** One account. Draggable to another lane when the viewer may assign. */
function AccountCard({
  account: a,
  load,
  inactive,
  canManage,
  draggable,
  laneId,
  onOpen,
  onMove,
}: {
  account: CeAccountRow;
  load: Load | undefined;
  inactive: boolean;
  canManage: boolean;
  draggable: boolean;
  laneId: string | null;
  onOpen: (a: CeAccountRow) => void;
  onMove: (a: CeAccountRow) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: a.id, disabled: !draggable });
  return (
    <li ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : undefined }}>
      <div
        className="group flex items-center gap-2 rounded-lg border border-hairline bg-surface-card py-1.5 pl-2.5 pr-1.5 transition-colors hover:border-hairline-strong"
        style={{ borderLeft: `3px solid ${statusEdge(a.hhStatus)}`, opacity: inactive ? 0.92 : 1 }}
      >
        {/* A drag HANDLE, not the whole card. The card body is a button that
            opens the record and its right edge is another that transfers it;
            making the whole card draggable would put a 6px-tolerance drag in
            front of both. */}
        {draggable ? (
          <span
            {...attributes}
            {...listeners}
            className="-ml-1 shrink-0 cursor-grab touch-none text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            title="Drag to another person"
            aria-label={`Drag ${a.fullName} to another person`}
          >
            <GripVertical size={13} strokeWidth={2.2} />
          </span>
        ) : null}
        <button type="button" onClick={() => onOpen(a)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-bold text-ink-strong">{accountLabel(a.fullName, a.batchCode)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <HhStatusPill status={a.hhStatus} small />
            {inactive && a.lifecycleStatus !== "active" ? (
              <span className="rounded-full bg-surface-soft px-1.5 py-px text-[10px] font-bold text-ink-muted">{lifecycleLabel(a.lifecycleStatus)}</span>
            ) : null}
            {!inactive ? (
              <span className="text-[11px] tabular-nums text-ink-subtle">
                {load && load.calls ? `${load.calls} call${load.calls === 1 ? "" : "s"} · ${formatDuration(load.minutes)} / wk` : "No calls this week"}
              </span>
            ) : null}
            {a.organization && !categoryNeedsBatch(a.category) ? (
              <span className="truncate text-[11px] text-ink-subtle">· {a.organization}</span>
            ) : null}
          </span>
        </button>
        {canManage ? (
          <button
            type="button"
            onClick={() => onMove(a)}
            title={laneId === null ? "Assign" : "Transfer"}
            aria-label={`${laneId === null ? "Assign" : "Transfer"} ${a.fullName}`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11.5px] font-bold text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red-deep"
          >
            <ArrowRightLeft size={13} strokeWidth={2.4} />
            {laneId === null ? "Assign" : null}
          </button>
        ) : null}
      </div>
    </li>
  );
}
