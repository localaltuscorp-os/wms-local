"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Sheet,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  previewImport,
  confirmImport,
  undoImport,
  type ImportPreview,
} from "@/app/(app)/outstanding/actions";

type Payload =
  | { kind: "file"; outstandingCsv?: string; collectionCsv?: string }
  | { kind: "gsheet"; sheetUrl?: string; sheetCollectionUrl?: string };

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Pull the Outstanding + Collection tabs out of a workbook as CSV text. For a
// single-sheet file the lone sheet is treated as the Outstanding tab.
function workbookToCsv(wb: XLSX.WorkBook): {
  outstandingCsv: string;
  collectionCsv: string;
} {
  const byName = (re: RegExp) =>
    wb.SheetNames.find((n) => re.test(n.trim().toLowerCase()));
  const outName = byName(/outstanding/) ?? wb.SheetNames[0];
  const colName = byName(/collection|payment|receipt/);
  const toCsv = (name: string | undefined) =>
    name && wb.Sheets[name] ? XLSX.utils.sheet_to_csv(wb.Sheets[name]) : "";
  return {
    outstandingCsv: toCsv(outName),
    // Don't double-count the outstanding sheet as collection.
    collectionCsv: colName && colName !== outName ? toCsv(colName) : "",
  };
}

export function OutstandingImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // The payload that produced the current preview — re-sent on confirm.
  const [payload, setPayload] = useState<Payload | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetCollectionUrl, setSheetCollectionUrl] = useState("");
  const [showGsheet, setShowGsheet] = useState(false);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  const excelInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  function reset() {
    setError(null);
    setPreview(null);
    setPayload(null);
    setSheetUrl("");
    setSheetCollectionUrl("");
    setShowGsheet(false);
  }

  function runPreview(p: Payload) {
    setError(null);
    setPreview(null);
    setPayload(p);
    startTransition(async () => {
      const res = await previewImport(p);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  }

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    setError(null);
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const { outstandingCsv, collectionCsv } = workbookToCsv(wb);
        runPreview({ kind: "file", outstandingCsv, collectionCsv });
      } else {
        // CSV / txt — the file IS one tab (treated as Outstanding).
        const text = await file.text();
        runPreview({ kind: "file", outstandingCsv: text });
      }
    } catch (err) {
      setError(`Could not read the file: ${(err as Error).message}`);
    }
  }

  function onGsheetSubmit() {
    if (!sheetUrl.trim()) {
      setError("Paste the Google Sheets link.");
      return;
    }
    runPreview({
      kind: "gsheet",
      sheetUrl: sheetUrl.trim(),
      sheetCollectionUrl: sheetCollectionUrl.trim() || undefined,
    });
  }

  function onConfirm() {
    if (!payload) return;
    startTransition(async () => {
      const res = await confirmImport(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLastBatchId(res.batchId);
      fireToast({
        message: `Imported ${res.contracts} contract(s), ${res.installments} installment(s), ${res.collections} collection(s).`,
      });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  function onUndo() {
    if (!lastBatchId) return;
    startTransition(async () => {
      const res = await undoImport(lastBatchId);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: `Undone: removed ${res.contracts} contract(s) and ${res.collections} collection(s).`,
      });
      setLastBatchId(null);
      router.refresh();
    });
  }

  const unmatchedNote = preview ? summariseUnmatched(preview.unmatched) : null;

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
          Import
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Import Data
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Add outstanding entries from an external source.
          </Dialog.Description>

          {/* Hidden file inputs driven by the source cards. */}
          <input
            ref={excelInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              void onFilePicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={csvInput}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              void onFilePicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={uploadInput}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              void onFilePicked(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {/* Source cards */}
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <SourceCard
              icon={<FileSpreadsheet size={22} strokeWidth={2} />}
              title="Excel File"
              hint=".xlsx, .xls"
              onClick={() => excelInput.current?.click()}
              disabled={pending}
            />
            <SourceCard
              icon={<FileText size={22} strokeWidth={2} />}
              title="CSV File"
              hint=".csv"
              onClick={() => csvInput.current?.click()}
              disabled={pending}
            />
            <SourceCard
              icon={<Sheet size={22} strokeWidth={2} />}
              title="Google Sheets"
              hint="Paste a share URL"
              onClick={() => setShowGsheet((v) => !v)}
              active={showGsheet}
              disabled={pending}
            />
            <SourceCard
              icon={<Upload size={22} strokeWidth={2} />}
              title="Upload File"
              hint=".xlsx, .csv, .txt"
              onClick={() => uploadInput.current?.click()}
              disabled={pending}
            />
          </div>

          {showGsheet && (
            <div className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
              <div>
                <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                  Outstanding sheet URL
                </label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                  Collection sheet URL{" "}
                  <span className="font-normal text-[#94A3B8]">(optional)</span>
                </label>
                <input
                  type="url"
                  value={sheetCollectionUrl}
                  onChange={(e) => setSheetCollectionUrl(e.target.value)}
                  placeholder="Paste the Collection tab's URL (with its gid)"
                  className={INPUT_CLASS}
                />
              </div>
              <p className="text-[12px] text-[#64748B]" style={{ lineHeight: 1.5 }}>
                The sheet must be link-viewable (Anyone with the link can view).
              </p>
              <button
                type="button"
                onClick={onGsheetSubmit}
                disabled={pending}
                className="rounded-md py-2 px-4 text-[13px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Loading…" : "Preview from Google Sheets"}
              </button>
            </div>
          )}

          {pending && !preview && (
            <p className="mt-4 text-[14px] text-[#64748B]">Reading & previewing…</p>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
            >
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="mt-5 rounded-lg border border-[#E2E8F0] p-4">
              <h3 className="text-[15px] font-semibold text-[#0F172A] mb-3">
                Preview
              </h3>
              <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-2">
                <Stat label="Contracts" value={String(preview.contracts)} />
                <Stat label="Installments" value={String(preview.installments)} />
                <Stat label="Collections" value={String(preview.collections)} />
                <Stat
                  label="Total outstanding"
                  value={inr(preview.totalOutstanding)}
                />
                <Stat
                  label="Total collected"
                  value={inr(preview.totalCollected)}
                />
              </div>

              {preview.sample.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
                        <th className="py-1.5 pr-3 font-semibold">Client</th>
                        <th className="py-1.5 pr-3 font-semibold">Product</th>
                        <th className="py-1.5 pr-3 font-semibold">Cycle</th>
                        <th className="py-1.5 pr-3 font-semibold text-right">Inst.</th>
                        <th className="py-1.5 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((s, i) => (
                        <tr key={i} className="border-b border-[#F1F5F9]">
                          <td className="py-1.5 pr-3 text-[#0F172A]">{s.clientName}</td>
                          <td className="py-1.5 pr-3 text-[#475569]">{s.product ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-[#475569]">{s.cycle}</td>
                          <td className="py-1.5 pr-3 text-right text-[#475569]">{s.installments}</td>
                          <td className="py-1.5 text-right text-[#0F172A]">{inr(s.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {unmatchedNote && (
                <p
                  className="mt-3 rounded-md border border-[#FED7AA] bg-[#FFF7ED] px-3 py-2 text-[13px] text-[#9A3412]"
                  style={{ lineHeight: 1.5 }}
                >
                  {unmatchedNote} These will be created automatically on confirm.
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setPayload(null);
                  }}
                  disabled={pending}
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
                >
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  {pending ? "Importing…" : "Confirm import"}
                </button>
              </div>
            </div>
          )}

          <p
            className="mt-5 text-[12px] text-[#94A3B8]"
            style={{ lineHeight: 1.5 }}
          >
            Imported data is previewed here for review. Column headers must match
            the Outstanding sheet format. Data is appended after confirmation.
          </p>

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

function summariseUnmatched(u: ImportPreview["unmatched"]): string | null {
  const parts: string[] = [];
  if (u.products.length) parts.push(`${u.products.length} new product(s)`);
  if (u.entities.length) parts.push(`${u.entities.length} new entit(y/ies)`);
  if (u.modes.length) parts.push(`${u.modes.length} new payment mode(s)`);
  if (u.responsibles.length) parts.push(`${u.responsibles.length} new responsible(s)`);
  if (parts.length === 0) return null;
  return `Unmatched roster values: ${parts.join(", ")}.`;
}

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] bg-white";

function SourceCard({
  icon,
  title,
  hint,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors disabled:opacity-50 ${
        active
          ? "border-altus-red bg-[#FEF2F2]"
          : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
      }`}
    >
      <span className="text-[#E10600]">{icon}</span>
      <span>
        <span className="block text-[14px] font-semibold text-[#0F172A]">{title}</span>
        <span className="block text-[12px] text-[#64748B]">{hint}</span>
      </span>
    </button>
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
