"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Users } from "lucide-react";
import type { HierarchyPerson } from "@/lib/queries/hierarchy";
import { moveEmployeeToManager, setEmployeeIsManager } from "@/app/(admin)/admin/hierarchy/actions";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status/status-listbox";
import { statusBadgeStyle } from "@/lib/format";

type View = "table" | "tree";
type KpiFilter = "people" | "managers" | "no-manager";

export function ReportingHierarchy({ people, inactivePeople = [], canEdit = false, title = "Reporting Hierarchy", embedded = false }: {
  people: HierarchyPerson[]; inactivePeople?: HierarchyPerson[]; canEdit?: boolean; title?: string; embedded?: boolean;
}) {
  const [view, setView] = useState<View>("table");
  const [filter, setFilter] = useState<KpiFilter | null>(null);
  const [editing, setEditing] = useState<HierarchyPerson | null>(null);
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(people.map((person) => person.id)));
  const byId = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const reportCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) if (person.managerId) counts.set(person.managerId, (counts.get(person.managerId) ?? 0) + 1);
    return counts;
  }, [people]);
  const isManagerNode = (person: HierarchyPerson) => person.isRoot || person.isManager || (reportCounts.get(person.id) ?? 0) > 0;
  const matchesFilter = (person: HierarchyPerson) => !filter || filter === "people" || (filter === "managers" ? isManagerNode(person) : !person.managerId);
  const visiblePeople = useMemo(() => people.filter(matchesFilter), [people, filter, reportCounts]);
  const managerOptions = useMemo(() => people.filter((person) => person.status === "active" && isManagerNode(person)), [people, reportCounts]);
  const childrenOf = (source: readonly HierarchyPerson[], id: string) => reportsFor(source, id);
  const tableColumns = useMemo(() => {
    const noManager = visiblePeople.filter((person) => !person.managerId).sort(compareHierarchyPeople);
    const managers = people.filter(isManagerNode).filter((manager) => visiblePeople.some((person) => person.managerId === manager.id) || matchesFilter(manager)).sort(compareHierarchyPeople);
    return [{ id: "no-manager", label: "No manager assigned", people: noManager }, ...managers.map((manager) => ({ id: manager.id, label: manager.name, people: childrenOf(visiblePeople, manager.id) }))];
  }, [people, visiblePeople, filter, reportCounts]);

  function toggleFilter(next: KpiFilter) { setFilter((current) => current === next ? null : next); }
  function openTransfer(person: HierarchyPerson, nextManagerId = person.managerId ?? "") { setEditing(person); setManagerId(nextManagerId); setError(""); }
  async function saveManager() {
    if (!editing) return;
    setBusy(true); setError("");
    const result = await moveEmployeeToManager({ employeeId: editing.id, managerId: managerId || null });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setEditing(null); window.location.reload();
  }
  async function toggleManager(person: HierarchyPerson) {
    setBusy(true); setError("");
    const result = await setEmployeeIsManager(person.id, !person.isManager);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    window.location.reload();
  }

  const viewToggle = <div role="group" aria-label="Hierarchy view" className="inline-flex rounded-lg border border-hairline bg-surface-soft p-0.5">{(["table", "tree"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={`rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-colors ${view === mode ? "bg-surface-card text-ink-strong shadow-sm" : "text-ink-muted hover:text-ink-strong"}`}>{mode === "table" ? "Table View" : "Tree View"}</button>)}</div>;
  const kpis: { key: KpiFilter; label: string; value: number; tone: string }[] = [
    { key: "people", label: "People", value: people.length, tone: "#1d4ed8" },
    { key: "managers", label: "Managers", value: people.filter(isManagerNode).length, tone: "#15803d" },
    { key: "no-manager", label: "No manager", value: people.filter((person) => !person.managerId).length, tone: "#b45309" },
  ];
  const header = <section className="rounded-[18px] border border-hairline bg-surface-card px-4 py-3 shadow-sm sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-[21px] font-black tracking-[-0.035em] text-ink-strong">{title}</h2>{embedded ? viewToggle : null}</div><div className="mt-3 grid max-w-xl grid-cols-3 gap-2" role="group" aria-label="Reporting hierarchy filters">{kpis.map((kpi) => { const selected = filter === kpi.key; const tint = "color-mix(in srgb, " + kpi.tone + " 8%, var(--color-surface-card))"; const iconTint = "color-mix(in srgb, " + kpi.tone + " 10%, transparent)"; return <button key={kpi.key} type="button" aria-pressed={selected} onClick={() => toggleFilter(kpi.key)} className={"rounded-2xl border px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 " + (selected ? "ring-2 ring-altus-red ring-offset-1" : "hover:border-hairline-strong")} style={{ borderColor: selected ? kpi.tone : "var(--color-hairline)", background: selected ? tint : "var(--color-surface-card)" }}><span className="flex items-center gap-2"><span className="inline-grid size-7 place-items-center rounded-lg" style={{ background: iconTint, color: kpi.tone }}><Users size={15} strokeWidth={2.4} /></span><span className="text-[9px] font-black uppercase tracking-[0.08em]" style={{ color: kpi.tone }}>{kpi.label}</span></span><span className="mt-1.5 block text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums text-ink-strong">{kpi.value}</span></button>; })}</div></section>;
  return <>
    {embedded ? header : <><PageCommandBar title={title} actions={viewToggle} />{header}</>}
    {view === "table" ? <section className="mt-4 overflow-x-auto rounded-xl border border-hairline bg-surface-soft/70 p-3"><div className="grid min-w-max grid-flow-col auto-cols-[232px] gap-3">{tableColumns.map((column) => <section key={column.id} className="min-h-[185px] rounded-xl border border-hairline bg-surface-card p-2.5"><header className="mb-2 flex items-center justify-between gap-2 px-0.5"><span className="truncate text-[12px] font-black text-ink-strong">{column.label}</span><span className="rounded-md bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-ink-muted">{column.people.length}</span></header><div className="space-y-2">{column.people.map((person) => <HierarchyCard key={person.id} person={person} canEdit={canEdit} busy={busy} managerOptions={managerOptions} onMove={openTransfer} onToggleManager={toggleManager} />)}</div></section>)}</div></section> : <HierarchyTree people={visiblePeople} expanded={expanded} setExpanded={setExpanded} />}
    {inactivePeople.length > 0 ? <section className="mt-5 border-t border-dashed border-hairline pt-4"><h2 className="text-[10px] font-black uppercase tracking-[0.12em] text-ink-muted">Past / inactive</h2><div className="mt-3 flex flex-wrap gap-2.5">{[...inactivePeople].sort(compareHierarchyPeople).map((person) => <OrgNodeCard key={person.id} person={person} />)}</div></section> : null}
    {editing ? <div role="dialog" aria-modal="true" aria-labelledby="transfer-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><div className="w-full max-w-md rounded-xl border border-hairline bg-surface-card p-4 shadow-xl"><h2 id="transfer-title" className="mb-4 text-[15px] font-bold text-ink-strong">Change reporting manager</h2><div className="space-y-3 text-[13px]"><label className="block text-ink-muted">Employee<input readOnly value={editing.name} className="mt-1 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 font-semibold text-ink-strong" /></label><label className="block text-ink-muted">Current manager<input readOnly value={byId.get(editing.managerId ?? "")?.name ?? "—"} className="mt-1 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-ink-strong" /></label><label className="block text-ink-muted">New manager<select value={managerId} onChange={(event) => setManagerId(event.target.value)} className="mt-1 w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-ink-strong"><option value="">No manager</option>{managerOptions.filter((person) => person.id !== editing.id).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div>{error ? <p role="alert" className="mt-3 text-[12px] text-red-700">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-semibold text-ink-muted">Cancel</button><button type="button" disabled={busy} onClick={() => void saveManager()} className="rounded-lg bg-altus-red px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button></div></div></div> : null}
    {error && !editing ? <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p> : null}
  </>;
}

function compareHierarchyPeople(a: HierarchyPerson, b: HierarchyPerson) { return Number(a.status === "break") - Number(b.status === "break") || (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.name.localeCompare(b.name); }
function reportsFor(people: readonly HierarchyPerson[], id: string) { return people.filter((person) => person.managerId === id).sort(compareHierarchyPeople); }
function HierarchyStatusTag({ status }: { status: HierarchyPerson["status"] }) { const config = status === "active" ? { label: "Active", style: statusBadgeStyle("green") } : status === "break" ? { label: "On break", style: statusBadgeStyle("orange") } : { label: "Inactive", style: statusBadgeStyle("slate") }; return <StatusBadge compact label={config.label} style={config.style} />; }
function HierarchyCard({ person, canEdit, busy, managerOptions, onMove, onToggleManager }: { person: HierarchyPerson; canEdit: boolean; busy: boolean; managerOptions: HierarchyPerson[]; onMove: (person: HierarchyPerson, managerId?: string) => void; onToggleManager: (person: HierarchyPerson) => void; }) { const editable = canEdit && !person.isRoot && person.status === "active"; return <article className="rounded-[11px] border border-hairline bg-surface-card p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"><div className="flex min-w-0 items-center gap-2"><Avatar name={person.name} avatarUrl={person.avatarUrl} size={28} /><div className="min-w-0 flex-1"><p className="truncate text-[11.5px] font-black text-ink-strong">{person.name}</p><p className="truncate text-[10px] text-ink-subtle">{person.functionName || person.role}</p></div><HierarchyStatusTag status={person.status} /></div>{editable ? <div className="mt-2 flex items-center gap-1.5"><select aria-label={"Move " + person.name + " to manager"} defaultValue="" onChange={(event) => { const next = event.target.value; if (next !== "") onMove(person, next === "__none__" ? "" : next); event.currentTarget.value = ""; }} className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-card px-2 py-1 text-[10px] font-semibold text-ink-muted"><option value="" disabled>Move to…</option><option value="__none__">No manager</option>{managerOptions.filter((manager) => manager.id !== person.id).map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select><button type="button" aria-label={(person.isManager ? "Remove" : "Make") + " " + person.name + " manager"} disabled={busy} onClick={() => void onToggleManager(person)} className="rounded-md border border-hairline px-1.5 py-1 text-[9px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50">{person.isManager ? "Manager" : <Pencil size={11} />}</button></div> : null}</article>; }
function OrgNodeCard({ person, expanded, onToggle }: { person: HierarchyPerson; expanded?: boolean; onToggle?: () => void }) { return <article className="relative flex min-w-[178px] max-w-[224px] items-center gap-2 rounded-lg border border-hairline bg-surface-card px-2.5 py-2 shadow-[0_2px_10px_-8px_rgba(15,23,42,0.32)]"><Avatar name={person.name} avatarUrl={person.avatarUrl} size={25} /><div className="min-w-0 flex-1"><p className="truncate text-[11.5px] font-black text-ink-strong">{person.name}</p><p className="truncate text-[9.5px] text-ink-subtle">{person.functionName || person.role}</p></div><HierarchyStatusTag status={person.status} />{onToggle ? <button type="button" aria-label={(expanded ? "Collapse" : "Expand") + " " + person.name} onClick={onToggle} className="absolute -right-2.5 top-1/2 grid size-[18px] -translate-y-1/2 place-items-center rounded-full border border-hairline bg-surface-card text-ink-muted shadow-sm hover:bg-surface-soft">{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</button> : null}</article>; }
function VerticalBranch({ person, people, expanded, setExpanded, seen = new Set<string>() }: { person: HierarchyPerson; people: readonly HierarchyPerson[]; expanded: Set<string>; setExpanded: (value: Set<string>) => void; seen?: Set<string>; }) { if (seen.has(person.id)) return null; const branch = new Set(seen).add(person.id); const reports = reportsFor(people, person.id); const isOpen = expanded.has(person.id); const toggle = reports.length ? () => { const next = new Set(expanded); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); setExpanded(next); } : undefined; return <div className="flex flex-col items-center"><OrgNodeCard person={person} expanded={isOpen} onToggle={toggle} />{isOpen && reports.length ? <div className="relative mt-3 flex flex-col items-center gap-2.5 pt-3 before:absolute before:left-1/2 before:top-0 before:h-3 before:border-l before:border-slate-300">{reports.map((child) => <div key={child.id} className="relative flex flex-col items-center before:absolute before:-top-3 before:left-1/2 before:h-3 before:border-l before:border-slate-300"><VerticalBranch person={child} people={people} expanded={expanded} setExpanded={setExpanded} seen={branch} /></div>)}</div> : null}</div>; }
function EmptyManagerGroup({ people }: { people: readonly HierarchyPerson[] }) { return <div className="flex min-w-[190px] flex-col items-center"><p className="mb-2 text-[9px] font-black uppercase tracking-[0.1em] text-ink-muted">No direct reports</p><div className="flex flex-col items-center gap-2">{people.map((person) => <OrgNodeCard key={person.id} person={person} />)}</div></div>; }
function HierarchyTree({ people, expanded, setExpanded }: { people: readonly HierarchyPerson[]; expanded: Set<string>; setExpanded: (value: Set<string>) => void; }) {
  const root = people.find((person) => person.isRoot) ?? null;
  const unassigned = people.filter((person) => !person.managerId && !person.isRoot).sort(compareHierarchyPeople);
  if (!root) return <section className="mt-4 border-t border-hairline pt-4">{unassigned.length ? <div className="flex flex-wrap gap-2.5">{unassigned.map((person) => <OrgNodeCard key={person.id} person={person} />)}</div> : <p className="text-[13px] text-ink-muted">No people match this filter.</p>}</section>;
  const directReports = reportsFor(people, root.id);
  const isManager = (person: HierarchyPerson) => person.isManager || reportsFor(people, person.id).length > 0;
  const managers = directReports.filter(isManager);
  const populatedManagers = managers.filter((person) => reportsFor(people, person.id).length > 0).sort(compareHierarchyPeople);
  const emptyManagers = managers.filter((person) => reportsFor(people, person.id).length === 0).sort(compareHierarchyPeople);
  const directEmployees = directReports.filter((person) => !isManager(person)).sort(compareHierarchyPeople);
  const activeManagerBranches = populatedManagers.filter((person) => person.status !== "break");
  const breakManagerBranches = populatedManagers.filter((person) => person.status === "break");
  const rootOpen = expanded.has(root.id);
  const toggleRoot = directReports.length ? () => { const next = new Set(expanded); if (next.has(root.id)) next.delete(root.id); else next.add(root.id); setExpanded(next); } : undefined;
  const hasBranches = activeManagerBranches.length + directEmployees.length + breakManagerBranches.length + emptyManagers.length > 0;
  return <section className="mt-4 overflow-x-auto py-3"><div className="min-w-max px-3 pb-2"><div className="flex flex-col items-center"><OrgNodeCard person={root} expanded={rootOpen} onToggle={toggleRoot} />{rootOpen && hasBranches ? <div className="relative mt-6 flex items-start justify-center gap-7 border-t border-slate-300 px-5 pt-4 before:absolute before:left-1/2 before:-top-6 before:h-6 before:border-l before:border-slate-300">{activeManagerBranches.map((person) => <TreeBranch key={person.id} person={person} people={people} expanded={expanded} setExpanded={setExpanded} />)}{directEmployees.map((person) => <TreeBranch key={person.id} person={person} people={people} expanded={expanded} setExpanded={setExpanded} />)}{breakManagerBranches.map((person) => <TreeBranch key={person.id} person={person} people={people} expanded={expanded} setExpanded={setExpanded} />)}{emptyManagers.length ? <div className="relative before:absolute before:-top-4 before:left-1/2 before:h-4 before:border-l before:border-slate-300"><EmptyManagerGroup people={emptyManagers} /></div> : null}</div> : null}</div>{unassigned.length > 0 ? <section className="mt-8 border-t border-dashed border-hairline pt-4"><h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-ink-muted">No manager assigned</h3><div className="flex flex-wrap gap-2.5">{unassigned.map((person) => <OrgNodeCard key={person.id} person={person} />)}</div></section> : null}</div></section>;
}
function TreeBranch({ person, people, expanded, setExpanded }: { person: HierarchyPerson; people: readonly HierarchyPerson[]; expanded: Set<string>; setExpanded: (value: Set<string>) => void; }) { return <div className="relative before:absolute before:-top-4 before:left-1/2 before:h-4 before:border-l before:border-slate-300"><VerticalBranch person={person} people={people} expanded={expanded} setExpanded={setExpanded} /></div>; }
