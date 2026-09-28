"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import {
  confirmIncentiveEntriesImport,
  validateIncentiveEntriesImport,
} from "@/app/(app)/incentive/admin-actions";
import { fireToast } from "@/lib/toast";

type Preview = { created: number; skipped: number };
type Issue = { rowNumber: number; field: string; message: string };

export function IncentiveImportDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [result, setResult] = React.useState<Preview | null>(null);
  const [busy, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setIssues([]);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function formData() {
    const data = new FormData();
    if (file) data.set("file", file);
    return data;
  }

  function validate() {
    if (!file) return;
    startTransition(async () => {
      const response = await validateIncentiveEntriesImport(formData());
      if (!response.ok) {
        setPreview(null);
        setIssues(response.issues ?? []);
        fireToast({ message: response.error ?? "Import validation failed.", type: "error" });
        return;
      }
      setIssues([]);
      setPreview({ created: response.created, skipped: response.skipped });
    });
  }

  function confirm() {
    startTransition(async () => {
      const response = await confirmIncentiveEntriesImport(formData());
      if (!response.ok) {
        setPreview(null);
        setIssues(response.issues ?? []);
        fireToast({ message: response.error ?? "Import failed.", type: "error" });
        return;
      }
      setResult({ created: response.created, skipped: response.skipped });
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }}>
      <Dialog.Trigger asChild>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-pill border border-hairline bg-surface-card px-4 text-[13.5px] font-semibold text-ink-strong transition-colors hover:border-hairline-strong hover:bg-surface-soft">
          <Upload size={15} strokeWidth={2.3} /> Import Excel
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-section border border-hairline bg-surface-card p-6 shadow-lg">
          <Dialog.Title className="text-[21px] font-black text-ink-strong">Import Incentive Entries</Dialog.Title>
          {result ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3 rounded-section border border-hairline bg-surface-soft p-5">
                <Check size={22} className="text-[var(--color-green-deep)]" />
                <span className="font-bold text-ink-strong">{result.created} entries imported.</span>
              </div>
              <Dialog.Close asChild><button type="button" className="ml-auto block rounded-chip px-5 py-2.5 text-[14px] font-bold text-white" style={{ background: "var(--color-altus-red)" }}>Done</button></Dialog.Close>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="/incentive/template.xlsx" className="inline-flex items-center gap-2 rounded-chip border border-hairline px-3 py-2 text-[13px] font-semibold text-ink-strong hover:bg-surface-soft">
                  <Download size={14} /> Download fresh template
                </a>
              </div>
              <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-section border-2 border-dashed border-hairline-strong bg-surface-soft px-5 text-center">
                <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setIssues([]); setPreview(null); }} />
                <FileSpreadsheet size={25} className="text-altus-red" />
                <span className="font-bold text-ink-strong">{file?.name ?? "Select completed .xlsx workbook"}</span>
                <span className="text-[12px] text-ink-subtle">Validate all rows before any entry is created.</span>
              </label>
              {issues.length > 0 && (
                <div className="mt-4 max-h-48 overflow-y-auto rounded-section border border-altus-red/30 bg-red-50 p-3 text-[12.5px] text-ink-strong">
                  {issues.map((issue, index) => <p key={`${issue.rowNumber}-${index}`}><b>Row {issue.rowNumber} · {issue.field}:</b> {issue.message}</p>)}
                </div>
              )}
              {preview && <div className="mt-4 rounded-section border border-hairline bg-surface-soft p-3 text-[13px] font-semibold text-ink-strong">{preview.created} valid entries ready for import{preview.skipped ? ` · ${preview.skipped} blank rows skipped` : ""}.</div>}
              <div className="mt-5 flex justify-end gap-2">
                {(file || preview) && <button type="button" onClick={reset} className="inline-flex items-center gap-1 px-3 py-2 text-[13px] font-semibold text-ink-subtle"><X size={14} /> Clear</button>}
                {preview ? (
                  <button type="button" onClick={confirm} disabled={busy} className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirm import
                  </button>
                ) : (
                  <button type="button" onClick={validate} disabled={!file || busy} className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Validate workbook
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
