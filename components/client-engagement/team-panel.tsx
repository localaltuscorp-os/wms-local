"use client";

import * as React from "react";
import { Check, Loader2, Pencil, Plus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { CE_ROLES, roleLabel } from "@/lib/client-engagement/constants";
import { CE_MANAGER_NAMES } from "@/lib/client-engagement/access";
import type { CeMemberRow } from "@/lib/queries/client-engagement";
import { ceSaveMember } from "@/app/(app)/operations/client-engagement/actions";
import { BTN_NEUTRAL, BTN_PRIMARY, CARD, CARD_SHADOW, CeDialog, DISPLAY, FIELD, FormError, LABEL, Select, TD, TH } from "./ui";

/**
 * THE TEAM — who can carry accounts, their login (which is what puts their
 * Hand-holding calls on the calendar and lets them edit their own accounts),
 * their role and their capacity cap. Managers edit; everyone can read.
 */
export function TeamPanel({
  members,
  employees,
  canManage,
}: {
  members: CeMemberRow[];
  employees: { id: string; name: string; email: string }[];
  canManage: boolean;
}) {
  const [editing, setEditing] = React.useState<CeMemberRow | "new" | null>(null);

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_SHADOW}>
      <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
        <h2 className="mr-auto text-[16px] font-extrabold text-ink-strong" style={DISPLAY}>
          Team
        </h2>
        {canManage ? (
          <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
            <Plus size={14} strokeWidth={2.8} /> Add member
          </button>
        ) : (
          <span className="text-[12px] text-ink-muted">{CE_MANAGER_NAMES} manage the team.</span>
        )}
      </header>
      <div className="scroll-x-only">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${TH} pl-4`}>Name</th>
              <th className={TH}>Login</th>
              <th className={TH}>Role</th>
              <th className={`${TH} text-right`}>Capacity</th>
              <th className={TH}>Status</th>
              <th className={`${TH} pr-4`} />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-hairline last:border-0 hover:bg-surface-soft" style={{ opacity: m.isActive ? 1 : 0.55 }}>
                <td className={`${TD} pl-4 text-[13.5px] font-bold text-ink-strong`}>{m.name}</td>
                <td className={TD}>{m.employeeName ?? <span className="text-ink-subtle">No login linked</span>}</td>
                <td className={TD}>{roleLabel(m.role)}</td>
                <td className={`${TD} text-right tabular-nums text-ink-strong`}>{m.activeClientLimit || "No cap"}</td>
                <td className={TD}>{m.isActive ? "Active" : "Inactive"}</td>
                <td className={`${TD} pr-4 text-right`}>
                  {canManage ? (
                    <button type="button" onClick={() => setEditing(m)} className="inline-flex size-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-card hover:text-ink-strong" aria-label={`Edit ${m.name}`}>
                      <Pencil size={13} strokeWidth={2.4} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? <MemberDialog member={editing === "new" ? null : editing} employees={employees} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function MemberDialog({
  member,
  employees,
  onClose,
}: {
  member: CeMemberRow | null;
  employees: { id: string; name: string; email: string }[];
  onClose: () => void;
}) {
  const [name, setName] = React.useState(member?.name ?? "");
  const [employeeId, setEmployeeId] = React.useState(member?.employeeId ?? "");
  const [role, setRole] = React.useState(member?.role ?? "coach");
  const [limit, setLimit] = React.useState(String(member?.activeClientLimit ?? 20));
  const [isActive, setIsActive] = React.useState(member?.isActive ?? true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await ceSaveMember({
      id: member?.id ?? null,
      name,
      employeeId: employeeId || null,
      email: employees.find((e) => e.id === employeeId)?.email ?? member?.email ?? null,
      role,
      activeClientLimit: Number(limit),
      isActive,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Saved", type: "success" });
    onClose();
  }

  return (
    <CeDialog
      title={member ? `Edit ${member.name}` : "Add team member"}
      subtitle="Link their login so their own calendar and Hand-holding calls appear."
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className={BTN_NEUTRAL} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
            Save
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className={LABEL}>Name on the boards</span>
          <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ruchita" autoFocus />
        </label>
        <label>
          <span className={LABEL}>Login</span>
          <Select
            value={employeeId}
            onChange={(v) => {
              setEmployeeId(v);
              if (!name.trim()) setName(employees.find((e) => e.id === v)?.name.split(" ")[0] ?? "");
            }}
            ariaLabel="Login"
          >
            <option value="">No login</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={LABEL}>Role</span>
          <Select value={role} onChange={setRole} ariaLabel="Role">
            {CE_ROLES.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={LABEL}>Active client limit</span>
          <input type="number" min={0} max={500} className={FIELD} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-bold text-ink-soft sm:col-span-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 accent-[var(--color-altus-red)]" />
          Active: shown on the boards and can be assigned work
        </label>
      </div>
      <FormError message={error} />
    </CeDialog>
  );
}
