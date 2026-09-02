"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import {
  Download,
  FileText,
  FileSpreadsheet,
  Table,
  Sheet,
  ClipboardCopy,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { exportFilename } from "@/lib/exports/csv";
import { OUTSTANDING_CYCLE_LABELS, type OutstandingCycle } from "@/db/enums";
import type { DerivedInstallment } from "@/lib/outstanding/types";
import type { CollectionDisplayRow } from "@/lib/queries/outstanding";

function cycleLabel(cycle: string | undefined): string {
  if (!cycle) return "";
  return OUTSTANDING_CYCLE_LABELS[cycle as OutstandingCycle] ?? cycle;
}

function fmtDue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : format(d, "dd-MMM-yyyy");
}

const ENTRY_HEADERS = [
  "S. No.",
  "Client",
  "Product",
  "Cycle",
  "Due Date",
  "Balance",
  "Days Overdue",
  "Entity",
  "Responsible",
  "Status",
];

function entryRows(entries: DerivedInstallment[]): (string | number)[][] {
  return entries.map((e, i) => [
    i + 1,
    e.clientName,
    e.productName ?? "",
    cycleLabel(e.cycle),
    fmtDue(e.dueDate),
    e.balance,
    e.state === "overdue" ? e.daysOverdue : "",
    e.entityName ?? "",
    e.responsibleName ?? "",
    e.state === "overdue" ? "Overdue" : "Not Due",
  ]);
}

const COLLECTION_HEADERS = [
  "S. No.",
  "Client",
  "Amount",
  "Payment Mode",
  "Responsible",
  "Comments",
  "Collected At",
];

function collectionRows(rows: CollectionDisplayRow[]): (string | number)[][] {
  return rows.map((c, i) => [
    i + 1,
    c.clientName,
    c.amount,
    c.paymentMode ?? "",
    c.responsible ?? "",
    c.comments ?? "",
    fmtDue(c.collectedAt),
  ]);
}

// Match lib/exports/csv.ts: UTF-8 BOM + RFC-4180 quoting, client-side blob.
function downloadCsv(
  resource: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const body = "﻿" + stringify([headers, ...rows]);
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFilename(resource);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function OutstandingExportDialog({
  entries,
  collectionEntries,
}: {
  entries: DerivedInstallment[];
  collectionEntries: CollectionDisplayRow[];
}) {
  const [open, setOpen] = React.useState(false);
  const searchParams = useSearchParams();

  // Preserve the dashboard's active filters when hitting the server routes.
  const qs = searchParams.toString();
  const withFilters = (path: string) => {
    if (!qs) return path;
    return path.includes("?") ? `${path}&${qs}` : `${path}?${qs}`;
  };

  const openRoute = (path: string) => {
    window.open(withFilters(path), "_blank", "noopener,noreferrer");
  };

  const onCsvEntries = () =>
    downloadCsv("outstanding-entries", ENTRY_HEADERS, entryRows(entries));
  const onCsvCollections = () =>
    downloadCsv(
      "outstanding-collections",
      COLLECTION_HEADERS,
      collectionRows(collectionEntries),
    );

  const onCopyTsv = async () => {
    // Tab-separated values paste cleanly into a Google Sheet, one cell per column.
    const rows = entryRows(entries);
    const tsv = [ENTRY_HEADERS, ...rows]
      .map((r) => r.map((c) => String(c ?? "")).join("\t"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      fireToast({ message: "Copied — paste into a Google Sheet." });
    } catch {
      fireToast({
        message: "Could not copy to clipboard. Try the CSV export instead.",
        type: "error",
      });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill text-[14px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-altus-red hover:text-altus-red transition-all print:hidden"
        >
          <Download size={16} strokeWidth={2.3} />
          Export
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Export Data
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Choose a format to export your outstanding data.
          </Dialog.Description>

          <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-[13px] font-semibold text-[#1D4ED8] mb-5">
            {entries.length.toLocaleString("en-IN")}{" "}
            {entries.length === 1 ? "row" : "rows"} ready to export (all data)
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8] mb-2">
            Export Format
          </div>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <FormatCard
              icon={<FileText size={22} strokeWidth={2} />}
              title="PDF Report"
              hint="Formatted, print-ready"
              onClick={() => openRoute("/outstanding/export.pdf")}
            />
            <FormatCard
              icon={<FileSpreadsheet size={22} strokeWidth={2} />}
              title="Excel (.xlsx)"
              hint="Entries + collections sheets"
              onClick={() => openRoute("/outstanding/export.xlsx")}
            />
            <FormatCard
              icon={<Table size={22} strokeWidth={2} />}
              title="CSV (.csv)"
              hint="Entries · plain text"
              onClick={onCsvEntries}
            />
            <FormatCard
              icon={<Sheet size={22} strokeWidth={2} />}
              title="Google Sheets"
              hint="Copy & paste into Sheets"
              onClick={() => void onCopyTsv()}
            />
          </div>

          <button
            type="button"
            onClick={onCsvCollections}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#64748B] hover:text-altus-red transition-colors"
          >
            <ClipboardCopy size={14} strokeWidth={2.2} />
            Also export Collections as CSV
          </button>

          <div className="mt-6 border-t border-[#E2E8F0] pt-5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8] mb-2">
              Download Import Template
            </div>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <FormatCard
                icon={<FileSpreadsheet size={22} strokeWidth={2} />}
                title="Outstanding Template"
                hint="26 columns · all fields"
                onClick={() =>
                  openRoute("/outstanding/export.xlsx?template=outstanding")
                }
              />
              <FormatCard
                icon={<FileSpreadsheet size={22} strokeWidth={2} />}
                title="Collection Template"
                hint="7 columns · payment records"
                onClick={() =>
                  openRoute("/outstanding/export.xlsx?template=collection")
                }
              />
            </div>
            <p
              className="mt-3 text-[12px] text-[#94A3B8]"
              style={{ lineHeight: 1.5 }}
            >
              Templates are blank workbooks with only the header row — bulk-fill
              them, then re-import via the Import dialog.
            </p>
          </div>

          <div className="mt-5 flex justify-end border-t border-[#E2E8F0] pt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-[14px] font-medium text-[#64748B]"
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

function FormatCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3.5 text-left transition-colors hover:border-altus-red hover:bg-[#FEF2F2]"
    >
      <span className="text-[#E10600]">{icon}</span>
      <span>
        <span className="block text-[14px] font-semibold text-[#0F172A]">
          {title}
        </span>
        <span className="block text-[12px] text-[#64748B]">{hint}</span>
      </span>
    </button>
  );
}
