"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { describeRecurrence } from "@/lib/jd/recurrence";
import { FUNCTION_LABELS, type BusinessFunction } from "@/lib/org/functions";
import { JD_FUNCTION_OPTIONS } from "@/lib/jd/functions";
import { JD_BULK_COLUMNS, jdBulkPayload, jdTemplateMatrix, readJdMatrix, type JdBulkRow } from "@/lib/jd/bulk";
import type { JdPositionRow } from "@/lib/queries/job-description";
import { bulkCreateJdEntries } from "@/app/(app)/operations/job-description/actions";

/**
 * JD BULK UPLOAD — every task from an Excel sheet in one go (lib/jd/bulk.ts).
 *
 * Download the template, fill one task per row (a Position for a General JD, or
 * a Person for a personal JD), then upload the .xlsx or paste the rows. Every
 * row is shown with its problems before anything is saved; only clean rows go.
 */

const ACCENT = "#B91C1C";

export function JdBulkUpload({
  open,
  onClose,
  positions,
  people,
  person = null,
}: {
  open: boolean;
  onClose: () => void;
  positions: JdPositionRow[];
  people: { id: string; name: string }[];
  /** Uploading from one person's JD: rows with no Position or Person become theirs. */
  person?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<JdBulkRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [paste, setPaste] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ctx = {
    positions: positions.map((p) => ({ id: p.id, title: p.title, functionKey: p.functionKey })),
    people,
    defaultPerson: person,
    today: new Date().toISOString().slice(0, 10),
  };

  function read(matrix: unknown[][], from: string) {
    const res = readJdMatrix(matrix, ctx);
    setRows(res.rows);
    setError(res.error ?? (res.rows.length === 0 ? "No task rows found." : null));
    setSource(from);
  }

  async function onFile(file: File) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
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
    const sheet = XLSX.utils.aoa_to_sheet(jdTemplateMatrix(person?.name));
    sheet["!cols"] = JD_BULK_COLUMNS.map((c) => ({ wch: c.field === "task" ? 48 : c.field === "position" ? 26 : 16 }));
    XLSX.utils.book_append_sheet(wb, sheet, "Job Descriptions");
    const lists: string[][] = [
      ["Positions (use in the Position column)", "Function"],
      ...positions.map((p) => [p.title, FUNCTION_LABELS[p.functionKey as BusinessFunction] ?? p.functionKey]),
      [],
      ["People (Person / Assign To)"],
      ...people.map((p) => [p.name]),
      [],
      ["Functions (personal JD)"],
      ...JD_FUNCTION_OPTIONS.map((f) => [f.label]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lists), "Lists");
    XLSX.writeFile(wb, person ? `jd-template-${person.name.replace(/\s+/g, "-").toLowerCase()}.xlsx` : "jd-bulk-template.xlsx");
  }

  const shown = rows ?? [];
  const clean = shown.filter((r) => r.errors.length === 0);

  async function upload() {
    setBusy(true);
    try {
      const res = await bulkCreateJdEntries({ rows: clean.map(jdBulkPayload) });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${res.created} task${res.created === 1 ? "" : "s"} added to the JD.`, type: "success" });
      setRows(null);
      setPaste("");
      setSource(null);
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 max-md:p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Bulk upload job descriptions" className="mt-[4vh] w-full max-w-[1200px] rounded-2xl bg-white p-5 shadow-2xl max-md:p-4">
        <div className="mb-4 flex items-start gap-3 border-b border-slate-200 pb-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5" style={{ color: ACCENT }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-slate-900">Bulk upload {person ? `— ${person.name}'s personal JD` : "— Job Descriptions"}</h2>
            <p className="text-[12.5px] text-slate-500">
              One task per row, in the template&apos;s columns. Fill <b>Position</b> for a General JD or <b>Person</b> for a personal JD
              {person ? ` (leave both blank and the row is ${person.name.split(" ")[0]}'s)` : ""}.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!rows ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-[13px] font-bold text-slate-800">1. Get the template</p>
              <p className="mt-1 text-[12px] text-slate-500">Columns: {JD_BULK_COLUMNS.map((c) => c.header).join(" · ")}. A second sheet lists the positions, people and functions to use.</p>
              <button type="button" onClick={downloadTemplate} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
                <Download className="h-4 w-4" /> Download Excel template
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-[13px] font-bold text-slate-800">2. Upload the filled sheet</p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-white" style={{ background: ACCENT }}>
                <Upload className="h-4 w-4" /> Choose .xlsx / .csv
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
              </label>
              <p className="mt-3 text-[12px] text-slate-500">…or paste rows copied from Excel (with the header row):</p>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[12px]" placeholder={JD_BULK_COLUMNS.map((c) => c.header).join("\t")} />
              <button type="button" onClick={readPaste} disabled={!paste.trim()} className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 disabled:opacity-50">
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
              {shown.length - clean.length > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">{shown.length - clean.length} with errors — skipped</span>}
              <button type="button" onClick={() => setRows(null)} className="ml-auto rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100">
                Choose another file
              </button>
            </div>
            {error && <p className="text-[13px] font-semibold text-red-700">{error}</p>}

            <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[980px] text-[12.5px]">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Position / Person</th>
                    <th className="px-3 py-2">Function</th>
                    <th className="px-3 py-2">Frequency</th>
                    <th className="px-3 py-2 text-right">Time</th>
                    <th className="px-3 py-2">Add to</th>
                    <th className="px-3 py-2">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.line} className={`border-t border-slate-100 align-top ${r.errors.length ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-2 tabular-nums text-slate-400">{r.line}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.task || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{r.ownerLabel}</td>
                      <td className="px-3 py-2 text-slate-600">{r.functionKey ? FUNCTION_LABELS[r.functionKey as BusinessFunction] ?? r.functionKey : "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{describeRecurrence(r.recurrence)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.estimatedMinutes}m</td>
                      <td className="px-3 py-2 text-slate-600">
                        {[r.pushDcc && "DCC", r.pushWms && "WMS", r.pushEvent && "Event"].filter(Boolean).join(", ") || "—"}
                        {r.assignNames.length > 0 && <span className="block text-[11px] text-slate-500">{r.assignNames.join(", ")}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.errors.length === 0 && r.warnings.length === 0 && (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> OK
                          </span>
                        )}
                        {r.errors.map((e) => (
                          <span key={e} className="block font-semibold text-red-700">{e}</span>
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

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={upload} disabled={busy || clean.length === 0} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: ACCENT }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Add {clean.length} task{clean.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
