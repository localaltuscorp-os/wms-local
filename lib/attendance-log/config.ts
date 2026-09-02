/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ── SINGLE CONFIG POINT — the "Attendance log" Google Sheet ─────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 * One spreadsheet, two authoritative tabs (verified structure):
 *   · "Attendance Sheet"          → attendance_sheet_month + attendance_sheet_day
 *   · "PAID LEAVE CALCULATION"    → paid_leave_cycle
 *
 * The sheet is already shared with FIREBASE_CLIENT_EMAIL (Viewer), so the
 * documented spreadsheet id is a safe default; override via env if HR ever
 * moves the workbook:
 *   ATT_LOG_SHEET_ID = <spreadsheet id>            (optional override)
 *   ATT_LOG_SYNC_OFF = true                        (kill switch, both engines)
 *
 * All reads go through readSheetValuesReadonly (READ-ONLY Sheets scope —
 * least privilege; this integration can never write any sheet).
 */

/** Documented default — the HR "Attendance log" workbook. */
const DEFAULT_ATT_LOG_SHEET_ID = "1BJNUz4sACUbUWvVeF0oLy6Fbror464_Z45drpHL7Cx0";

export const ATT_LOG_SHEET_ID = process.env.ATT_LOG_SHEET_ID?.trim() || DEFAULT_ATT_LOG_SHEET_ID;

/** Tab 1 — flat monthly matrix; row 0 legend, row 1 header, data from row 2. */
export const ATT_LOG_ATTENDANCE_RANGE = "'Attendance Sheet'!A1:AX4000";

/** Tab 2 — employee-blocked paid-leave cycles ("<Name> DOJ - dd/mm/yyyy"). */
export const ATT_LOG_PAID_LEAVE_RANGE = "'PAID LEAVE CALCULATION'!A1:Z2000";

/** Kill switch, house convention: <FEATURE>_OFF === "true" disables. */
export const ATT_LOG_KILL_SWITCH = "ATT_LOG_SYNC_OFF";

/** Null when configured; otherwise a safe, admin-showable reason. */
export function attLogSyncConfigError(): string | null {
  if (!ATT_LOG_SHEET_ID) {
    return "Attendance-log sync is not configured (ATT_LOG_SHEET_ID is empty).";
  }
  return null;
}
