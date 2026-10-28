"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ChevronDown, ChevronRight, GripVertical, Pencil, RotateCcw, Users } from "lucide-react";
import type { HierarchyPerson } from "@/lib/queries/hierarchy";
import { moveEmployeeToManager, setEmployeeIsManager } from "@/app/(admin)/admin/hierarchy/actions";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status/status-listbox";
import { statusBadgeStyle } from "@/lib/format";
import { cn } from "@/lib/utils";

type View = "table" | "tree";
type KpiFilter = "people" | "managers" | "no-manager";

type DragDropHandlers = {
  draggable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

interface ColumnData {
  id: string;
  label: string;
  people: HierarchyPerson[];
  manager: HierarchyPerson | null;
  isFixed: boolean;
  isRoot: boolean;
}

const STORAGE_KEY_COL_ORDER = "wms:reporting-hierarchy:column-order:v1";

function isMananVasa(person?: HierarchyPerson | null): boolean {
  if (!person) return false;
  return Boolean(person.isRoot || (person.name && person.name.toLowerCase().includes("manan")));
}

function isUnassigned(person?: HierarchyPerson | null): boolean {
  if (!person) return false;
  return Boolean(!person.managerId && !person.isRoot && !isMananVasa(person));
}

export function ReportingHierarchy({
  people = [],
  inactivePeople = [],
  canEdit = false,
  title = "Reporting Hierarchy",
  embedded: _embedded = false,
}: {
  people?: HierarchyPerson[];
  inactivePeople?: HierarchyPerson[];
  canEdit?: boolean;
  title?: string;
  embedded?: boolean;
}) {
  const [view, setView] = useState<View>("table");
  const [filter, setFilter] = useState<KpiFilter | null>(null);
  const [editing, setEditing] = useState<HierarchyPerson | null>(null);
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set((people ?? []).map((person) => person.id)));

  // Column drag-and-drop state
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dropTargetColId, setDropTargetColId] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  // Tree view drag & drop state
  const [treeDraggedId, setTreeDraggedId] = useState<string | null>(null);
  const [treeDropTargetId, setTreeDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COL_ORDER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCustomOrder(parsed);
        }
      }
    } catch {}
  }, []);

  const byId = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const reportCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) {
      if (person.managerId) {
        counts.set(person.managerId, (counts.get(person.managerId) ?? 0) + 1);
      }
    }
    return counts;
  }, [people]);

  const isManagerNode = (person: HierarchyPerson) =>
    person.isRoot || person.isManager || (reportCounts.get(person.id) ?? 0) > 0;

  const managerOptions = useMemo(
    () => people.filter((person) => person.status === "active" && isManagerNode(person)),
    [people, reportCounts],
  );

  // Table columns: Manan Vasa fixed at far left, middle managers sorted by reports count descending,
  // No Manager Assigned fixed at far right.
  const tableColumns = useMemo((): ColumnData[] => {
    const unassignedPeople = people
      .filter(isUnassigned)
      .sort(compareHierarchyPeople);

    // If filter is "no-manager", only return the "no-manager" column
    if (filter === "no-manager") {
      return [
        {
          id: "no-manager",
          label: "No manager assigned",
          people: unassignedPeople,
          manager: null,
          isFixed: true,
          isRoot: false,
        },
      ];
    }

    // Managers to include:
    // When filter === "managers", only managers are included.
    // When filter === null or "people", all managers are included.
    const allManagers = people.filter(isManagerNode);

    const manan = allManagers.find(isMananVasa) ?? people.find(isMananVasa) ?? null;
    const otherManagers = allManagers.filter((m) => m.id !== manan?.id);

    // Initial sort of other managers: highest reports count closest to Manan Vasa
    const sortedOther = [...otherManagers].sort((a, b) => {
      const countA = reportCounts.get(a.id) ?? 0;
      const countB = reportCounts.get(b.id) ?? 0;
      if (countB !== countA) return countB - countA;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    // Apply custom order if saved
    let orderedMiddle: HierarchyPerson[] = sortedOther;
    if (customOrder.length > 0) {
      const otherMap = new Map(sortedOther.map((m) => [m.id, m]));
      const ordered: HierarchyPerson[] = [];
      for (const id of customOrder) {
        const m = otherMap.get(id);
        if (m) {
          ordered.push(m);
          otherMap.delete(id);
        }
      }
      for (const m of sortedOther) {
        if (otherMap.has(m.id)) {
          ordered.push(m);
        }
      }
      orderedMiddle = ordered;
    }

    const cols: ColumnData[] = [];

    // 1. Manan Vasa at far left (fixed)
    if (manan) {
      cols.push({
        id: manan.id,
        label: manan.name,
        people: reportsFor(people, manan.id),
        manager: manan,
        isFixed: true,
        isRoot: true,
      });
    }

    // 2. Other managers
    for (const m of orderedMiddle) {
      cols.push({
        id: m.id,
        label: m.name,
        people: reportsFor(people, m.id),
        manager: m,
        isFixed: false,
        isRoot: false,
      });
    }

    // 3. No Manager Assigned at far right (fixed) - included unless filter is "managers"
    if (filter !== "managers") {
      cols.push({
        id: "no-manager",
        label: "No manager assigned",
        people: unassignedPeople,
        manager: null,
        isFixed: true,
        isRoot: false,
      });
    }

    return cols;
  }, [people, customOrder, filter, reportCounts]);

  function handleColumnReorder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    // Retrieve middle manager column IDs
    const middleIds = tableColumns.filter((c) => !c.isFixed).map((c) => c.id);
    const srcIndex = middleIds.indexOf(sourceId);
    const tgtIndex = middleIds.indexOf(targetId);
    if (srcIndex === -1 || tgtIndex === -1) return;

    const next = [...middleIds];
    next.splice(srcIndex, 1);
    next.splice(tgtIndex, 0, sourceId);

    setCustomOrder(next);
    try {
      localStorage.setItem(STORAGE_KEY_COL_ORDER, JSON.stringify(next));
    } catch {}
  }

  function resetColumnOrder() {
    setCustomOrder([]);
    try {
      localStorage.removeItem(STORAGE_KEY_COL_ORDER);
    } catch {}
  }

  function toggleFilter(next: KpiFilter) {
    setFilter((current) => (current === next ? null : next));
  }

  function openTransfer(person: HierarchyPerson, nextManagerId = person.managerId ?? "") {
    setEditing(person);
    setManagerId(nextManagerId);
    setError("");
  }

  async function saveManager() {
    if (!editing) return;
    setBusy(true);
    setError("");
    const result = await moveEmployeeToManager({ employeeId: editing.id, managerId: managerId || null });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    window.location.reload();
  }

  async function toggleManager(person: HierarchyPerson) {
    setBusy(true);
    setError("");
    const result = await setEmployeeIsManager(person.id, !person.isManager);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.reload();
  }

  // Tree view drag handlers
  function canDragTree(person: HierarchyPerson) {
    return canEdit && !person.isRoot && person.status === "active";
  }

  function canDropOnTree(managerId: string | null) {
    if (!treeDraggedId || treeDraggedId === managerId) return false;
    if (managerId === null) return true;
    const target = byId.get(managerId);
    return Boolean(target && target.status === "active" && isManagerNode(target));
  }

  function treeDragHandlers(person: HierarchyPerson, managerId?: string | null): DragDropHandlers {
    const dropId = managerId === undefined ? null : managerId ?? "__no-manager__";
    return {
      draggable: canDragTree(person),
      dragging: treeDraggedId === person.id,
      dropTarget: managerId !== undefined && treeDropTargetId === dropId,
      onDragStart: (event) => {
        if (!canDragTree(person)) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", person.id);
        setTreeDraggedId(person.id);
        setError("");
      },
      onDragEnd: () => {
        setTreeDraggedId(null);
        setTreeDropTargetId(null);
      },
      onDragOver: (event) => {
        if (managerId !== undefined && canDropOnTree(managerId)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setTreeDropTargetId(dropId);
        }
      },
      onDrop: (event) => {
        if (managerId !== undefined) {
          event.preventDefault();
          if (!treeDraggedId || !canDropOnTree(managerId)) return;
          const employeeId = treeDraggedId;
          setTreeDraggedId(null);
          setTreeDropTargetId(null);
          void moveByDrag(employeeId, managerId);
        }
      },
    };
  }

  async function moveByDrag(employeeId: string, managerId: string | null) {
    setBusy(true);
    setError("");
    const result = await moveEmployeeToManager({ employeeId, managerId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.changed) window.location.reload();
  }

  const viewToggle = (
    <div
      role="group"
      aria-label="Hierarchy view"
      className="inline-flex rounded-lg border border-hairline bg-surface-soft p-0.5"
    >
      {(["table", "tree"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={view === mode}
          onClick={() => setView(mode)}
          className={`rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-colors cursor-pointer ${
            view === mode
              ? "bg-surface-card text-ink-strong shadow-sm"
              : "text-ink-muted hover:text-ink-strong"
          }`}
        >
          {mode === "table" ? "Table View" : "Tree View"}
        </button>
      ))}
    </div>
  );

  const unassignedCount = useMemo(() => people.filter(isUnassigned).length, [people]);
  const managersCount = useMemo(() => people.filter(isManagerNode).length, [people, reportCounts]);

  const kpis: { key: KpiFilter; label: string; value: number; tone: string }[] = [
    { key: "people", label: "People", value: people.length, tone: "#1d4ed8" },
    { key: "managers", label: "Managers", value: managersCount, tone: "#15803d" },
    {
      key: "no-manager",
      label: "No manager",
      value: unassignedCount,
      tone: "#b45309",
    },
  ];

  return (
    <>
      {/* Main Reporting Hierarchy header at top of page */}
      <PageCommandBar
        title={title}
        actions={
          <div className="flex items-center gap-2">
            {customOrder.length > 0 && view === "table" && (
              <button
                type="button"
                onClick={resetColumnOrder}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[11px] font-bold text-ink-muted transition-colors hover:border-altus-red hover:text-altus-red cursor-pointer"
              >
                <RotateCcw size={12} /> Reset Column Order
              </button>
            )}
            {viewToggle}
          </div>
        }
      />

      {/* KPI Cards section (duplicate heading removed) */}
      <section className="mt-3 rounded-[18px] border border-hairline bg-surface-card px-4 py-3 shadow-sm sm:px-5">
        <div className="grid max-w-xl grid-cols-3 gap-2" role="group" aria-label="Reporting hierarchy filters">
          {kpis.map((kpi) => {
            const selected = filter === kpi.key;
            const tint = "color-mix(in srgb, " + kpi.tone + " 8%, var(--color-surface-card))";
            const iconTint = "color-mix(in srgb, " + kpi.tone + " 12%, transparent)";
            return (
              <button
                key={kpi.key}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleFilter(kpi.key)}
                title={selected ? "Active filter. Click to reset." : "Filter by " + kpi.label}
                className={cn(
                  "group relative rounded-2xl border px-3 py-2.5 text-left transition-all cursor-pointer",
                  "hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  selected
                    ? "shadow-sm ring-2 ring-offset-1"
                    : "hover:border-slate-400 bg-surface-card",
                )}
                style={{
                  borderColor: selected ? kpi.tone : "var(--color-hairline)",
                  backgroundColor: selected ? tint : undefined,
                  boxShadow: selected ? `0 0 0 2px ${kpi.tone}` : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-grid size-7 place-items-center rounded-lg transition-transform group-hover:scale-105"
                      style={{ background: iconTint, color: kpi.tone }}
                    >
                      <Users size={15} strokeWidth={2.4} />
                    </span>
                    <span
                      className="text-[10px] font-black uppercase tracking-[0.08em]"
                      style={{ color: kpi.tone }}
                    >
                      {kpi.label}
                    </span>
                  </span>
                  {selected && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white"
                      style={{ backgroundColor: kpi.tone }}
                    >
                      Active
                    </span>
                  )}
                </div>
                <span className="mt-2 block text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums text-ink-strong">
                  {kpi.value}
                </span>
              </button>
            );
          })}
        </div>
        {filter && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11.5px] font-medium text-ink-muted">
              Filtered by <strong className="text-ink-strong">{kpis.find((k) => k.key === filter)?.label}</strong>
            </span>
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="text-[11.5px] font-bold text-altus-red underline hover:text-red-700 cursor-pointer"
            >
              Reset filter
            </button>
          </div>
        )}
      </section>

      {view === "table" ? (
        <section className="mt-4 overflow-x-auto rounded-xl border border-hairline bg-surface-soft/60 p-4">
          <div className="flex min-w-max items-start gap-3.5">
            {tableColumns.map((column) => {
              const isManan = column.isRoot;
              const isNoManager = column.id === "no-manager";
              const isDraggable = !column.isFixed;
              const isDragging = draggedColId === column.id;
              const isDropTarget = dropTargetColId === column.id;

              return (
                <section
                  key={column.id}
                  draggable={isDraggable}
                  onDragStart={(e) => {
                    if (!isDraggable) return;
                    e.dataTransfer.setData("text/plain", column.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedColId(column.id);
                  }}
                  onDragOver={(e) => {
                    if (!draggedColId || column.isFixed || draggedColId === column.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTargetColId(column.id);
                  }}
                  onDragLeave={() => {
                    if (dropTargetColId === column.id) setDropTargetColId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!draggedColId || column.isFixed || draggedColId === column.id) return;
                    handleColumnReorder(draggedColId, column.id);
                    setDraggedColId(null);
                    setDropTargetColId(null);
                  }}
                  onDragEnd={() => {
                    setDraggedColId(null);
                    setDropTargetColId(null);
                  }}
                  className={cn(
                    "flex w-[280px] min-w-[280px] max-w-[280px] flex-col rounded-xl border bg-surface-card p-3 shadow-sm transition-all duration-150",
                    isDropTarget ? "border-altus-red bg-red-50/40 ring-2 ring-altus-red/40" : "border-hairline",
                    isDragging ? "opacity-40 scale-[0.98]" : "",
                    isDraggable ? "cursor-grab active:cursor-grabbing hover:border-hairline-strong" : "",
                  )}
                >
                  {/* Column Header: Identical dimensions, avatar display, and unified typography */}
                  <header className="mb-3 flex items-center gap-2.5 border-b border-hairline pb-2.5">
                    {column.manager ? (
                      <Avatar name={column.manager.name} avatarUrl={column.manager.avatarUrl} size={34} />
                    ) : (
                      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-soft text-ink-muted">
                        <Users size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3
                          className="break-words text-[13px] font-bold leading-snug text-ink-strong line-clamp-1"
                          title={column.label}
                        >
                          {column.label}
                        </h3>
                        {isManan && (
                          <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[9.5px] font-bold text-altus-red border border-red-200/60">
                            Founder
                          </span>
                        )}
                        {isNoManager && (
                          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700 border border-amber-200/60">
                            Unassigned
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] font-medium text-ink-muted">
                        {column.people.length} {column.people.length === 1 ? "direct report" : "direct reports"}
                      </p>
                    </div>
                    {isDraggable && (
                      <span className="p-0.5 text-ink-subtle hover:text-ink-strong" title="Drag to reorder column">
                        <GripVertical size={15} />
                      </span>
                    )}
                  </header>

                  {/* Column Cards */}
                  <div className="max-h-[calc(100vh-320px)] min-h-[220px] flex-1 space-y-2 overflow-y-auto pr-0.5">
                    {column.people.length === 0 ? (
                      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-hairline text-[11.5px] text-ink-subtle">
                        No direct reports
                      </div>
                    ) : (
                      column.people.map((person) => (
                        <HierarchyCard
                          key={person.id}
                          person={person}
                          canEdit={canEdit}
                          busy={busy}
                          managerOptions={managerOptions}
                          onMove={openTransfer}
                          onToggleManager={toggleManager}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : (
        <HierarchyTree
          people={people}
          expanded={expanded}
          setExpanded={setExpanded}
          canEdit={canEdit}
          dragHandlers={treeDragHandlers}
          filter={filter}
        />
      )}

      {inactivePeople.length > 0 && (
        <section className="mt-5 border-t border-dashed border-hairline pt-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.12em] text-ink-muted">Past / inactive</h2>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {[...inactivePeople].sort(compareHierarchyPeople).map((person) => (
              <OrgNodeCard key={person.id} person={person} />
            ))}
          </div>
        </section>
      )}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-hairline bg-surface-card p-4 shadow-xl">
            <h2 id="transfer-title" className="mb-4 text-[15px] font-bold text-ink-strong">
              Change reporting manager
            </h2>
            <div className="space-y-3 text-[13px]">
              <label className="block text-ink-muted">
                Employee
                <input
                  readOnly
                  value={editing.name}
                  className="mt-1 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 font-semibold text-ink-strong"
                />
              </label>
              <label className="block text-ink-muted">
                Current manager
                <input
                  readOnly
                  value={byId.get(editing.managerId ?? "")?.name ?? "—"}
                  className="mt-1 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-ink-strong"
                />
              </label>
              <label className="block text-ink-muted">
                New manager
                <select
                  value={managerId}
                  onChange={(event) => setManagerId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-ink-strong"
                >
                  <option value="">No manager</option>
                  {managerOptions
                    .filter((person) => person.id !== editing.id)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-[12px] text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-semibold text-ink-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveManager()}
                className="rounded-lg bg-altus-red px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !editing && (
        <p role="alert" className="mt-2 text-[12px] text-red-700">
          {error}
        </p>
      )}
    </>
  );
}

function compareHierarchyPeople(a: HierarchyPerson, b: HierarchyPerson) {
  return (
    Number(a.status === "break") - Number(b.status === "break") ||
    (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) ||
    (a.name ?? "").localeCompare(b.name ?? "")
  );
}

function reportsFor(people: readonly HierarchyPerson[], id: string) {
  return people.filter((person) => person.managerId === id).sort(compareHierarchyPeople);
}

function HierarchyStatusTag({ status }: { status: HierarchyPerson["status"] }) {
  const config =
    status === "active"
      ? { label: "Active", style: statusBadgeStyle("green") }
      : status === "break"
        ? { label: "On break", style: statusBadgeStyle("orange") }
        : { label: "Inactive", style: statusBadgeStyle("slate") };
  return <StatusBadge compact label={config.label} style={config.style} />;
}

function HierarchyCard({
  person,
  canEdit,
  busy,
  managerOptions,
  onMove,
  onToggleManager,
}: {
  person: HierarchyPerson;
  canEdit: boolean;
  busy: boolean;
  managerOptions: HierarchyPerson[];
  onMove: (person: HierarchyPerson, managerId?: string) => void;
  onToggleManager: (person: HierarchyPerson) => void;
}) {
  const editable = canEdit && !person.isRoot && person.status === "active";
  return (
    <article className="rounded-xl border border-hairline bg-white p-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all hover:border-hairline-strong">
      <div className="flex items-center gap-2.5">
        <Avatar name={person.name} avatarUrl={person.avatarUrl} size={30} />
        <div className="min-w-0 flex-1">
          <p
            className="break-words text-[12px] font-bold leading-tight text-ink-strong line-clamp-2"
            title={person.name}
          >
            {person.name}
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-ink-muted">
            {person.functionName || person.role}
          </p>
        </div>
        <div className="shrink-0">
          <HierarchyStatusTag status={person.status} />
        </div>
      </div>
      {editable && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-hairline/60 pt-2">
          <select
            aria-label={"Move " + person.name + " to manager"}
            defaultValue=""
            onChange={(event) => {
              const next = event.target.value;
              if (next !== "") onMove(person, next === "__none__" ? "" : next);
              event.currentTarget.value = "";
            }}
            className="min-w-0 flex-1 rounded-md border border-hairline-strong bg-surface-soft px-2 py-1 text-[11px] font-semibold text-ink-strong outline-none hover:bg-white cursor-pointer"
          >
            <option value="" disabled>
              Move to…
            </option>
            <option value="__none__">No manager</option>
            {managerOptions
              .filter((manager) => manager.id !== person.id)
              .map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            aria-label={(person.isManager ? "Remove" : "Make") + " " + person.name + " manager"}
            disabled={busy}
            onClick={() => void onToggleManager(person)}
            title={person.isManager ? "Remove manager status" : "Make manager"}
            className="rounded-md border border-hairline-strong px-2 py-1 text-[10.5px] font-bold text-ink-muted hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50 cursor-pointer"
          >
            {person.isManager ? "Manager" : <Pencil size={11} />}
          </button>
        </div>
      )}
    </article>
  );
}

function OrgNodeCard({
  person,
  expanded,
  onToggle,
  dragDrop,
}: {
  person: HierarchyPerson;
  expanded?: boolean;
  onToggle?: () => void;
  dragDrop?: DragDropHandlers;
}) {
  return (
    <article
      draggable={dragDrop?.draggable}
      onDragStart={dragDrop?.onDragStart}
      onDragEnd={dragDrop?.onDragEnd}
      onDragOver={dragDrop?.onDragOver}
      onDrop={dragDrop?.onDrop}
      className={`relative flex h-[54px] w-[230px] min-w-[230px] max-w-[230px] shrink-0 items-center gap-2.5 rounded-lg border bg-surface-card px-2.5 py-1.5 shadow-[0_2px_10px_-8px_rgba(15,23,42,0.32)] ${
        dragDrop?.dropTarget ? "border-altus-red bg-red-50/50 ring-2 ring-altus-red/30" : "border-hairline"
      } ${dragDrop?.draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragDrop?.dragging ? "opacity-50" : ""}`}
    >
      <Avatar name={person.name} avatarUrl={person.avatarUrl} size={28} />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="break-words text-[11.5px] font-bold leading-tight text-ink-strong line-clamp-1" title={person.name}>
          {person.name}
        </p>
        <p className="truncate text-[10px] text-ink-subtle">{person.functionName || person.role}</p>
      </div>
      <div className="shrink-0">
        <HierarchyStatusTag status={person.status} />
      </div>
      {onToggle && (
        <button
          type="button"
          aria-label={(expanded ? "Collapse" : "Expand") + " " + person.name}
          onClick={onToggle}
          className="absolute -right-2.5 top-1/2 grid size-[18px] -translate-y-1/2 place-items-center rounded-full border border-hairline bg-surface-card text-ink-muted shadow-sm hover:bg-surface-soft cursor-pointer"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      )}
    </article>
  );
}

function VerticalBranch({
  person,
  people = [],
  expanded,
  setExpanded,
  dragHandlers,
  seen = new Set<string>(),
}: {
  person: HierarchyPerson;
  people: readonly HierarchyPerson[];
  expanded: Set<string>;
  setExpanded: (value: Set<string>) => void;
  dragHandlers: (person: HierarchyPerson, managerId?: string | null) => DragDropHandlers;
  seen?: Set<string>;
}) {
  if (seen.has(person.id)) return null;
  const branch = new Set(seen).add(person.id);
  const reports = reportsFor(people, person.id);
  const isOpen = expanded.has(person.id);
  const toggle = reports.length
    ? () => {
        const next = new Set(expanded);
        if (next.has(person.id)) next.delete(person.id);
        else next.add(person.id);
        setExpanded(next);
      }
    : undefined;
  const nodeDrag = dragHandlers(person, person.isManager || reports.length > 0 ? person.id : undefined);

  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard person={person} expanded={isOpen} onToggle={toggle} dragDrop={nodeDrag} />
      {isOpen && reports.length ? (
        <div className="relative mt-3 flex flex-col items-center gap-2.5 pt-3 before:absolute before:left-1/2 before:top-0 before:h-3 before:border-l before:border-slate-300">
          {reports.map((child) => (
            <div
              key={child.id}
              className="relative flex flex-col items-center before:absolute before:-top-3 before:left-1/2 before:h-3 before:border-l before:border-slate-300"
            >
              <VerticalBranch
                person={child}
                people={people}
                expanded={expanded}
                setExpanded={setExpanded}
                dragHandlers={dragHandlers}
                seen={branch}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyManagerGroup({
  people = [],
  dragHandlers,
}: {
  people: readonly HierarchyPerson[];
  dragHandlers: (person: HierarchyPerson, managerId?: string | null) => DragDropHandlers;
}) {
  return (
    <div className="flex min-w-[190px] flex-col items-center">
      <p className="mb-2 text-[9px] font-black uppercase tracking-[0.1em] text-ink-muted">No direct reports</p>
      <div className="flex flex-col items-center gap-2">
        {people.map((person) => (
          <OrgNodeCard key={person.id} person={person} dragDrop={dragHandlers(person, person.id)} />
        ))}
      </div>
    </div>
  );
}

function HierarchyTree({
  people = [],
  expanded,
  setExpanded,
  canEdit: _canEdit,
  dragHandlers,
  filter,
}: {
  people: readonly HierarchyPerson[];
  expanded: Set<string>;
  setExpanded: (value: Set<string>) => void;
  canEdit: boolean;
  dragHandlers: (person: HierarchyPerson, managerId?: string | null) => DragDropHandlers;
  filter?: KpiFilter | null;
}) {
  // If KPI filter is "no-manager", render directly the unassigned employees
  if (filter === "no-manager") {
    const unassigned = people.filter(isUnassigned).sort(compareHierarchyPeople);
    return (
      <section className="mt-4 rounded-xl border border-hairline bg-surface-card p-5">
        <h3 className="mb-3 text-[12px] font-black uppercase tracking-[0.08em] text-ink-strong">
          Employees without an assigned manager ({unassigned.length})
        </h3>
        {unassigned.length === 0 ? (
          <p className="text-[13px] text-ink-muted">All employees have an assigned manager.</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {unassigned.map((person) => (
              <OrgNodeCard key={person.id} person={person} dragDrop={dragHandlers(person)} />
            ))}
          </div>
        )}
      </section>
    );
  }

  const root = people.find((person) => person.isRoot) ?? null;
  const unassigned = people
    .filter(isUnassigned)
    .sort(compareHierarchyPeople);

  if (!root) {
    return (
      <section className="mt-4 border-t border-hairline pt-4">
        {unassigned.length ? (
          <div className="flex flex-wrap gap-2.5">
            {unassigned.map((person) => (
              <OrgNodeCard key={person.id} person={person} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">No people found.</p>
        )}
      </section>
    );
  }

  const directReports = reportsFor(people, root.id);
  const isManager = (person: HierarchyPerson) => person.isManager || reportsFor(people, person.id).length > 0;
  const managers = directReports.filter(isManager);
  const populatedManagers = managers
    .filter((person) => reportsFor(people, person.id).length > 0)
    .sort(compareHierarchyPeople);
  const emptyManagers = managers
    .filter((person) => reportsFor(people, person.id).length === 0)
    .sort(compareHierarchyPeople);
  const directEmployees = directReports.filter((person) => !isManager(person)).sort(compareHierarchyPeople);
  const activeManagerBranches = populatedManagers.filter((person) => person.status !== "break");
  const breakManagerBranches = populatedManagers.filter((person) => person.status === "break");
  const rootOpen = expanded.has(root.id);
  const toggleRoot = directReports.length
    ? () => {
        const next = new Set(expanded);
        if (next.has(root.id)) next.delete(root.id);
        else next.add(root.id);
        setExpanded(next);
      }
    : undefined;
  const hasBranches =
    activeManagerBranches.length + directEmployees.length + breakManagerBranches.length + emptyManagers.length > 0;
  const rootDrag = dragHandlers(root, root.id);
  const noManagerDrop = dragHandlers(root, null);

  return (
    <section className="mt-4 overflow-x-auto py-3">
      <div className="min-w-max px-3 pb-2">
        <div className="flex flex-col items-center">
          <OrgNodeCard person={root} expanded={rootOpen} onToggle={toggleRoot} dragDrop={rootDrag} />
          {rootOpen && hasBranches ? (
            <div className="relative mt-6 flex items-start justify-center gap-7 border-t border-slate-300 px-5 pt-4 before:absolute before:left-1/2 before:-top-6 before:h-6 before:border-l before:border-slate-300">
              {activeManagerBranches.map((person) => (
                <TreeBranch
                  key={person.id}
                  person={person}
                  people={people}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  dragHandlers={dragHandlers}
                />
              ))}
              {directEmployees.map((person) => (
                <TreeBranch
                  key={person.id}
                  person={person}
                  people={people}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  dragHandlers={dragHandlers}
                />
              ))}
              {breakManagerBranches.map((person) => (
                <TreeBranch
                  key={person.id}
                  person={person}
                  people={people}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  dragHandlers={dragHandlers}
                />
              ))}
              {emptyManagers.length ? (
                <div className="relative before:absolute before:-top-4 before:left-1/2 before:h-4 before:border-l before:border-slate-300">
                  <EmptyManagerGroup people={emptyManagers} dragHandlers={dragHandlers} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {unassigned.length > 0 && filter !== "managers" && (
          <section
            onDragOver={noManagerDrop.onDragOver}
            onDrop={noManagerDrop.onDrop}
            className={`mt-8 rounded-lg border border-dashed p-3 transition-colors ${
              noManagerDrop.dropTarget ? "border-altus-red bg-red-50/50 ring-2 ring-altus-red/30" : "border-hairline"
            }`}
          >
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-ink-muted">
              No manager assigned ({unassigned.length})
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {unassigned.map((person) => (
                <OrgNodeCard key={person.id} person={person} dragDrop={dragHandlers(person)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

function TreeBranch({
  person,
  people = [],
  expanded,
  setExpanded,
  dragHandlers,
}: {
  person: HierarchyPerson;
  people: readonly HierarchyPerson[];
  expanded: Set<string>;
  setExpanded: (value: Set<string>) => void;
  dragHandlers: (person: HierarchyPerson, managerId?: string | null) => DragDropHandlers;
}) {
  return (
    <div className="relative before:absolute before:-top-4 before:left-1/2 before:h-4 before:border-l before:border-slate-300">
      <VerticalBranch
        person={person}
        people={people}
        expanded={expanded}
        setExpanded={setExpanded}
        dragHandlers={dragHandlers}
      />
    </div>
  );
}
