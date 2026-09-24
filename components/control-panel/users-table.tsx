"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import type { ControlPanelUser } from "@/lib/queries/control-panel";

type GroupKey = "none" | "functionName" | "designationName" | "entityName" | "roleNames";

export function ControlPanelUsersTable({ users }: { users: ControlPanelUser[] }) {
  const [view, setView] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const visible = useMemo(() => users.filter((u) => u.isActive === (view === "active")).filter((u) => {
    const q = search.trim().toLocaleLowerCase();
    return !q || [u.name, u.employeeCode, u.functionName, u.designationName, u.entityName, ...u.roleNames].some((v) => v?.toLocaleLowerCase().includes(q));
  }).sort((a, b) => a.name.localeCompare(b.name) * (sortAsc ? 1 : -1)), [users, view, search, sortAsc]);
  const groups = useMemo(() => {
    if (groupBy === "none") return [["", visible] as const];
    const map = new Map<string, ControlPanelUser[]>();
    for (const user of visible) {
      const value = groupBy === "roleNames" ? user.roleNames.join(", ") : user[groupBy];
      const key = typeof value === "string" && value ? value : "Unassigned";
      (map.get(key) ?? map.set(key, []).get(key)!).push(user);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [groupBy, visible]);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-hairline bg-surface-soft p-0.5">{(["active", "inactive"] as const).map((key) => <button key={key} type="button" onClick={() => setView(key)} className={`rounded px-3 py-1.5 text-[12px] font-semibold ${view === key ? "bg-white text-ink-strong shadow-sm" : "text-ink-muted"}`}>{key === "active" ? "Active" : "Inactive"}</button>)}</div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees" className="h-8 min-w-[220px] flex-1 rounded-md border border-hairline bg-white px-2.5 text-[12px]" />
      <button type="button" onClick={() => setSortAsc((v) => !v)} className="h-8 rounded-md border border-hairline bg-white px-2.5 text-[12px] font-semibold text-ink-soft">Name {sortAsc ? "A-Z" : "Z-A"}</button>
      <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupKey)} className="h-8 rounded-md border border-hairline bg-white px-2.5 text-[12px] text-ink-soft"><option value="none">Group by: None</option><option value="functionName">Function</option><option value="designationName">Designation</option><option value="entityName">Entity</option><option value="roleNames">Role</option></select>
    </div>
    <div className="overflow-x-auto rounded-lg border border-hairline bg-white"><table className="w-full min-w-[900px] border-collapse text-left"><thead><tr>{["S. No.", "Employee", "Employee ID", "Function", "Designation", "Entity", "Role", "Status"].map((h) => <th key={h} className="border-b border-hairline-strong px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">{h}</th>)}</tr></thead><tbody>{groups.map(([group, rows]) => <tr key={`${group}-group`}><td colSpan={8} className="p-0"><>{group && <div className="bg-surface-soft px-3 py-2 text-[11px] font-bold text-ink-muted">{group}</div>}{rows.map((u, index) => <div key={u.id} className="grid grid-cols-[64px_1.5fr_1fr_1.1fr_1.1fr_1fr_1.2fr_90px] items-center border-b border-hairline px-3 py-2 text-[12.5px] last:border-0"><span className="text-ink-muted">{index + 1}</span><Link href={`/control-panel/effective-access?emp=${u.id}` as Route} className="font-semibold text-ink-strong hover:underline">{u.name}</Link><span className="text-ink-soft">{u.employeeCode ?? "—"}</span><span className="text-ink-soft">{u.functionName ?? "—"}</span><span className="text-ink-soft">{u.designationName ?? "—"}</span><span className="text-ink-soft">{u.entityName ?? "—"}</span><span className="text-ink-soft">{u.roleNames.join(", ") || "—"}</span><span className="font-semibold">{u.isActive ? "Active" : "Inactive"}</span></div>)}</></td></tr>)}</tbody></table>{visible.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-ink-muted">No {view} users found.</p>}</div>
  </div>;
}
