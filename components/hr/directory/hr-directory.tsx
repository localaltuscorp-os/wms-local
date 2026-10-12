"use client";

import * as React from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Copy, Download, Eye, FileDown, GripVertical, Link2, Loader2, Mail, MessageCircle, Pencil, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import type { ContactRow, EmployeeContactRow } from "@/lib/hr/registers-server";
import { directoryReport, directoryTypeLabel, employeeDirectoryReport, safeDirectoryType, type DirectoryType } from "@/lib/hr/directory";
import { whatsappHref } from "@/lib/hr/registers";
import { createVendorRegistrationLink, createVendorRegistrationLinkForContact, emailDirectoryPdf, saveDirectoryContact, setDirectoryContactActive } from "@/app/(app)/hr/directory/actions";
import { Field, INPUT, Modal, PASS_VERTICAL_SCROLL, TD, TH } from "@/components/hr/registers/register-ui";

type Draft = {
  id?: string;
  directoryType: DirectoryType;
  firstName: string;
  lastName: string;
  companyName: string;
  cellNo: string;
  email: string;
  category: string;
  utility: string;
  amcOnCall: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  addressLine4: string;
  pincode: string;
  gstNo: string;
  panNo: string;
  gstName: string;
  accountName: string;
  accountNo: string;
  accountType: string;
  micrCode: string;
  branchAddress: string;
  bankPincode: string;
  contact1Name: string;
  contact1CellNo: string;
  contact1Email: string;
  contact2Name: string;
  contact2CellNo: string;
  contact2Email: string;
  attachments: Record<string, never>;
  rateNegotiated: string;
  paymentTerms: string;
  notes: string;
};

type DirectoryColumnKey = "serial" | "name" | "company" | "cell" | "email" | "actions";
type SortState = { key: Exclude<DirectoryColumnKey, "serial" | "actions">; direction: "asc" | "desc" } | null;

const DIRECTORY_COLUMNS: ReadonlyArray<{ key: DirectoryColumnKey; label: string; sortable: boolean; pinned?: "left" | "right" }> = [
  { key: "serial", label: "Sr. No.", sortable: false, pinned: "left" },
  { key: "name", label: "Name", sortable: true, pinned: "left" },
  { key: "company", label: "Company Name", sortable: true, pinned: "left" },
  { key: "cell", label: "Cell Number", sortable: true, pinned: "left" },
  { key: "email", label: "Email", sortable: true },
  { key: "actions", label: "Actions", sortable: false, pinned: "right" },
];

const DIRECTORY_COLUMN_WIDTHS: Record<DirectoryColumnKey, number> = {
  serial: 64,
  name: 190,
  company: 230,
  cell: 170,
  email: 240,
  actions: 120,
};

const PINNED_COLUMN_STYLE: Partial<Record<DirectoryColumnKey, React.CSSProperties>> = {
  serial: { left: 0, width: DIRECTORY_COLUMN_WIDTHS.serial },
  name: { left: DIRECTORY_COLUMN_WIDTHS.serial, width: DIRECTORY_COLUMN_WIDTHS.name },
  company: { left: DIRECTORY_COLUMN_WIDTHS.serial + DIRECTORY_COLUMN_WIDTHS.name, width: DIRECTORY_COLUMN_WIDTHS.company },
  cell: { left: DIRECTORY_COLUMN_WIDTHS.serial + DIRECTORY_COLUMN_WIDTHS.name + DIRECTORY_COLUMN_WIDTHS.company, width: DIRECTORY_COLUMN_WIDTHS.cell },
  actions: { right: 0, width: DIRECTORY_COLUMN_WIDTHS.actions },
};

const PINNED_HEADER_BACKGROUND = "#f8fafc";
const PINNED_CELL_BACKGROUND = "#ffffff";

const blank = (directoryType: DirectoryType): Draft => ({ directoryType, firstName: "", lastName: "", companyName: "", cellNo: "", email: "", category: "", utility: "", amcOnCall: "", addressLine1: "", addressLine2: "", addressLine3: "", addressLine4: "", pincode: "", gstNo: "", panNo: "", gstName: "", accountName: "", accountNo: "", accountType: "", micrCode: "", branchAddress: "", bankPincode: "", contact1Name: "", contact1CellNo: "", contact1Email: "", contact2Name: "", contact2CellNo: "", contact2Email: "", attachments: {}, rateNegotiated: directoryType === "hr_consultant" ? "8.33%" : "", paymentTerms: directoryType === "hr_consultant" ? "60 days" : "", notes: "" });

function fromRow(row: ContactRow): Draft {
  const [first = "", ...rest] = row.personName.split(" "); const bank = row.bankDetails ?? {};
  return { ...blank(safeDirectoryType(row.directoryType)), id: row.id, firstName: row.firstName ?? first, lastName: row.lastName ?? rest.join(" "), companyName: row.companyName ?? "", cellNo: row.cellNo ?? "", email: row.email ?? "", category: row.category ?? row.service, utility: row.utility ?? "", amcOnCall: row.amcOnCall ?? "", addressLine1: row.addressLine1 ?? "", addressLine2: row.addressLine2 ?? "", addressLine3: row.addressLine3 ?? "", addressLine4: row.addressLine4 ?? "", pincode: row.pincode ?? "", gstNo: row.gstNo ?? "", panNo: row.panNo ?? "", gstName: row.gstName ?? "", accountName: bank.accountName ?? "", accountNo: bank.accountNo ?? "", accountType: bank.accountType ?? "", micrCode: bank.micrCode ?? "", branchAddress: bank.branchAddress ?? "", bankPincode: bank.pincode ?? "", contact1Name: row.contact1Name ?? "", contact1CellNo: row.contact1CellNo ?? "", contact1Email: row.contact1Email ?? "", contact2Name: row.contact2Name ?? "", contact2CellNo: row.contact2CellNo ?? "", contact2Email: row.contact2Email ?? "", rateNegotiated: row.rateNegotiated ?? "", paymentTerms: row.paymentTerms ?? "", notes: row.notes ?? "" };
}

export function HrDirectory({ contacts, employees = [], preview = false }: { contacts: ContactRow[]; employees?: EmployeeContactRow[]; preview?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<DirectoryType | "employee">("vendor");
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [invite, setInvite] = React.useState<{ firstName: string; lastName: string; cellNo: string; companyName: string; url?: string } | null>(null);
  const [recordPreview, setRecordPreview] = React.useState<{ kind: "contact"; row: ContactRow } | { kind: "employee"; row: EmployeeContactRow } | null>(null);
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
      .filter((row) => row.isActive && tab !== "employee" && safeDirectoryType(row.directoryType) === tab)
      .filter((row) => !needle || [row.personName, row.companyName, row.cellNo, row.email].some((value) => value?.toLowerCase().includes(needle)));
    if (!sort) return filtered;
    return [...filtered].sort((left, right) => {
      const direction = sort.direction === "asc" ? 1 : -1;
      return directorySortValue(left, sort.key).localeCompare(directorySortValue(right, sort.key), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [contacts, needle, sort, tab]);
  const vendorCount = contacts.filter((row) => row.isActive && safeDirectoryType(row.directoryType) === "vendor").length;
  const consultantCount = contacts.filter((row) => row.isActive && safeDirectoryType(row.directoryType) === "hr_consultant").length;
  const employeeCount = employees.filter((row) => row.isActive).length;

  React.useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (preview) return fireToast({ message: "Preview mode: this sample form is ready to review, but its data is not saved.", type: "success" });
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

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!invite) return;
    setBusy("invite");
    const result = await createVendorRegistrationLink(invite).catch(() => ({ ok: false as const, error: "Could not create the registration link." }));
    setBusy(null);
    if (!result.ok) return fireToast({ message: result.error, type: "error" });
    setInvite((current) => current ? { ...current, url: result.url } : current);
    router.refresh();
    void navigator.clipboard?.writeText(result.url);
    fireToast({ message: "Registration link copied. Share it with the vendor.", type: "success" });
  }

  async function createRecordLink(row: ContactRow) {
    if (preview) {
      router.push(`/vendor-registration/preview?record=${encodeURIComponent(row.id)}`);
      return;
    }
    setBusy(`link-${row.id}`);
    const result = await createVendorRegistrationLinkForContact(row.id).catch(() => ({ ok: false as const, error: "Could not create the registration link." }));
    setBusy(null);
    if (!result.ok) return fireToast({ message: result.error, type: "error" });
    void navigator.clipboard?.writeText(result.url);
    fireToast({ message: `Registration link for ${row.personName} copied.`, type: "success" });
  }

  function downloadCsv() {
    const headers = tab === "employee"
      ? ["First Name", "Last Name", "Cell No.", "Personal Email", "Contact 1 Name", "Contact 1 Cell No.", "Contact 2 Name", "Contact 2 Cell No."]
      : ["Type", "Name", "Company Name", "Cell Number", "Email", "Contact 2 Name", "Contact 2 Cell Number", "Contact 2 Email"];
    const data = tab === "employee"
      ? employees.filter((row) => row.isActive).map((row) => [row.firstName, row.lastName, row.cell ?? "", row.email ?? "", row.contact1Name ?? "", row.contact1Cell ?? "", row.contact2Name ?? "", row.contact2Cell ?? ""])
      : contacts.filter((row) => row.isActive).map((row) => [directoryTypeLabel(safeDirectoryType(row.directoryType)), row.personName, row.companyName ?? "", row.cellNo ?? "", row.email ?? "", row.contact2Name ?? "", row.contact2CellNo ?? "", row.contact2Email ?? ""]);
    const csv = [headers, ...data].map((line) => line.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = tab === "employee" ? "employee-directory.csv" : "hr-directory.csv"; link.click(); URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const response = await fetch("/api/reports/section-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tab === "employee" ? employeeDirectoryReport(employees) : directoryReport(contacts)) });
      if (!response.ok) throw new Error("Could not create the PDF.");
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = tab === "employee" ? "employee-directory.pdf" : "hr-directory.pdf"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { fireToast({ message: error instanceof Error ? error.message : "Could not create the PDF.", type: "error" }); } finally { setBusy(null); }
  }

  async function emailPdf() {
    setBusy("email"); const result = await emailDirectoryPdf(tab === "employee" ? "employees" : "contacts").catch(() => ({ ok: false as const, error: "Could not send the directory PDF." })); setBusy(null);
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
        {(["vendor", "hr_consultant", "employee"] as const).map((type) => <button key={type} type="button" role="tab" aria-selected={tab === type} onClick={() => setTab(type)} className={`rounded-lg px-3.5 py-2 text-[13px] font-bold ${tab === type ? "bg-red-50 text-red-700" : "text-ink-muted hover:bg-surface-soft"}`}>{type === "employee" ? "Employees" : directoryTypeLabel(type)} <span className="tabular-nums">({type === "vendor" ? vendorCount : type === "hr_consultant" ? consultantCount : employeeCount})</span></button>)}
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
        {tab === "vendor" && !preview ? <button type="button" title="Create a vendor registration link" onClick={() => setInvite({ firstName: "", lastName: "", cellNo: "", companyName: "" })} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-[12.5px] font-bold text-red-700 hover:bg-red-50"><Link2 size={15} /> Registration link</button> : null}
        {tab !== "employee" ? <button type="button" title={preview ? "Preview the complete form" : "Add directory contact"} onClick={() => setDraft(blank(tab))} className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-red-800"><Plus size={16} /> Add</button> : null}
      </div>
    </div>
    {tab === "employee" ? <EmployeeDirectory employees={employees} query={needle} onPreview={(row) => setRecordPreview({ kind: "employee", row })} /> : <section className="overflow-hidden rounded-2xl border border-hairline-strong bg-white">
      <div className="directory-table-scroll isolate overflow-x-auto" style={PASS_VERTICAL_SCROLL}>
          <table className="min-w-[1020px] w-full table-fixed border-separate border-spacing-0">
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
                      onRegistrationLink={safeDirectoryType(row.directoryType) === "vendor" ? () => void createRecordLink(row) : undefined}
                      onPreview={safeDirectoryType(row.directoryType) === "hr_consultant" ? () => setRecordPreview({ kind: "contact", row }) : undefined}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        {rows.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-ink-muted">No {directoryTypeLabel(tab).toLowerCase()} match this search.</p> : null}
      </div>
    </section>}
    {draft && <DirectoryForm draft={draft} busy={busy === "save"} onChange={setDraft} onClose={() => setDraft(null)} onSubmit={save} />}
    {invite && <VendorInviteForm invite={invite} busy={busy === "invite"} onChange={setInvite} onClose={() => setInvite(null)} onSubmit={createInvite} />}
    {recordPreview && <DirectoryRecordPreview record={recordPreview} onClose={() => setRecordPreview(null)} />}
  </div>;
}

function directorySortValue(row: ContactRow, key: Exclude<DirectoryColumnKey, "serial" | "actions">): string {
  switch (key) {
    case "name": return row.personName;
    case "company": return row.companyName ?? "";
    case "cell": return row.cellNo ?? "";
    case "email": return row.email ?? "";
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
  onRegistrationLink,
  onPreview,
}: {
  column: DirectoryColumnKey;
  row: ContactRow;
  index: number;
  busy: string | null;
  preview: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRegistrationLink?: () => void;
  onPreview?: () => void;
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
    case "actions": return <td className={`${cellClassName} text-right`} style={cellStyle}><div className="flex flex-nowrap items-center justify-end gap-1">{onRegistrationLink ? <button type="button" title={preview ? "Preview this vendor's registration form" : "Copy vendor registration link"} disabled={busy === `link-${row.id}`} onClick={onRegistrationLink} className="shrink-0 rounded-lg border border-hairline p-2 text-red-700 hover:bg-red-50 disabled:opacity-50">{busy === `link-${row.id}` ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}</button> : null}{onPreview ? <button type="button" title="View full record" onClick={onPreview} className="shrink-0 rounded-lg border border-hairline p-2 text-red-700 hover:bg-red-50"><Eye size={14} /></button> : null}<button type="button" title={preview ? "Preview data cannot be changed." : "Edit contact"} disabled={preview} onClick={onEdit} className="shrink-0 rounded-lg border border-hairline p-2 hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"><Pencil size={14} /></button><button type="button" title={preview ? "Preview data cannot be changed." : "Archive contact"} disabled={preview || busy === `archive-${row.id}`} onClick={onArchive} className="shrink-0 rounded-lg border border-hairline p-2 hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"><Archive size={14} /></button></div></td>;
  }
}

function ContactActions({ name, phone, email }: { name: string; phone: string | null; email: string | null }) {
  const whatsapp = whatsappHref(phone);
  return <div className="flex min-w-[132px] items-center gap-1 whitespace-nowrap"><a href={phone ? `tel:${phone}` : undefined} className="font-semibold tabular-nums hover:underline">{phone ?? "-"}</a>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" title={`WhatsApp ${name}`} className="rounded p-1 text-emerald-700 hover:bg-emerald-50"><MessageCircle size={15} /></a>}{email && <a href={`mailto:${email}`} title={`Email ${name}`} className="rounded p-1 text-red-700 hover:bg-red-50"><Mail size={15} /></a>}</div>;
}

/** Employee data is read live from the onboarding submission, rather than copied
 * into this Directory. A correction in onboarding is therefore visible here at
 * once and cannot drift into a second, conflicting contact record. */
function EmployeeDirectory({ employees, query, onPreview }: { employees: EmployeeContactRow[]; query: string; onPreview: (row: EmployeeContactRow) => void }) {
  const rows = employees.filter((row) => row.isActive).filter((row) => !query || [row.firstName, row.lastName, row.cell, row.email, row.contact1Name, row.contact1Cell, row.contact2Name, row.contact2Cell].some((value) => value?.toLowerCase().includes(query)));
  return <section className="overflow-hidden rounded-2xl border border-hairline-strong bg-white"><div className="directory-table-scroll overflow-x-auto" style={PASS_VERTICAL_SCROLL}><table className="min-w-[1580px] w-full table-fixed border-separate border-spacing-0"><colgroup><col style={{ width: 64 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col style={{ width: 160 }} /><col style={{ width: 250 }} /><col style={{ width: 190 }} /><col style={{ width: 170 }} /><col style={{ width: 190 }} /><col style={{ width: 170 }} /><col style={{ width: 82 }} /></colgroup><thead className="bg-surface-soft"><tr><th className={TH}>Sr. No.</th><th className={TH}>First Name</th><th className={TH}>Last Name</th><th className={TH}>Cell No.</th><th className={TH}>Personal Email</th><th className={TH}>Contact 1 Name</th><th className={TH}>Contact 1 Cell No.</th><th className={TH}>Contact 2 Name</th><th className={TH}>Contact 2 Cell No.</th><th className={`${TH} text-right`}>Actions</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t border-hairline"><td className={`${TD} text-ink-muted`}>{index + 1}</td><td className={`${TD} truncate font-bold`} title={row.firstName || "-"}>{row.firstName || "-"}</td><td className={`${TD} truncate font-bold`} title={row.lastName || "-"}>{row.lastName || "-"}</td><td className={TD}><ContactActions name={row.name} phone={row.cell} email={null} /></td><td className={`${TD} truncate`} title={row.email ?? "-"}>{row.email ? <a className="hover:underline" href={`mailto:${row.email}`}>{row.email}</a> : "-"}</td><td className={`${TD} truncate`} title={row.contact1Name ?? "-"}>{row.contact1Name ?? "-"}</td><td className={TD}><ContactActions name={row.contact1Name ?? "Contact 1"} phone={row.contact1Cell} email={null} /></td><td className={`${TD} truncate`} title={row.contact2Name ?? "-"}>{row.contact2Name ?? "-"}</td><td className={TD}><ContactActions name={row.contact2Name ?? "Contact 2"} phone={row.contact2Cell} email={null} /></td><td className={`${TD} text-right`}><button type="button" title="View full employee record" onClick={() => onPreview(row)} className="rounded-lg border border-hairline p-2 text-red-700 hover:bg-red-50"><Eye size={14} /></button></td></tr>)}</tbody></table>{rows.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-ink-muted">No employee records are available from onboarding.</p> : null}</div><p className="border-t border-hairline bg-surface-soft px-4 py-2.5 text-[12px] text-ink-muted">Employee details are pulled directly from the onboarding form. Personal email falls back to the employee profile when it was not collected on onboarding.</p></section>;
}

function DetailSection({ title, items }: { title: string; items: Array<[string, string | null | undefined]> }) {
  return <section className="rounded-xl border border-hairline bg-white p-3"><h3 className="mb-2 text-[13px] font-extrabold text-ink-strong">{title}</h3><dl className="grid grid-cols-2 gap-x-5 gap-y-2 max-sm:grid-cols-1">{items.map(([label, value]) => <div key={label}><dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">{label}</dt><dd className="mt-0.5 break-words text-[13px] font-semibold text-ink-strong">{value || "-"}</dd></div>)}</dl></section>;
}

function DirectoryRecordPreview({ record, onClose }: { record: { kind: "contact"; row: ContactRow } | { kind: "employee"; row: EmployeeContactRow }; onClose: () => void }) {
  if (record.kind === "employee") return <Modal title={`${record.row.name} — Employee details`} onClose={onClose} wide><div className="space-y-3"><DetailSection title="Employee" items={[["First Name", record.row.firstName], ["Last Name", record.row.lastName], ["Cell No.", record.row.cell], ["Personal Email", record.row.email], ["Company", "Altus Corp"], ["Designation", record.row.designation]]} /><DetailSection title="Contact 1" items={[["Name", record.row.contact1Name], ["Cell No.", record.row.contact1Cell]]} /><DetailSection title="Contact 2" items={[["Name", record.row.contact2Name], ["Cell No.", record.row.contact2Cell]]} /></div></Modal>;
  const row = record.row; const bank = row.bankDetails ?? {}; const files = Object.values(row.attachments ?? {}).map((file) => typeof file === "object" && file !== null && "fileName" in file ? String((file as { fileName?: unknown }).fileName ?? "") : "").filter(Boolean).join(", ");
  return <Modal title={`${row.personName} — ${directoryTypeLabel(safeDirectoryType(row.directoryType)).slice(0, -1)} details`} onClose={onClose} wide><div className="space-y-3"><DetailSection title="Primary details" items={[["First Name", row.firstName], ["Last Name", row.lastName], ["Company Name", row.companyName], ["Cell No.", row.cellNo], ["Email", row.email], ["Category", row.category], ["Utility", row.utility], ["AMC / On-call", row.amcOnCall]]} /><DetailSection title="Address and GST" items={[["Address line 1", row.addressLine1], ["Address line 2", row.addressLine2], ["Address line 3", row.addressLine3], ["Address line 4", row.addressLine4], ["PIN Code", row.pincode], ["GST No.", row.gstNo], ["PAN No.", row.panNo], ["GST Name", row.gstName]]} /><DetailSection title="Bank details" items={[["Account Name", bank.accountName], ["Account No.", bank.accountNo], ["Account Type", bank.accountType], ["MICR Code", bank.micrCode], ["Branch Address", bank.branchAddress], ["PIN Code", bank.pincode]]} /><DetailSection title="Alternate Person 1" items={[["Name", row.contact1Name], ["Cell No.", row.contact1CellNo], ["Email", row.contact1Email]]} /><DetailSection title="Alternate Person 2" items={[["Name", row.contact2Name], ["Cell No.", row.contact2CellNo], ["Email", row.contact2Email]]} />{safeDirectoryType(row.directoryType) === "hr_consultant" ? <DetailSection title="Internal details" items={[["Rate Negotiated", row.rateNegotiated], ["Payment Terms", row.paymentTerms]]} /> : null}<DetailSection title="Attachments" items={[["Files", files || "No attachments uploaded"]]} /></div></Modal>;
}

function DirectoryForm({ draft, busy, onChange, onClose, onSubmit }: { draft: Draft; busy: boolean; onChange: (draft: Draft) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const setPhone = (key: "cellNo" | "contact1CellNo" | "contact2CellNo", value: string) => set(key, value.replace(/\D/g, "").slice(0, 10));
  const phoneInput = { inputMode: "numeric" as const, pattern: "[0-9]{10}", minLength: 10, maxLength: 10, title: "Enter exactly 10 digits." };
  const input = <K extends keyof Draft>(key: K, label: string, opts: { required?: boolean; type?: string; full?: boolean; upper?: boolean } = {}) => <Field label={label} required={opts.required} className={opts.full ? "col-span-2 max-sm:col-span-1" : undefined}><input value={draft[key] as string} onChange={(event) => set(key, (opts.upper ? event.target.value.toUpperCase() : event.target.value) as Draft[K])} className={INPUT} type={opts.type ?? "text"} required={opts.required} autoFocus={key === "firstName"} /></Field>;

  return <Modal title={draft.id ? `Edit ${directoryTypeLabel(draft.directoryType).slice(0, -1)}` : `Add ${directoryTypeLabel(draft.directoryType).slice(0, -1)}`} onClose={onClose} wide><form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
    <p className="col-span-2 text-[12px] font-semibold text-ink-muted">* First Name, Last Name, Cell No., Category and AMC / On-call are required.</p>
    {input("firstName", "First Name", { required: true })}{input("lastName", "Last Name", { required: true })}
    <Field label="Cell No." required><input value={draft.cellNo} onChange={(event) => setPhone("cellNo", event.target.value)} className={INPUT} type="tel" required {...phoneInput} /></Field>
    {input("category", "Category", { required: true })}{input("utility", "Utility")}
    {input("amcOnCall", "AMC / On-call", { required: true })}{input("companyName", "Company Name")}{input("email", "Email", { type: "email" })}
    <p className="col-span-2 mt-2 border-t border-hairline pt-3 text-[13px] font-extrabold text-ink-strong">Address</p>
    {input("addressLine1", "Address line 1", { full: true })}{input("addressLine2", "Address line 2", { full: true })}{input("addressLine3", "Address line 3", { full: true })}{input("addressLine4", "Address line 4", { full: true })}{input("pincode", "PIN code")}
    <p className="col-span-2 mt-2 border-t border-hairline pt-3 text-[13px] font-extrabold text-ink-strong">GST and bank details</p>
    {input("gstNo", "GST No.", { upper: true })}{input("panNo", "PAN No.", { upper: true })}{input("gstName", "GST Name")}
    {input("accountName", "Account Name")}{input("accountNo", "Account No.")}{input("accountType", "Account Type")}{input("micrCode", "MICR Code")}{input("branchAddress", "Branch Address", { full: true })}{input("bankPincode", "Bank PIN Code")}
    <p className="col-span-2 mt-2 border-t border-hairline pt-3 text-[13px] font-extrabold text-ink-strong">Alternate contacts</p>
    {input("contact1Name", "Alternate Person 1 Name")}<Field label="Alternate Person 1 Cell No."><input value={draft.contact1CellNo} onChange={(event) => setPhone("contact1CellNo", event.target.value)} className={INPUT} type="tel" {...phoneInput} /></Field>{input("contact1Email", "Alternate Person 1 Email", { type: "email" })}
    {input("contact2Name", "Alternate Person 2 Name")}<Field label="Alternate Person 2 Cell No."><input value={draft.contact2CellNo} onChange={(event) => setPhone("contact2CellNo", event.target.value)} className={INPUT} type="tel" {...phoneInput} /></Field>{input("contact2Email", "Alternate Person 2 Email", { type: "email" })}
    {draft.directoryType === "hr_consultant" ? <><p className="col-span-2 mt-2 border-t border-hairline pt-3 text-[13px] font-extrabold text-ink-strong">Internal details</p>{input("rateNegotiated", "Rate Negotiated")}{input("paymentTerms", "Payment Terms")}</> : null}
    <Field label="Internal notes" className="col-span-2 max-sm:col-span-1"><input value={draft.notes} onChange={(event) => set("notes", event.target.value)} className={INPUT} /></Field>
    {draft.directoryType === "vendor" ? <p className="col-span-2 rounded-lg bg-surface-soft px-3 py-2 text-[12px] text-ink-muted">To collect GST Certificate, PAN Card, Cancelled Cheque Copy and UPI Scanner directly from the vendor, use <strong>Registration link</strong>.</p> : null}
    <div className="col-span-2 flex justify-end gap-2 max-sm:col-span-1"><button type="button" onClick={onClose} className="rounded-lg border border-hairline-strong px-4 py-2 text-[13px] font-bold">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{draft.id ? "Save changes" : "Add contact"}</button></div>
  </form></Modal>;
}

function VendorInviteForm({ invite, busy, onChange, onClose, onSubmit }: { invite: { firstName: string; lastName: string; cellNo: string; companyName: string; url?: string }; busy: boolean; onChange: (value: { firstName: string; lastName: string; cellNo: string; companyName: string; url?: string }) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const set = (key: "firstName" | "lastName" | "cellNo" | "companyName", value: string) => onChange({ ...invite, [key]: key === "cellNo" ? value.replace(/\D/g, "").slice(0, 10) : value });
  return <Modal title="Create vendor registration link" onClose={onClose}><form onSubmit={onSubmit} className="space-y-3"><p className="text-[13px] text-ink-muted">Enter the vendor&apos;s name and cell number. The link opens the complete registration form and saves the completed details to Directory.</p><Field label="First Name" required><input autoFocus value={invite.firstName} onChange={(event) => set("firstName", event.target.value)} className={INPUT} required /></Field><Field label="Last Name" required><input value={invite.lastName} onChange={(event) => set("lastName", event.target.value)} className={INPUT} required /></Field><Field label="Cell No." required><input value={invite.cellNo} onChange={(event) => set("cellNo", event.target.value)} className={INPUT} type="tel" inputMode="numeric" pattern="[0-9]{10}" required /></Field><Field label="Company Name"><input value={invite.companyName} onChange={(event) => set("companyName", event.target.value)} className={INPUT} /></Field>{invite.url ? <div className="rounded-lg bg-emerald-50 p-3 text-[12px] font-semibold text-emerald-800"><p className="mb-2">Link copied. You can also copy it again or send it through WhatsApp.</p><input readOnly value={invite.url} className={`${INPUT} bg-white text-[11px]`} /><div className="mt-2 flex gap-2"><button type="button" onClick={() => void navigator.clipboard?.writeText(invite.url!)} className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1.5"><Copy size={13} /> Copy</button><a href={`https://wa.me/91${invite.cellNo}?text=${encodeURIComponent(`Please complete your Altus vendor registration: ${invite.url}`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1.5 text-white"><MessageCircle size={13} /> WhatsApp</a></div></div> : null}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-hairline-strong px-4 py-2 text-[13px] font-bold">Close</button>{!invite.url ? <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-[13px] font-bold text-white">{busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}Create link</button> : null}</div></form></Modal>;
}
