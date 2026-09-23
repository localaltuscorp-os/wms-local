"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  assignRole,
  createRole,
  deleteRole,
  grantRolePermission,
  removeRole,
  revokeRolePermission,
} from "@/app/(admin)/admin/control-panel/roles/actions";
import type { RoleRow, RolePermissionRow } from "@/lib/queries/control-panel";

type User = { id: string; name: string; roleNames: string[] };
type Option = { id: string; label: string };

export function RolesClient({
  roles,
  users,
  permissionsByRole,
  nodes,
  actions,
  scopes,
}: {
  roles: RoleRow[];
  users: User[];
  permissionsByRole: Record<string, RolePermissionRow[]>;
  nodes: { key: string; label: string }[];
  actions: Option[];
  scopes: Option[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [error, setError] = React.useState("");

  // Add-permission form state.
  const [permNode, setPermNode] = React.useState("");
  const [permAction, setPermAction] = React.useState("view");
  const [permScope, setPermScope] = React.useState("");

  // Assign form state.
  const [assignEmp, setAssignEmp] = React.useState("");
  const [assignRoleId, setAssignRoleId] = React.useState("");

  const refresh = () => {
    start(() => router.refresh());
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError("");
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  };

  const selectedRole = roles.find((r) => r.id === selected) ?? null;
  const selectedPerms = selected ? (permissionsByRole[selected] ?? []) : [];

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-altus-red bg-altus-red-soft px-3 py-2 text-[12.5px] font-semibold text-altus-red">
          {error}
        </p>
      )}

      {/* ── Create role ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Role name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-hairline bg-surface-soft px-2 py-1.5 text-[13px] text-ink-strong"
            placeholder="e.g. HR Admin"
          />
        </label>
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Description</span>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full rounded-lg border border-hairline bg-surface-soft px-2 py-1.5 text-[13px] text-ink-strong"
          />
        </label>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() => run(async () => {
            const r = await createRole({ name, description: desc });
            if (r.ok) { setName(""); setDesc(""); }
            return r;
          })}
          className="inline-flex items-center gap-1 rounded-pill bg-altus-red px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          <Plus size={14} /> Create role
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* ── Role list ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-hairline bg-surface-card">
          <p className="border-b border-hairline px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">
            Roles
          </p>
          <ul className="divide-y divide-hairline">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${selected === r.id ? "bg-surface-soft" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-ink-strong">
                      {r.name} {r.isSystem && <span className="text-ink-muted">· system</span>}
                    </span>
                    <span className="block text-[11.5px] text-ink-subtle">
                      {r.permissionCount} permissions · {r.memberCount} members
                    </span>
                  </span>
                  {!r.isSystem && (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label={`Delete ${r.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          run(() => deleteRole({ roleId: r.id }));
                        }}
                        className="rounded p-1 text-ink-muted hover:text-altus-red"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Selected role detail ──────────────────────────────── */}
        {selectedRole && (
          <div className="space-y-4">
            <div className="rounded-xl border border-hairline bg-surface-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-black text-ink-strong">{selectedRole.name}</p>
                  <p className="text-[11.5px] text-ink-subtle">{selectedRole.description ?? "No description."}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-surface-soft">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Permissions */}
            <div className="rounded-xl border border-hairline bg-surface-card px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Permissions</p>
              <div className="mt-2 space-y-1">
                {selectedPerms.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 border-b border-hairline pb-1 text-[12.5px]">
                    <span className="min-w-0 truncate text-ink-strong">
                      {p.module}{p.page ? ` → ${p.page}` : ""} · <b>{p.action}</b>
                      {p.scope ? ` · ${p.scope}` : ""}
                    </span>
                    <button
                      type="button"
                      aria-label="Revoke"
                      onClick={() => run(() => revokeRolePermission({ permissionId: p.id }))}
                      className="shrink-0 rounded p-1 text-ink-muted hover:text-altus-red"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {selectedPerms.length === 0 && (
                  <p className="text-[12px] text-ink-subtle">No permissions yet.</p>
                )}
              </div>

              {/* Add permission */}
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                <select value={permNode} onChange={(e) => setPermNode(e.target.value)} className="col-span-2 rounded-lg border border-hairline bg-surface-soft px-2 py-1.5 text-[12.5px] text-ink-strong">
                  <option value="">Module…</option>
                  {nodes.map((n) => (
                    <option key={n.key} value={n.key}>{n.label}</option>
                  ))}
                </select>
                <select value={permAction} onChange={(e) => setPermAction(e.target.value)} className="rounded-lg border border-hairline bg-surface-soft px-2 py-1.5 text-[12.5px] text-ink-strong">
                  {actions.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
                <select value={permScope} onChange={(e) => setPermScope(e.target.value)} className="rounded-lg border border-hairline bg-surface-soft px-2 py-1.5 text-[12.5px] text-ink-strong">
                  <option value="">Scope…</option>
                  {scopes.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={pending || !permNode}
                onClick={() => run(() => grantRolePermission({ roleId: selectedRole.id, nodeKey: permNode, action: permAction, scope: permScope || null }))}
                className="mt-2 inline-flex items-center gap-1 rounded-pill border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-strong"
              >
                <Check size={14} /> Add permission
              </button>
            </div>

            {/* Members */}
            <div className="rounded-xl border border-hairline bg-surface-card px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Members</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {users.filter((u) => u.roleNames.includes(selectedRole.name)).map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface-soft px-2 py-0.5 text-[12px] font-semibold text-ink-strong">
                    {u.name}
                    <button type="button" aria-label={`Remove ${u.name}`} onClick={() => run(() => removeRole({ employeeId: u.id, roleId: selectedRole.id }))} className="text-ink-muted hover:text-altus-red">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select value={assignEmp} onChange={(e) => setAssignEmp(e.target.value)} className="flex-1 rounded-lg border border-hairline bg-surface-soft px-2 py-1.5 text-[12.5px] text-ink-strong">
                  <option value="">Add a member…</option>
                  {users.filter((u) => !u.roleNames.includes(selectedRole.name)).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !assignEmp}
                  onClick={() => run(async () => {
                    const r = await assignRole({ employeeId: assignEmp, roleId: selectedRole.id });
                    if (r.ok) setAssignEmp("");
                    return r;
                  })}
                  className="rounded-pill bg-altus-red px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
