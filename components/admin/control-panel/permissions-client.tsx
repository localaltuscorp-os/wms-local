"use client";

import * as React from "react";
import { fetchEmployeeMatrix, setModulePermission } from "@/app/master-admin/actions";

type Node = { key: string; label: string; depth: number; module: string };

/**
 * The per-employee permission matrix, compact. Select a person, then toggle
 * show / view / edit per module node. Every toggle calls the existing
 * `setModulePermission` action (master-admin gated), which also writes the
 * immutable Logs.
 */
export function PermissionsClient({
  users,
  nodes,
}: {
  users: { id: string; name: string }[];
  nodes: Node[];
}) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [overrides, setOverrides] = React.useState<Record<string, { show: boolean; view: boolean; edit: boolean }>>({});
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!employeeId) return;
    setLoaded(false);
    fetchEmployeeMatrix(employeeId).then((res) => {
      if (res.ok) setOverrides(res.overrides);
      else setError(res.error);
      setLoaded(true);
    });
  }, [employeeId]);

  const toggle = (nodeKey: string, field: "show" | "view" | "edit") => {
    const cur = overrides[nodeKey] ?? { show: true, view: true, edit: true };
    const next = { ...cur, [field]: !cur[field] };
    setOverrides((o) => ({ ...o, [nodeKey]: next }));
    void setModulePermission({ employeeId, nodeKey, show: next.show, view: next.view, edit: next.edit }).then((r) => {
      if (!r.ok) setError(r.error ?? "Failed to save.");
    });
  };

  const byModule = new Map<string, Node[]>();
  for (const n of nodes) {
    (byModule.get(n.module) ?? byModule.set(n.module, []).get(n.module)!).push(n);
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-altus-red bg-altus-red-soft px-3 py-2 text-[12.5px] font-semibold text-altus-red">{error}</p>
      )}

      <select
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
        className="rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-[13px] font-bold text-ink-strong"
      >
        <option value="">Choose an employee…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>

      {employeeId && loaded && (
        <div className="space-y-3">
          {[...byModule.entries()].map(([module, moduleNodes]) => (
            <div key={module} className="rounded-xl border border-hairline bg-surface-card">
              <p className="border-b border-hairline px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">
                {module}
              </p>
              <div className="divide-y divide-hairline">
                {moduleNodes.map((n) => {
                  const o = overrides[n.key] ?? { show: true, view: true, edit: true };
                  return (
                    <div key={n.key} className="flex items-center justify-between gap-2 px-3 py-1" style={{ paddingLeft: 8 + n.depth * 14 }}>
                      <span className="text-[12.5px] text-ink-strong">{n.label}</span>
                      <span className="flex shrink-0 gap-3">
                        <Check label="Show" checked={o.show} onChange={() => toggle(n.key, "show")} />
                        <Check label="View" checked={o.view} onChange={() => toggle(n.key, "view")} />
                        <Check label="Edit" checked={o.edit} onChange={() => toggle(n.key, "edit")} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1 text-[11px] text-ink-muted">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[#e10600]" />
      {label}
    </label>
  );
}
