"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Search, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { grantScopedTemporaryAccess, revokeScopedTemporaryAccess } from "@/app/(app)/control-panel/temporary-access/actions";

type Person = { id: string; name: string; email: string };
type Module = { key: string; label: string; options: { key: string; label: string }[] };
type Level = "full" | "viewing" | "custom";
type Scope = { moduleKey: string; accessLevel: Level; navigationKeys: string[] };
type Grant = { recipientId: string; employeeName: string; modules: { moduleKey: string; accessLevel: Level }[]; expiresAt: string; revokedAt: string | null };

const CARD = "rounded-xl border border-hairline bg-surface-card p-4";
const LABEL = "mb-1.5 block text-[12px] font-bold text-ink-soft";
const INPUT = "w-full rounded-md border border-hairline bg-white px-3 py-2 text-[13px] text-ink-strong outline-none focus:border-altus-red";

export function TemporaryAccessPanel({ employees, modules, grants }: { employees: Person[]; modules: Module[]; grants: Grant[] }) {
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [durationKind, setDurationKind] = useState<"preset" | "dates">("preset");
  const [amount, setAmount] = useState(2);
  const [unit, setUnit] = useState<"hours" | "days" | "weeks" | "months" | "quarters" | "year">("weeks");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [customFor, setCustomFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = new Set(employeeIds);
  const filtered = useMemo(() => employees.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase())), [employees, search]);

  const setScope = (moduleKey: string, patch: Partial<Scope> | null) => setScopes((current) => {
    const old = current.find((scope) => scope.moduleKey === moduleKey);
    if (!patch) return current.filter((scope) => scope.moduleKey !== moduleKey);
    const next = { moduleKey, accessLevel: "full" as Level, navigationKeys: [], ...old, ...patch };
    return [...current.filter((scope) => scope.moduleKey !== moduleKey), next];
  });

  function submit() {
    if (!employeeIds.length || !scopes.length) return fireToast({ message: "Choose employees and at least one module." });
    if (durationKind === "dates" && (!from || !until)) return fireToast({ message: "Choose both custom dates." });
    const duration = durationKind === "preset"
      ? { kind: "preset" as const, amount, unit }
      : { kind: "dates" as const, from: new Date(from).toISOString(), until: new Date(until).toISOString() };
    startTransition(async () => {
      const result = await grantScopedTemporaryAccess({ employeeIds, scopes, duration });
      if (!result.ok) return fireToast({ message: result.error });
      setEmployeeIds([]); setScopes([]); setFrom(""); setUntil("");
      fireToast({ message: "Temporary access scope saved." });
    });
  }

  return <div className="space-y-4">
    <section className={CARD}>
      <label className={LABEL}>Employees</label>
      <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-ink-subtle" /><input className={`${INPUT} pl-8`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees..." /></div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {filtered.map((person) => <button key={person.id} type="button" onClick={() => setEmployeeIds((ids) => ids.includes(person.id) ? ids.filter((id) => id !== person.id) : [...ids, person.id])} className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold ${selected.has(person.id) ? "border-altus-red bg-red-50 text-altus-red" : "border-hairline text-ink-soft hover:border-altus-red"}`}>{person.name}</button>)}
      </div>
    </section>

    <section className={CARD}>
      <p className={LABEL}>Select Modules</p>
      <div className="divide-y divide-hairline">
        {modules.map((module) => {
          const scope = scopes.find((item) => item.moduleKey === module.key);
          return <div key={module.key} className="flex items-center gap-3 py-2.5">
            <input aria-label={`Select ${module.label}`} type="checkbox" checked={Boolean(scope)} onChange={(event) => setScope(module.key, event.target.checked ? {} : null)} className="h-4 w-4 accent-[var(--color-altus-red)]" />
            <span className="min-w-36 flex-1 text-[13px] font-bold text-ink-strong">{module.label}</span>
            {scope && <><select aria-label={`${module.label} access`} value={scope.accessLevel} onChange={(event) => setScope(module.key, { accessLevel: event.target.value as Level, navigationKeys: [] })} className="rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] font-semibold"><option value="full">Full Access</option><option value="viewing">Viewing Access</option><option value="custom">Custom</option></select>{scope.accessLevel === "custom" && <button type="button" onClick={() => setCustomFor(module.key)} className="text-[12px] font-bold text-altus-red">Choose</button>}</>}
          </div>;
        })}
      </div>
    </section>

    <section className={CARD}>
      <p className={LABEL}>Duration</p>
      <div className="mb-2 flex gap-2 text-[12px] font-bold"><button type="button" onClick={() => setDurationKind("preset")} className={durationKind === "preset" ? "text-altus-red" : "text-ink-soft"}>Preset duration</button><button type="button" onClick={() => setDurationKind("dates")} className={durationKind === "dates" ? "text-altus-red" : "text-ink-soft"}>Custom date</button></div>
      {durationKind === "preset" ? <div className="flex gap-2"><input className={`${INPUT} w-20`} type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><select className={INPUT} value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)}>{["hours", "days", "weeks", "months", "quarters", "year"].map((value) => <option key={value}>{value}</option>)}</select></div> : <div className="grid grid-cols-2 gap-2"><input className={INPUT} type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /><input className={INPUT} type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} /></div>}
    </section>

    <button type="button" disabled={pending} onClick={submit} className="rounded-md bg-altus-red px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Granting..." : "Grant Access"}</button>
    <PreviousGrants grants={grants} />
    {customFor && <CustomDialog module={modules.find((module) => module.key === customFor)!} value={scopes.find((scope) => scope.moduleKey === customFor)?.navigationKeys ?? []} onClose={() => setCustomFor(null)} onSave={(navigationKeys) => { setScope(customFor, { navigationKeys }); setCustomFor(null); }} />}
  </div>;
}

function CustomDialog({ module, value, onClose, onSave }: { module: Module; value: string[]; onClose: () => void; onSave: (keys: string[]) => void }) {
  const [keys, setKeys] = useState(value);
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/30 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-hairline bg-white p-4 shadow-xl"><div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold text-ink-strong">Custom Access — {module.label}</h2><button type="button" onClick={onClose}><X size={16} /></button></div><div className="space-y-1">{module.options.map((option) => <label key={option.key} className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] hover:bg-surface-soft"><input type="checkbox" checked={keys.includes(option.key)} onChange={() => setKeys((current) => current.includes(option.key) ? current.filter((key) => key !== option.key) : [...current, option.key])} />{option.label}</label>)}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-hairline px-3 py-2 text-[12px] font-bold">Cancel</button><button type="button" onClick={() => onSave(keys)} className="rounded-md bg-altus-red px-3 py-2 text-[12px] font-bold text-white">Save</button></div></section></div>;
}

function PreviousGrants({ grants }: { grants: Grant[] }) {
  const [selected, setSelected] = useState<string[]>([]); const [confirm, setConfirm] = useState(false); const [pending, startTransition] = useTransition();
  const live = grants.filter((grant) => !grant.revokedAt && new Date(grant.expiresAt) > new Date());
  function revoke() { startTransition(async () => { const result = await revokeScopedTemporaryAccess(selected); if (!result.ok) return fireToast({ message: result.error ?? "Could not revoke access." }); setSelected([]); setConfirm(false); fireToast({ message: "Temporary access revoked." }); }); }
  return <section className={CARD}><div className="mb-2 flex items-center justify-between"><p className={LABEL}>Previous Temporary Access</p>{live.length > 1 && <button type="button" onClick={() => setSelected(selected.length === live.length ? [] : live.map((grant) => grant.recipientId))} className="text-[12px] font-bold text-altus-red">Select all</button>}</div>{live.length === 0 ? <p className="text-[13px] text-ink-subtle">No active temporary access.</p> : <div className="space-y-1.5">{live.map((grant) => <label key={grant.recipientId} className="flex items-center gap-2 rounded-md border border-hairline px-3 py-2"><input type="checkbox" checked={selected.includes(grant.recipientId)} onChange={() => setSelected((ids) => ids.includes(grant.recipientId) ? ids.filter((id) => id !== grant.recipientId) : [...ids, grant.recipientId])} /><span className="min-w-0 flex-1 text-[13px] font-bold text-ink-strong">{grant.employeeName}</span><span className="max-w-48 truncate text-[11px] text-ink-soft">{grant.modules.map((scope) => `${scope.moduleKey} · ${scope.accessLevel}`).join(", ")}</span><span className="text-[11px] text-ink-subtle">Until {new Date(grant.expiresAt).toLocaleDateString()}</span></label>)}</div>}{selected.length > 0 && <div className="mt-3 flex justify-end gap-2">{confirm ? <><span className="mr-auto text-[12px] font-semibold text-ink-soft">Revoke {selected.length} selected employee{selected.length === 1 ? "" : "s"}?</span><button type="button" onClick={() => setConfirm(false)} className="rounded-md border border-hairline px-3 py-2 text-[12px] font-bold">Cancel</button><button type="button" disabled={pending} onClick={revoke} className="rounded-md bg-altus-red px-3 py-2 text-[12px] font-bold text-white">Confirm Revoke</button></> : <button type="button" onClick={() => setConfirm(true)} className="rounded-md border border-altus-red px-3 py-2 text-[12px] font-bold text-altus-red">Revoke selected</button>}</div>}</section>;
}
