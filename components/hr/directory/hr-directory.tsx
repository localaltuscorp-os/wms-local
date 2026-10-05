"use client";

import * as React from "react";
import { Archive, Download, FileDown, Loader2, Mail, MessageCircle, Pencil, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import type { ContactRow } from "@/lib/hr/registers-server";
import { directoryReport, directoryTypeLabel, safeDirectoryType, type DirectoryType } from "@/lib/hr/directory";
import { whatsappHref } from "@/lib/hr/registers";
import { emailDirectoryPdf, saveDirectoryContact, setDirectoryContactActive } from "@/app/(app)/hr/directory/actions";
import { Field, INPUT, Modal, PASS_VERTICAL_SCROLL, TD, TH } from "@/components/hr/registers/register-ui";

type Draft = {
  id?: string;
  directoryType: DirectoryType;
  personName: string;
  companyName: string;
  cellNo: string;
  email: string;
  contact2Name: string;
  contact2CellNo: string;
  contact2Email: string;
  service: string;
  notes: string;
};

const blank = (directoryType: DirectoryType): Draft => ({ directoryType, personName: "", companyName: "", cellNo: "", email: "", contact2Name: "", contact2CellNo: "", contact2Email: "", service: "", notes: "" });

function fromRow(row: ContactRow): Draft {
  return { id: row.id, directoryType: safeDirectoryType(row.directoryType), personName: row.personName, companyName: row.companyName ?? "", cellNo: row.cellNo ?? "", email: row.email ?? "", contact2Name: row.contact2Name ?? "", contact2CellNo: row.contact2CellNo ?? "", contact2Email: row.contact2Email ?? "", service: row.service, notes: row.notes ?? "" };
}

export function HrDirectory({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<DirectoryType>("vendor");
  const [query, setQuery] = React.useState("");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const rows = contacts.filter((row) => row.isActive && safeDirectoryType(row.directoryType) === tab).filter((row) => !needle || [row.personName, row.companyName, row.cellNo, row.email, row.contact2Name, row.contact2CellNo, row.contact2Email].some((value) => value?.toLowerCase().includes(needle)));
  const vendorCount = contacts.filter((row) => row.isActive && safeDirectoryType(row.directoryType) === "vendor").length;
  const consultantCount = contacts.filter((row) => row.isActive && safeDirectoryType(row.directoryType) === "hr_consultant").length;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy("save");
    const result = await saveDirectoryContact(draft).catch(() => ({ ok: false as const, error: "Could not save the directory contact." }));
    setBusy(null);
    if (!result.ok) return fireToast({ message: result.error, type: "error" });
    setDraft(null); router.refresh(); fireToast({ message: draft.id ? "Directory contact updated" : "Directory contact added", type: "success" });
  }

  async function archive(row: ContactRow) {
    if (!window.confirm(`Archive ${row.personName}? It can be restored from the existing Address Book.`)) return;
    setBusy(`archive-${row.id}`);
    const result = await setDirectoryContactActive(row.id, false).catch(() => ({ ok: false as const, error: "Could not archive the contact." }));
    setBusy(null);
    if (!result.ok) return fireToast({ message: result.error, type: "error" });
    router.refresh(); fireToast({ message: "Directory contact archived", type: "success" });
  }

  function downloadCsv() {
    const headers = ["Type", "Name", "Company Name", "Cell Number", "Email", "Contact 2 Name", "Contact 2 Cell Number", "Contact 2 Email"];
    const csv = [headers, ...contacts.filter((row) => row.isActive).map((row) => [directoryTypeLabel(safeDirectoryType(row.directoryType)), row.personName, row.companyName ?? "", row.cellNo ?? "", row.email ?? "", row.contact2Name ?? "", row.contact2CellNo ?? "", row.contact2Email ?? ""])].map((line) => line.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "hr-directory.csv"; link.click(); URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const response = await fetch("/api/reports/section-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(directoryReport(contacts)) });
      if (!response.ok) throw new Error("Could not create the PDF.");
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "hr-directory.pdf"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { fireToast({ message: error instanceof Error ? error.message : "Could not create the PDF.", type: "error" }); } finally { setBusy(null); }
  }

  async function emailPdf() {
    setBusy("email"); const result = await emailDirectoryPdf().catch(() => ({ ok: false as const, error: "Could not send the directory PDF." })); setBusy(null);
    if (!result.ok) return fireToast({ message: result.error, type: "error" });
    fireToast({ message: `Directory PDF sent to ${result.to}`, type: "success" });
  }

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" className="inline-flex rounded-xl border border-hairline bg-white p-1">
        {(["vendor", "hr_consultant"] as const).map((type) => <button key={type} type="button" role="tab" aria-selected={tab === type} onClick={() => setTab(type)} className={`rounded-lg px-3.5 py-2 text-[13px] font-bold ${tab === type ? "bg-red-50 text-red-700" : "text-ink-muted hover:bg-surface-soft"}`}>{directoryTypeLabel(type)} <span className="tabular-nums">({type === "vendor" ? vendorCount : consultantCount})</span></button>)}
      </div>
      <div className="relative w-[270px] max-w-full"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${INPUT} pl-9`} placeholder="Search directory" aria-label="Search directory" /></div>
      <div className="ml-auto flex flex-wrap gap-2 max-sm:ml-0">
        <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[12.5px] font-bold"><Download size={15} /> Download DL</button>
        <button type="button" disabled={busy !== null} onClick={() => void downloadPdf()} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[12.5px] font-bold disabled:opacity-50">{busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF</button>
        <button type="button" disabled={busy !== null} onClick={() => void emailPdf()} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-bold text-red-700 disabled:opacity-50">{busy === "email" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Email PDF</button>
        <button type="button" onClick={() => setDraft(blank(tab))} className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-red-800"><Plus size={16} /> Add</button>
      </div>
    </div>
    <section className="overflow-hidden rounded-2xl border border-hairline-strong bg-white"><div className="overflow-x-auto" style={PASS_VERTICAL_SCROLL}><table className="min-w-[1240px] w-full border-collapse"><thead className="bg-surface-soft"><tr><th className={TH}>Sr. No.</th><th className={TH}>Name</th><th className={TH}>Company Name</th><th className={TH}>Cell Number</th><th className={TH}>Email</th><th className={TH}>Contact 2 Name</th><th className={TH}>Contact 2 Cell Number</th><th className={TH}>Contact 2 Email</th><th className={`${TH} text-right`}>Actions</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t border-hairline"><td className={`${TD} tabular-nums text-ink-muted`}>{index + 1}</td><td className={`${TD} font-bold`}>{row.personName}<span className="mt-0.5 block text-[11px] font-semibold text-red-700">{directoryTypeLabel(safeDirectoryType(row.directoryType))}</span></td><td className={TD}>{row.companyName ?? "-"}</td><td className={TD}><ContactActions name={row.personName} phone={row.cellNo} email={row.email} /></td><td className={TD}>{row.email ? <a className="break-all hover:underline" href={`mailto:${row.email}`}>{row.email}</a> : "-"}</td><td className={TD}>{row.contact2Name ?? "-"}</td><td className={TD}><ContactActions name={row.contact2Name ?? row.personName} phone={row.contact2CellNo} email={row.contact2Email} /></td><td className={TD}>{row.contact2Email ? <a className="break-all hover:underline" href={`mailto:${row.contact2Email}`}>{row.contact2Email}</a> : "-"}</td><td className={`${TD} text-right`}><button type="button" title="Edit contact" onClick={() => setDraft(fromRow(row))} className="mr-1 rounded-lg border border-hairline p-2 hover:bg-surface-soft"><Pencil size={14} /></button><button type="button" title="Archive contact" disabled={busy === `archive-${row.id}`} onClick={() => void archive(row)} className="rounded-lg border border-hairline p-2 hover:bg-surface-soft disabled:opacity-50"><Archive size={14} /></button></td></tr>)}</tbody></table>{rows.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-ink-muted">No {directoryTypeLabel(tab).toLowerCase()} match this search.</p> : null}</div></section>
    {draft && <DirectoryForm draft={draft} busy={busy === "save"} onChange={setDraft} onClose={() => setDraft(null)} onSubmit={save} />}
  </div>;
}

function ContactActions({ name, phone, email }: { name: string; phone: string | null; email: string | null }) {
  const whatsapp = whatsappHref(phone);
  return <div className="min-w-[132px]"><a href={phone ? `tel:${phone}` : undefined} className="font-semibold tabular-nums hover:underline">{phone ?? "-"}</a><div className="mt-1 flex gap-1">{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" title={`WhatsApp ${name}`} className="rounded p-1 text-emerald-700 hover:bg-emerald-50"><MessageCircle size={15} /></a>}{email && <a href={`mailto:${email}`} title={`Email ${name}`} className="rounded p-1 text-red-700 hover:bg-red-50"><Mail size={15} /></a>}</div></div>;
}

function DirectoryForm({ draft, busy, onChange, onClose, onSubmit }: { draft: Draft; busy: boolean; onChange: (draft: Draft) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  return <Modal title={draft.id ? `Edit ${directoryTypeLabel(draft.directoryType).slice(0, -1)}` : `Add ${directoryTypeLabel(draft.directoryType).slice(0, -1)}`} onClose={onClose} wide><form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 max-sm:grid-cols-1"><Field label="Name" required><input value={draft.personName} onChange={(event) => set("personName", event.target.value)} className={INPUT} required autoFocus /></Field><Field label="Company Name"><input value={draft.companyName} onChange={(event) => set("companyName", event.target.value)} className={INPUT} /></Field><Field label="Cell Number" required><input value={draft.cellNo} onChange={(event) => set("cellNo", event.target.value)} className={INPUT} type="tel" required /></Field><Field label="Email"><input value={draft.email} onChange={(event) => set("email", event.target.value)} className={INPUT} type="email" /></Field><Field label="Contact 2 Name"><input value={draft.contact2Name} onChange={(event) => set("contact2Name", event.target.value)} className={INPUT} /></Field><Field label="Contact 2 Cell Number"><input value={draft.contact2CellNo} onChange={(event) => set("contact2CellNo", event.target.value)} className={INPUT} type="tel" /></Field><Field label="Contact 2 Email" className="col-span-2 max-sm:col-span-1"><input value={draft.contact2Email} onChange={(event) => set("contact2Email", event.target.value)} className={INPUT} type="email" /></Field><Field label="Service / Notes" className="col-span-2 max-sm:col-span-1"><input value={draft.service} onChange={(event) => set("service", event.target.value)} className={INPUT} placeholder="Optional service or category" /></Field><div className="col-span-2 flex justify-end gap-2 max-sm:col-span-1"><button type="button" onClick={onClose} className="rounded-lg border border-hairline-strong px-4 py-2 text-[13px] font-bold">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{draft.id ? "Save changes" : "Add contact"}</button></div></form></Modal>;
}
