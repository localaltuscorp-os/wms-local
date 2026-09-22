/**
 * Client-safe presentation helpers for HR tickets (no server imports). Badge
 * tones + category icons + relative-time. The label/enum sources of truth live
 * in db/enums.ts (pure constants, safe to import on the client).
 */
import type { HrTicketPriority, HrTicketStatus, HrTicketCategory } from "@/db/enums";
import {
  Building2,
  CalendarDays,
  CircleDot,
  FileText,
  IndianRupee,
  KeyRound,
  Lock,
  ReceiptText,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { formatDateHr } from "@/lib/format";

export const STATUS_TONE: Record<HrTicketStatus, { bg: string; fg: string; dot: string }> = {
  new: { bg: "#E106061a", fg: "#A80400", dot: "#E10600" },
  in_progress: { bg: "#2563eb1a", fg: "#1d4ed8", dot: "#2563eb" },
  waiting_on_employee: { bg: "#b4530910", fg: "#b45309", dot: "#f59e0b" },
  resolved: { bg: "#0f766e1a", fg: "#0f766e", dot: "#10b981" },
  closed: { bg: "#64748b1a", fg: "#475569", dot: "#94a3b8" },
  reopened: { bg: "#7c3aed1a", fg: "#6d28d9", dot: "#8b5cf6" },
};

export const PRIORITY_TONE: Record<HrTicketPriority, { fg: string; label: string }> = {
  low: { fg: "#64748b", label: "Low" },
  normal: { fg: "#2563eb", label: "Normal" },
  high: { fg: "#b45309", label: "High" },
  urgent: { fg: "#E10600", label: "Urgent" },
};

/**
 * The icon for each ticket category.
 *
 * WAS A MAP OF EMOJI (🗓 🧾 🔑 🏢 📄 ❓ 🔒). They render at a different weight
 * and colour from every other icon in the app, they are a different shape on
 * every operating system, and half of them come out as flat monochrome glyphs
 * on Windows — which is exactly how they looked on the Queries page: nine
 * chips, each with a differently-styled little picture on it.
 *
 * Lucide components, like the rest of the app. They inherit `currentColor` and
 * the size they are given, so a category icon now looks like it belongs to the
 * thing it sits in.
 */
export const CATEGORY_ICON: Record<HrTicketCategory, LucideIcon> = {
  payroll: IndianRupee,
  leave_attendance: CalendarDays,
  reimbursement: ReceiptText,
  it_access: KeyRound,
  facilities: Building2,
  documents_letters: FileText,
  policy_question: Scale,
  grievance: Lock,
  other: CircleDot,
};

export function relTime(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const secs = Math.round((Date.now() - t.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateHr(t);
}

/** SLA countdown label for an open ticket, or null when not applicable. */
export function slaLabel(
  dueAt: Date | string | null,
  respondedAt: Date | string | null,
): { text: string; breached: boolean } | null {
  if (!dueAt || respondedAt) return null;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const ms = due.getTime() - Date.now();
  const breached = ms < 0;
  const abs = Math.abs(ms);
  const hrs = Math.floor(abs / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const span = hrs >= 1 ? `${hrs}h` : `${mins}m`;
  return { text: breached ? `SLA breached ${span} ago` : `${span} to first response`, breached };
}
