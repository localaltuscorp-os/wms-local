"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { ShareRow } from "@/lib/queries/accounts-shares";
import { parseAmount, formatINR, sumAmounts } from "@/lib/accounts/amounts";
import { createShare, updateShare, deleteShare } from "@/app/(app)/accounts/shares-register/actions";

const INPUT = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CHIP = "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

function Dim() { return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>; }

function ValueSelect({ label, kind, options, value, onChange, placeholder }: { label: string; kind: string; options: LookupOption[]; value: string | null; onChange: (n: string | null) => void; placeholder?: string }) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => { setOpts((prev) => { const extra = prev.filter((p) => !options.some((o) => o.id === p.id)); return [...options, ...extra]; }); }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect label={label} value={selectedId} options={opts} placeholder={placeholder} className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => { const res = await addAccountsLookup(kind, name); if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, { id: res.option.id, name: res.option.name }])); return res.ok ? { ok: true as const, option: { id: res.option.id, name: res.option.name } } : { ok: false as const, error: res.error }; }}
      onDelete={async (id) => { const res = await softDeleteAccountsLookup(id); return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error }); }} />
  );
}

type Draft = { code: string; entity: string | null; company: string; folioDemat: string; qty: string; rate: string; value: string; txnDate: string; notes: string };
function emptyDraft(): Draft { return { code: "", entity: null, company: "", folioDemat: "", qty: "", rate: "", value: "", txnDate: "", notes: "" }; }
function toDraft(r: ShareRow): Draft { return { code: r.code ?? "", entity: r.entity, company: r.company, folioDemat: r.folioDemat ?? "", qty: r.qty ?? "", rate: r.rate ?? "", value: r.value ?? "", txnDate: r.txnDate ?? "", notes: r.notes ?? "" }; }

/** Value = stored value, else qty × rate. */
function rowValue(r: ShareRow): number | null {
  const v = parseAmount(r.value);
  if (v !== null) return v;
  const q = parseAmount(r.qty), rt = parseAmount(r.rate);
  return q !== null && rt !== null ? q * rt : null;
}

export function SharesRegister({ rows, entityOptions }: { rows: ShareRow[]; entityOptions: LookupOption[] }) {
  const [q, setQ] = React.useState("");
  const [fEntity, setFEntity] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const entities = React.useMemo(() => Array.from(new Set([...entityOptions.map((o) => o.name), ...rows.map((r) => r.entity ?? "")].filter(Boolean))), [entityOptions, rows]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fEntity && (r.entity ?? "") !== fEntity) return false;
      if (needle && ![r.code, r.entity, r.company, r.folioDemat, r.notes].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, fEntity]);

  const hasFilters = q || fEntity;
  function clearFilters() { setQ(""); setFEntity(""); }
  function startAdd() { setEditingId(null); setDraft(emptyDraft()); setAdding(true); }
  function startEdit(r: ShareRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    const company = draft.company.trim();
    if (!company) { fireToast({ message: "A company is required.", type: "error" }); return; }
    setBusy(true);
    const payload = { ...draft, company };
    startTransition(async () => {
      const res = adding ? await createShare(payload) : await updateShare({ ...payload, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Holding added." : "Saved.", type: "success" });
      cancel();
    });
  }
  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteShare(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Removed.", type: "info" });
    });
  }

  const totalCols = 9;
  const totalValue = sumAmounts(filtered.map((r) => rowValue(r)));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — company, entity, folio" title="Local search — filters only the list on this page" aria-label="Local search — company, entity, folio — this page only" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        <select className={CHIP} value={fEntity} onChange={(e) => setFEntity(e.target.value)} aria-label="Filter by entity">
          <option value="">All Entities</option>
          {entities.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} strokeWidth={2.4} /> Clear</button>}
        <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
          <Plus size={16} strokeWidth={2.6} /> Add Holding
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "holding" : "holdings"}{hasFilters ? ` · filtered from ${rows.length}` : ""}{totalValue ? ` · ₹${formatINR(totalValue)} value` : ""}</div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1040 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>S. No</Th><Th>Entity</Th><Th>Company</Th><Th>Folio / Demat</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Value</Th><Th>Date</Th><Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && <EditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />}
            {filtered.length === 0 && !adding ? (
              <tr><td colSpan={totalCols} className="px-5 py-16 text-center"><p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No holdings match." : "No shareholdings recorded yet."}</p>{!hasFilters && <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red"><Plus size={15} strokeWidth={2.6} /> Add the First Holding</button>}</td></tr>
            ) : (
              filtered.map((r) => editingId === r.id ? (
                <EditorRow key={r.id} colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={save} onCancel={cancel} busy={busy} adding={false} />
              ) : (
                <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Td className="font-bold text-ink-strong whitespace-nowrap">{r.code || <Dim />}</Td>
                  <Td className="whitespace-nowrap font-semibold text-ink-soft">{r.entity || <Dim />}</Td>
                  <Td className="font-semibold text-ink-strong">{r.company}</Td>
                  <Td className="whitespace-nowrap text-[13px]">{r.folioDemat || <Dim />}</Td>
                  <Td className="text-right whitespace-nowrap">{parseAmount(r.qty) !== null ? formatINR(parseAmount(r.qty), true) : <Dim />}</Td>
                  <Td className="text-right whitespace-nowrap">{parseAmount(r.rate) !== null ? `₹${formatINR(parseAmount(r.rate), true)}` : <Dim />}</Td>
                  <Td className="text-right font-bold text-ink-strong whitespace-nowrap">{rowValue(r) !== null ? `₹${formatINR(rowValue(r))}` : <Dim />}</Td>
                  <Td className="whitespace-nowrap text-[13px]">{r.txnDate || <Dim />}</Td>
                  <Td className="text-right"><RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy} /></Td>
                </tr>
              ))
            )}
            {filtered.length > 0 && (
              <tr style={{ borderTop: "2px solid var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}>
                <Td className="font-bold uppercase text-[12px] tracking-[0.08em] text-ink-soft">Total</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td>
                <Td className="text-right font-extrabold text-altus-red whitespace-nowrap">₹{formatINR(totalValue)}</Td><Td>{""}</Td><Td>{""}</Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " + (className ?? "")} style={{ background: "var(--color-surface-soft)" }}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-4 py-3 align-middle text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
}
function RowActions({ onEdit, onDelete, busy }: { onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const [c, setC] = React.useState(false);
  React.useEffect(() => { if (!c) return; const t = setTimeout(() => setC(false), 3500); return () => clearTimeout(t); }, [c]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"><Pencil size={15} strokeWidth={2.2} /></button>
      {c ? <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm</button>
        : <button type="button" onClick={() => setC(true)} disabled={busy} aria-label="Delete" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"><Trash2 size={15} strokeWidth={2.2} /></button>}
    </div>
  );
}
function EditorRow({ colSpan, draft, setDraft, entityOptions, onSave, onCancel, busy, adding }: { colSpan: number; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; entityOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean }) {
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-md:col-span-1"><input value={draft.code} onChange={(e) => set({ code: e.target.value })} className={INPUT} placeholder="1" aria-label="S. No" autoFocus /></Field>
          <Field label="Entity" className="col-span-4 max-md:col-span-1"><ValueSelect label="entity" kind="shares_entity" options={entityOptions} value={draft.entity} onChange={(v) => set({ entity: v })} placeholder="Entity…" /></Field>
          <Field label="Company" className="col-span-6 max-md:col-span-2"><input value={draft.company} onChange={(e) => set({ company: e.target.value })} className={INPUT} placeholder="e.g. Reliance Industries" aria-label="Company" /></Field>
          <Field label="Folio / Demat" className="col-span-4 max-md:col-span-1"><input value={draft.folioDemat} onChange={(e) => set({ folioDemat: e.target.value })} className={INPUT} placeholder="Folio / demat no" aria-label="Folio / Demat" /></Field>
          <Field label="Qty" className="col-span-2 max-md:col-span-1"><input value={draft.qty} onChange={(e) => set({ qty: e.target.value })} className={INPUT} inputMode="decimal" placeholder="100" aria-label="Qty" /></Field>
          <Field label="Rate (₹)" className="col-span-2 max-md:col-span-1"><input value={draft.rate} onChange={(e) => set({ rate: e.target.value })} className={INPUT} inputMode="decimal" placeholder="1200" aria-label="Rate" /></Field>
          <Field label="Value (₹) — auto if blank" className="col-span-2 max-md:col-span-1"><input value={draft.value} onChange={(e) => set({ value: e.target.value })} className={INPUT} inputMode="numeric" placeholder="qty × rate" aria-label="Value" /></Field>
          <Field label="Date" className="col-span-2 max-md:col-span-1"><input value={draft.txnDate} onChange={(e) => set({ txnDate: e.target.value })} className={INPUT} placeholder="dd/mm/yy" aria-label="Date" /></Field>
          <Field label="Notes" className="col-span-12 max-md:col-span-2"><textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT + " min-h-[48px] resize-y"} placeholder="Notes" aria-label="Notes" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50"><X size={16} strokeWidth={2.4} /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Holding" : "Save Changes"}</button>
        </div>
      </td>
    </tr>
  );
}
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={"flex flex-col gap-1.5 " + (className ?? "")}><span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>{children}</label>;
}
