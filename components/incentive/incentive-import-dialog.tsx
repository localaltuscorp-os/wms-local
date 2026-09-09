"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, FileSpreadsheet, Loader2, Check, X } from "lucide-react";
import { bulkUploadIncentiveEntries } from "@/app/(app)/incentive/admin-actions";
import { fireToast } from "@/lib/toast";

const RECOGNISED = [
  "Sr No",
  "Date",
  "Incentive",
  "Period / Month",
  "Emp / Employee Name",
  "Participant",
  "Prospect / Group",
  "Amount",
  "Approved",
  "Approved Amt",
  "Paid",
  "Paid Amt",
  "Paid Date",
  "Note",
];

/** Admin bulk Excel import for incentive entries — single upload + summary. */
export function IncentiveImportDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<{ created: number; skipped: number } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await bulkUploadIncentiveEntries(fd);
      if (!res.ok) {
        fireToast({ message: res.error || "Import failed.", type: "error" });
        return;
      }
      setResult({ created: res.created, skipped: res.skipped });
      fireToast({
        message: `Imported ${res.created} entr${res.created === 1 ? "y" : "ies"}${
          res.skipped ? ` · ${res.skipped} skipped` : ""
        }.`,
      });
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-card px-4 h-10 font-semibold text-ink-strong hover:bg-surface-soft hover:border-hairline-strong transition-colors"
          style={{ fontSize: 13.5 }}
        >
          <Upload size={15} strokeWidth={2.3} />
          Import Excel
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-section bg-surface-card border border-hairline p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title
            className="text-ink-strong mb-1"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 21 }}
          >
            Import Incentive Entries
          </Dialog.Title>
          <Dialog.Description className="text-ink-subtle font-semibold mb-4" style={{ fontSize: 13.5 }}>
            Upload a .xlsx or .csv — each row becomes one incentive entry. Columns are
            matched by name; employees are matched to the roster best-effort.
          </Dialog.Description>

          {result ? (
            <div className="space-y-4">
              <div className="rounded-section border border-hairline bg-surface-soft p-5 flex items-center gap-3">
                <span
                  className="inline-flex items-center justify-center h-11 w-11 rounded-xl"
                  style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}
                >
                  <Check size={22} strokeWidth={2.6} />
                </span>
                <div>
                  <div className="font-black text-ink-strong tabular-nums" style={{ fontSize: 22, lineHeight: 1 }}>
                    {result.created} imported
                  </div>
                  {result.skipped > 0 && (
                    <div className="font-semibold text-ink-subtle mt-1" style={{ fontSize: 13 }}>
                      {result.skipped} row{result.skipped === 1 ? "" : "s"} skipped
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-chip border border-hairline bg-surface-card px-4 py-2.5 font-semibold text-ink-strong hover:bg-surface-soft transition-colors"
                  style={{ fontSize: 14 }}
                >
                  Import Another
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-chip px-5 py-2.5 font-bold text-white"
                    style={{ fontSize: 14, background: "linear-gradient(135deg, #E10600, #A80400)" }}
                  >
                    Done
                  </button>
                </Dialog.Close>
              </div>
            </div>
          ) : (
            <>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  setFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className="flex flex-col items-center justify-center gap-2.5 rounded-section border-2 border-solid px-6 py-9 cursor-pointer transition-all"
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
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <span
                  className="inline-flex items-center justify-center h-12 w-12 rounded-2xl"
                  style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline)" }}
                >
                  {file ? (
                    <FileSpreadsheet size={24} className="text-altus-red" strokeWidth={2} />
                  ) : (
                    <Upload size={24} className="text-ink-subtle" strokeWidth={2} />
                  )}
                </span>
                {file ? (
                  <span className="font-bold text-ink-strong" style={{ fontSize: 14.5 }}>
                    {file.name}
                  </span>
                ) : (
                  <>
                    <span className="font-bold text-ink-strong" style={{ fontSize: 14.5 }}>
                      Drop a file, or <span className="text-altus-red">browse</span>
                    </span>
                    <span className="text-ink-subtle" style={{ fontSize: 12 }}>
                      CSV or Excel · up to 2000 rows
                    </span>
                  </>
                )}
              </label>

              <div className="mt-4">
                <p className="uppercase font-bold tracking-[0.08em] text-ink-subtle mb-2" style={{ fontSize: 11 }}>
                  Recognised columns
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {RECOGNISED.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center rounded-pill border px-2.5 py-1 font-semibold"
                      style={{ fontSize: 11.5, borderColor: "var(--color-hairline)", color: "var(--color-ink-soft)" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                {file && (
                  <button
                    type="button"
                    onClick={reset}
                    className="bg-surface-card inline-flex items-center gap-1.5 px-3 py-2.5 font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
                    style={{ fontSize: 13.5 }}
                  >
                    <X size={14} strokeWidth={2.4} />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={upload}
                  disabled={!file || busy}
                  className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 font-bold text-white disabled:opacity-50"
                  style={{ fontSize: 14, background: "linear-gradient(135deg, #E10600, #A80400)" }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} strokeWidth={2.4} />}
                  {busy ? "Importing…" : "Upload"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
