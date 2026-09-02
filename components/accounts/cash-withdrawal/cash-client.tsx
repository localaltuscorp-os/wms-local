"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { CashItemRow, CashMonthCell, CashLimitRow } from "@/lib/queries/accounts-cash";
import { type FyMonthCol } from "@/lib/accounts/cc";
import { parseAmount, formatINR, sumAmounts } from "@/lib/accounts/amounts";
import {
  createCashItem, updateCashItem, deleteCashItem, setCashMonth, setCashLimit,
} from "@/app/(app)/accounts/cash-withdrawal/actions";

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

const key = (itemId: string, month: number) => `${itemId}:${month}`;

type Draft = { code: string; entity: string | null; nameOnCheque: string | null; chequeNo: string; chqDate: string; amount: string };
function emptyDraft(): Draft { return { code: "", entity: null, nameOnCheque: null, chequeNo: "", chqDate: "", amount: "" }; }
function toDraft(r: CashItemRow): Draft {
  return { code: r.code ?? "", entity: r.entity, nameOnCheque: r.nameOnCheque, chequeNo: r.chequeNo ?? "", chqDate: r.chqDate ?? "", amount: r.amount ?? "" };
}

export function CashWithdrawal({ fyStartYear, cols, currentMonth, items, months, limits, entityOptions, payeeOptions }: {
  fyStartYear: number; cols: FyMonthCol[]; currentMonth: number | null; items: CashItemRow[]; months: CashMonthCell[]; limits: CashLimitRow[]; entityOptions: LookupOption[]; payeeOptions: LookupOption[];
}) {
  const [grid, setGrid] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    const m: Record<string, string> = {};
    for (const c of months) if (c.amount != null) m[key(c.itemId, c.month)] = c.amount;
    setGrid(m);
  }, [months]);

  const [q, setQ] = React.useState("");
  const [fEntity, setFEntity] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const entities = React.useMemo(() => Array.from(new Set([...entityOptions.map((o) => o.name), ...items.map((i) => i.entity ?? "")].filter(Boolean))), [entityOptions, items]);

  // Total withdrawn per entity (live, from the grid) — drives the caps panel.
  const withdrawnByEntity = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const t = sumAmounts(cols.map((c) => parseAmount(grid[key(it.id, c.month)])));
      if (!t) continue;
      const e = it.entity ?? "—";
      map.set(e, (map.get(e) ?? 0) + t);
    }
    return map;
  }, [items, cols, grid]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (fEntity && (r.entity ?? "") !== fEntity) return false;
      if (needle) {
        const hay = [r.code, r.entity, r.nameOnCheque, r.chequeNo].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, fEntity]);

  const ytd = (itemId: string) => sumAmounts(cols.map((c) => parseAmount(grid[key(itemId, c.month)])));
  const monthTotal = (month: number) => sumAmounts(filtered.map((r) => parseAmount(grid[key(r.id, month)])));
  const grandTotal = sumAmounts(filtered.map((r) => ytd(r.id)));

  const hasFilters = q || fEntity;
  function clearFilters() { setQ(""); setFEntity(""); }
  function startAdd() { setEditingId(null); setDraft(emptyDraft()); setAdding(true); }
  function startEdit(r: CashItemRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    setBusy(true);
    const base = { code: draft.code, entity: draft.entity, nameOnCheque: draft.nameOnCheque, chequeNo: draft.chequeNo, chqDate: draft.chqDate, amount: draft.amount };
    startTransition(async () => {
      const res = adding ? await createCashItem({ ...base, fyStartYear }) : await updateCashItem({ ...base, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Withdrawal added." : "Saved.", type: "success" });
      cancel();
    });
  }
  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteCashItem(id);
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
      const res = await setCashMonth({ itemId, month, amount: norm });
      setRowBusy(null);
      if (!res.ok) {
        setGrid((g) => { const x = { ...g }; if (prev) x[k] = prev; else delete x[k]; return x; });
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  const totalCols = 1 + cols.length + 2; // cheque + months + ytd + actions

  return (
    <section className="flex flex-col gap-6">
      <CapsPanel fyStartYear={fyStartYear} limits={limits} withdrawnByEntity={withdrawnByEntity} entityOptions={entityOptions} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
            <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — cheques, entity, payee" title="Local search — filters only the list on this page" aria-label="Local search — cheques, entity, payee — this page only" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
          </div>
          <select className={CHIP} value={fEntity} onChange={(e) => setFEntity(e.target.value)} aria-label="Filter by entity">
            <option value="">All Entities</option>
            {entities.map((a) => (<option key={a} value={a}>{a}</option>))}
          </select>
          {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} strokeWidth={2.4} /> Clear</button>}
          <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
            <Plus size={16} strokeWidth={2.6} /> Add Withdrawal
          </button>
        </div>

        <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "withdrawal" : "withdrawals"}{hasFilters ? ` · filtered from ${items.length}` : ""}</div>

        <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
          <table className="w-full border-collapse text-left" style={{ minWidth: 1080 + cols.length * 92 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                <Th>Cheque</Th>
                {cols.map((c) => (
                  <th key={c.month} className="px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle whitespace-nowrap" style={{ background: c.month === currentMonth ? "color-mix(in srgb, var(--color-altus-red) 9%, var(--color-surface-soft))" : "var(--color-surface-soft)" }}>
                    <div className="text-ink-strong">{c.label}</div>
                    <div className="text-[10px] font-semibold normal-case tracking-normal text-ink-subtle">&apos;{String(c.calYear % 100).padStart(2, "0")}</div>
                  </th>
                ))}
                <Th className="text-right">Total</Th>
                <Th className="text-right">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && (
                <EditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} payeeOptions={payeeOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />
              )}
              {filtered.length === 0 && !adding ? (
                <tr><td colSpan={totalCols} className="px-5 py-16 text-center"><p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No withdrawals match these filters." : "No withdrawals for this financial year yet."}</p>{!hasFilters && <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red"><Plus size={15} strokeWidth={2.6} /> Add the First Withdrawal</button>}</td></tr>
              ) : (
                filtered.map((r) => editingId === r.id ? (
                  <EditorRow key={r.id} colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} payeeOptions={payeeOptions} onSave={save} onCancel={cancel} busy={busy} adding={false} />
                ) : (
                  <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td>
                      <div className="min-w-[200px] max-w-[300px]">
                        <div className="flex items-center gap-2">
                          {r.code && <span className="text-[11px] font-bold text-ink-subtle">#{r.code}</span>}
                          <span className="font-bold text-ink-strong">{r.nameOnCheque || <span className="text-ink-subtle font-semibold">(no payee)</span>}</span>
                        </div>
                        <div className="mt-0.5 text-[12px] font-semibold text-ink-subtle">
                          {[r.entity, r.chequeNo && `#${r.chequeNo}`, r.chqDate, r.amount && `₹${formatINR(parseAmount(r.amount))}`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </Td>
                    {cols.map((c) => {
                      const k = key(r.id, c.month);
                      return (
                        <td key={c.month} className="px-1.5 py-2 align-middle" style={{ background: c.month === currentMonth ? "color-mix(in srgb, var(--color-altus-red) 4%, transparent)" : undefined }}>
                          <input value={grid[k] ?? ""} disabled={rowBusy === k} inputMode="numeric" onChange={(e) => setGrid((g) => ({ ...g, [k]: e.target.value }))} onBlur={(e) => commitCell(r.id, c.month, e.target.value)} className={CELL + " disabled:opacity-60"} style={{ minWidth: 84, borderColor: c.month === currentMonth ? "var(--color-altus-red)" : undefined }} aria-label="Monthly amount" placeholder="—" />
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
                  <Td className="font-bold uppercase text-[12px] tracking-[0.08em] text-ink-soft">Grand total</Td>
                  {cols.map((c) => (<td key={c.month} className="px-2 py-3 text-right text-[12.5px] font-bold text-ink-strong whitespace-nowrap">{monthTotal(c.month) ? formatINR(monthTotal(c.month)) : ""}</td>))}
                  <Td className="text-right font-extrabold text-altus-red whitespace-nowrap">₹{formatINR(grandTotal)}</Td>
                  <Td>{""}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── Per-entity caps panel ─────────────────────────────────────────────────────
function CapsPanel({ fyStartYear, limits, withdrawnByEntity, entityOptions }: {
  fyStartYear: number; limits: CashLimitRow[]; withdrawnByEntity: Map<string, number>; entityOptions: LookupOption[];
}) {
  const [, startTransition] = React.useTransition();
  const [savingId, setSavingId] = React.useState<string | null>(null);

  // Any entity that has withdrawals but no cap row still deserves a tile.
  const capEntities = new Set(limits.map((l) => l.entity));
  const extras = [...withdrawnByEntity.keys()].filter((e) => e !== "—" && !capEntities.has(e));
  const rows = [
    ...limits.map((l) => ({ id: l.id, entity: l.entity, max: parseAmount(l.maxAllowed) })),
    ...extras.map((e) => ({ id: `extra:${e}`, entity: e, max: null as number | null })),
  ];

  function saveMax(entity: string, raw: string, id: string) {
    setSavingId(id);
    startTransition(async () => {
      const res = await setCashLimit({ fyStartYear, entity, maxAllowed: raw });
      setSavingId(null);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }

  if (rows.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-soft">Annual cap by entity</h2>
        <span className="text-[12px] font-semibold text-ink-subtle">— withdrawn vs allowed this FY</span>
      </div>
      <div className="grid grid-cols-4 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
        {rows.map((r) => {
          const withdrawn = withdrawnByEntity.get(r.entity) ?? 0;
          const max = r.max;
          const remaining = max != null ? max - withdrawn : null;
          const pct = max && max > 0 ? Math.min(100, (withdrawn / max) * 100) : 0;
          const over = max != null && withdrawn > max;
          const near = !over && max != null && pct >= 85;
          const bar = over ? "var(--color-altus-red)" : near ? "var(--color-amber, #f59e0b)" : "var(--color-green)";
          return (
            <div key={r.id} className="rounded-xl border border-hairline bg-surface-card p-3.5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-ink-strong text-[14px] truncate">{r.entity}</span>
                {over && <span className="text-[10px] font-bold uppercase tracking-[0.08em] rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--color-altus-red) 14%, transparent)", color: "var(--color-altus-red-deep)" }}>Over</span>}
              </div>
              <div className="mt-2 text-[13px] font-semibold text-ink-soft">
                ₹{formatINR(withdrawn)} <span className="text-ink-subtle">withdrawn</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track, #eef2f7)" }}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: bar }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                <label className="flex items-center gap-1.5 text-ink-subtle">
                  Max ₹
                  <input
                    defaultValue={max != null ? String(max) : ""}
                    inputMode="numeric"
                    disabled={savingId === r.id}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (max != null ? String(max) : "")) saveMax(r.entity, v, r.id); }}
                    className="w-[110px] rounded-md border border-hairline bg-white px-2 py-1 text-right text-[12px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] disabled:opacity-60"
                    placeholder="set cap"
                    aria-label={`Max allowed for ${r.entity}`}
                  />
                  {savingId === r.id && <Loader2 size={12} className="animate-spin" />}
                </label>
                {remaining != null && (
                  <span className="font-bold whitespace-nowrap" style={{ color: over ? "var(--color-altus-red-deep)" : "var(--color-green-deep)" }}>
                    {over ? `−₹${formatINR(Math.abs(remaining))}` : `₹${formatINR(remaining)} left`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit withdrawal" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"><Pencil size={15} strokeWidth={2.2} /></button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm</button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete withdrawal" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"><Trash2 size={15} strokeWidth={2.2} /></button>
      )}
    </div>
  );
}

function EditorRow({ colSpan, draft, setDraft, entityOptions, payeeOptions, onSave, onCancel, busy, adding }: {
  colSpan: number; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; entityOptions: LookupOption[]; payeeOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-6 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-md:col-span-1"><input value={draft.code} onChange={(e) => set({ code: e.target.value })} className={INPUT} placeholder="1" aria-label="S. No" autoFocus /></Field>
          <Field label="Entity" className="col-span-5 max-lg:col-span-3 max-md:col-span-1"><ValueSelect label="entity" kind="cash_entity" options={entityOptions} value={draft.entity} onChange={(v) => set({ entity: v })} placeholder="Entity / bank…" /></Field>
          <Field label="Name on cheque" className="col-span-5 max-lg:col-span-3 max-md:col-span-1"><ValueSelect label="payee" kind="cash_payee" options={payeeOptions} value={draft.nameOnCheque} onChange={(v) => set({ nameOnCheque: v })} placeholder="Payee…" /></Field>
          <Field label="Cheque no" className="col-span-3 max-lg:col-span-2 max-md:col-span-1"><input value={draft.chequeNo} onChange={(e) => set({ chequeNo: e.target.value })} className={INPUT} placeholder="000679" aria-label="Cheque no" /></Field>
          <Field label="Cheque date" className="col-span-3 max-lg:col-span-2 max-md:col-span-1"><input value={draft.chqDate} onChange={(e) => set({ chqDate: e.target.value })} className={INPUT} placeholder="dd/mm/yy" aria-label="Cheque date" /></Field>
          <Field label="Cheque amount (₹)" className="col-span-3 max-lg:col-span-2 max-md:col-span-2"><input value={draft.amount} onChange={(e) => set({ amount: e.target.value })} className={INPUT} inputMode="numeric" placeholder="195000" aria-label="Cheque amount" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50"><X size={16} strokeWidth={2.4} /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Withdrawal" : "Save Changes"}</button>
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
