"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2, UserPlus, X } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  assignRole,
  createRole,
  deleteRole,
  grantRolePermission,
  removeRole,
  revokeRolePermission,
  updateRole,
} from "@/app/(app)/control-panel/roles/actions";
import type { RolePermissionRow, RoleRow } from "@/lib/queries/control-panel";

const BASIC_ACTIONS = [
  { id: "view", label: "View" },
  { id: "create", label: "Create" },
  { id: "edit", label: "Edit" },
  { id: "delete", label: "Delete" },
] as const;

type Employee = { id: string; name: string; email: string | null; employeeCode: string | null; roleNames: string[] };
type Module = { key: string; label: string };
type Result = { ok: boolean; error?: string };

export function RolesClient({
  roles,
  employees,
  permissionsByRole,
  modules,
}: {
  roles: RoleRow[];
  employees: Employee[];
  permissionsByRole: Record<string, RolePermissionRow[]>;
  modules: Module[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [selected, setSelected] = React.useState<string | null>(roles[0]?.id ?? null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [pendingEmployeeIds, setPendingEmployeeIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");

  const selectedRole = roles.find((role) => role.id === selected) ?? null;
  const selectedPermissions = selected ? permissionsByRole[selected] ?? [] : [];
  const members = selectedRole ? employees.filter((employee) => employee.roleNames.includes(selectedRole.name)) : [];
  const moduleColumns = React.useMemo(() => splitModules(modules), [modules]);

  const selectRole = (roleId: string) => {
    setSelected(roleId);
    setPendingEmployeeIds([]);
    setEditing(false);
  };

  const run = (work: () => Promise<Result>, after?: () => void) => {
    setError("");
    start(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else after?.();
      if (result.ok) router.refresh();
    });
  };

  const permissionFor = (moduleKey: string, action: string) =>
    selectedPermissions.find((permission) => permission.nodeKey === moduleKey && permission.action === action && permission.scope == null);

  const toggle = (moduleKey: string, action: string, checked: boolean) => {
    if (!selectedRole) return;
    const existing = permissionFor(moduleKey, action);
    if (checked && !existing) run(() => grantRolePermission({ roleId: selectedRole.id, nodeKey: moduleKey, action, scope: null }));
    if (!checked && existing) run(() => revokeRolePermission({ permissionId: existing.id }));
  };

  const beginEdit = () => {
    if (!selectedRole || selectedRole.isSystem) return;
    setName(selectedRole.name);
    setDescription(selectedRole.description ?? "");
    setEditing(true);
  };

  const availableEmployees = selectedRole
    ? employees.filter((employee) => !employee.roleNames.includes(selectedRole.name))
    : [];

  const applyEmployees = async (): Promise<Result> => {
    if (!selectedRole || pendingEmployeeIds.length === 0) return { ok: true };
    for (const employeeId of pendingEmployeeIds) {
      const result = await assignRole({ employeeId, roleId: selectedRole.id });
      if (!result.ok) return result;
    }
    return { ok: true };
  };

  return (
    <div className="max-w-[980px] space-y-3">
      {error && <p className="rounded-lg border border-altus-red bg-altus-red-soft px-3 py-2 text-[12.5px] font-semibold text-altus-red">{error}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">New role</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Role name" className="rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[13px] text-ink-strong" />
        </label>
        <label className="flex min-w-[220px] flex-[1.4] flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Description</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" className="rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[13px] text-ink-strong" />
        </label>
        <button type="button" disabled={pending || !name.trim()} onClick={() => run(() => createRole({ name, description }), () => { setName(""); setDescription(""); })} className="inline-flex items-center gap-1.5 rounded-lg bg-altus-red px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
          <Plus size={14} /> Create role
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <section className="h-fit rounded-xl border border-hairline bg-surface-card">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Roles</p>
            <span className="text-[11px] font-semibold text-ink-subtle">{roles.length}</span>
          </div>
          <div className="divide-y divide-hairline">
            {roles.map((role) => (
              <div key={role.id} className={`flex items-center gap-1 px-2 py-2 ${selected === role.id ? "bg-surface-soft" : ""}`}>
                <button type="button" onClick={() => selectRole(role.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-bold text-ink-strong">{role.name}</span>
                  <span className="block text-[11px] text-ink-subtle">{role.memberCount} members · {role.permissionCount} permissions</span>
                </button>
                {!role.isSystem && <button type="button" aria-label={`Delete ${role.name}`} disabled={pending} onClick={() => { if (window.confirm(`Delete role ${role.name}?`)) run(() => deleteRole({ roleId: role.id }), () => setSelected(null)); }} className="rounded p-1.5 text-ink-muted hover:text-altus-red"><Trash2 size={14} /></button>}
              </div>
            ))}
            {roles.length === 0 && <p className="px-3 py-5 text-[12px] text-ink-subtle">No roles yet.</p>}
          </div>
        </section>

        {selectedRole ? (
          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-3">
              <div className="min-w-0">
                <p className="text-[16px] font-black text-ink-strong">{selectedRole.name}</p>
                <p className="mt-0.5 text-[12px] text-ink-subtle">{selectedRole.description || "No description."}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!selectedRole.isSystem && <button type="button" onClick={beginEdit} className="inline-flex items-center gap-1 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12px] font-bold text-ink-strong"><Pencil size={13} /> Edit</button>}
                <button type="button" aria-label="Close role" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-soft"><X size={16} /></button>
              </div>
            </div>

            {editing && <div className="flex flex-wrap items-end gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2">
              <label className="flex min-w-[180px] flex-1 flex-col gap-1"><span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Role name</span><input value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[13px]" /></label>
              <label className="flex min-w-[200px] flex-[1.4] flex-col gap-1"><span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[13px]" /></label>
              <button type="button" disabled={pending || !name.trim()} onClick={() => run(() => updateRole({ roleId: selectedRole.id, name, description }), () => setEditing(false))} className="rounded-lg bg-altus-red px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50">Save</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[12px] font-bold">Cancel</button>
            </div>}

            <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
              <p className="border-b border-hairline px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Module access</p>
              <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-hairline">
                {moduleColumns.map((column, columnIndex) => (
                  <div key={columnIndex} className={columnIndex > 0 ? "border-t border-hairline lg:border-t-0" : ""}>
                    <div className="grid grid-cols-[minmax(120px,1fr)_repeat(4,48px)] items-center border-b border-hairline bg-surface-soft/55 px-3 py-2 sm:grid-cols-[minmax(132px,1fr)_repeat(4,52px)]">
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">Module</span>
                      {BASIC_ACTIONS.map((action) => <span key={action.id} className="text-center text-[10px] font-bold text-ink-muted">{action.label}</span>)}
                    </div>
                    <div className="divide-y divide-hairline">
                      {column.map((module) => (
                        <div key={module.key} className="grid grid-cols-[minmax(120px,1fr)_repeat(4,48px)] items-center px-3 py-2 sm:grid-cols-[minmax(132px,1fr)_repeat(4,52px)]">
                          <span className="truncate text-[12.5px] font-semibold text-ink-strong">{module.label}</span>
                          {BASIC_ACTIONS.map((action) => <label key={action.id} className="flex cursor-pointer justify-center"><input aria-label={`${module.label} ${action.label}`} type="checkbox" checked={Boolean(permissionFor(module.key, action.id))} onChange={(event) => toggle(module.key, action.id, event.target.checked)} className="h-3.5 w-3.5 accent-[#e10600]" /></label>)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-3 z-20 rounded-xl border border-hairline bg-surface-card px-3 py-3 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.45)]">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Assigned employees</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {members.map((employee) => <EmployeeChip key={employee.id} employee={employee} onRemove={() => run(() => removeRole({ employeeId: employee.id, roleId: selectedRole.id }))} />)}
                {pendingEmployeeIds.map((employeeId) => {
                  const employee = employees.find((item) => item.id === employeeId);
                  return employee ? <EmployeeChip key={employee.id} employee={employee} pending onRemove={() => setPendingEmployeeIds((ids) => ids.filter((id) => id !== employee.id))} /> : null;
                })}
                {members.length === 0 && pendingEmployeeIds.length === 0 && <span className="text-[12px] text-ink-subtle">No employees assigned.</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-2.5">
                <MultiSelect options={availableEmployees.map((employee) => ({ value: employee.id, label: employeeLabel(employee) }))} selected={pendingEmployeeIds} onChange={setPendingEmployeeIds} placeholder="Add employees / applicants" showSelectAll={false} renderTrigger={({ selectedLabels }) => <button type="button" className="inline-flex min-w-[230px] items-center gap-1.5 rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[12.5px] font-semibold text-ink-strong"><UserPlus size={14} />{selectedLabels.length ? `${selectedLabels.length} selected` : "Add employees / applicants"}</button>} />
                <button type="button" disabled={pending || pendingEmployeeIds.length === 0} onClick={() => run(applyEmployees, () => setPendingEmployeeIds([]))} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-altus-red px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"><Save size={13} /> Save changes</button>
              </div>
            </div>
          </section>
        ) : <section className="rounded-xl border border-dashed border-hairline-strong bg-surface-card px-4 py-12 text-center text-[13px] font-semibold text-ink-subtle">Select role to manage access.</section>}
      </div>
    </div>
  );
}

function splitModules(modules: Module[]): [Module[], Module[]] {
  const midpoint = Math.ceil(modules.length / 2);
  return [modules.slice(0, midpoint), modules.slice(midpoint)];
}

function employeeLabel(employee: Employee) {
  return [employee.name, employee.employeeCode, employee.email].filter(Boolean).join(" · ");
}

function EmployeeChip({ employee, pending, onRemove }: { employee: Employee; pending?: boolean; onRemove: () => void }) {
  return <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${pending ? "border-altus-red bg-altus-red-soft text-altus-red" : "border-hairline bg-surface-soft text-ink-strong"}`}><span className="truncate">{employee.name}{pending && " · pending"}</span><button type="button" aria-label={`Remove ${employee.name}`} onClick={onRemove} className="shrink-0 opacity-70 hover:opacity-100"><X size={12} /></button></span>;
}
