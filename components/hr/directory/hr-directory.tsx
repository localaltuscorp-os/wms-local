"use client";

import * as React from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Download, FileDown, GripVertical, Loader2, Mail, MessageCircle, Pencil, Plus, Search } from "lucide-react";
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

type DirectoryColumnKey = "serial" | "name" | "company" | "cell" | "email" | "contact2Name" | "contact2Cell" | "contact2Email" | "actions";
type SortState = { key: Exclude<DirectoryColumnKey, "serial" | "actions">; direction: "asc" | "desc" } | null;

const DIRECTORY_COLUMNS: ReadonlyArray<{ key: DirectoryColumnKey; label: string; sortable: boolean; pinned?: "left" | "right" }> = [
  { key: "serial", label: "Sr. No.", sortable: false, pinned: "left" },
  { key: "name", label: "Name", sortable: true, pinned: "left" },
  { key: "company", label: "Company Name", sortable: true, pinned: "left" },
  { key: "cell", label: "Cell Number", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "contact2Name", label: "Contact 2 Name", sortable: true },
  { key: "contact2Cell", label: "Contact 2 Cell Number", sortable: true },
  { key: "contact2Email", label: "Contact 2 Email", sortable: true },
  { key: "actions", label: "Actions", sortable: false, pinned: "right" },
];

const DIRECTORY_COLUMN_WIDTHS: Record<DirectoryColumnKey, number> = {
  serial: 80,
  name: 210,
  company: 260,
  cell: 180,
  email: 240,
  contact2Name: 200,
  contact2Cell: 210,
  contact2Email: 240,
  actions: 120,
};

const PINNED_COLUMN_STYLE: Partial<Record<DirectoryColumnKey, React.CSSProperties>> = {
  serial: { left: 0, width: DIRECTORY_COLUMN_WIDTHS.serial },
  name: { left: DIRECTORY_COLUMN_WIDTHS.serial, width: DIRECTORY_COLUMN_WIDTHS.name },
  company: { left: DIRECTORY_COLUMN_WIDTHS.serial + DIRECTORY_COLUMN_WIDTHS.name, width: DIRECTORY_COLUMN_WIDTHS.company },
  actions: { right: 0, width: DIRECTORY_COLUMN_WIDTHS.actions },
};

const PINNED_HEADER_BACKGROUND = "#f8fafc";
const PINNED_CELL_BACKGROUND = "#ffffff";

const blank = (directoryType: DirectoryType): Draft => ({ directoryType, personName: "", companyName: "", cellNo: "", email: "", contact2Name: "", contact2CellNo: "", contact2Email: "", service: "", notes: "" });

function fromRow(row: ContactRow): Draft {
  return { id: row.id, directoryType: safeDirectoryType(row.directoryType), personName: row.personName, companyName: row.companyName ?? "", cellNo: row.cellNo ?? "", email: row.email ?? "", contact2Name: row.contact2Name ?? "", contact2CellNo: row.contact2CellNo ?? "", contact2Email: row.contact2Email ?? "", service: row.service, notes: row.notes ?? "" };
}

export function HrDirectory({ contacts, preview = false }: { contacts: ContactRow[]; preview?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<DirectoryType>("vendor");
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [columnOrder, setColumnOrder] = React.useState<DirectoryColumnKey[]>(() => DIRECTORY_COLUMNS.map((column) => column.key));
  const [sort, setSort] = React.useState<SortState>(null);
  const [draggingColumn, setDraggingColumn] = React.useState<DirectoryColumnKey | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();
  const columns = React.useMemo(() => {
    const columnsByKey = new Map(DIRECTORY_COLUMNS.map((column) => [column.key, column]));
    const leftPinned = DIRECTORY_COLUMNS.filter((column) => column.pinned === "left");
    const rightPinned = DIRECTORY_COLUMNS.filter((column) => column.pinned === "right");
    const movable = columnOrder
      .map((key) => columnsByKey.get(key))
      .filter((column): column is (typeof DIRECTORY_COLUMNS)[number] => Boolean(column && !column.pinned));
    return [...leftPinned, ...movable, ...rightPinned];
  }, [columnOrder]);
  const rows = React.useMemo(() => {
    const filtered = contacts
      .filter((row) => row.isActive && safeDirectoryType(row.directoryType) === tab)
      .filter((row) => !needle || [row.personName, row.companyName, row.cellNo, row.email, row.contact2Name, row.contact2CellNo, row.contact2Email].some((value) => value?.toLowerCase().includes(needle)));
    if (!sort) return filtered;
    return [...filtered].sort((left, right) => {
      const direction = sort.direction === "asc" ? 1 : -1;
      return directorySortValue(left, sort.key).localeCompare(directorySortValue(right, sort.key), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [contacts, needle, sort, tab]);
  const vendorCount = contacts.filter((row) => row.isActive && safeDirectoryType(row.directoryType) === "vendor").length;
  const consultantCount = contacts.filter((row) => row.isActive && safeDirectoryType(row.directoryType) === "hr_consultant").length;

  React.useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

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

  function toggleSort(key: Exclude<DirectoryColumnKey, "serial" | "actions">) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  function reorderColumns(activeKey: DirectoryColumnKey, overKey: DirectoryColumnKey) {
    if (activeKey === overKey) return;
    setColumnOrder((current) => {
      const pinnedKeys = DIRECTORY_COLUMNS.filter((column) => column.pinned).map((column) => column.key);
      const movableKeys = current.filter((key) => !pinnedKeys.includes(key));
      if (pinnedKeys.includes(activeKey)) return current;
      const from = movableKeys.indexOf(activeKey);
      const to = movableKeys.indexOf(overKey);
      return from < 0 || to < 0 ? current : [...DIRECTORY_COLUMNS.filter((column) => column.pinned === "left").map((column) => column.key), ...arrayMove(movableKeys, from, to), ...DIRECTORY_COLUMNS.filter((column) => column.pinned === "right").map((column) => column.key)];
    });
  }

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" className="inline-flex rounded-xl border border-hairline bg-white p-1">
        {(["vendor", "hr_consultant"] as const).map((type) => <button key={type} type="button" role="tab" aria-selected={tab === type} onClick={() => setTab(type)} className={`rounded-lg px-3.5 py-2 text-[13px] font-bold ${tab === type ? "bg-red-50 text-red-700" : "text-ink-muted hover:bg-surface-soft"}`}>{directoryTypeLabel(type)} <span className="tabular-nums">({type === "vendor" ? vendorCount : consultantCount})</span></button>)}
      </div>
      {preview && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">Preview data</span>}
      <button
        type="button"
        onClick={() => {
          if (searchOpen) setQuery("");
          setSearchOpen((open) => !open);
        }}
        aria-label={searchOpen ? "Close directory search" : "Search directory"}
        aria-expanded={searchOpen}
        title={searchOpen ? "Close search" : "Search directory"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-muted transition-colors hover:text-ink-strong"
      >
        <Search size={16} />
      </button>
      {searchOpen && <div className="relative w-[270px] max-w-full"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} className={`${INPUT} pl-9`} placeholder="Search directory" aria-label="Search directory" /></div>}
      <div className="ml-auto flex flex-wrap gap-2 max-sm:ml-0">
        <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[12.5px] font-bold"><Download size={15} /> Download</button>
        <button type="button" disabled={preview || busy !== null} title={preview ? "Preview data cannot be exported as a PDF." : "Download PDF"} onClick={() => void downloadPdf()} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50">{busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF</button>
        <button type="button" disabled={preview || busy !== null} title={preview ? "Preview data cannot be emailed." : "Email PDF"} onClick={() => void emailPdf()} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-50">{busy === "email" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Email PDF</button>
        <button type="button" disabled={preview} title={preview ? "Preview data cannot be changed." : "Add directory contact"} onClick={() => setDraft(blank(tab))} className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-55"><Plus size={16} /> Add</button>
      </div>
    </div>
    <section className="overflow-hidden rounded-2xl border border-hairline-strong bg-white">
      <div className="directory-table-scroll isolate overflow-x-auto" style={PASS_VERTICAL_SCROLL}>
          <table className="min-w-[1740px] w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              {columns.map((column) => <col key={column.key} style={{ width: DIRECTORY_COLUMN_WIDTHS[column.key] }} />)}
            </colgroup>
            <thead className="bg-surface-soft">
              <tr>
                {columns.map((column) => (
                  <DirectoryHeader
                    key={column.key}
                    column={column}
                    sort={sort}
                    draggingColumn={draggingColumn}
                    onSort={toggleSort}
                    onDragStart={setDraggingColumn}
                    onDrop={(overColumn) => {
                      if (draggingColumn) reorderColumns(draggingColumn, overColumn);
                      setDraggingColumn(null);
                    }}
                    onDragEnd={() => setDraggingColumn(null)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-t border-hairline">
                  {columns.map((column) => (
                    <DirectoryCell
                      key={column.key}
                      column={column.key}
                      row={row}
                      index={index}
                      busy={busy}
                      preview={preview}
                      onEdit={() => setDraft(fromRow(row))}
                      onArchive={() => void archive(row)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        {rows.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-ink-muted">No {directoryTypeLabel(tab).toLowerCase()} match this search.</p> : null}
      </div>
    </section>
    {draft && <DirectoryForm draft={draft} busy={busy === "save"} onChange={setDraft} onClose={() => setDraft(null)} onSubmit={save} />}
  </div>;
}

function directorySortValue(row: ContactRow, key: Exclude<DirectoryColumnKey, "serial" | "actions">): string {
  switch (key) {
    case "name": return row.personName;
    case "company": return row.companyName ?? "";
    case "cell": return row.cellNo ?? "";
    case "email": return row.email ?? "";
    case "contact2Name": return row.contact2Name ?? "";
    case "contact2Cell": return row.contact2CellNo ?? "";
    case "contact2Email": return row.contact2Email ?? "";
  }
}

function DirectoryHeader({
  column,
  sort,
  draggingColumn,
  onSort,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  column: (typeof DIRECTORY_COLUMNS)[number];
  sort: SortState;
  draggingColumn: DirectoryColumnKey | null;
  onSort: (key: Exclude<DirectoryColumnKey, "serial" | "actions">) => void;
  onDragStart: (key: DirectoryColumnKey) => void;
  onDrop: (key: DirectoryColumnKey) => void;
  onDragEnd: () => void;
}) {
  const activeSort = column.sortable && sort?.key === column.key ? sort : null;
  const sortLabel = activeSort?.direction === "asc" ? "ascending" : activeSort?.direction === "desc" ? "descending" : "not sorted";
  const pinnedStyle = PINNED_COLUMN_STYLE[column.key];
  const canDrag = !column.pinned;
  const headerStyle: React.CSSProperties = {
    position: pinnedStyle ? "sticky" : "relative",
    zIndex: pinnedStyle ? 30 : 1,
    ...pinnedStyle,
    backgroundColor: PINNED_HEADER_BACKGROUND,
  };

  return (
    <th
      className={`${TH} ${column.key === "actions" ? "text-right" : "text-left"} ${draggingColumn === column.key ? "opacity-50" : ""}`}
      style={headerStyle}
      aria-sort={activeSort?.direction === "asc" ? "ascending" : activeSort?.direction === "desc" ? "descending" : undefined}
      onDragOver={(event) => {
        if (!canDrag || !draggingColumn) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!canDrag || !draggingColumn) return;
        event.preventDefault();
        onDrop(column.key);
      }}
    >
      <div className={`flex items-center gap-1.5 ${column.key === "actions" ? "justify-end" : ""}`}>
        {!canDrag ? <span className="w-5 shrink-0" aria-hidden /> : <button
            type="button"
            draggable
            className="cursor-grab touch-none rounded p-0.5 text-ink-subtle hover:bg-surface-card hover:text-ink-strong active:cursor-grabbing"
            aria-label={`Drag ${column.label} column`}
            title="Drag to reorder column"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", column.key);
              onDragStart(column.key);
            }}
            onDragEnd={onDragEnd}
          >
            <GripVertical size={14} aria-hidden />
          </button>}
        {column.sortable ? (
          <button
            type="button"
            onClick={() => onSort(column.key as Exclude<DirectoryColumnKey, "serial" | "actions">)}
            className="inline-flex items-center gap-1 whitespace-nowrap text-left hover:text-ink-strong"
            title={`Sort ${column.label} ${activeSort?.direction === "asc" ? "descending" : "ascending"}`}
          >
            {column.label}
            {activeSort?.direction === "asc" ? <ArrowUp size={13} aria-label={`Sorted ${sortLabel}`} /> : activeSort?.direction === "desc" ? <ArrowDown size={13} aria-label={`Sorted ${sortLabel}`} /> : <ArrowUpDown size={13} aria-hidden />}
          </button>
        ) : (
          <span className="whitespace-nowrap">{column.label}</span>
        )}
      </div>
    </th>
  );
}

function DirectoryCell({
  column,
  row,
  index,
  busy,
  preview,
  onEdit,
  onArchive,
}: {
  column: DirectoryColumnKey;
  row: ContactRow;
  index: number;
  busy: string | null;
  preview: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const pinnedStyle = PINNED_COLUMN_STYLE[column];
  const cellClassName = TD;
  const cellStyle: React.CSSProperties = {
    position: pinnedStyle ? "sticky" : "relative",
    zIndex: pinnedStyle ? 20 : 0,
    ...pinnedStyle,
    backgroundColor: pinnedStyle ? PINNED_CELL_BACKGROUND : undefined,
  };
  switch (column) {
    case "serial": return <td className={`${cellClassName} tabular-nums text-ink-muted`} style={cellStyle}>{index + 1}</td>;
    case "name": return <td className={`${cellClassName} truncate whitespace-nowrap font-bold`} style={cellStyle} title={row.personName}>{row.personName}</td>;
    case "company": return <td className={`${cellClassName} truncate whitespace-nowrap`} style={cellStyle} title={row.companyName ?? "-"}>{row.companyName ?? "-"}</td>;
    case "cell": return <td className={cellClassName} style={cellStyle}><ContactActions name={row.personName} phone={row.cellNo} email={row.email} /></td>;
    case "email": return <td className={`${cellClassName} whitespace-nowrap`} style={cellStyle}>{row.email ? <a className="hover:underline" href={`mailto:${row.email}`}>{row.email}</a> : "-"}</td>;
    case "contact2Name": return <td className={`${cellClassName} whitespace-nowrap`} style={cellStyle}>{row.contact2Name ?? "-"}</td>;
    case "contact2Cell": return <td className={cellClassName} style={cellStyle}><ContactActions name={row.contact2Name ?? row.personName} phone={row.contact2CellNo} email={row.contact2Email} /></td>;
    case "contact2Email": return <td className={`${cellClassName} whitespace-nowrap`} style={cellStyle}>{row.contact2Email ? <a className="hover:underline" href={`mailto:${row.contact2Email}`}>{row.contact2Email}</a> : "-"}</td>;
    case "actions": return <td className={`${cellClassName} text-right`} style={cellStyle}><button type="button" title={preview ? "Preview data cannot be changed." : "Edit contact"} disabled={preview} onClick={onEdit} className="mr-1 rounded-lg border border-hairline p-2 hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"><Pencil size={14} /></button><button type="button" title={preview ? "Preview data cannot be changed." : "Archive contact"} disabled={preview || busy === `archive-${row.id}`} onClick={onArchive} className="rounded-lg border border-hairline p-2 hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"><Archive size={14} /></button></td>;
  }
}

function ContactActions({ name, phone, email }: { name: string; phone: string | null; email: string | null }) {
  const whatsapp = whatsappHref(phone);
  return <div className="flex min-w-[132px] items-center gap-1 whitespace-nowrap"><a href={phone ? `tel:${phone}` : undefined} className="font-semibold tabular-nums hover:underline">{phone ?? "-"}</a>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" title={`WhatsApp ${name}`} className="rounded p-1 text-emerald-700 hover:bg-emerald-50"><MessageCircle size={15} /></a>}{email && <a href={`mailto:${email}`} title={`Email ${name}`} className="rounded p-1 text-red-700 hover:bg-red-50"><Mail size={15} /></a>}</div>;
}

function DirectoryForm({ draft, busy, onChange, onClose, onSubmit }: { draft: Draft; busy: boolean; onChange: (draft: Draft) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const setPhone = (key: "cellNo" | "contact2CellNo", value: string) => set(key, value.replace(/\D/g, "").slice(0, 10));
  const phoneInput = { inputMode: "numeric" as const, pattern: "[0-9]{10}", minLength: 10, maxLength: 10, title: "Enter exactly 10 digits." };

  return <Modal title={draft.id ? `Edit ${directoryTypeLabel(draft.directoryType).slice(0, -1)}` : `Add ${directoryTypeLabel(draft.directoryType).slice(0, -1)}`} onClose={onClose} wide><form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 max-sm:grid-cols-1"><Field label="Name" required><input value={draft.personName} onChange={(event) => set("personName", event.target.value)} className={INPUT} required autoFocus /></Field><Field label="Company Name"><input value={draft.companyName} onChange={(event) => set("companyName", event.target.value)} className={INPUT} /></Field><Field label="Cell Number" required><input value={draft.cellNo} onChange={(event) => setPhone("cellNo", event.target.value)} className={INPUT} type="tel" required {...phoneInput} /></Field><Field label="Email"><input value={draft.email} onChange={(event) => set("email", event.target.value)} className={INPUT} type="email" /></Field><Field label="Contact 2 Name"><input value={draft.contact2Name} onChange={(event) => set("contact2Name", event.target.value)} className={INPUT} /></Field><Field label="Contact 2 Cell Number"><input value={draft.contact2CellNo} onChange={(event) => setPhone("contact2CellNo", event.target.value)} className={INPUT} type="tel" {...phoneInput} /></Field><Field label="Contact 2 Email" className="col-span-2 max-sm:col-span-1"><input value={draft.contact2Email} onChange={(event) => set("contact2Email", event.target.value)} className={INPUT} type="email" /></Field><Field label="Service / Notes" className="col-span-2 max-sm:col-span-1"><input value={draft.service} onChange={(event) => set("service", event.target.value)} className={INPUT} placeholder="Optional service or category" /></Field><div className="col-span-2 flex justify-end gap-2 max-sm:col-span-1"><button type="button" onClick={onClose} className="rounded-lg border border-hairline-strong px-4 py-2 text-[13px] font-bold">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{draft.id ? "Save changes" : "Add contact"}</button></div></form></Modal>;
}
