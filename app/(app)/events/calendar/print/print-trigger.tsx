"use client";
import { Printer } from "lucide-react";

/**
 * "Print / Save PDF" trigger for the Monthly Events Master print view. Fires the
 * browser print dialog (from which the user can Save as PDF). Hidden on the
 * printed page itself via the `.me-no-print` wrapper in page.tsx.
 */
export function PrintTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-pill text-[14px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-altus-red hover:text-altus-red transition-all"
    >
      <Printer size={16} strokeWidth={2.3} />
      Print / Save PDF
    </button>
  );
}
