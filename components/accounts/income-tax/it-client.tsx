"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2, ExternalLink } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { ItFolderRow } from "@/lib/queries/accounts-it";
import { createItFolder, updateItFolder, deleteItFolder } from "@/app/(app)/accounts/income-tax-master-folder/actions";

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

type Draft = { entity: string | null; fy: string; folderLink: string; notes: string };
function emptyDraft(): Draft { return { entity: null, fy: "", folderLink: "", notes: "" }; }
function toDraft(r: ItFolderRow): Draft { return { entity: r.entity, fy: r.fy ?? "", folderLink: r.folderLink ?? "", notes: r.notes ?? "" }; }

export function ItMasterFolder({ rows, entityOptions }: { rows: ItFolderRow[]; entityOptions: LookupOption[] }) {
  const [q, setQ] = React.useState("");
  const [fEntity, setFEntity] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const entities = React.useMemo(() => Array.from(new Set([...entityOptions.map((o) => o.name), ...rows.map((r) => r.entity)].filter(Boolean))), [entityOptions, rows]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fEntity && r.entity !== fEntity) return false;
      if (needle && ![r.entity, r.fy, r.notes].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, fEntity]);

  const hasFilters = q || fEntity;
  function clearFilters() { setQ(""); setFEntity(""); }
  function startAdd() { setEditingId(null); setDraft(emptyDraft()); setAdding(true); }
  function startEdit(r: ItFolderRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    const entity = (draft.entity ?? "").trim();
    if (!entity) { fireToast({ message: "An entity is required.", type: "error" }); return; }
    setBusy(true);
    const payload = { ...draft, entity };
    startTransition(async () => {
      const res = adding ? await createItFolder(payload) : await updateItFolder({ ...payload, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Folder added." : "Saved.", type: "success" });
      cancel();
    });
  }
  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteItFolder(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Removed.", type: "info" });
    });
  }

  const totalCols = 5;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — entity, FY, notes" title="Local search — filters only the list on this page" aria-label="Local search — entity, FY, notes — this page only" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        <select className={CHIP} value={fEntity} onChange={(e) => setFEntity(e.target.value)} aria-label="Filter by entity">
          <option value="">All Entities</option>
          {entities.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} strokeWidth={2.4} /> Clear</button>}
        <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
          <Plus size={16} strokeWidth={2.6} /> Add Folder
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "folder" : "folders"}{hasFilters ? ` · filtered from ${rows.length}` : ""}</div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>Entity</Th><Th>FY</Th><Th>Folder</Th><Th>Notes</Th><Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && <EditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />}
            {filtered.length === 0 && !adding ? (
              <tr><td colSpan={totalCols} className="px-5 py-16 text-center"><p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No folders match." : "No income-tax folders linked yet."}</p>{!hasFilters && <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red"><Plus size={15} strokeWidth={2.6} /> Add the First Folder</button>}</td></tr>
            ) : (
              filtered.map((r) => editingId === r.id ? (
                <EditorRow key={r.id} colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={save} onCancel={cancel} busy={busy} adding={false} />
              ) : (
                <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Td className="font-bold text-ink-strong whitespace-nowrap">{r.entity}</Td>
                  <Td className="whitespace-nowrap font-semibold text-ink-soft">{r.fy || <Dim />}</Td>
                  <Td>
                    {r.folderLink && /^https?:\/\//i.test(r.folderLink) ? (
                      <a href={r.folderLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-altus-red hover:underline"><ExternalLink size={14} strokeWidth={2.4} /> Open Folder</a>
                    ) : r.folderLink ? <span className="text-[13px] text-ink-soft break-all">{r.folderLink}</span> : <Dim />}
                  </Td>
                  <Td>{r.notes ? <p className="max-w-[320px] whitespace-pre-wrap break-words text-[13px] text-ink-soft" title={r.notes}>{r.notes}</p> : <Dim />}</Td>
                  <Td className="text-right"><RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy} /></Td>
                </tr>
              ))
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
          <Field label="Entity" className="col-span-4 max-md:col-span-1"><ValueSelect label="entity" kind="it_entity" options={entityOptions} value={draft.entity} onChange={(v) => set({ entity: v })} placeholder="Entity…" /></Field>
          <Field label="FY" className="col-span-3 max-md:col-span-1"><input value={draft.fy} onChange={(e) => set({ fy: e.target.value })} className={INPUT} placeholder="2024-25" aria-label="FY" autoFocus /></Field>
          <Field label="Folder link" className="col-span-5 max-md:col-span-2"><input value={draft.folderLink} onChange={(e) => set({ folderLink: e.target.value })} className={INPUT} placeholder="https://drive.google.com/…" aria-label="Folder link" /></Field>
          <Field label="Notes" className="col-span-12 max-md:col-span-2"><textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT + " min-h-[48px] resize-y"} placeholder="Notes" aria-label="Notes" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50"><X size={16} strokeWidth={2.4} /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add Folder" : "Save Changes"}</button>
        </div>
      </td>
    </tr>
  );
}
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={"flex flex-col gap-1.5 " + (className ?? "")}><span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>{children}</label>;
}
