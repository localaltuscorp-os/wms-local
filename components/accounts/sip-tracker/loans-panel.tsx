"use client";

import * as React from "react";
import { Plus, X, Pencil, Trash2, Check, Loader2, Search } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { LoanItemRow, LoanPeriodRow, LoanCell } from "@/lib/queries/accounts-loans";
import { parseAmount, formatINR, sumAmounts } from "@/lib/accounts/amounts";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { MultiFilter } from "@/components/ui/multi-filter";
import {
  createLoanItem, updateLoanItem, deleteLoanItem,
  createLoanPeriod, deleteLoanPeriod, setLoanCell,
} from "@/app/(app)/accounts/sip-tracker/loan-actions";

const INPUT = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CELL = "w-full rounded-lg border border-hairline bg-white px-2 py-1.5 text-right text-[12.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)]";
const CHIP = "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

function Dim() { return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>; }
const ck = (loanId: string, periodId: string) => `${loanId}:${periodId}`;
type CellVal = { emi: string; closing: string };

function ValueSelect({ kind, options, value, onChange, placeholder }: { kind: string; options: LookupOption[]; value: string | null; onChange: (n: string | null) => void; placeholder?: string }) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => { setOpts((prev) => { const extra = prev.filter((p) => !options.some((o) => o.id === p.id)); return [...options, ...extra]; }); }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect label="entity" value={selectedId} options={opts} placeholder={placeholder} className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => { const res = await addAccountsLookup(kind, name); if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, { id: res.option.id, name: res.option.name }])); return res.ok ? { ok: true as const, option: { id: res.option.id, name: res.option.name } } : { ok: false as const, error: res.error }; }}
      onDelete={async (id) => { const res = await softDeleteAccountsLookup(id); return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error }); }} />
  );
}

type Draft = { code: string; entity: string | null; loanName: string; location: string; emiDate: string };
function emptyDraft(): Draft { return { code: "", entity: null, loanName: "", location: "", emiDate: "" }; }
function toDraft(r: LoanItemRow): Draft { return { code: r.code ?? "", entity: r.entity, loanName: r.loanName, location: r.location ?? "", emiDate: r.emiDate ?? "" }; }

export function LoansPanel({ loans, periods, cells, entityOptions }: {
  loans: LoanItemRow[]; periods: LoanPeriodRow[]; cells: LoanCell[]; entityOptions: LookupOption[];
}) {
  const [grid, setGrid] = React.useState<Record<string, CellVal>>({});
  React.useEffect(() => {
    const m: Record<string, CellVal> = {};
    for (const c of cells) m[ck(c.loanId, c.periodId)] = { emi: c.emi ?? "", closing: c.closingBalance ?? "" };
    setGrid(m);
  }, [cells]);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [cellBusy, setCellBusy] = React.useState<string | null>(null);
  const [newPeriod, setNewPeriod] = React.useState("");
  const [q, setQ] = React.useState("");
  const [fEntity, setFEntity] = React.useState<string[]>([]);
  const [, startTransition] = React.useTransition();

  const entities = React.useMemo(() => Array.from(new Set([...entityOptions.map((option) => option.name), ...loans.map((loan) => loan.entity ?? "")].filter(Boolean))), [entityOptions, loans]);
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return loans.filter((loan) => {
      if (fEntity.length > 0 && !fEntity.includes(loan.entity ?? "")) return false;
      return !needle || [loan.code, loan.entity, loan.loanName, loan.location, loan.emiDate].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [loans, q, fEntity]);
  const hasFilters = q || fEntity.length > 0;

  const val = (loanId: string, periodId: string): CellVal => grid[ck(loanId, periodId)] ?? { emi: "", closing: "" };
  const ytdEmi = (loanId: string) => sumAmounts(periods.map((p) => parseAmount(val(loanId, p.id).emi)));
  const latestClosing = (loanId: string): number | null => {
    for (let i = periods.length - 1; i >= 0; i--) { const v = parseAmount(val(loanId, periods[i]!.id).closing); if (v !== null) return v; }
    return null;
  };

  const nextCode = React.useMemo(() => {
    const highest = loans.reduce((max, loan) => {
      const raw = loan.code ?? "";
      return /^\d+$/.test(raw) ? Math.max(max, Number(raw)) : max;
    }, 0);
    return String(highest + 1);
  }, [loans]);

  function startAdd() { setEditingId(null); setDraft({ ...emptyDraft(), code: nextCode }); setAdding(true); }
  function startEdit(r: LoanItemRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    const loanName = draft.loanName.trim();
    if (!loanName) { fireToast({ message: "A loan name is required.", type: "error" }); return; }
    setBusy(true);
    const base = { code: draft.code, entity: draft.entity, loanName, location: draft.location, emiDate: draft.emiDate };
    startTransition(async () => {
      const res = adding ? await createLoanItem(base) : await updateLoanItem({ ...base, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Loan added." : "Saved.", type: "success" });
      cancel();
    });
  }
  function removeLoan(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteLoanItem(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Loan removed.", type: "info" });
    });
  }
  function commit(loanId: string, periodId: string, field: "emi" | "closing", raw: string) {
    const k = ck(loanId, periodId);
    const cur = val(loanId, periodId);
    const n = parseAmount(raw);
    const norm = n === null ? "" : String(n);
    if (norm === cur[field]) return;
    setGrid((g) => ({ ...g, [k]: { ...cur, [field]: norm } }));
    setCellBusy(`${k}:${field}`);
    startTransition(async () => {
      const res = await setLoanCell({ loanId, periodId, field: field === "emi" ? "emi" : "closingBalance", value: norm });
      setCellBusy(null);
      if (!res.ok) { setGrid((g) => ({ ...g, [k]: cur })); fireToast({ message: res.error, type: "error" }); }
    });
  }
  function addPeriod() {
    const label = newPeriod.trim();
    if (!label) return;
    startTransition(async () => {
      const res = await createLoanPeriod({ label });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setNewPeriod("");
      fireToast({ message: `Month "${label}" added.`, type: "success" });
    });
  }
  function removePeriod(id: string, label: string) {
    startTransition(async () => {
      const res = await deleteLoanPeriod(id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Month "${label}" removed.`, type: "info" });
    });
  }

  const emiCols = 1 + periods.length + 2; // loan + periods + ytd + actions
  const balCols = 1 + periods.length + 1; // loan + periods + latest

  return (
    <div id="loans-tracker" className="mt-10 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>Loans</h2>
          <span className="text-[13px] font-semibold text-ink-subtle">EMIs &amp; loan-account closing balances</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2 py-1">
            <input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPeriod(); } }} placeholder="New month e.g. Jul-26" className="w-[130px] bg-transparent px-1 py-1.5 text-[13.5px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle" aria-label="New month label" />
            <button type="button" onClick={addPeriod} disabled={!newPeriod.trim()} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-ink-strong)" }}><Plus size={13} strokeWidth={2.6} /> Month</button>
          </div>
          <button type="button" onClick={startAdd} className="inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}><Plus size={16} strokeWidth={2.6} /> Add Loan</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CollapsibleSearch scope="loans, entity">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
            <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — loans, entity" title="Local search — filters only loans on this page" aria-label="Local search loans and entity" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
          </div>
        </CollapsibleSearch>
        <MultiFilter className={CHIP} values={fEntity} onChange={setFEntity} options={entities} allLabel="All Entities" aria-label="Filter loans by entity" />
        {hasFilters && <button type="button" onClick={() => { setQ(""); setFEntity([]); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} strokeWidth={2.4} /> Clear</button>}
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "loan" : "loans"}{hasFilters ? ` · filtered from ${loans.length}` : ""}</div>

      {(adding || editingId) && <LoanEditorDialog draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />}

      {/* Grid 1 — EMIs */}
      <div>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">Loan EMIs (paid per month)</div>
        <div className="accounts-inbox-shell table-scroll overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
          <table className="accounts-inbox-table w-full border-collapse text-left" style={{ minWidth: 560 + periods.length * 96 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                <Th>Loan</Th>
                {periods.map((p) => (
                  <th key={p.id} className="group/pp px-2 py-2.5 text-center text-[11px] font-bold text-ink-subtle whitespace-nowrap" style={{ background: "var(--color-surface-soft)" }}>
                    <span className="inline-flex items-center gap-1"><span className="text-ink-strong">{p.label}</span><PeriodDelete onDelete={() => removePeriod(p.id, p.label)} /></span>
                  </th>
                ))}
                <Th className="text-right">YTD EMI</Th><Th className="accounts-inbox-actions text-right">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !adding ? (
                <tr><td colSpan={emiCols} className="px-5 py-12 text-center"><p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No loans match these filters." : "No loans yet."}</p>{!hasFilters && <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red"><Plus size={15} strokeWidth={2.6} /> Add the First Loan</button>}</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Td><LoanIdentity r={r} /></Td>
                  {periods.map((p) => {
                    const id = `${ck(r.id, p.id)}:emi`;
                    return <td key={p.id} className="px-1.5 py-2"><input value={val(r.id, p.id).emi} disabled={cellBusy === id} inputMode="numeric" onChange={(e) => setGrid((g) => ({ ...g, [ck(r.id, p.id)]: { ...val(r.id, p.id), emi: e.target.value } }))} onBlur={(e) => commit(r.id, p.id, "emi", e.target.value)} className={CELL + " disabled:opacity-60"} style={{ minWidth: 88 }} aria-label="EMI" placeholder="—" /></td>;
                  })}
                  <Td className="text-right font-bold text-ink-strong whitespace-nowrap">{ytdEmi(r.id) ? `Rs. ${formatINR(ytdEmi(r.id))}` : <Dim />}</Td>
                  <Td className="accounts-inbox-actions text-right"><RowActions onEdit={() => startEdit(r)} onDelete={() => removeLoan(r.id)} busy={busy} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid 2 — Closing balances */}
      {filtered.length > 0 && (
        <div>
          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">Loan account closing balances</div>
          <div className="accounts-inbox-shell table-scroll overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
            <table className="accounts-inbox-table w-full border-collapse text-left" style={{ minWidth: 440 + periods.length * 96 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Th>Loan</Th>
                  {periods.map((p) => (<th key={p.id} className="px-2 py-2.5 text-center text-[11px] font-bold text-ink-strong whitespace-nowrap" style={{ background: "var(--color-surface-soft)" }}>{p.label}</th>))}
                  <Th className="text-right">Latest</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td className="font-bold text-ink-strong whitespace-nowrap">{r.loanName}</Td>
                    {periods.map((p) => {
                      const id = `${ck(r.id, p.id)}:closing`;
                      return <td key={p.id} className="px-1.5 py-2"><input value={val(r.id, p.id).closing} disabled={cellBusy === id} inputMode="numeric" onChange={(e) => setGrid((g) => ({ ...g, [ck(r.id, p.id)]: { ...val(r.id, p.id), closing: e.target.value } }))} onBlur={(e) => commit(r.id, p.id, "closing", e.target.value)} className={CELL + " disabled:opacity-60"} style={{ minWidth: 88 }} aria-label="Closing balance" placeholder="—" /></td>;
                    })}
                    <Td className="text-right font-bold text-ink-strong whitespace-nowrap">{latestClosing(r.id) !== null ? `Rs. ${formatINR(latestClosing(r.id))}` : <Dim />}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LoanIdentity({ r }: { r: LoanItemRow }) {
  return (
    <div className="min-w-[180px] max-w-[260px]">
      <div className="flex items-center gap-2">{r.code && <span className="text-[11px] font-bold text-ink-subtle">#{r.code}</span>}<span className="font-bold text-ink-strong">{r.loanName}</span></div>
      <div className="mt-0.5 text-[12px] font-semibold text-ink-subtle">{[r.entity, r.location, r.emiDate && r.emiDate !== "EMI Date" ? r.emiDate : null].filter(Boolean).join(" · ")}</div>
    </div>
  );
}
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " + (className ?? "")} style={{ background: "var(--color-surface-soft)" }}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-4 py-3 align-middle text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
}
function PeriodDelete({ onDelete }: { onDelete: () => void }) {
  const [c, setC] = React.useState(false);
  React.useEffect(() => { if (!c) return; const t = setTimeout(() => setC(false), 3000); return () => clearTimeout(t); }, [c]);
  return c ? <button type="button" onClick={onDelete} aria-label="Confirm delete month" className="inline-flex items-center rounded px-1 text-[10px] font-bold text-white" style={{ background: "var(--color-altus-red)" }}>del?</button>
    : <button type="button" onClick={() => setC(true)} aria-label="Delete month" className="opacity-0 group-hover/pp:opacity-100 transition-opacity text-ink-subtle hover:text-altus-red"><X size={12} strokeWidth={2.6} /></button>;
}
function RowActions({ onEdit, onDelete, busy }: { onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const [c, setC] = React.useState(false);
  React.useEffect(() => { if (!c) return; const t = setTimeout(() => setC(false), 3500); return () => clearTimeout(t); }, [c]);
  return (
    <div className="accounts-inbox-action-buttons flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit loan" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"><Pencil size={15} strokeWidth={2.2} /></button>
      {c ? <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm</button>
        : <button type="button" onClick={() => setC(true)} disabled={busy} aria-label="Delete loan" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"><Trash2 size={15} strokeWidth={2.2} /></button>}
    </div>
  );
}
function LoanEditorDialog({ draft, setDraft, entityOptions, onSave, onCancel, busy, adding }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; entityOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean }) {
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 max-md:items-end max-md:p-0" role="dialog" aria-modal="true" aria-label={adding ? "Add loan" : "Edit loan"}>
      <button type="button" aria-label="Close loan form" onClick={busy ? undefined : onCancel} className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.44)] backdrop-blur-[2px]" />
      <div className="relative w-full max-w-[760px] overflow-hidden rounded-2xl bg-surface-card max-md:max-w-none max-md:rounded-b-none" style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 32px 90px -24px rgba(15,23,42,0.55)" }}>
        <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: "var(--color-altus-red)" }} />
        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
          <div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-altus-red">SIP Tracker</p><h2 className="text-[20px] font-black tracking-[-0.01em] text-ink-strong">{adding ? "Add Loan" : "Edit Loan"}</h2></div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Cancel" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-4 px-6 py-5 max-md:grid-cols-1">
          <Field label="S. No"><input value={draft.code} readOnly={adding} onChange={(e) => set({ code: e.target.value })} className={INPUT + (adding ? " cursor-not-allowed bg-surface-soft" : "")} placeholder="1" aria-label="S. No" /></Field>
          <Field label="Entity"><ValueSelect kind="loan_entity" options={entityOptions} value={draft.entity} onChange={(v) => set({ entity: v })} placeholder="Entity…" /></Field>
          <Field label="Loan name"><input value={draft.loanName} onChange={(e) => set({ loanName: e.target.value })} className={INPUT} placeholder="e.g. Home Loan ECS" aria-label="Loan name" autoFocus /></Field>
          <Field label="Location / bank"><input value={draft.location} onChange={(e) => set({ location: e.target.value })} className={INPUT} placeholder="Federal Bank" aria-label="Location" /></Field>
          <Field label="EMI date"><input value={draft.emiDate} onChange={(e) => set({ emiDate: e.target.value })} className={INPUT} placeholder="5th" aria-label="EMI date" /></Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid var(--color-hairline)", background: "var(--color-surface-soft)" }}>
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50"><X size={16} strokeWidth={2.4} /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Loan" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={"flex flex-col gap-1.5 " + (className ?? "")}><span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>{children}</label>;
}
