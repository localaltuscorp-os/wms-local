"use client";

import * as React from "react";
import { Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  SECURITY_ROLE_CATEGORIES,
  SECURITY_ROLE_LIST,
  type SecurityRole,
} from "@/lib/auth/security-roles-catalog";
import { setSecurityRole } from "@/app/(admin)/admin/security-roles/actions";

type Person = { id: string; name: string; email: string };
type Assignment = { employeeId: string; role: SecurityRole; grantedAt: string | null };

export function SecurityRolesPanel({ people, assignments: initial }: { people: Person[]; assignments: Assignment[] }) {
  const [role, setRole] = React.useState<SecurityRole>(SECURITY_ROLE_LIST[0]!.key);
  const [assignments, setAssignments] = React.useState(initial);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const selected = SECURITY_ROLE_LIST.find((item) => item.key === role)!;
  const holderIds = new Set(assignments.filter((item) => item.role === role).map((item) => item.employeeId));
  const visible = people.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(query.toLowerCase()));

  async function toggle(person: Person) {
    if (busy) return;
    const grant = !holderIds.has(person.id);
    setBusy(person.id);
    try {
      const result = await setSecurityRole({ employeeId: person.id, role, grant });
      if (!result.ok) return fireToast({ message: result.error, type: "error" });
      setAssignments((current) => grant
        ? [...current, { employeeId: person.id, role, grantedAt: new Date().toISOString() }]
        : current.filter((item) => !(item.employeeId === person.id && item.role === role)));
      fireToast({ message: grant ? `${person.name} now has ${selected.label}.` : `${selected.label} removed from ${person.name}.`, type: "success" });
    } finally { setBusy(null); }
  }

  return <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
    <aside className="rounded-2xl border border-hairline bg-white p-3">
      <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.12em] text-ink-muted">Roles by module</p>
      <div className="max-h-[620px] space-y-4 overflow-y-auto pr-1">
        {SECURITY_ROLE_CATEGORIES.map((category) => {
          const roles = SECURITY_ROLE_LIST.filter((item) => item.category === category);
          return <div key={category}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-2 py-1.5">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-ink-muted">{category}</p>
              <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[9px] font-bold text-ink-muted">{roles.length}</span>
            </div>
            <div className="space-y-1">
              {roles.map((item) => <button key={item.key} onClick={() => setRole(item.key)} className={`w-full rounded-xl px-3 py-2.5 text-left transition ${role === item.key ? "bg-[#fff0ef] text-[#a80400]" : "hover:bg-surface-soft text-ink-strong"}`}>
                <span className="block text-[12px] font-bold">{item.label}</span>
              </button>)}
            </div>
          </div>;
        })}
      </div>
    </aside>
    <section className="rounded-2xl border border-hairline bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck size={20} className="text-[#e10600]"/><h2 className="text-[18px] font-black text-ink-strong">{selected.label}</h2></div><p className="mt-1 max-w-2xl text-[12px] text-ink-muted">{selected.blurb}</p><p className={`mt-2 text-[11px] font-semibold ${selected.enforced ? "text-emerald-700" : "text-amber-700"}`}>{selected.enforced ? "Active: this role is enforced now." : "Stored and audited: runtime guard migration is pending."}</p></div><span className="rounded-full bg-surface-soft px-3 py-1 text-[11px] font-bold text-ink-muted">{holderIds.size} holder{holderIds.size === 1 ? "" : "s"}</span></div>
      <label className="mt-5 flex items-center gap-2 rounded-xl border border-hairline bg-surface-soft px-3 py-2"><Search size={15} className="text-ink-muted"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search active employees" className="w-full bg-transparent text-[13px] outline-none"/></label>
      <div className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">{visible.map((person) => { const assigned = holderIds.has(person.id); return <div key={person.id} className="flex items-center justify-between gap-3 px-3 py-3"><div><p className="text-[13px] font-bold text-ink-strong">{person.name}</p><p className="text-[11px] text-ink-muted">{person.email}</p></div><button disabled={busy !== null} onClick={() => toggle(person)} className={`inline-flex min-w-[94px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black disabled:opacity-50 ${assigned ? "bg-[#fff0ef] text-[#b42318]" : "bg-[#e10600] text-white"}`}>{assigned ? <><X size={14}/>Remove</> : <><UserPlus size={14}/>Grant</>}</button></div>})}</div>
      {visible.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">No active employee matches that search.</p>}
    </section>
  </div>;
}
