"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { SipItemRow, SipMonthCell } from "@/lib/queries/accounts-sip";
import { type FyMonthCol } from "@/lib/accounts/cc";
import { parseAmount, formatINR, sumAmounts } from "@/lib/accounts/amounts";
import { createSipItem, updateSipItem, deleteSipItem, setSipMonth } from "@/app/(app)/accounts/sip-tracker/actions";

const INPUT = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CELL = "w-full rounded-lg border border-hairline bg-white px-2 py-1.5 text-right text-[12.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)]";
const CHIP = "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

function Dim() { return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>; }

function lookupAdd(kind: string) {
  return async (name: string) => {
    const res = await addAccountsLookup(kind, name);
    return res.ok ? ({ ok: true as const, option: { id: res.option.id, name: res.option.name } }) : ({ ok: false as const, error: res.error });
  };
}
function ValueSelect({ label, kind, options, value, onChange, placeholder }: { label: string; kind: string; options: LookupOption[]; value: string | null; onChange: (n: string | null) => void; placeholder?: string }) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => { setOpts((prev) => { const extra = prev.filter((p) => !options.some((o) => o.id === p.id)); return [...options, ...extra]; }); }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect label={label} value={selectedId} options={opts} placeholder={placeholder} className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => { const res = await lookupAdd(kind)(name); if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, res.option])); return res; }}
      onDelete={async (id) => { const res = await softDeleteAccountsLookup(id); return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error }); }} />
  );
}

function AmountCell({ value, busy, onChange, onCommit, isCurrent }: { value: string; busy: boolean; onChange: (v: string) => void; onCommit: (v: string) => void; isCurrent: boolean }) {
  return (
    <input
      value={value}
      disabled={busy}
      inputMode="numeric"
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      className={CELL + " disabled:opacity-60"}
      style={{ minWidth: 84, borderColor: isCurrent ? "var(--color-altus-red)" : undefined }}
      aria-label="Monthly amount"
      placeholder="—"
    />
  );
}

const key = (itemId: string, month: number) => `${itemId}:${month}`;

type Draft = { code: string; entity: string | null; fundName: string; location: string; sipDate: string; type: string | null; amount: string };
function emptyDraft(): Draft { return { code: "", entity: null, fundName: "", location: "", sipDate: "", type: null, amount: "" }; }
function toDraft(r: SipItemRow): Draft {
  return { code: r.code ?? "", entity: r.entity, fundName: r.fundName, location: r.location ?? "", sipDate: r.sipDate ?? "", type: r.type, amount: r.amount ?? "" };
}

export function SipTracker({ fyStartYear, cols, currentMonth, items, months, entityOptions, typeOptions }: {
  fyStartYear: number; cols: FyMonthCol[]; currentMonth: number | null; items: SipItemRow[]; months: SipMonthCell[]; entityOptions: LookupOption[]; typeOptions: LookupOption[];
}) {
  const [grid, setGrid] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    const m: Record<string, string> = {};
    for (const c of months) if (c.amount != null) m[key(c.itemId, c.month)] = c.amount;
    setGrid(m);
  }, [months]);

  const [q, setQ] = React.useState("");
  const [fEntity, setFEntity] = React.useState("");
  const [fType, setFType] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const entities = React.useMemo(() => Array.from(new Set([...entityOptions.map((o) => o.name), ...items.map((i) => i.entity ?? "")].filter(Boolean))), [entityOptions, items]);
  const types = React.useMemo(() => Array.from(new Set([...typeOptions.map((o) => o.name), ...items.map((i) => i.type ?? "")].filter(Boolean))), [typeOptions, items]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (fEntity && (r.entity ?? "") !== fEntity) return false;
      if (fType && (r.type ?? "") !== fType) return false;
      if (needle) {
        const hay = [r.code, r.entity, r.fundName, r.location, r.type].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, fEntity, fType]);

  const ytd = (itemId: string) => sumAmounts(cols.map((c) => parseAmount(grid[key(itemId, c.month)])));
  const monthTotal = (month: number) => sumAmounts(filtered.map((r) => parseAmount(grid[key(r.id, month)])));
  const grandTotal = sumAmounts(filtered.map((r) => ytd(r.id)));

  const hasFilters = q || fEntity || fType;
  function clearFilters() { setQ(""); setFEntity(""); setFType(""); }
  function startAdd() { setEditingId(null); setDraft(emptyDraft()); setAdding(true); }
  function startEdit(r: SipItemRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    const fundName = draft.fundName.trim();
    if (!fundName) { fireToast({ message: "A fund name is required.", type: "error" }); return; }
    setBusy(true);
    const base = { code: draft.code, entity: draft.entity, fundName, location: draft.location, sipDate: draft.sipDate, type: draft.type, amount: draft.amount };
    startTransition(async () => {
      const res = adding ? await createSipItem({ ...base, fyStartYear }) : await updateSipItem({ ...base, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Fund added." : "Saved.", type: "success" });
      cancel();
    });
  }
  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteSipItem(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Removed.", type: "info" });
    });
  }
  function commitCell(itemId: string, month: number, raw: string) {
    const k = key(itemId, month);
    const prev = grid[k] ?? "";
    const n = parseAmount(raw);
    const norm = n === null ? "" : String(n);
    if (norm === prev) return;
    setGrid((g) => { const x = { ...g }; if (norm) x[k] = norm; else delete x[k]; return x; });
    setRowBusy(k);
    startTransition(async () => {
      const res = await setSipMonth({ itemId, month, amount: norm });
      setRowBusy(null);
      if (!res.ok) {
        setGrid((g) => { const x = { ...g }; if (prev) x[k] = prev; else delete x[k]; return x; });
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  const META = 1;
  const totalCols = META + cols.length + 2; // fund + months + ytd + actions

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — funds, entity" title="Local search — filters only the list on this page" aria-label="Local search — funds, entity — this page only" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        <select className={CHIP} value={fEntity} onChange={(e) => setFEntity(e.target.value)} aria-label="Filter by entity">
          <option value="">All Entities</option>
          {entities.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        <select className={CHIP} value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Filter by type">
          <option value="">All Types</option>
          {types.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} strokeWidth={2.4} /> Clear</button>}
        <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
          <Plus size={16} strokeWidth={2.6} /> Add Fund
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "fund" : "funds"}{hasFilters ? ` · filtered from ${items.length}` : ""}</div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1080 + cols.length * 92 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>Fund</Th>
              {cols.map((c) => (
                <th key={c.month} className="px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle whitespace-nowrap" style={{ background: c.month === currentMonth ? "color-mix(in srgb, var(--color-altus-red) 9%, var(--color-surface-soft))" : "var(--color-surface-soft)" }}>
                  <div className="text-ink-strong">{c.label}</div>
                  <div className="text-[10px] font-semibold normal-case tracking-normal text-ink-subtle">&apos;{String(c.calYear % 100).padStart(2, "0")}</div>
                </th>
              ))}
              <Th className="text-right">YTD</Th>
              <Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && (
              <EditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} typeOptions={typeOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />
            )}
            {filtered.length === 0 && !adding ? (
              <tr><td colSpan={totalCols} className="px-5 py-16 text-center"><p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No funds match these filters." : "No SIP funds for this financial year yet."}</p>{!hasFilters && <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red"><Plus size={15} strokeWidth={2.6} /> Add the First Fund</button>}</td></tr>
            ) : (
              filtered.map((r) => editingId === r.id ? (
                <EditorRow key={r.id} colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} typeOptions={typeOptions} onSave={save} onCancel={cancel} busy={busy} adding={false} />
              ) : (
                <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Td>
                    <div className="min-w-[200px] max-w-[300px]">
                      <div className="flex items-center gap-2">
                        {r.code && <span className="text-[11px] font-bold text-ink-subtle">#{r.code}</span>}
                        <span className="font-bold text-ink-strong">{r.fundName}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] font-semibold text-ink-subtle">
                        {[r.entity, r.location, r.sipDate && `SIP ${r.sipDate}`, r.type, r.amount && `₹${formatINR(parseAmount(r.amount))}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </Td>
                  {cols.map((c) => {
                    const k = key(r.id, c.month);
                    return (
                      <td key={c.month} className="px-1.5 py-2 align-middle" style={{ background: c.month === currentMonth ? "color-mix(in srgb, var(--color-altus-red) 4%, transparent)" : undefined }}>
                        <AmountCell value={grid[k] ?? ""} busy={rowBusy === k} isCurrent={c.month === currentMonth} onChange={(v) => setGrid((g) => ({ ...g, [k]: v }))} onCommit={(v) => commitCell(r.id, c.month, v)} />
                      </td>
                    );
                  })}
                  <Td className="text-right font-bold text-ink-strong whitespace-nowrap">{ytd(r.id) ? `₹${formatINR(ytd(r.id))}` : <Dim />}</Td>
                  <Td className="text-right"><RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy} /></Td>
                </tr>
              ))
            )}
            {filtered.length > 0 && (
              <tr style={{ borderTop: "2px solid var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}>
                <Td className="font-bold uppercase text-[12px] tracking-[0.08em] text-ink-soft">Total</Td>
                {cols.map((c) => (
                  <td key={c.month} className="px-2 py-3 text-right text-[12.5px] font-bold text-ink-strong whitespace-nowrap">{monthTotal(c.month) ? formatINR(monthTotal(c.month)) : ""}</td>
                ))}
                <Td className="text-right font-extrabold text-altus-red whitespace-nowrap">₹{formatINR(grandTotal)}</Td>
                <Td>{""}</Td>
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
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => { if (!confirming) return; const t = setTimeout(() => setConfirming(false), 3500); return () => clearTimeout(t); }, [confirming]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit fund" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"><Pencil size={15} strokeWidth={2.2} /></button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm</button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete fund" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"><Trash2 size={15} strokeWidth={2.2} /></button>
      )}
    </div>
  );
}

function EditorRow({ colSpan, draft, setDraft, entityOptions, typeOptions, onSave, onCancel, busy, adding }: {
  colSpan: number; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; entityOptions: LookupOption[]; typeOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-6 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-md:col-span-1"><input value={draft.code} onChange={(e) => set({ code: e.target.value })} className={INPUT} placeholder="1" aria-label="S. No" autoFocus /></Field>
          <Field label="Entity" className="col-span-4 max-lg:col-span-2 max-md:col-span-1"><ValueSelect label="entity" kind="sip_entity" options={entityOptions} value={draft.entity} onChange={(v) => set({ entity: v })} placeholder="Entity…" /></Field>
          <Field label="Mutual fund name" className="col-span-6 max-lg:col-span-6 max-md:col-span-2"><input value={draft.fundName} onChange={(e) => set({ fundName: e.target.value })} className={INPUT} placeholder="e.g. Bajaj Flexicap Fund" aria-label="Fund name" /></Field>
          <Field label="Location" className="col-span-4 max-lg:col-span-3 max-md:col-span-1"><input value={draft.location} onChange={(e) => set({ location: e.target.value })} className={INPUT} placeholder="Demat / account" aria-label="Location" /></Field>
          <Field label="SIP date" className="col-span-2 max-lg:col-span-1 max-md:col-span-1"><input value={draft.sipDate} onChange={(e) => set({ sipDate: e.target.value })} className={INPUT} placeholder="1st" aria-label="SIP date" /></Field>
          <Field label="Type" className="col-span-3 max-lg:col-span-2 max-md:col-span-1"><ValueSelect label="type" kind="sip_type" options={typeOptions} value={draft.type} onChange={(v) => set({ type: v })} placeholder="SIP…" /></Field>
          <Field label="Installment amount (₹)" className="col-span-3 max-lg:col-span-3 max-md:col-span-1"><input value={draft.amount} onChange={(e) => set({ amount: e.target.value })} className={INPUT} inputMode="numeric" placeholder="125000" aria-label="Installment amount" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50"><X size={16} strokeWidth={2.4} /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Fund" : "Save Changes"}</button>
        </div>
      </td>
    </tr>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={"flex flex-col gap-1.5 " + (className ?? "")}>
      <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}
