"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { DueItemRow } from "@/lib/queries/accounts-due";
import { createDueItem, updateDueItem, deleteDueItem } from "@/app/(app)/accounts/due-dates/actions";

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CHIP =
  "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

const YES_NO = ["Yes", "No", "Not Applicable", "Don't Know"];
const TALLY = ["Done", "Pending", "NA"];
const BALANCE = ["Tallied", "Pending", "NA"];

/** Tone for the status-ish fields. */
function tone(value: string | null): { bg: string; fg: string } | null {
  if (!value) return null;
  const s = value.trim().toLowerCase();
  if (["done", "tallied", "yes"].includes(s))
    return { bg: "color-mix(in srgb, var(--color-green) 16%, transparent)", fg: "var(--color-green-deep)" };
  if (["pending"].includes(s))
    return { bg: "color-mix(in srgb, var(--color-amber, #f59e0b) 20%, transparent)", fg: "var(--color-amber-deep, #b45309)" };
  if (["no", "na", "not applicable"].includes(s))
    return { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-subtle)" };
  return { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-soft)" };
}

function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}

function StatusChip({ value }: { value: string | null }) {
  const t = tone(value);
  if (!value || !t) return <Dim />;
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap" style={{ background: t.bg, color: t.fg }}>
      {value === "Not Applicable" ? "N/A" : value}
    </span>
  );
}

function lookupAdd(kind: string) {
  return async (name: string) => {
    const res = await addAccountsLookup(kind, name);
    return res.ok
      ? ({ ok: true as const, option: { id: res.option.id, name: res.option.name } })
      : ({ ok: false as const, error: res.error });
  };
}
function lookupDelete() {
  return async (id: string) => {
    const res = await softDeleteAccountsLookup(id);
    return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error });
  };
}

function ValueSelect({
  label, kind, options, value, onChange, placeholder,
}: {
  label: string; kind: string; options: LookupOption[];
  value: string | null; onChange: (name: string | null) => void; placeholder?: string;
}) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => {
    setOpts((prev) => {
      const extra = prev.filter((p) => !options.some((o) => o.id === p.id));
      return [...options, ...extra];
    });
  }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect
      label={label}
      value={selectedId}
      options={opts}
      placeholder={placeholder}
      className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => {
        const res = await lookupAdd(kind)(name);
        if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, res.option]));
        return res;
      }}
      onDelete={lookupDelete()}
    />
  );
}

type Draft = Omit<DueItemRow, "id" | "sortOrder"> & { compliance: string };
function emptyDraft(): Draft {
  return {
    code: null, area: null, compliance: "", frequency: null, ecs: null, ecsFrom: null,
    statementPeriod: null, statementDate: null, dueDate: null, softCopyAutoEmail: null,
    hardCopy: null, softCopy: null, tallyEntry: null, balanceTally: null, paidDate: null,
    paidAmt: null, intFinChgs: null, chgReversed: null, notes: null,
  };
}
function toDraft(r: DueItemRow): Draft {
  const { id: _id, sortOrder: _s, ...rest } = r;
  return { ...rest, compliance: r.compliance };
}

export function DueDatesChecklist({
  items, areaOptions, frequencyOptions,
}: {
  items: DueItemRow[]; areaOptions: LookupOption[]; frequencyOptions: LookupOption[];
}) {
  const [q, setQ] = React.useState("");
  const [fArea, setFArea] = React.useState("");
  const [fFreq, setFFreq] = React.useState("");

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const areas = React.useMemo(
    () => Array.from(new Set([...areaOptions.map((o) => o.name), ...items.map((i) => i.area ?? "")].filter(Boolean))),
    [areaOptions, items],
  );
  const freqs = React.useMemo(
    () => Array.from(new Set([...frequencyOptions.map((o) => o.name), ...items.map((i) => i.frequency ?? "")].filter(Boolean))),
    [frequencyOptions, items],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((r) => {
      if (fArea && (r.area ?? "") !== fArea) return false;
      if (fFreq && (r.frequency ?? "") !== fFreq) return false;
      if (needle) {
        const hay = [r.code, r.area, r.compliance, r.frequency, r.ecsFrom, r.statementPeriod, r.notes]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, fArea, fFreq]);

  const hasFilters = q || fArea || fFreq;
  function clearFilters() { setQ(""); setFArea(""); setFFreq(""); }

  function startAdd() { setEditingId(null); setDraft(emptyDraft()); setAdding(true); }
  function startEdit(r: DueItemRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    const compliance = draft.compliance.trim();
    if (!compliance) { fireToast({ message: "A name is required.", type: "error" }); return; }
    setBusy(true);
    const payload = { ...draft, compliance };
    startTransition(async () => {
      const res = adding ? await createDueItem(payload) : await updateDueItem({ ...payload, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Item added." : "Item saved.", type: "success" });
      cancel();
    });
  }

  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteDueItem(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Item removed.", type: "info" });
    });
  }

  const totalCols = 9;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — bills, area, notes" title="Local search — filters only the list on this page" aria-label="Local search — bills, area, notes — this page only" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        <select className={CHIP} value={fArea} onChange={(e) => setFArea(e.target.value)} aria-label="Filter by area">
          <option value="">All Areas</option>
          {areas.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        <select className={CHIP} value={fFreq} onChange={(e) => setFFreq(e.target.value)} aria-label="Filter by frequency">
          <option value="">All Frequencies</option>
          {freqs.map((f) => (<option key={f} value={f}>{f}</option>))}
        </select>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <X size={15} strokeWidth={2.4} /> Clear
          </button>
        )}
        <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
          <Plus size={16} strokeWidth={2.6} /> Add Item
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "item" : "items"}{hasFilters ? ` · filtered from ${items.length}` : ""}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1100 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>S. No</Th><Th>Area</Th><Th>Compliance</Th><Th>Freq</Th>
              <Th>Stmt Period</Th><Th>Due</Th><Th>Payment</Th><Th>Notes</Th><Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && (
              <EditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} areaOptions={areaOptions} frequencyOptions={frequencyOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />
            )}
            {filtered.length === 0 && !adding ? (
              <tr>
                <td colSpan={totalCols} className="px-5 py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No items match these filters." : "No due-date items yet."}</p>
                  {!hasFilters && (
                    <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the First Item
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) =>
                editingId === r.id ? (
                  <EditorRow key={r.id} colSpan={totalCols} draft={draft} setDraft={setDraft} areaOptions={areaOptions} frequencyOptions={frequencyOptions} onSave={save} onCancel={cancel} busy={busy} adding={false} />
                ) : (
                  <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td className="font-bold text-ink-strong whitespace-nowrap">{r.code || <Dim />}</Td>
                    <Td><StatusChipNeutral value={r.area} /></Td>
                    <Td><span className="block max-w-[280px] whitespace-pre-wrap break-words font-semibold text-ink-strong">{r.compliance}</span></Td>
                    <Td className="whitespace-nowrap text-[13px]">{r.frequency || <Dim />}</Td>
                    <Td className="whitespace-nowrap text-[13px] text-ink-soft">{r.statementPeriod || <Dim />}</Td>
                    <Td className="whitespace-nowrap font-bold text-ink-strong">{r.dueDate || <Dim />}</Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip value={r.tallyEntry} />
                          <StatusChip value={r.balanceTally} />
                        </div>
                        {(r.paidDate || r.paidAmt) && (
                          <div className="text-[12px] font-semibold text-ink-soft whitespace-nowrap">
                            {r.paidDate ?? ""}{r.paidAmt ? ` · ₹${r.paidAmt}` : ""}
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td>{r.notes ? <p className="max-w-[220px] whitespace-pre-wrap break-words text-[13px] text-ink-soft" title={r.notes}>{r.notes}</p> : <Dim />}</Td>
                    <Td className="text-right"><RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy} /></Td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusChipNeutral({ value }: { value: string | null }) {
  if (!value) return <Dim />;
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }}>
      {value}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " + (className ?? "")} style={{ background: "var(--color-surface-soft)" }}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-4 py-3 align-top text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
}

function RowActions({ onEdit, onDelete, busy }: { onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit item" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50">
        <Pencil size={15} strokeWidth={2.2} />
      </button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete item" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50">
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function EditorRow({
  colSpan, draft, setDraft, areaOptions, frequencyOptions, onSave, onCancel, busy, adding,
}: {
  colSpan: number; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  areaOptions: LookupOption[]; frequencyOptions: LookupOption[];
  onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-6 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-md:col-span-1">
            <input value={draft.code ?? ""} onChange={(e) => set({ code: e.target.value })} className={INPUT} placeholder="1" aria-label="S. No" autoFocus />
          </Field>
          <Field label="Area" className="col-span-4 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="area" kind="due_area" options={areaOptions} value={draft.area} onChange={(v) => set({ area: v })} placeholder="Area…" />
          </Field>
          <Field label="Compliance / bill" className="col-span-6 max-lg:col-span-6 max-md:col-span-2">
            <input value={draft.compliance} onChange={(e) => set({ compliance: e.target.value })} className={INPUT} placeholder="e.g. Yashodhan Electricity" aria-label="Compliance" />
          </Field>
          <Field label="Frequency" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="frequency" kind="due_frequency" options={frequencyOptions} value={draft.frequency} onChange={(v) => set({ frequency: v })} placeholder="Frequency…" />
          </Field>
          <Field label="ECS" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <FixedSelect value={draft.ecs} onChange={(v) => set({ ecs: v })} options={YES_NO} placeholder="ECS?" />
          </Field>
          <Field label="ECS From" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <input value={draft.ecsFrom ?? ""} onChange={(e) => set({ ecsFrom: e.target.value })} className={INPUT} placeholder="Entity" aria-label="ECS From" />
          </Field>
          <Field label="Statement period" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.statementPeriod ?? ""} onChange={(e) => set({ statementPeriod: e.target.value })} className={INPUT} placeholder="18th to 18th" aria-label="Statement period" />
          </Field>
          <Field label="Statement date" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.statementDate ?? ""} onChange={(e) => set({ statementDate: e.target.value })} className={INPUT} placeholder="19" aria-label="Statement date" />
          </Field>
          <Field label="Due date" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value })} className={INPUT} placeholder="9" aria-label="Due date" />
          </Field>
          <Field label="Soft copy auto-email" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <FixedSelect value={draft.softCopyAutoEmail} onChange={(v) => set({ softCopyAutoEmail: v })} options={YES_NO} placeholder="?" />
          </Field>
          <Field label="Hard copy" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <FixedSelect value={draft.hardCopy} onChange={(v) => set({ hardCopy: v })} options={YES_NO} placeholder="?" />
          </Field>
          <Field label="Soft copy" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <FixedSelect value={draft.softCopy} onChange={(v) => set({ softCopy: v })} options={YES_NO} placeholder="?" />
          </Field>
          <Field label="Tally entry" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <FixedSelect value={draft.tallyEntry} onChange={(v) => set({ tallyEntry: v })} options={TALLY} placeholder="?" />
          </Field>
          <Field label="Balance tally" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <FixedSelect value={draft.balanceTally} onChange={(v) => set({ balanceTally: v })} options={BALANCE} placeholder="?" />
          </Field>
          <Field label="Paid date" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.paidDate ?? ""} onChange={(e) => set({ paidDate: e.target.value })} className={INPUT} placeholder="22/07/25" aria-label="Paid date" />
          </Field>
          <Field label="Paid amount" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.paidAmt ?? ""} onChange={(e) => set({ paidAmt: e.target.value })} className={INPUT} placeholder="20660" aria-label="Paid amount" />
          </Field>
          <Field label="Int + fin charges" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.intFinChgs ?? ""} onChange={(e) => set({ intFinChgs: e.target.value })} className={INPUT} placeholder="0" aria-label="Int + fin charges" />
          </Field>
          <Field label="Charge reversed?" className="col-span-3 max-lg:col-span-3 max-md:col-span-1">
            <FixedSelect value={draft.chgReversed} onChange={(v) => set({ chgReversed: v })} options={YES_NO} placeholder="?" />
          </Field>
          <Field label="Notes" className="col-span-6 max-lg:col-span-6 max-md:col-span-2">
            <textarea value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} className={INPUT + " min-h-[52px] resize-y"} placeholder="Notes" aria-label="Notes" />
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50">
            <X size={16} strokeWidth={2.4} /> Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Item" : "Save Changes"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function FixedSelect({ value, onChange, options, placeholder }: { value: string | null; onChange: (v: string | null) => void; options: string[]; placeholder?: string }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={INPUT} aria-label={placeholder}>
      <option value="">{placeholder ?? "—"}</option>
      {options.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
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
