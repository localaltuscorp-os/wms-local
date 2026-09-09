"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  bulkImportAccountsTasks,
  type BulkImportResult,
} from "@/app/(app)/accounts/task-list/import-actions";

const TASK_COLUMNS = [
  "Sr. No.",
  "Area",
  "Task Description",
  "Status",
  "Links",
  "Target Date",
  "Actual Date",
  "Gear",
  "Notes",
];
const SHOT_COLUMNS = [
  "Sr. No.",
  "Project Name",
  "Project Details",
  "Frequency",
  "Target Date",
  "Actual Date",
  "Gear",
  "Notes",
];

/**
 * Bulk-import button + premium dialog for the Accounts Task List. Mirrors the
 * Tasks importer UX with Altus tokens: download a clean template, drop a
 * .xlsx/.csv, upload → server parses (handling Excel serial dates) and appends
 * tasks + screenshots, then refreshes. New Status / Gear / Frequency values are
 * auto-added to the dropdowns server-side.
 */
export function AccountsTaskImport() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [uploading, startUpload] = React.useTransition();
  const [result, setResult] = React.useState<BulkImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onClose(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function onPick(f: File | null) {
    setResult(null);
    setFile(f);
  }

  function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startUpload(async () => {
      const res = await bulkImportAccountsTasks(fd);
      setResult(res);
      if (!res.ok) {
        fireToast({ message: res.error || "Import failed.", type: "error" });
        return;
      }
      const parts: string[] = [];
      if (res.createdTasks) parts.push(`${res.createdTasks} task${res.createdTasks === 1 ? "" : "s"}`);
      if (res.createdShots) parts.push(`${res.createdShots} screenshot${res.createdShots === 1 ? "" : "s"}`);
      fireToast({ message: `Imported ${parts.join(" + ") || "0 rows"}.` });
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 h-10 text-[14px] font-bold text-ink-strong hover:border-altus-red hover:text-altus-red transition-colors"
        >
          <Upload size={16} strokeWidth={2.4} />
          Import
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-2rem))] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-section border border-hairline bg-surface-card shadow-2xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
            <div className="flex items-start gap-3">
              <span
                className="inline-flex size-11 items-center justify-center rounded-2xl shrink-0"
                style={{
                  background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
                  color: "var(--color-altus-red-deep)",
                }}
              >
                <Upload size={20} strokeWidth={2.2} />
              </span>
              <div>
                <Dialog.Title
                  className="text-ink-strong"
                  style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "-0.02em" }}
                >
                  Bulk Import
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-ink-muted" style={{ fontSize: 13.5, maxWidth: "52ch" }}>
                  Upload an Excel/CSV. Task rows and Screenshots-to-Post rows on the
                  sheet are appended to the bottom of each table.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong transition-colors"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5">
            {/* Download template */}
            <a
              href="/accounts/task-list/template"
              className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-soft px-4 h-10 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong transition-colors mb-5"
            >
              <Download size={15} strokeWidth={2.2} />
              Download Template
            </a>

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
              className="group flex flex-col items-center justify-center gap-2.5 rounded-section border-2 border-solid px-6 py-10 cursor-pointer transition-all"
              style={{
                borderColor: dragging ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
                background: dragging
                  ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)"
                  : "var(--color-surface-soft)",
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
                className="inline-flex size-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
                style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline)" }}
              >
                {file ? (
                  <FileSpreadsheet size={24} className="text-altus-red" strokeWidth={2} />
                ) : (
                  <Upload size={24} className="text-ink-subtle" strokeWidth={2} />
                )}
              </span>
              {file ? (
                <span className="text-[14.5px] font-bold text-ink-strong">{file.name}</span>
              ) : (
                <>
                  <span className="text-[15px] font-bold text-ink-strong">
                    Drop your file here, or <span className="text-altus-red">browse</span>
                  </span>
                  <span className="text-[12.5px] text-ink-subtle">Excel (.xlsx) or CSV</span>
                </>
              )}
            </label>

            {/* Recognised columns hint */}
            <div className="mt-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle mb-2">
                Recognised columns — Task list
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TASK_COLUMNS.map((c) => (
                  <Pill key={`t-${c}`}>{c}</Pill>
                ))}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle mb-2 mt-4">
                Recognised columns — Screenshots to Post
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SHOT_COLUMNS.map((c) => (
                  <Pill key={`s-${c}`}>{c}</Pill>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-ink-subtle">
                Columns are matched by header name. Dates accept real dates, Excel
                serial numbers, or dd/mm/yyyy. Rows with no Task Description (or no
                Project Name) are skipped. Blank status defaults to Pending; new
                Status / Gear / Frequency values are added to the dropdowns.
              </p>
            </div>

            {/* Result summary */}
            {result?.ok && (
              <div
                className="mt-5 flex items-center gap-3 rounded-section border px-4 py-3.5"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-green) 30%, transparent)",
                  background: "color-mix(in srgb, var(--color-green) 8%, transparent)",
                }}
              >
                <span
                  className="inline-flex size-9 items-center justify-center rounded-xl shrink-0"
                  style={{
                    background: "color-mix(in srgb, var(--color-green) 16%, transparent)",
                    color: "var(--color-green-deep)",
                  }}
                >
                  <Check size={18} strokeWidth={2.8} />
                </span>
                <div className="text-[13.5px] font-semibold text-ink-strong">
                  Imported{" "}
                  <span className="font-black">{result.createdTasks}</span> task
                  {result.createdTasks === 1 ? "" : "s"} and{" "}
                  <span className="font-black">{result.createdShots}</span> screenshot
                  {result.createdShots === 1 ? "" : "s"}.
                  {result.skipped ? ` ${result.skipped} skipped.` : ""}
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 border-t border-hairline px-6 py-4">
            {result?.ok ? (
              <button
                type="button"
                onClick={() => onClose(false)}
                className="inline-flex items-center gap-2 text-white px-6 py-2.5 rounded-chip text-[14.5px] font-bold transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, rgb(225,6,0), rgb(168,4,0))", boxShadow: "0 6px 16px rgba(225,6,0,0.32)" }}
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={reset}
                  disabled={!file || uploading}
                  className="px-5 py-2.5 rounded-chip text-[14px] font-semibold border border-hairline bg-surface-card text-ink-strong hover:bg-surface-soft transition-colors disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={upload}
                  disabled={!file || uploading}
                  className="inline-flex items-center gap-2 text-white px-6 py-2.5 rounded-chip text-[14.5px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                  style={{ background: "linear-gradient(135deg, rgb(225,6,0), rgb(168,4,0))", boxShadow: "0 6px 16px rgba(225,6,0,0.32)" }}
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={2.4} />}
                  {uploading ? "Importing…" : "Import"}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-pill border px-2.5 py-1 text-[12px] font-semibold"
      style={{
        borderColor: "var(--color-hairline)",
        background: "var(--color-surface-card)",
        color: "var(--color-ink-strong)",
      }}
    >
      {children}
    </span>
  );
}
