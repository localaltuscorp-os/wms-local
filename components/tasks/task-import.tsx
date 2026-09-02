"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { motion } from "motion/react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Check,
  AlertTriangle,
  Loader2,
  X,
  ArrowLeft,
  Users,
  ListChecks,
} from "lucide-react";
import { previewTaskImport, commitTaskImport } from "@/app/(app)/tasks/import-actions";
import type { ImportPreview } from "@/lib/import/task-import";
import { fireToast } from "@/lib/toast";

const COLUMNS: { name: string; required: boolean }[] = [
  { name: "Client", required: true },
  { name: "Subject", required: true },
  { name: "Doer", required: true },
  { name: "Initiator", required: true },
  { name: "Priority", required: false },
  { name: "Due Date", required: true },
  { name: "Description", required: true },
  { name: "Notes", required: false },
  { name: "Tags", required: false },
];

/**
 * Admin CSV/XLSX task importer — premium two-step flow. Upload → the server
 * parses + validates every row (resolving Doer/Initiator by name or email) →
 * review a per-row preview with inline errors → commit. Parsing is server-side
 * so the spreadsheet lib never ships to the browser.
 */
export function TaskImport({
  embedded = false,
  onSuccess,
}: {
  /** Rendered inside a dialog — drop the page chrome (back link, big hero). */
  embedded?: boolean;
  /** Called after a successful import instead of navigating to /tasks. */
  onSuccess?: () => void;
} = {}) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [previewing, startPreview] = React.useTransition();
  const [committing, startCommit] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onPick(f: File | null) {
    setPreview(null);
    setFile(f);
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    startPreview(async () => {
      const result = await previewTaskImport(fd);
      setPreview(result);
      if (result.fatal) fireToast({ message: result.fatal, type: "error" });
    });
  }

  function reset() {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function commit() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startCommit(async () => {
      const res = await commitTaskImport(fd);
      if (!res.ok) {
        fireToast({ message: res.error || "Import failed.", type: "error" });
        return;
      }
      fireToast({
        message: `Imported ${res.created} task${res.created === 1 ? "" : "s"}${
          res.skipped ? ` · ${res.skipped} skipped` : ""
        }.`,
      });
      if (onSuccess) {
        onSuccess();
        router.refresh();
      } else {
        router.push("/tasks" as Route);
      }
    });
  }

  function downloadTemplate() {
    const a = document.createElement("a");
    a.href = "/task-import-template.xlsx";
    a.download = "task-import-template.xlsx";
    a.click();
  }

  const hasPreview = preview && !preview.fatal;

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-[1120px] px-6 max-md:px-4 py-8"}>
      {/* Breadcrumb / back — page only */}
      {!embedded && (
        <button
          type="button"
          onClick={() => router.push("/tasks" as Route)}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors mb-5"
        >
          <ArrowLeft size={15} strokeWidth={2.4} />
          Back to Tasks
        </button>
      )}

      {/* Hero — full hero on the page; in a dialog the dialog title covers it,
          so we only keep the subtitle + Download template row. */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        {embedded ? (
          <p className="text-ink-soft" style={{ fontSize: 14.5, maxWidth: "60ch" }}>
            Upload a CSV or Excel file — each row becomes one task. Doer &amp;
            Initiator are matched by employee name or email.
          </p>
        ) : (
          <div className="flex items-start gap-3.5">
            <span
              className="inline-flex items-center justify-center h-12 w-12 rounded-2xl shrink-0"
              style={{ background: "var(--color-red-bg, #fef2f2)", color: "var(--color-altus-red)" }}
            >
              <Upload size={22} strokeWidth={2.2} />
            </span>
            <div>
              <h1
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 500, fontSize: 32, letterSpacing: "-0.02em", lineHeight: 1.1 }}
              >
                Import tasks
              </h1>
              <p className="mt-1.5 text-ink-soft" style={{ fontSize: 15, maxWidth: "60ch" }}>
                Upload a CSV or Excel file — each row becomes one task. Doer &amp;
                Initiator are matched by employee name or email.
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-card px-4 h-11 text-[14px] font-semibold text-ink-strong hover:bg-surface-soft hover:border-hairline-strong transition-colors shrink-0"
        >
          <Download size={16} strokeWidth={2.2} />
          Download template
        </button>
      </div>

      {/* Dropzone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onPick(e.dataTransfer.files?.[0] ?? null);
        }}
        className="group flex flex-col items-center justify-center gap-3 rounded-section border-2 border-dashed px-6 py-12 cursor-pointer transition-all"
        style={{
          borderColor: dragging ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
          background: dragging ? "var(--color-red-bg, #fef2f2)" : "var(--color-surface-soft)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <span
          className="inline-flex items-center justify-center h-14 w-14 rounded-2xl transition-transform group-hover:scale-105"
          style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline)" }}
        >
          {file ? (
            <FileSpreadsheet size={26} className="text-altus-red" strokeWidth={2} />
          ) : (
            <Upload size={26} className="text-ink-subtle" strokeWidth={2} />
          )}
        </span>
        {file ? (
          <span className="text-[15.5px] font-bold text-ink-strong">{file.name}</span>
        ) : (
          <>
            <span className="text-[16px] font-bold text-ink-strong">
              Drop your file here, or <span className="text-altus-red">browse</span>
            </span>
            <span className="text-[13px] text-ink-subtle">CSV or Excel (.xlsx) · up to 500 rows</span>
          </>
        )}
        {previewing && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle mt-1">
            <Loader2 size={14} className="animate-spin" /> Reading &amp; validating…
          </span>
        )}
      </label>

      {/* Expected columns helper (only before a preview, to teach the format) */}
      {!hasPreview && (
        <div className="mt-5">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle mb-2.5">
            Expected columns
          </p>
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-semibold"
                style={{
                  borderColor: "var(--color-hairline)",
                  background: "var(--color-surface-card)",
                  color: "var(--color-ink-strong)",
                }}
              >
                {c.name}
                {c.required ? (
                  <span className="text-altus-red" title="Required">*</span>
                ) : (
                  <span className="text-ink-subtle text-[11px] font-medium">optional</span>
                )}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[12.5px] text-ink-subtle">
            <span className="text-altus-red font-bold">*</span> required · Priority accepts
            Critical / Important / Urgent / Normal · dates accept ISO or dd/mm/yyyy · Tags
            comma- or semicolon-separated.
          </p>
        </div>
      )}

      {/* Preview */}
      {hasPreview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {/* Summary cards */}
          <div className="mt-6 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <SummaryCard
              icon={<Check size={16} strokeWidth={2.6} />}
              tone="green"
              value={preview.validCount}
              label="Ready to import"
            />
            <SummaryCard
              icon={<AlertTriangle size={16} strokeWidth={2.4} />}
              tone="red"
              value={preview.errorCount}
              label="With errors (skipped)"
            />
            <SummaryCard
              icon={<ListChecks size={16} strokeWidth={2.4} />}
              tone="slate"
              value={preview.totalRows}
              label="Rows in file"
            />
          </div>

          {/* Preview table */}
          <div className="mt-5 rounded-section border border-hairline overflow-hidden">
            <div className="overflow-auto max-h-[52vh]">
              <table className="min-w-full text-[13.5px]">
                <thead className="sticky top-0 z-10" style={{ background: "var(--color-surface-soft)" }}>
                  <tr className="text-left text-ink-subtle">
                    {["#", "Client", "Subject", "Doer", "Initiator", "Priority", "Due", "Status"].map((h) => (
                      <th key={h} className="px-3.5 py-3 font-bold whitespace-nowrap border-b border-hairline">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr
                      key={r.rowNumber}
                      className="border-b border-hairline last:border-0"
                      style={{
                        background: !r.ok
                          ? "color-mix(in srgb, var(--color-red) 6%, transparent)"
                          : i % 2
                            ? "var(--color-surface-soft)"
                            : undefined,
                      }}
                    >
                      <td className="px-3.5 py-2.5 tabular-nums text-ink-subtle">{r.rowNumber}</td>
                      <td className="px-3.5 py-2.5 text-ink-strong font-semibold whitespace-nowrap">{r.client || "—"}</td>
                      <td className="px-3.5 py-2.5 text-ink-muted whitespace-nowrap">{r.subject || "—"}</td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Users size={13} className="text-ink-subtle shrink-0" />
                          {r.doerName || "—"}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">{r.initiatorName || "—"}</td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">{r.priorityLabel}</td>
                      <td className="px-3.5 py-2.5 tabular-nums whitespace-nowrap">
                        {r.dueAt ? r.dueAt.slice(0, 10) : r.dueRaw || "—"}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {r.ok ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold"
                            style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}
                          >
                            <Check size={12} strokeWidth={3} /> Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-start gap-1 text-[12.5px] font-semibold" style={{ color: "var(--color-red-deep)" }}>
                            <X size={13} strokeWidth={2.8} className="mt-0.5 shrink-0" />
                            <span>{r.errors.join("; ")}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[13px] text-ink-subtle">
              {preview.errorCount > 0
                ? "Rows with errors are skipped — fix them in your file and re-upload to include them."
                : "All rows look good."}
            </p>
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={reset}
                className="px-5 py-2.5 rounded-chip text-[14px] font-semibold border border-hairline bg-surface-card text-ink-strong hover:bg-surface-soft transition-colors"
              >
                Choose another file
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={committing || preview.validCount === 0}
                className="inline-flex items-center gap-2 text-white px-6 py-3 rounded-chip text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                style={{ background: "linear-gradient(135deg, rgb(225,6,0), rgb(168,4,0))", boxShadow: "0 6px 16px rgba(225,6,0,0.32)" }}
              >
                {committing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={2.4} />}
                {committing ? "Importing…" : `Import ${preview.validCount} task${preview.validCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "green" | "red" | "slate";
  value: number;
  label: string;
}) {
  const fg =
    tone === "green" ? "var(--color-green-deep)" : tone === "red" ? "var(--color-red-deep)" : "var(--color-ink-soft)";
  const bg =
    tone === "green"
      ? "color-mix(in srgb, var(--color-green) 12%, transparent)"
      : tone === "red"
        ? "color-mix(in srgb, var(--color-red) 12%, transparent)"
        : "var(--color-surface-soft)";
  return (
    <div className="rounded-section border border-hairline bg-surface-card p-4 flex items-center gap-3">
      <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl shrink-0" style={{ background: bg, color: fg }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="tabular-nums font-black text-ink-strong" style={{ fontSize: 24, lineHeight: 1 }}>
          {value}
        </div>
        <div className="text-[12.5px] font-semibold text-ink-subtle mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}
