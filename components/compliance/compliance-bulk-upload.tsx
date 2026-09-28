"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { AlertTriangle, Check, CheckCircle2, Download, FileSpreadsheet, Loader2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  bulkColumns,
  bulkPayload,
  frequencyLabels,
  personLabels,
  readComplianceMatrix,
  type BulkField,
  type BulkPerson,
  type BulkRow,
} from "@/lib/compliance/bulk";
import type { ComplianceKind } from "@/lib/compliance/schedule";
import { minutesText } from "@/lib/compliance/minutes";
import { bulkAddCompliances, type BulkProblem } from "@/app/(app)/dcc/compliance-actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * BULK UPLOAD — many WCC or MCC compliances from one Excel sheet (account
 * holder, 2026-09-19).
 *
 * 1. Download the template (lib/compliance/bulk-template.ts) — its Employee
 *    list is the people this viewer may add for, its dropdowns the frequencies.
 * 2. Upload the filled sheet, or paste the rows with their header.
 * 3. Every row is shown with what it will become, and its problems — first as
 *    the sheet reads (lib/compliance/bulk.ts), then as the server sees them
 *    (already on the checklist, not someone you can add for). Nothing is added
 *    until every row is right, and then all of them go in one transaction.
 */

const SKIP_SHEETS = new Set(["lists", "examples", "how to use"]);

type ManualDraft = { id: number; values: Record<BulkField, string> };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function WeekdayPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const selected = new Set(value.split(/[,\s]+/).filter((day) => WEEKDAYS.includes(day)));
  const toggle = (day: string) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange(WEEKDAYS.filter((candidate) => next.has(candidate)).join(", "));
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Select days of week"
          className="w-full truncate bg-transparent px-2 py-1.5 text-left text-[12.5px] text-ink-strong outline-none hover:bg-altus-red/5 disabled:cursor-not-allowed disabled:text-ink-subtle"
        >
          {disabled ? "Not needed" : value || "Select days"}
        </button>
      </PopoverTrigger>
      {!disabled && (
        <PopoverContent className="w-[252px] p-2" align="start">
          <p className="px-1 pb-2 text-[12px] font-bold text-ink-soft">Select the days this compliance repeats</p>
          <div className="grid grid-cols-4 gap-1.5">
            {WEEKDAYS.map((day) => {
              const active = selected.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(day)}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border text-[12px] font-bold"
                  style={active ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)", color: "#fff" } : { borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }}
                >
                  {active && <Check size={11} strokeWidth={3} />} {day}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

export function ComplianceBulkUpload({
  open,
  onOpenChange,
  kind,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ComplianceKind;
  people: readonly BulkPerson[];
}) {
  const router = useRouter();
  const columns = React.useMemo(() => bulkColumns(kind), [kind]);
  const labels = React.useMemo(() => personLabels(people), [people]);
  const rowSequence = React.useRef(1);
  const blankDraft = React.useCallback((): ManualDraft => {
    const values = Object.fromEntries(
      (["employee", "section", "compliance", "frequency", "days", "day1", "day2", "day3", "dueMonth", "mins", "target", "unit"] as BulkField[]).map((field) => [field, ""]),
    ) as Record<BulkField, string>;
    values.frequency = kind === "wcc" ? "Mon to Sat" : "Monthly";
    return { id: rowSequence.current++, values };
  }, [kind]);
  const KIND = kind.toUpperCase();
  const [rows, setRows] = React.useState<BulkRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [paste, setPaste] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [onlyProblems, setOnlyProblems] = React.useState(false);
  const [draggingFile, setDraggingFile] = React.useState(false);
  const [drafts, setDrafts] = React.useState<ManualDraft[]>(() => Array.from({ length: 6 }, blankDraft));

  React.useEffect(() => {
    rowSequence.current = 1;
    setDrafts(Array.from({ length: 6 }, blankDraft));
  }, [blankDraft]);

  function reset() {
    setRows(null);
    setError(null);
    setSource(null);
    setPaste("");
    setOnlyProblems(false);
    rowSequence.current = 1;
    setDrafts(Array.from({ length: 6 }, blankDraft));
  }

  /** Leave the review without throwing away what was typed in the grid. */
  function backToEntry() {
    setRows(null);
    setError(null);
    setSource(null);
    setPaste("");
    setOnlyProblems(false);
  }

  function changeDraft(id: number, field: BulkField, value: string) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, values: { ...draft.values, [field]: value } } : draft)));
  }

  function removeDraft(id: number) {
    setDrafts((current) => (current.length > 1 ? current.filter((draft) => draft.id !== id) : current));
  }

  function proceedManual() {
    const started = drafts.filter((draft) => columns.some((column) => draft.values[column.field].trim()));
    if (started.length === 0) {
      setError("Fill at least one compliance row before reviewing it.");
      return;
    }
    void read(
      [columns.map((column) => column.header), ...started.map((draft) => columns.map((column) => draft.values[column.field]))],
      "filled rows",
      0,
    );
  }

  /** Put the server's problems on their rows. */
  function withProblems(list: BulkRow[], problems: readonly BulkProblem[]): BulkRow[] {
    const byLine = new Map<number, string[]>();
    for (const p of problems) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p.error]);
    return list.map((r) => {
      const extra = (byLine.get(r.line) ?? []).filter((e) => !r.errors.includes(e));
      return extra.length ? { ...r, errors: [...r.errors, ...extra] } : r;
    });
  }

  async function read(matrix: unknown[][], from: string, firstLine: number) {
    const res = readComplianceMatrix(matrix, { kind, people, firstLine });
    setSource(from);
    setError(res.error ?? (res.rows.length === 0 ? "No compliance rows found under the header." : null));
    setRows(res.rows);
    const clean = res.rows.filter((r) => r.errors.length === 0);
    if (clean.length === 0) return;
    // What only the server can tell: already on the checklist, who you may add for.
    setChecking(true);
    try {
      const check = await bulkAddCompliances({ kind, rows: clean.map(bulkPayload), dryRun: true });
      if (check.ok && check.dryRun) setRows(withProblems(res.rows, check.problems));
      else if (!check.ok) setError(check.error);
    } finally {
      setChecking(false);
    }
  }

  async function onFile(file: File) {
    try {
      // A CSV is read as text, so 05/09 stays the 5th of September.
      const csv = /\.csv$/i.test(file.name);
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: csv });
      const name =
        wb.SheetNames.find((n) => n.trim().toUpperCase() === KIND) ??
        wb.SheetNames.find((n) => !SKIP_SHEETS.has(n.trim().toLowerCase())) ??
        wb.SheetNames[0]!;
      const sheet = wb.Sheets[name]!;
      const firstLine = XLSX.utils.decode_range(sheet["!ref"] ?? "A1").s.r + 1;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true });
      await read(matrix, `${file.name}${name ? ` · sheet ${name}` : ""}`, firstLine);
    } catch {
      setError(`Couldn't read that file. Upload the .xlsx made from the ${KIND} template, or a .csv of it.`);
    }
  }

  function readPaste() {
    const lines = paste.replace(/\r\n?/g, "\n").split("\n");
    const tabbed = lines.some((l) => l.includes("\t"));
    void read(
      lines.map((l) => (tabbed ? l.split("\t") : l.split(","))),
      "pasted rows",
      1,
    );
  }

  function manualCell(draft: ManualDraft, field: BulkField) {
    const value = draft.values[field];
    const set = (next: string) => changeDraft(draft.id, field, next);
    const className = "w-full min-w-0 bg-transparent px-2 py-1.5 text-[12.5px] text-ink-strong outline-none focus:bg-altus-red/5";
    if (field === "employee") {
      return (
        <select value={value} onChange={(e) => set(e.target.value)} aria-label="Employee" className={`${className} cursor-pointer`}>
          <option value="">Pick employee</option>
          {people.map((person) => (
            <option key={person.id} value={labels.get(person.id) ?? person.name}>
              {labels.get(person.id) ?? person.name}
            </option>
          ))}
        </select>
      );
    }
    if (field === "frequency") {
      return (
        <select value={value} onChange={(e) => set(e.target.value)} aria-label="Frequency" className={`${className} cursor-pointer`}>
          {frequencyLabels(kind).map((frequency) => (
            <option key={frequency} value={frequency}>
              {frequency}
            </option>
          ))}
        </select>
      );
    }
    if (field === "days") {
      return <WeekdayPicker value={value} onChange={set} disabled={draft.values.frequency !== "Each Day of the Week"} />;
    }
    if (field === "day1" || field === "day2" || field === "day3") {
      return (
        <select value={value} onChange={(e) => set(e.target.value)} aria-label="Deadline day" className={`${className} cursor-pointer`}>
          <option value="">Select day</option>
          {Array.from({ length: 30 }, (_, index) => String(index + 1)).map((day) => (
            <option key={day} value={day}>Day {day}</option>
          ))}
          <option value="Last day">Last day</option>
        </select>
      );
    }
    if (field === "dueMonth") {
      return (
        <select value={value} onChange={(e) => set(e.target.value)} aria-label="Due month" className={`${className} cursor-pointer`}>
          <option value="">Select month</option>
          {[
            "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
          ].map((month) => (
            <option key={month} value={month}>{month}</option>
          ))}
        </select>
      );
    }
    const placeholder = field === "compliance" ? "What must be done?" : field === "section" ? "e.g. Reporting" : field === "mins" ? "e.g. 15" : field === "target" ? "e.g. 25" : "e.g. emails";
    return (
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        aria-label={field}
        inputMode={field === "mins" || field === "target" ? "numeric" : undefined}
        className={className}
      />
    );
  }

  const shown = rows ?? [];
  const clean = shown.filter((r) => r.errors.length === 0);
  const problemCount = shown.length - clean.length;
  const visible = onlyProblems ? shown.filter((r) => r.errors.length > 0) : shown;

  async function upload() {
    setBusy(true);
    try {
      const res = await bulkAddCompliances({ kind, rows: clean.map(bulkPayload) });
      if (res.ok && !res.dryRun) {
        fireToast({ message: `${res.created} compliance${res.created === 1 ? "" : "s"} added to ${KIND}.`, type: "success" });
        reset();
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        if (res.problems?.length) {
          setRows((cur) => (cur ? withProblems(cur, res.problems!) : cur));
          setOnlyProblems(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60]" style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] flex w-[min(1180px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-section bg-surface-card shadow-xl"
          style={{ maxHeight: "calc(100vh - 32px)" }}
        >
          <div
            className="relative flex items-start gap-3 px-8 py-5 max-md:px-5"
            style={{ borderBottom: "1px solid var(--color-hairline)", background: "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)" }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }} />
            <FileSpreadsheet className="mt-1 h-6 w-6 shrink-0" style={{ color: "#B91C1C" }} />
            <div className="min-w-0 flex-1 pr-12">
              <Dialog.Title
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(22px, 2.2vw, 28px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
              >
                Bulk upload {KIND} compliances
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[14px] font-semibold text-ink-muted">
                One compliance per row, in the template&apos;s columns — checked row by row before anything is added.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="absolute right-5 top-4 inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-all hover:bg-surface-soft"
              >
                <X size={20} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 overflow-y-auto px-8 py-5 max-md:px-5">
            {!rows ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Sparkles size={15} className="text-altus-red" strokeWidth={2.4} />
                  <span className="text-[13px] font-bold text-ink-strong">Fill your {KIND} compliances below</span>
                  <span className="text-[12px] font-semibold text-ink-subtle">— add rows yourself, then review them before creating</span>
                  <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1 text-[12px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red">
                    <FileSpreadsheet size={13} strokeWidth={2.4} /> Import CSV / Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      aria-label={`Import ${KIND} CSV or Excel`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void onFile(file);
                      }}
                    />
                  </label>
                </div>
                <div className="table-scroll max-h-[48vh] overflow-auto rounded-xl border border-hairline-strong">
                  <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-surface-soft text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">
                        <th className="w-10 border-b px-1 py-2 text-center" style={{ borderColor: "var(--color-hairline)" }}>#</th>
                        {columns.map((column) => (
                          <th key={column.field} className="border-b border-l px-2 py-2" style={{ borderColor: "var(--color-hairline)", minWidth: Math.max(110, column.width * 8) }}>
                            {column.header}{column.required === "yes" ? " *" : ""}
                          </th>
                        ))}
                        <th className="w-8 border-b border-l" style={{ borderColor: "var(--color-hairline)" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {drafts.map((draft, index) => (
                        <tr key={draft.id} className="group">
                          <td className="border-b px-1 text-center font-bold tabular-nums text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>{index + 1}</td>
                          {columns.map((column) => (
                            <td key={column.field} className="border-b border-l" style={{ borderColor: "var(--color-hairline)", minWidth: Math.max(110, column.width * 8) }}>
                              {manualCell(draft, column.field)}
                            </td>
                          ))}
                          <td className="border-b border-l px-1 text-center" style={{ borderColor: "var(--color-hairline)" }}>
                            <button type="button" onClick={() => removeDraft(draft.id)} aria-label={`Remove row ${index + 1}`} className="grid size-6 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:bg-altus-red hover:text-white group-hover:opacity-100">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {error && <p className="mt-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setDrafts((current) => [...current, blankDraft()])} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red">
                    <Plus size={14} strokeWidth={2.6} /> Add Row
                  </button>
                  <button type="button" onClick={proceedManual} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                    Proceed to Review
                  </button>
                </div>
                <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                  <span className="h-px flex-1 bg-hairline" /> or import a prepared file <span className="h-px flex-1 bg-hairline" />
                </div>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <p className="max-w-[620px] text-[13.5px] font-medium text-ink-muted">
                      Upload a CSV or Excel file — each row becomes one {KIND} compliance. Employee names or email addresses are matched to the people you can manage.
                    </p>
                    <a href={`/dcc/${kind}/template.xlsx`} download className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[12.5px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red">
                      <Download size={15} /> Download Template
                    </a>
                  </div>
                  <label
                    className="relative mt-4 grid min-h-[190px] cursor-pointer place-items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors"
                    style={{ borderColor: draggingFile ? "var(--color-altus-red)" : "var(--color-hairline-strong)", background: draggingFile ? "color-mix(in srgb, var(--color-altus-red) 5%, var(--color-surface-card))" : "var(--color-surface-soft)" }}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes("Files")) return;
                      event.preventDefault();
                      setDraggingFile(true);
                    }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                      setDraggingFile(false);
                    }}
                    onDrop={(event) => {
                      if (!event.dataTransfer.types.includes("Files")) return;
                      event.preventDefault();
                      setDraggingFile(false);
                      const file = event.dataTransfer.files?.[0];
                      if (file) void onFile(file);
                    }}
                  >
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="sr-only"
                      aria-label={`Browse for a ${KIND} CSV or Excel file`}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void onFile(file);
                      }}
                    />
                    <div>
                      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl border border-hairline bg-white text-ink-muted"><Upload size={22} /></span>
                      <p className="text-[14px] font-bold text-ink-strong">Drop your file here, or <span className="text-altus-red">browse</span></p>
                      <p className="mt-1 text-[12px] font-semibold text-ink-subtle">CSV or Excel (.xlsx) · up to 500 rows</p>
                    </div>
                  </label>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Expected columns</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {columns.map((column) => (
                      <span key={column.field} className="rounded-lg border border-hairline bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft">
                        {column.header} {column.required === "yes" ? <b className="text-altus-red">*</b> : <small className="ml-0.5 text-ink-subtle">optional</small>}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11.5px] font-medium text-ink-subtle">
                    <span className="font-bold text-altus-red">*</span> required · Frequency must be one of the listed choices · the review checks every row before creating.
                  </p>
                </div>
              <div className="hidden">
                <div className="rounded-xl border border-hairline p-4">
                  <p className="text-[14px] font-bold text-ink-strong">1. Get the {KIND} template</p>
                  <p className="mt-1 text-[12.5px] text-ink-muted">
                    Columns: {columns.map((c) => `${c.header}${c.required === "yes" ? " *" : ""}`).join(" · ")}.
                  </p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-muted">
                    <li>Frequency: {frequencyLabels(kind).join(", ")}.</li>
                    {kind === "wcc" ? (
                      <>
                        <li>Days for Each Day of the Week (Mon, Wed, Fri) — not used for Mon to Sat or Mon to Sun.</li>
                        <li>Mins: how many minutes each one takes — added up per day on the checklist.</li>
                      </>
                    ) : (
                      <>
                        <li>Deadline Day: 1–30 or Last day — two of them for 2 times/month, three for 3 times/month.</li>
                        <li>Due Month for Alternate Month, Quarterly, Half Yearly and Annually.</li>
                      </>
                    )}
                    <li>Dropdowns, a hint on every cell, red for what a row still needs — and an Examples sheet.</li>
                  </ul>
                  <a
                    href={`/dcc/${kind}/template.xlsx`}
                    download
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-soft hover:bg-surface-soft"
                  >
                    <Download className="h-4 w-4" /> Download the {KIND} template
                  </a>
                </div>
                <div className="rounded-xl border border-hairline p-4">
                  <p className="text-[14px] font-bold text-ink-strong">2. Upload the filled sheet</p>
                  <label
                    className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                  >
                    <Upload className="h-4 w-4" /> Choose .xlsx / .csv
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      aria-label={`Upload the filled ${KIND} sheet`}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void onFile(f);
                      }}
                    />
                  </label>
                  <p className="mt-3 text-[12.5px] text-ink-muted">…or paste rows copied from Excel, with the header row:</p>
                  <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={4}
                    aria-label="Rows pasted from Excel"
                    className="mt-1 w-full rounded-lg border border-hairline-strong px-3 py-2 font-mono text-[12px]"
                    placeholder={columns.map((c) => c.header).join("\t")}
                  />
                  <button
                    type="button"
                    onClick={readPaste}
                    disabled={!paste.trim()}
                    className="mt-2 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-soft disabled:opacity-50"
                  >
                    Read pasted rows
                  </button>
                </div>
                {error && <p className="text-[13px] font-semibold text-red-700 md:col-span-2">{error}</p>}
              </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-ink-soft">{source}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{clean.length} ready</span>
                  {problemCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setOnlyProblems((v) => !v)}
                      aria-pressed={onlyProblems}
                      className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700 hover:bg-red-100"
                    >
                      {problemCount} with problems{onlyProblems ? " — showing only these" : " — show only these"}
                    </button>
                  )}
                  {checking && (
                    <span className="inline-flex items-center gap-1 text-ink-subtle">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking against the checklist…
                    </span>
                  )}
                  <button type="button" onClick={backToEntry} className="ml-auto rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft hover:bg-surface-soft">
                    Back to entry
                  </button>
                </div>
                {error && <p className="text-[13px] font-semibold text-red-700">{error}</p>}
                {problemCount > 0 && (
                  <p className="text-[12.5px] text-ink-muted">
                    Fix the rows with problems in your sheet (by row number) and upload it again — or delete them from the sheet. Nothing is added until every row is right.
                  </p>
                )}

                <div className="table-scroll max-h-[52vh] overflow-auto rounded-xl border border-hairline">
                  <table className="w-full min-w-[1000px] text-[12.5px]">
                    <thead className="sticky top-0 z-10 bg-surface-soft">
                      <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-subtle">
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Compliance</th>
                        <th className="px-3 py-2">Frequency</th>
                        <th className="px-3 py-2">When</th>
                        {kind === "wcc" && <th className="px-3 py-2">Mins</th>}
                        <th className="px-3 py-2">Counts</th>
                        <th className="px-3 py-2">Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.line} className={`border-t border-hairline align-top ${r.errors.length ? "bg-red-50/50" : ""}`}>
                          <td className="px-3 py-2 tabular-nums text-ink-subtle">{r.line}</td>
                          <td className="px-3 py-2 text-ink-soft">{r.ownerName ?? "—"}</td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-ink-strong">{r.title || <span className="text-ink-subtle">—</span>}</div>
                            {r.section && <span className="mt-0.5 inline-block rounded-full bg-surface-soft px-2 py-0.5 text-[10.5px] font-bold text-ink-soft">{r.section}</span>}
                          </td>
                          <td className="px-3 py-2 font-semibold text-ink-soft">{r.frequency || "—"}</td>
                          <td className="px-3 py-2 text-ink-soft">{r.when || "—"}</td>
                          {kind === "wcc" && (
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums text-ink-soft">{r.minutes !== null ? minutesText(r.minutes) : "—"}</td>
                          )}
                          <td className="px-3 py-2 text-ink-soft">{r.counts ?? "—"}</td>
                          <td className="px-3 py-2">
                            {r.errors.length === 0 && r.warnings.length === 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                              </span>
                            )}
                            {r.errors.map((e) => (
                              <span key={e} className="block font-semibold text-red-700">
                                {e}
                              </span>
                            ))}
                            {r.warnings.map((w) => (
                              <span key={w} className="flex items-start gap-1 text-amber-700">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-8 py-4 max-md:px-5">
            <Dialog.Close asChild>
              <button type="button" className="h-10 rounded-lg border border-hairline-strong bg-white px-5 text-[14px] font-bold text-ink-muted hover:bg-surface-soft">
                Cancel
              </button>
            </Dialog.Close>
            {rows && (
              <button
                type="button"
                onClick={() => void upload()}
                disabled={busy || checking || clean.length === 0 || problemCount > 0}
                title={problemCount > 0 ? "Fix the rows with problems first — nothing is added until every row is right." : undefined}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Add {clean.length} compliance{clean.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
