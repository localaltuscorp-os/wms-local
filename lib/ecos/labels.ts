import type { Broadcast } from "@/db/schema";
import type {
  BroadcastCategory,
  BroadcastPriority,
  BroadcastStatus,
  BroadcastRecipientStatus,
} from "@/db/enums";

/**
 * Enterprise Communications (ECOS) — display maps + tone tokens.
 *
 * The broadcast enums in `db/enums.ts` ship WITHOUT label maps (unlike the older
 * domains); these are the single source of truth for how a broadcast's category,
 * priority, status and receipt state render across the module. Brand-token hues
 * only — a five-step priority ramp from calm slate → Altus red → deep emergency.
 */

export const BROADCAST_CATEGORY_LABELS: Record<BroadcastCategory, string> = {
  announcement: "Announcement",
  ceo: "From the CEO",
  policy: "Policy",
  compliance: "Compliance",
  emergency: "Emergency",
  department: "Department",
  event: "Event",
  holiday: "Holiday",
  recognition: "Recognition",
  it: "IT",
  payroll: "Payroll",
  other: "Other",
};

export const BROADCAST_PRIORITY_LABELS: Record<BroadcastPriority, string> = {
  normal: "Normal",
  important: "Important",
  high: "High",
  critical: "Critical",
  emergency: "Emergency",
};

export const BROADCAST_STATUS_LABELS: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  paused: "Paused",
  archived: "Archived",
};

/** A pill's foreground / background / border, as raw CSS values. */
export interface Tone {
  fg: string;
  bg: string;
  border: string;
}

/** Priority ramp — calm → urgent. Reduced-motion / colour-blind safe (each also
 *  carries its own label, never colour-only). */
export const BROADCAST_PRIORITY_TONE: Record<BroadcastPriority, Tone> = {
  normal: { fg: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  important: { fg: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  high: { fg: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  critical: { fg: "#A80400", bg: "#fef2f2", border: "#fecaca" },
  emergency: { fg: "#ffffff", bg: "#A80400", border: "#7f0300" },
};

/** Status pill tones — draft/scheduled neutral, published green, paused amber,
 *  archived muted. */
export const BROADCAST_STATUS_TONE: Record<BroadcastStatus, Tone> = {
  draft: { fg: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  scheduled: { fg: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  published: { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  paused: { fg: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  archived: { fg: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
};

/** A recipient's own receipt state — the chip on their inbox cards. */
export const RECEIPT_STATUS_LABELS: Record<BroadcastRecipientStatus, string> = {
  pending: "Unread",
  read: "Read",
  acknowledged: "Acknowledged",
};

export const RECEIPT_STATUS_TONE: Record<BroadcastRecipientStatus, Tone> = {
  pending: { fg: "#A80400", bg: "#fef2f2", border: "#fecaca" },
  read: { fg: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  acknowledged: { fg: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
};

/**
 * The human sender label for a broadcast — mirrors `senderLabelFor` in the HR
 * communications actions: an explicit `senderName` wins, else a role default.
 */
export function senderLabel(
  b: Pick<Broadcast, "authorIdentity" | "senderName">,
): string {
  if (b.senderName && b.senderName.trim()) return b.senderName.trim();
  switch (b.authorIdentity) {
    case "ceo":
      return "The CEO";
    case "founder":
      return "The Founder";
    default:
      return "Altus HR";
  }
}

/** A broadcast attachment record (stored on `broadcasts.attachments` jsonb). */
export interface BroadcastAttachment {
  path: string;
  name: string;
  mime?: string;
  size?: number;
}

/** Coerce the untyped `attachments` jsonb into a clean, typed array. */
export function readAttachments(raw: unknown): BroadcastAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is BroadcastAttachment =>
      !!a && typeof a === "object" && typeof (a as { path?: unknown }).path === "string",
  );
}

/** Percent (0–100, integer) of `part` out of `whole`; 0 when `whole` is 0. */
export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
