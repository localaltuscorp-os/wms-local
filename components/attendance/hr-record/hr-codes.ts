/**
 * HR "Attendance log" sheet day-code → semantic colour/label map, shared by
 * the day grid + legend on /attendance/hr-record. Codes are stored verbatim
 * from the sheet (see attendance_sheet_day.status_code): P | A | W/O | H |
 * H-P | H-H/D | H/D | -  — anything unknown falls back to neutral slate so
 * a new sheet code can never crash the page.
 */
import { formatDate } from "@/lib/format";

export interface HrCodeStyle {
  code: string;
  label: string;
  /** Semantic accent colour (light theme). */
  accent: string;
  /** True for the "no data" dash — rendered faint/dashed. */
  faint?: boolean;
}

export const HR_CODE_STYLES: Record<string, HrCodeStyle> = {
  "P": { code: "P", label: "Present", accent: "#16a34a" },
  "A": { code: "A", label: "Absent", accent: "#dc2626" },
  "W/O": { code: "W/O", label: "Weekly off", accent: "#64748b" },
  "H": { code: "H", label: "Holiday", accent: "#2563eb" },
  "H-P": { code: "H-P", label: "Present on holiday", accent: "#0d9488" },
  "H-H/D": { code: "H-H/D", label: "Half day on holiday", accent: "#0d9488" },
  "H/D": { code: "H/D", label: "Half day", accent: "#d97706" },
  "-": { code: "-", label: "No record", accent: "#94a3b8", faint: true },
};

/** Legend display order (most meaningful first). */
export const HR_LEGEND_ORDER = ["P", "H/D", "A", "W/O", "H", "H-P", "H-H/D", "-"];

export function hrCodeStyle(code: string): HrCodeStyle {
  const key = code.trim().toUpperCase();
  return HR_CODE_STYLES[key] ?? { code, label: code, accent: "#64748b" };
}

/** "2026-06-01" (month bucket) → "June 2026". */
export function hrMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, 1, 12)),
  );
}

/** "2026-06-04" → "04 Jun 2026" (canonical, drift-free). */
export function hrDateLabel(date: string): string {
  return formatDate(date);
}

/** Numeric-string → tidy display: integers bare, otherwise one decimal. */
export function hrNum(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
