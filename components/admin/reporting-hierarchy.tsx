"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import type { HierarchyPerson } from "@/lib/queries/hierarchy";
import { moveEmployeeToManager, setEmployeeIsManager } from "@/app/(admin)/admin/hierarchy/actions";
import { PageCommandBar } from "@/components/layout/page-command-bar";

type View = "table" | "tree";
type SortKey = "name" | "functionName" | "role" | "manager" | "status";

export function ReportingHierarchy({
  people,
  inactivePeople = [],
  canEdit = false,
  title = "Reporting Hierarchy",
}: {
  people: HierarchyPerson[];
  inactivePeople?: HierarchyPerson[];
  canEdit?: boolean;
  title?: string;
}) {
  const [view, setView] = useState<View>("table");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
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
  const sortedPeople = useMemo(() => [...people].sort((a, b) => {
    const value = (person: HierarchyPerson): string => {
      if (sort.key === "manager") return byId.get(person.managerId ?? "")?.name ?? "";
      if (sort.key === "status") return person.status === "active" ? "0" : "1";
      return person[sort.key] ?? "";
    };
    const compared = String(value(a)).localeCompare(String(value(b)), undefined, { numeric: true, sensitivity: "base" });
    return (sort.direction === "asc" ? compared : -compared) || a.name.localeCompare(b.name);
  }), [people, sort, byId]);

  function sortBy(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  async function saveManager() {
    if (!editing) return;
    setBusy(true);
    setError("");
    const result = await moveEmployeeToManager({ employeeId: editing.id, managerId: managerId || null });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setEditing(null);
    window.location.reload();
  }

  async function toggleManager(person: HierarchyPerson) {
    setBusy(true);
    setError("");
    const result = await setEmployeeIsManager(person.id, !person.isManager);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    window.location.reload();
  }

  const managerOptions = people.filter((person) => person.status === "active" && (person.isRoot || person.isManager || (reportCounts.get(person.id) ?? 0) > 0));
  const root = people.find((person) => person.isRoot);
  const children = (id: string) => people
    .filter((person) => person.managerId === id)
    .sort((a, b) => Number(a.status === "break") - Number(b.status === "break") || (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.name.localeCompare(b.name));
  const roots = people.filter((person) => !person.managerId && !person.isRoot).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageCommandBar title={title} actions={
        <div role="group" aria-label="Hierarchy view" className="inline-flex rounded-lg border border-hairline bg-surface-soft p-0.5">
          {(["table", "tree"] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-colors ${view === mode ? "bg-surface-card text-ink-strong shadow-sm" : "text-ink-muted hover:text-ink-strong"}`}>
              {mode === "table" ? "Table View" : "Tree View"}
            </button>
          ))}
        </div>
      } />

      {view === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-card">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-surface-soft text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              <tr>{([["name", "Employee"], ["functionName", "Function"], ["role", "Role"], ["manager", "Reports To"], ["status", "Status"]] as [SortKey, string][]).map(([key, label]) => (
                <th key={key} className="px-3.5 py-2.5"><button type="button" onClick={() => sortBy(key)} className="inline-flex items-center gap-1 hover:text-ink-strong">{label}{sort.key === key ? sort.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}</button></th>
              ))}<th className="px-3.5 py-2.5">{canEdit ? "Actions" : ""}</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline text-[13px] text-ink-strong">
              {sortedPeople.map((person) => <tr key={person.id} className="hover:bg-surface-soft/60">
                <td className="px-3.5 py-2.5 font-semibold">{person.name}</td>
                <td className="px-3.5 py-2.5 text-ink-muted">{person.functionName || "—"}</td>
                <td className="px-3.5 py-2.5">{person.role}</td>
                <td className="px-3.5 py-2.5 text-ink-muted">{byId.get(person.managerId ?? "")?.name ?? "—"}</td>
                <td className="px-3.5 py-2.5"><StatusTag status={person.status} /></td>
                <td className="px-3.5 py-2.5">{canEdit && !person.isRoot && person.status === "active" ? <div className="flex gap-1.5">
                  <button type="button" onClick={() => { setEditing(person); setManagerId(person.managerId ?? ""); setError(""); }} className="inline-flex items-center gap-1 rounded-md border border-hairline-strong px-2 py-1 text-[11px] font-semibold text-ink-muted hover:bg-surface-soft"><Pencil size={12} /> Transfer</button>
                  <button type="button" disabled={busy} onClick={() => void toggleManager(person)} className="rounded-md border border-hairline-strong px-2 py-1 text-[11px] font-semibold text-ink-muted hover:bg-surface-soft">{person.isManager ? "Remove Manager" : "Make Manager"}</button>
                </div> : null}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-hairline bg-surface-card p-4 max-md:p-3">
          {root ? <TreeNode person={root} getChildren={children} expanded={expanded} setExpanded={setExpanded} /> : <p className="text-[13px] text-ink-muted">Founder is not in the active hierarchy.</p>}
          {roots.length ? <section className="mt-3 border-t border-hairline pt-3"><h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">No manager assigned</h2><div className="flex flex-wrap gap-2">{roots.map((person) => <PersonCard key={person.id} person={person} />)}</div></section> : null}
        </div>
      )}

      {inactivePeople.length > 0 ? <section className="mt-5 overflow-hidden rounded-xl border border-hairline bg-surface-card">
        <h2 className="border-b border-hairline px-4 py-3 text-[13px] font-bold text-ink-strong">Inactive</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[12.5px]"><tbody className="divide-y divide-hairline">{inactivePeople.map((person) => <tr key={person.id}><td className="px-3.5 py-2.5 font-semibold text-ink-strong">{person.name}</td><td className="px-3.5 py-2.5 text-ink-muted">{person.functionName || "—"}</td><td className="px-3.5 py-2.5">{byId.get(person.managerId ?? "")?.name ?? "—"}</td><td className="px-3.5 py-2.5"><StatusTag status="inactive" /></td></tr>)}</tbody></table></div>
      </section> : null}

      {editing ? <div role="dialog" aria-modal="true" aria-labelledby="transfer-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <div className="w-full max-w-md rounded-xl border border-hairline bg-surface-card p-4 shadow-xl">
          <h2 id="transfer-title" className="mb-4 text-[15px] font-bold text-ink-strong">Change reporting manager</h2>
          <div className="space-y-3 text-[13px]"><label className="block text-ink-muted">Employee<input readOnly value={editing.name} className="mt-1 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 font-semibold text-ink-strong" /></label>
            <label className="block text-ink-muted">Current Manager<input readOnly value={byId.get(editing.managerId ?? "")?.name ?? "—"} className="mt-1 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-ink-strong" /></label>
            <label className="block text-ink-muted">New Manager<select value={managerId} onChange={(event) => setManagerId(event.target.value)} className="mt-1 w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-ink-strong"><option value="">No manager</option>{managerOptions.filter((person) => person.id !== editing.id).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          </div>
          {error ? <p role="alert" className="mt-3 text-[12px] text-red-700">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-semibold text-ink-muted">Cancel</button><button type="button" disabled={busy} onClick={() => void saveManager()} className="rounded-lg bg-altus-red px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button></div>
        </div>
      </div> : null}
      {error && !editing ? <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p> : null}
    </>
  );
}

function StatusTag({ status }: { status: HierarchyPerson["status"] }) {
  const tone = status === "active" ? "bg-[#e9f7ef] text-[#15803d]" : status === "break" ? "bg-[#fef3e2] text-[#b45309]" : "bg-[#fce8e8] text-[#b42318]";
  return <span className={`inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold ${tone}`}>{status === "break" ? "On a Break" : status === "inactive" ? "Inactive" : "Active"}</span>;
}

function PersonCard({ person }: { person: HierarchyPerson }) {
  return <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[12.5px] font-semibold text-ink-strong"><span>{person.name}</span><StatusTag status={person.status} /></div>;
}

function TreeNode({ person, getChildren, expanded, setExpanded, seen = new Set<string>() }: {
  person: HierarchyPerson;
  getChildren: (id: string) => HierarchyPerson[];
  expanded: Set<string>;
  setExpanded: (value: Set<string>) => void;
  seen?: Set<string>;
}) {
  if (seen.has(person.id)) return null;
  const branch = new Set(seen).add(person.id);
  const reports = getChildren(person.id);
  const isOpen = expanded.has(person.id);
  return <div className="min-w-0">
    <div className="flex items-center gap-2">
      {reports.length ? <button type="button" aria-label={`${isOpen ? "Collapse" : "Expand"} ${person.name}`} onClick={() => { const next = new Set(expanded); if (isOpen) next.delete(person.id); else next.add(person.id); setExpanded(next); }} className="rounded-md p-1 text-ink-subtle hover:bg-surface-soft">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="w-[23px]" />}
      <PersonCard person={person} />
    </div>
    {isOpen && reports.length ? <div className="ml-3 border-l border-hairline pl-4 pt-2"><div className="space-y-2">{reports.map((child) => <TreeNode key={child.id} person={child} getChildren={getChildren} expanded={expanded} setExpanded={setExpanded} seen={branch} />)}</div></div> : null}
  </div>;
}
