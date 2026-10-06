"use client";

import * as React from "react";
import { Check, ExternalLink, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { KycDocumentRow } from "@/lib/queries/accounts-kyc";
import { createKycDocument, deleteKycDocument, updateKycDocument } from "@/app/(app)/accounts/vasa-family-kyc/actions";
import { fireToast } from "@/lib/toast";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { MultiFilter } from "@/components/ui/multi-filter";

const INPUT = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle focus:border-[color:var(--color-altus-red)]";
const CHIP = "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none";
type Draft = Omit<KycDocumentRow, "id">;
const emptyDraft = (): Draft => ({ person: "", documentType: "", documentNumber: "", issuedOn: "", expiresOn: "", fileLink: "", notes: "" });
const asDraft = (row: KycDocumentRow): Draft => ({ person: row.person, documentType: row.documentType, documentNumber: row.documentNumber ?? "", issuedOn: row.issuedOn ?? "", expiresOn: row.expiresOn ?? "", fileLink: row.fileLink ?? "", notes: row.notes ?? "" });

export function KycDocuments({ rows }: { rows: KycDocumentRow[] }) {
  const [q, setQ] = React.useState("");
  const [types, setTypes] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const documentTypes = React.useMemo(() => Array.from(new Set(rows.map((row) => row.documentType))).sort(), [rows]);
  const filtered = React.useMemo(() => rows.filter((row) => {
    if (types.length && !types.includes(row.documentType)) return false;
    const needle = q.trim().toLowerCase();
    return !needle || [row.person, row.documentType, row.documentNumber, row.notes].filter(Boolean).join(" ").toLowerCase().includes(needle);
  }), [rows, q, types]);
  const hasFilters = q || types.length;
  const close = () => { setAdding(false); setEditingId(null); };
  const startAdd = () => { setDraft(emptyDraft()); setEditingId(null); setAdding(true); };
  const startEdit = (row: KycDocumentRow) => { setDraft(asDraft(row)); setAdding(false); setEditingId(row.id); };
  const save = () => {
    if (!draft.person.trim() || !draft.documentType.trim()) { fireToast({ type: "error", message: "Person and document type are required." }); return; }
    setBusy(true);
    startTransition(async () => {
      const result = adding ? await createKycDocument(draft) : await updateKycDocument({ ...draft, id: editingId });
      setBusy(false);
      if (!result.ok) { fireToast({ type: "error", message: result.error }); return; }
      fireToast({ type: "success", message: adding ? "Document added." : "Document updated." });
      close();
    });
  };
  const remove = (id: string) => startTransition(async () => {
    const result = await deleteKycDocument(id);
    if (!result.ok) fireToast({ type: "error", message: result.error });
    else fireToast({ type: "info", message: "Document removed." });
  });

  return <section className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <CollapsibleSearch scope="person, document, number"><div className="flex min-w-[250px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3"><Search size={17} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Local search — person, document, number" className="w-full bg-transparent py-2.5 text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-ink-subtle" /></div></CollapsibleSearch>
      <MultiFilter className={CHIP} values={types} onChange={setTypes} options={documentTypes} allLabel="All Documents" aria-label="Filter by document type" />
      {hasFilters && <button type="button" onClick={() => { setQ(""); setTypes([]); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} /> Clear</button>}
      <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14.5px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}><Plus size={16} /> Add Document</button>
    </div>
    <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "document" : "documents"}{hasFilters ? ` · filtered from ${rows.length}` : ""}</div>
    {(adding || editingId) && <KycDialog draft={draft} setDraft={setDraft} adding={adding} busy={busy} onSave={save} onCancel={close} />}
    <div className="accounts-inbox-shell table-scroll overflow-x-auto rounded-section border border-hairline bg-surface-card"><table className="accounts-inbox-table w-full border-collapse text-left" style={{ minWidth: 920 }}><thead><tr><Th>Person</Th><Th>Document</Th><Th>Number</Th><Th>Issued</Th><Th>Expires</Th><Th>File</Th><Th className="accounts-inbox-actions text-right" /></tr></thead><tbody>
      {filtered.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center text-[15px] font-semibold text-ink-muted">{hasFilters ? "No documents match these filters." : "No KYC documents yet."}</td></tr> : filtered.map((row) => <tr key={row.id} className="group border-b border-hairline"><Td className="font-bold text-ink-strong">{row.person}</Td><Td>{row.documentType}</Td><Td>{row.documentNumber || "—"}</Td><Td>{row.issuedOn || "—"}</Td><Td>{row.expiresOn || "—"}</Td><Td>{row.fileLink ? <a href={row.fileLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-altus-red hover:underline"><ExternalLink size={13} /> Open file</a> : "—"}</Td><Td className="accounts-inbox-actions text-right"><Actions onEdit={() => startEdit(row)} onDelete={() => remove(row.id)} /></Td></tr>)}
    </tbody></table></div>
  </section>;
}

function KycDialog({ draft, setDraft, adding, busy, onSave, onCancel }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; adding: boolean; busy: boolean; onSave: () => void; onCancel: () => void }) {
  const set = (patch: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...patch }));
  return <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 max-md:items-end max-md:p-0" role="dialog" aria-modal="true" aria-label={adding ? "Add KYC document" : "Edit KYC document"}><button type="button" onClick={busy ? undefined : onCancel} aria-label="Close document form" className="absolute inset-0 bg-[rgba(15,23,42,0.44)] backdrop-blur-[2px]" /><div className="relative w-full max-w-[820px] overflow-hidden rounded-2xl bg-surface-card max-md:rounded-b-none"><div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--color-hairline)" }}><div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-altus-red">Vasa Family KYC</p><h2 className="text-[20px] font-black text-ink-strong">{adding ? "Add Document" : "Edit Document"}</h2></div><button type="button" onClick={onCancel} disabled={busy} aria-label="Cancel" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-soft"><X size={18} /></button></div><div className="grid grid-cols-2 gap-4 px-6 py-5 max-md:grid-cols-1"><Field label="Person"><input value={draft.person} onChange={(event) => set({ person: event.target.value })} className={INPUT} autoFocus /></Field><Field label="Document type"><input value={draft.documentType} onChange={(event) => set({ documentType: event.target.value })} placeholder="PAN, Aadhaar, passport…" className={INPUT} /></Field><Field label="Document number"><input value={draft.documentNumber ?? ""} onChange={(event) => set({ documentNumber: event.target.value })} className={INPUT} /></Field><Field label="File link"><input value={draft.fileLink ?? ""} onChange={(event) => set({ fileLink: event.target.value })} placeholder="https://…" className={INPUT} /></Field><Field label="Issued on"><input value={draft.issuedOn ?? ""} onChange={(event) => set({ issuedOn: event.target.value })} placeholder="dd/mm/yyyy" className={INPUT} /></Field><Field label="Expires on"><input value={draft.expiresOn ?? ""} onChange={(event) => set({ expiresOn: event.target.value })} placeholder="dd/mm/yyyy" className={INPUT} /></Field><Field label="Notes" className="col-span-2 max-md:col-span-1"><textarea value={draft.notes ?? ""} onChange={(event) => set({ notes: event.target.value })} className={INPUT + " min-h-[76px] resize-y"} /></Field></div><div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid var(--color-hairline)", background: "var(--color-surface-soft)" }}><button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-muted"><X size={16} /> Cancel</button><button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-altus-red px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {adding ? "Add Document" : "Save Changes"}</button></div></div></div>;
}

function Actions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) { const [confirm, setConfirm] = React.useState(false); return <div className="accounts-inbox-action-buttons flex justify-end gap-1"><button type="button" onClick={onEdit} aria-label="Edit document" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft"><Pencil size={15} /></button>{confirm ? <button type="button" onClick={onDelete} className="rounded-lg bg-altus-red px-2.5 py-1.5 text-[12px] font-bold text-white">Confirm</button> : <button type="button" onClick={() => setConfirm(true)} aria-label="Delete document" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-altus-red"><Trash2 size={15} /></button>}</div>; }
function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) { return <th className={"px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle " + className} style={{ background: "var(--color-surface-soft)" }}>{children}</th>; }
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={"px-4 py-3 text-[14px] text-ink-soft " + className}>{children}</td>; }
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={"flex flex-col gap-1.5 " + className}><span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>{children}</label>; }
