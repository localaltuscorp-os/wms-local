"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  refreshAttendanceSheetNow,
  refreshPaidLeaveNow,
} from "@/app/(app)/attendance/attlog-sync-actions";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

/**
 * Admin "Sync attendance from sheet" — pulls the LIVE HR "Attendance log"
 * Google Sheet into the attendance_sheet_* + paid_leave_cycle read layer on
 * demand (both engines idempotent, transactional, audit-logged; they never
 * touch punch grading). Runs the month/day engine first, then paid-leave.
 * The summaries carry counts + unmatched names only — safe to surface verbatim.
 */
export function AttendanceSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  function sync() {
    setBusy(true);
    startTransition(async () => {
      const att = await refreshAttendanceSheetNow();
      if (!att.ok) {
        setBusy(false);
        fireToast({ message: att.error, type: "error" });
        return;
      }
      const leave = await refreshPaidLeaveNow();
      setBusy(false);

      const s = att.summary;
      const unmatched = s.unmatchedNames.length
        ? ` · ${s.unmatchedNames.length} name${s.unmatchedNames.length === 1 ? "" : "s"} unmatched (${s.unmatchedNames.slice(0, 3).join(", ")}${s.unmatchedNames.length > 3 ? "…" : ""})`
        : "";
      const leaveNote = leave.ok
        ? ` · ${leave.summary.rowsWritten} leave cycle${leave.summary.rowsWritten === 1 ? "" : "s"}`
        : "";
      fireToast({
        message: `Synced ${s.monthRowsWritten} month${s.monthRowsWritten === 1 ? "" : "s"} · ${s.dayRowsWritten} day cells${leaveNote}${unmatched}`,
        type: s.unmatchedNames.length ? "info" : "success",
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={busy}
      title="Pull the latest attendance + paid-leave from the HR Attendance log sheet"
      className="brand-btn wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold text-white whitespace-nowrap disabled:opacity-60"
      style={{
        background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
        boxShadow: `0 8px 20px -10px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
      }}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" strokeWidth={2.4} />
      ) : (
        <RefreshCw size={15} strokeWidth={2.4} />
      )}
      {busy ? "Syncing…" : "Sync Attendance from Sheet"}
    </button>
  );
}
