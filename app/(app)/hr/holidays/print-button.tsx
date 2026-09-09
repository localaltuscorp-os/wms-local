"use client";

import { CalendarDays } from "lucide-react";

/**
 * The Holiday List's "Print Calendar" control.
 *
 * A client component purely so it can own its own onClick. This used to be a
 * plain server-rendered <button data-print-trigger> wired up by an inline
 * <script> at the bottom of the page — which broke once the button moved into
 * <HrTitleBar>: that portals its content into the console's sticky slot, so by
 * the time the script ran there was no matching element in the document yet.
 * React also never executes inline <script> tags on client navigation, so the
 * handler silently went missing whenever the page was reached from the rail
 * rather than a fresh load.
 *
 * `.hol-print` still comes from the page's own <style> block — those rules are
 * global, so they apply to the portaled button just the same.
 */
export function HolidayPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="hol-print inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold max-md:px-3"
    >
      <CalendarDays size={15} strokeWidth={2.4} />
      <span className="max-md:hidden">Print Calendar</span>
      <span className="md:hidden">Print</span>
    </button>
  );
}
