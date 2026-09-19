/**
 * WCC / MCC — THE DOER STATUS, AND ITS BRIDGE TO THE OLD DCC WORDS.
 *
 * PURE and client-safe: the tables, the server actions and the 10 pm reminders
 * all read these.
 *
 * The doer's side is the WMS Tasks six (account holder, 2026-09-18) — Not Read
 * · Not Started · Initiated · Follow Up · Need Info · Done — so a compliance and
 * a task are graded in one vocabulary, plus WCC / MCC's own seventh, ABANDONED
 * (2026-09-19, migration 0241): the doer has given it up. Abandoned is not
 * Done — it never counts as done — but it is ACCOUNTED FOR: it is not carried
 * forward, and when its time runs out it reads Abandoned, not Lapsed.
 *
 * The approver's side is the WMS Approver Status (lib/status/approver-status.ts)
 * narrowed for WCC / MCC to four rulings — Approved · Not Approved · On Hold ·
 * Archive (2026-09-19) — with no Cancelled. "Pending" is the absence of a
 * ruling and stays what an unruled row reads; older rows already Cancelled
 * still read so.
 *
 * ── WHY THE OLD `status` IS STILL WRITTEN ────────────────────────────────
 * dcc_entries.status (Done / Not done / NA / Pending) is read by the DCC
 * dashboard, the 10 pm DCC report, PMS, the team-performance figures and the
 * Android app. Every WCC/MCC save writes it too, from `legacyStatusFor`, so
 * none of those readers has to change — and a fill the Android app makes in
 * the old words still reads correctly here through `doerStatusOf`.
 */

import { DOER_TASK_STATUSES, type TaskStatus } from "@/db/enums";
import { STATUS_LABELS_FALLBACK, STATUS_TONES_FALLBACK, statusBadgeStyle } from "@/lib/format";
import {
  canSetApproverStatus,
  type ApproverActor,
  type ApproverChoice,
  type ApproverShown,
} from "@/lib/status/approver-status";

/** In the order the dropdown lists them: Not Read … Done, then Abandoned. */
export const DOER_STATUSES = [...DOER_TASK_STATUSES, "abandoned"] as const;
export type DoerStatus = (typeof DOER_STATUSES)[number];

/** Done, or given up — nothing more is expected of the doer. */
export function isClosed(s: DoerStatus | null | undefined): boolean {
  return s === "done" || s === "abandoned";
}

export function isDoerStatus(v: unknown): v is DoerStatus {
  return typeof v === "string" && (DOER_STATUSES as readonly string[]).includes(v);
}

/** The old DCC words, as the Doer Status each became (migration 0238). */
const FROM_LEGACY: Record<string, DoerStatus> = {
  Done: "done",
  Pending: "initiated",
  "Not done": "not_started",
  NA: "not_started",
};

/**
 * What the doer has recorded for a fill — or null when they have not filled it
 * at all, which is what the 10 pm reminder looks for.
 *
 * THE OLD WORD WINS WHEN THE TWO DISAGREE. Every WCC/MCC save writes both
 * columns in step, so they only disagree when an older writer — the Android
 * app, the DCC board — changed `status` afterwards and left `doer_status`
 * behind. That later change is the newer truth.
 */
export function doerStatusOf(
  entry:
    | { doerStatus?: string | null; status?: string | null; approverStatus?: string | null }
    | null
    | undefined,
): DoerStatus | null {
  if (!entry) return null;
  const fromLegacy = (entry.status && FROM_LEGACY[entry.status]) || null;
  if (isDoerStatus(entry.doerStatus)) {
    const inStep = legacyStatusFor(entry.doerStatus, entry.approverStatus ?? null) === (entry.status ?? null);
    return !inStep && fromLegacy ? fromLegacy : entry.doerStatus;
  }
  return fromLegacy;
}

/** The Approver Status a fill carries, the old "NA" read as Cancelled. */
export function approverStatusOf(
  entry: { approverStatus?: string | null; status?: string | null } | null | undefined,
): string | null {
  if (!entry) return null;
  if (entry.approverStatus) return entry.approverStatus;
  return entry.status === "NA" ? "cancelled" : null;
}

/** Rulings that take a fill out of the work altogether. */
export function isRuledOut(approverStatus: string | null | undefined): boolean {
  return approverStatus === "cancelled" || approverStatus === "archived";
}

/**
 * The old `status` to write beside the new columns, so every reader of the old
 * words keeps working (see the note at the top).
 */
export function legacyStatusFor(
  doer: DoerStatus | null,
  approver: string | null | undefined,
): string | null {
  if (isRuledOut(approver)) return "NA";
  if (doer === "done") return "Done";
  if (doer === "initiated" || doer === "follow_up" || doer === "need_info") return "Pending";
  // Given up is, to DCC's readers, simply not done.
  if (doer === "not_started" || doer === "dont_know" || doer === "abandoned") return "Not done";
  return null;
}

/** The WMS label ("Not Read" for dont_know). */
export function doerLabel(s: DoerStatus): string {
  if (s === "abandoned") return "Abandoned";
  return STATUS_LABELS_FALLBACK[s as TaskStatus] ?? s;
}

/** The WMS badge colours for a Doer Status — Abandoned in brown, apart from Not Read's grey. */
export function doerStyle(s: DoerStatus) {
  return statusBadgeStyle(s === "abandoned" ? "brown" : STATUS_TONES_FALLBACK[s as TaskStatus]);
}

/* ── WCC / MCC's Approver Status ────────────────────────────────────────── */

/** The rulings WCC / MCC offer, in order. */
export const COMPLIANCE_APPROVER_CHOICES = ["approved", "not_approved", "on_hold", "archived"] as const satisfies readonly ApproverChoice[];
export type ComplianceApproverChoice = (typeof COMPLIANCE_APPROVER_CHOICES)[number];

/** WCC / MCC's own words where they differ from WMS Tasks' — "Archive". */
export const COMPLIANCE_APPROVER_LABEL: Partial<Record<ApproverShown, string>> = { archived: "Archive" };

export function isComplianceApproverChoice(v: unknown): v is ComplianceApproverChoice {
  return typeof v === "string" && (COMPLIANCE_APPROVER_CHOICES as readonly string[]).includes(v);
}

/** The rulings this actor may pick on this row now — the WMS rule, over WCC / MCC's four. */
export function complianceApproverChoices(actor: ApproverActor, doer: DoerStatus | null): ComplianceApproverChoice[] {
  return COMPLIANCE_APPROVER_CHOICES.filter((c) => canSetApproverStatus(actor, c, doer).ok);
}
