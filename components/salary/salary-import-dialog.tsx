"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, CheckCircle2, Undo2, FileSpreadsheet } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  previewSalaryImport,
  confirmSalaryImport,
  undoSalaryImport,
  type SalaryImportPreview,
} from "@/app/(app)/salary/import/actions";

const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function SalaryImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SalaryImportPreview | null>(null);
  // The picked file is kept so confirm can re-send the SAME workbook.
  const [file, setFile] = useState<File | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setError(null);
    setPreview(null);
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onFilePicked(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    setPreview(null);
    setFile(picked);
    const fd = new FormData();
    fd.append("file", picked);
    startTransition(async () => {
      const res = await previewSalaryImport(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  }

  function onConfirm() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await confirmSalaryImport(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLastBatchId(res.batchId);
      fireToast({
        message: `Imported ${res.created} historical salary run(s). Batch ${res.batchId.slice(0, 8)}…`,
      });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  function onUndo() {
    if (!lastBatchId) return;
    startTransition(async () => {
      const res = await undoSalaryImport(lastBatchId);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Undone: removed ${res.deleted} imported run(s).` });
      setLastBatchId(null);
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
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2.5 px-4 text-[14px] font-medium text-ink-strong hover:border-hairline-strong transition-colors"
        >
          <Upload size={15} strokeWidth={2.2} />
          Import Altus-Log
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Import Altus-Log (historical backtest)
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Upload the Altus-Log workbook. Its <strong>Summary</strong> sheet seeds
            historical salary runs for April&nbsp;2026 onward, for employees who
            have a CTC profile.
          </Dialog.Description>

          <input
            ref={fileInput}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              onFilePicked(e.target.files?.[0]);
            }}
          />

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
            className="flex w-full items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3.5 text-left transition-colors hover:border-[#CBD5E1] disabled:opacity-50"
          >
            <span className="text-[#E10600]">
              <FileSpreadsheet size={22} strokeWidth={2} />
            </span>
            <span>
              <span className="block text-[14px] font-semibold text-[#0F172A]">
                {file ? file.name : "Choose Altus-Log .xlsx"}
              </span>
              <span className="block text-[12px] text-[#64748B]">
                Reads the &quot;Summary&quot; sheet
              </span>
            </span>
          </button>

          {pending && !preview && (
            <p className="mt-4 text-[14px] text-[#64748B]">Reading &amp; previewing…</p>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
            >
              {error}
            </div>
          )}

          {preview && (
            <div className="mt-5 rounded-lg border border-[#E2E8F0] p-4">
              <h3 className="text-[15px] font-semibold text-[#0F172A] mb-3">Preview</h3>
              <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-2">
                <Stat label="Rows parsed" value={String(preview.totalRows)} />
                <Stat label="In range (Apr-26+)" value={String(preview.inRange)} />
                <Stat label="Out of range (skipped)" value={String(preview.outOfRange)} />
                <Stat label="Runs to create" value={String(preview.withProfile)} />
                <Stat label="Matched, no CTC" value={String(preview.noProfile)} />
                <Stat label="Unmatched names" value={String(preview.unmatchedNames.length)} />
              </div>

              {preview.unmatchedNames.length > 0 && (
                <p
                  className="mt-3 rounded-md border border-[#FED7AA] bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#9A3412]"
                  style={{ lineHeight: 1.5 }}
                >
                  Unmatched employee names (fix the name in the sheet or add the
                  employee, then re-import):{" "}
                  <span className="font-medium">
                    {preview.unmatchedNames.join(", ")}
                  </span>
                </p>
              )}

              {preview.noProfile > 0 && (
                <p
                  className="mt-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#475569]"
                  style={{ lineHeight: 1.5 }}
                >
                  {preview.noProfile} matched employee(s) have no CTC profile —
                  attendance-only, skipped for salary.
                </p>
              )}

              {preview.sample.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
                        <th className="py-1.5 pr-3 font-semibold">Employee</th>
                        <th className="py-1.5 pr-3 font-semibold">Month</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Payable d.</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Days</th>
                        <th className="py-1.5 font-semibold text-right">Net (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((s, i) => (
                        <tr key={i} className="border-b border-[#F1F5F9]">
                          <td className="py-1.5 pr-3 text-[#0F172A]">{s.employeeName}</td>
                          <td className="py-1.5 pr-3 text-[#475569]">{s.month}</td>
                          <td className="py-1.5 pr-3 text-right text-[#475569]">{num(s.payableDays)}</td>
                          <td className="py-1.5 pr-3 text-right text-[#475569]">{s.daysInMonth}</td>
                          <td className="py-1.5 text-right text-[#0F172A]">{num(s.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p
                className="mt-3 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[13px] text-[#92400E]"
                style={{ lineHeight: 1.5 }}
              >
                Historical runs use the sheet&apos;s attendance summary only. The
                Summary sheet has no late-marks, advances or carry-forward — so
                imported runs are computed with <strong>0 late marks</strong>,{" "}
                <strong>0 advances</strong> and <strong>0 pending balance</strong>.
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={pending}
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={pending || preview.withProfile === 0}
                  className="inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
                >
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  {pending ? "Importing…" : `Confirm import (${preview.withProfile})`}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              onClick={onUndo}
              disabled={pending || !lastBatchId}
              title={lastBatchId ? undefined : "No import done yet in this session"}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2 px-4 text-[13px] font-medium text-ink-strong hover:border-hairline-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Undo2 size={14} strokeWidth={2.2} />
              Undo Last Import
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-[14px] font-medium text-[#64748B]"
                disabled={pending}
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </div>
      <div className="text-[16px] font-bold text-[#0F172A]">{value}</div>
    </div>
  );
}
