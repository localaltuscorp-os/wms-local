"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  checklistBulkColumns,
  checklistBulkPayload,
  checklistTemplateMatrix,
  readChecklistMatrix,
  type ChecklistBulkRow,
  type ChecklistBulkTarget,
} from "@/lib/operations/checklist-bulk";
import { bulkCreateChecklistRows } from "@/app/(app)/operations/checklist/actions";

/**
 * BULK UPLOAD — many checklist tasks from one Excel sheet (account holder,
 * 2026-09-18), on a checklist or a master (lib/operations/checklist-bulk.ts).
 *
 * Download the template, fill one task per row, upload the .xlsx (or paste the
 * rows). Every row is shown with its problems before anything is saved, and
 * only the clean ones go — in one transaction, so a sheet lands whole.
 */

const ACCENT = "#B91C1C";

export function ChecklistBulkUpload({
  open,
  onOpenChange,
  target,
  ownerId,
  containerName,
  isEvent,
  eventDate = null,
  defaultOffset = null,
  groupLabel = null,
  people,
  subjects,
  clients = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ChecklistBulkTarget;
  /** The checklist's (run) or master's (template) id. */
  ownerId: string;
  containerName: string;
  isEvent: boolean;
  eventDate?: string | null;
  /** The Day a row without one gets — the group the upload was opened from. */
  defaultOffset?: number | null;
  groupLabel?: string | null;
  people: ReadonlyArray<{ id: string; name: string }>;
  subjects: string[];
  clients?: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<ChecklistBulkRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [paste, setPaste] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const columns = checklistBulkColumns(target, isEvent);
  const isRun = target === "run";

  function reset() {
    setRows(null);
    setError(null);
    setSource(null);
    setPaste("");
  }

  function read(matrix: unknown[][], from: string) {
    const res = readChecklistMatrix(matrix, {
      target,
      isEvent,
      eventDate,
      defaultOffset,
      today: new Date().toISOString().slice(0, 10),
      people,
      subjects,
      clients,
    });
    setRows(res.rows);
    setError(res.error ?? (res.rows.length === 0 ? "No task rows found." : null));
    setSource(from);
  }

  async function onFile(file: File) {
    try {
      /* A CSV is read as TEXT: left to itself the parser turns 05/09/2026
         into the 9th of May. A real .xlsx date cell arrives as its serial
         number, which lib/operations/checklist-bulk.ts reads exactly. */
      const csv = /\.csv$/i.test(file.name);
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: csv });
      const sheet = wb.Sheets[wb.SheetNames[0]!]!;
      read(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" }), file.name);
    } catch {
      setError("Couldn't read that file. Upload an .xlsx or .csv made from the template.");
    }
  }

  function readPaste() {
    const lines = paste.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
    const tabbed = lines.some((l) => l.includes("\t"));
    read(lines.map((l) => (tabbed ? l.split("\t") : l.split(","))), "pasted rows");
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(checklistTemplateMatrix(target, isEvent));
    sheet["!cols"] = columns.map((c) => ({ wch: c.field === "task" ? 46 : c.field === "instructions" ? 32 : 18 }));
    XLSX.utils.book_append_sheet(wb, sheet, "Tasks");
    const lists: string[][] = [
      ["People (Doer / Initiator / Backup)"],
      ...people.map((p) => [p.name]),
      [],
      ["Subjects"],
      ...subjects.map((s) => [s]),
      ...(isRun ? [[], ["Clients"], ...clients.map((c) => [c])] : []),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lists), "Lists");
    const slug = containerName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "checklist";
    XLSX.writeFile(wb, `${slug}-tasks-template.xlsx`);
  }

  const shown = rows ?? [];
  const clean = shown.filter((r) => r.errors.length === 0);

  async function upload() {
    setBusy(true);
    try {
      const res = await bulkCreateChecklistRows({
        ...(isRun ? { runId: ownerId } : { templateId: ownerId }),
        rows: clean.map((r) => checklistBulkPayload(r, target)),
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${res.created} task${res.created === 1 ? "" : "s"} added to ${containerName}.`, type: "success" });
      reset();
      onOpenChange(false);
      router.refresh();
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
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] flex w-[min(1180px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-section bg-surface-card shadow-xl"
          style={{ maxHeight: "calc(100vh - 32px)" }}
        >
          <div
            className="relative flex items-start gap-3 px-8 py-5 max-md:px-5"
            style={{ borderBottom: "1px solid var(--color-hairline)", background: "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)" }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }} />
            <FileSpreadsheet className="mt-1 h-6 w-6 shrink-0" style={{ color: ACCENT }} />
            <div className="min-w-0 flex-1 pr-12">
              <Dialog.Title
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(22px, 2.2vw, 28px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
              >
                Bulk upload tasks
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[14px] font-semibold text-ink-muted">
                Into “{containerName}”{groupLabel ? ` · ${groupLabel}` : ""} — one task per row, in the template&apos;s columns.
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[14px] font-bold text-slate-800">1. Get the template</p>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    Columns: {columns.map((c) => c.header).join(" · ")}. A second sheet lists the people and subjects to use.
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-[12.5px] text-slate-500">
                    {isRun && !isEvent && <li>Target Date as DD/MM/YYYY.</li>}
                    {isEvent && (
                      <li>
                        Day is counted from the event: -3 is three days before, 0 the event day, +1 the day after.
                        {isRun && " Or give a Target Date instead."}
                        {defaultOffset !== null && groupLabel && ` A row with neither goes under ${groupLabel}.`}
                      </li>
                    )}
                    {isRun && <li>Frequency: One-time, Daily, Weekly, Monthly, Quarterly or Yearly — blank is One-time.</li>}
                  </ul>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4" /> Download Excel template
                  </button>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-[14px] font-bold text-slate-800">2. Upload the filled sheet</p>
                  <label
                    className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                    style={{ background: ACCENT }}
                  >
                    <Upload className="h-4 w-4" /> Choose .xlsx / .csv
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void onFile(f);
                      }}
                    />
                  </label>
                  <p className="mt-3 text-[12.5px] text-slate-500">…or paste rows copied from Excel (with the header row):</p>
                  <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[12px]"
                    placeholder={columns.map((c) => c.header).join("\t")}
                  />
                  <button
                    type="button"
                    onClick={readPaste}
                    disabled={!paste.trim()}
                    className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Read pasted rows
                  </button>
                </div>
                {error && <p className="text-[13px] font-semibold text-red-700 md:col-span-2">{error}</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-slate-700">{source}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{clean.length} ready</span>
                  {shown.length - clean.length > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">
                      {shown.length - clean.length} with errors — skipped
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRows(null)}
                    className="ml-auto rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Choose another file
                  </button>
                </div>
                {error && <p className="text-[13px] font-semibold text-red-700">{error}</p>}

                <div className="table-scroll max-h-[52vh] overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[980px] text-[12.5px]">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Task</th>
                        <th className="px-3 py-2">Subject</th>
                        {isRun && <th className="px-3 py-2">Client</th>}
                        <th className="px-3 py-2">Doer</th>
                        <th className="px-3 py-2">{isRun ? "Initiator" : "Backup"}</th>
                        {(isRun || isEvent) && <th className="px-3 py-2">{isRun ? "Target Date" : "Day"}</th>}
                        {isRun && <th className="px-3 py-2">Frequency</th>}
                        <th className="px-3 py-2">Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.line} className={`border-t border-slate-100 align-top ${r.errors.length ? "bg-red-50/40" : ""}`}>
                          <td className="px-3 py-2 tabular-nums text-slate-400">{r.line}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{r.title || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2 text-slate-600">{r.category ?? "—"}</td>
                          {isRun && <td className="px-3 py-2 text-slate-600">{r.client ?? "—"}</td>}
                          <td className="px-3 py-2 text-slate-600">{r.doerName ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{(isRun ? r.initiatorName ?? "You" : r.backupName) ?? "—"}</td>
                          {(isRun || isEvent) && <td className="px-3 py-2 text-slate-600">{r.when}</td>}
                          {isRun && <td className="px-3 py-2 text-slate-600">{r.frequency}</td>}
                          <td className="px-3 py-2">
                            {r.errors.length === 0 && r.warnings.length === 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> OK
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
                disabled={busy || clean.length === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Add {clean.length} task{clean.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
