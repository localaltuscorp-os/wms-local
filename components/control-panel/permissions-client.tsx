"use client";

import * as React from "react";
import { fetchEmployeeMatrix, setModulePermission } from "@/app/master-admin/actions";

type Node = { key: string; label: string; depth: number; module: string };
type ModuleGroup = { module: string; nodes: Node[] };

/** Existing Show / View / Edit matrix, arranged for compact scanning. */
export function PermissionsClient({ users, nodes }: { users: { id: string; name: string }[]; nodes: Node[] }) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [overrides, setOverrides] = React.useState<Record<string, { show: boolean; view: boolean; edit: boolean }>>({});
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!employeeId) return;
    fetchEmployeeMatrix(employeeId).then((result) => {
      if (result.ok) setOverrides(result.overrides);
      else setError(result.error);
      setLoaded(true);
    });
  }, [employeeId]);

  const columns = React.useMemo(() => splitModules(nodes), [nodes]);

  const selectEmployee = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    setLoaded(false);
    setError("");
  };

  const toggle = (nodeKey: string, field: "show" | "view" | "edit") => {
    const current = overrides[nodeKey] ?? { show: true, view: true, edit: true };
    const next = { ...current, [field]: !current[field] };
    setOverrides((value) => ({ ...value, [nodeKey]: next }));
    void setModulePermission({ employeeId, nodeKey, show: next.show, view: next.view, edit: next.edit }).then((result) => {
      if (!result.ok) setError(result.error ?? "Failed to save.");
    });
  };

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-altus-red bg-altus-red-soft px-3 py-2 text-[12.5px] font-semibold text-altus-red">{error}</p>}

      <label className="flex max-w-sm flex-col gap-1">
        <span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Employee</span>
        <select value={employeeId} onChange={(event) => selectEmployee(event.target.value)} className="rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[13px] font-semibold text-ink-strong">
          <option value="">Select employee</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>

      {employeeId && loaded && (
        <div className="grid gap-3 xl:grid-cols-2">
          {columns.map((column, index) => (
            <div key={index} className="space-y-3">
              {column.map((group) => (
                <section key={group.module} className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
                  <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,44px)] items-center border-b border-hairline px-3 py-2">
                    <p className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">{group.module}</p>
                    <span className="text-center text-[10px] font-bold text-ink-muted">S</span>
                    <span className="text-center text-[10px] font-bold text-ink-muted">V</span>
                    <span className="text-center text-[10px] font-bold text-ink-muted">E</span>
                  </div>
                  <div className="divide-y divide-hairline">
                    {group.nodes.map((node) => {
                      const access = overrides[node.key] ?? { show: true, view: true, edit: true };
                      return (
                        <div key={node.key} className="grid grid-cols-[minmax(0,1fr)_repeat(3,44px)] items-center px-3 py-1.5" style={{ paddingLeft: 12 + node.depth * 10 }}>
                          <span className="truncate text-[12px] text-ink-strong">{node.label}</span>
                          <Check label="Show" checked={access.show} onChange={() => toggle(node.key, "show")} />
                          <Check label="View" checked={access.view} onChange={() => toggle(node.key, "view")} />
                          <Check label="Edit" checked={access.edit} onChange={() => toggle(node.key, "edit")} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function splitModules(nodes: Node[]): [ModuleGroup[], ModuleGroup[]] {
  const groups = new Map<string, Node[]>();
  for (const node of nodes) (groups.get(node.module) ?? groups.set(node.module, []).get(node.module)!).push(node);

  const columns: [ModuleGroup[], ModuleGroup[]] = [[], []];
  const sizes: [number, number] = [0, 0];
  for (const [module, moduleNodes] of groups) {
    const index: 0 | 1 = sizes[0] <= sizes[1] ? 0 : 1;
    columns[index].push({ module, nodes: moduleNodes });
    sizes[index] += moduleNodes.length;
  }
  return columns;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <input aria-label={label} type="checkbox" checked={checked} onChange={onChange} className="mx-auto h-3.5 w-3.5 accent-[#e10600]" />;
}
