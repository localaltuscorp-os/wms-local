"use client";
import { Printer } from "lucide-react";

/**
 * Standalone Print button for the Outstanding dashboard toolbar. The CSV /
 * XLSX / PDF / Google-Sheets exports + import templates now live in the
 * OutstandingExportDialog (components/outstanding/export-dialog.tsx); only
 * browser-print remains a distinct one-click action here.
 */
export function OutstandingPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill text-[14px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-altus-red hover:text-altus-red transition-all print:hidden"
    >
      <Printer size={16} strokeWidth={2.3} />
      Print
    </button>
  );
}
