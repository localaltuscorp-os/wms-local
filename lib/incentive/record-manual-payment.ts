import "server-only";

import { db } from "@/lib/db";
import { incentivePayoutEvents, salaryPayments } from "@/db/schema";
import { round2 } from "@/lib/incentive/payout-math";

/**
 * WHEN "PAID" IS RECORDED BY HAND, THE LEDGER MUST SAY SO TOO.
 *
 * The Entries editor and the Status editor both let an administrator record a
 * paid amount directly. Until now that wrote `incentive_entries.paid_amt` and
 * fired the paid notice, but wrote NOTHING to `salary_payments` — the table the
 * salary payout ledger and the Accounts adjustment column read. So an incentive
 * paid by hand appeared, in every money view, as if no money had moved: the
 * paid figure was right on the entry and missing from the ledger beside it.
 *
 * This is the missing half. It is called INSIDE the caller's transaction, after
 * the entry has been updated, and it records exactly the INCREASE — the same
 * number the paid notice was computed from — so re-saving an unchanged amount
 * writes nothing, and a later top-up records only the difference.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * It is not a second payout path: `payIncentivesWithRun` (the salary run) still
 * owns payments made WITH a salary run and writes its own row with
 * `method: "with_salary"`. This writes `method: "manual_entry"`, which is how a
 * reader tells the two apart — and why an administrator's manual figure is never
 * mistaken for a run a payroll report should reconcile.
 *
 * The audit event is written for the same reason the payout action writes one:
 * the money trail is a table of events, and a payment with no event is a payment
 * nobody can point at six months later.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ManualPaymentInput {
  /**
   * The `incentive_entries` row the money belongs to. NULL for a project leg or
   * a split participant — those parents have no entry row, so the ledger line
   * carries the employee and the month instead, exactly as the payout action's
   * own rows do (`incentiveEntryId: src.incentiveEntryId ?? null`).
   */
  entryId: string | null;
  /** Which ledger the money came from — also the audit event's `source`. */
  eventSource?: "entry" | "project" | "participant";
  employeeId: string | null;
  /** The employee's display name, for the audit event. */
  empName: string | null;
  /** "YYYY-MM-DD" — the entry's period month, or the payment date when unset. */
  periodMonth: string | null;
  paidDate: string | null;
  /** How much MORE is now recorded as paid. Zero or negative writes nothing. */
  increase: number;
  /** Which editor recorded it — named in the ledger note. */
  source: "entries" | "status" | "split";
  note?: string | null;
  actorId: string;
}

/** True when this write actually has money to record. */
export function hasManualPaymentAmount(increase: number): boolean {
  return Number.isFinite(increase) && increase > 0;
}

/** The note on the ledger row and the audit event. */
export function manualPaymentNote(
  source: ManualPaymentInput["source"],
  note?: string | null,
): string {
  const label =
    source === "entries"
      ? "Entries editor"
      : source === "status"
        ? "Status editor"
        : "Split editor";
  return [`Recorded by hand · ${label}`, note ?? null].filter(Boolean).join(" · ");
}

/**
 * Record the manual payment: a positive `salary_payments` row linked to the
 * entry, plus its audit event. No-op when there is nothing to record.
 *
 * Runs in the CALLER'S transaction, so the entry update and this row commit
 * together — a failure cannot leave an entry claiming money the ledger has
 * never heard of.
 */
export async function recordManualIncentivePayment(
  tx: Tx,
  input: ManualPaymentInput,
): Promise<boolean> {
  if (!hasManualPaymentAmount(input.increase)) return false;

  const amount = String(round2(input.increase));
  const note = manualPaymentNote(input.source, input.note);

  await tx.insert(incentivePayoutEvents).values({
    employeeId: input.employeeId,
    empName: input.empName,
    source: input.eventSource ?? "entry",
    sourceId: input.entryId,
    salaryRunId: null,
    periodMonth: input.periodMonth,
    amount,
    paidDate: input.paidDate,
    createdById: input.actorId,
    note,
  });

  await tx.insert(salaryPayments).values({
    employeeId: input.employeeId,
    salaryRunId: null,
    month: input.periodMonth ? input.periodMonth.slice(0, 7) : null,
    kind: "incentive",
    incentiveEntryId: input.entryId,
    amount,
    paidDate: input.paidDate,
    method: "manual_entry",
    note,
    createdById: input.actorId,
  });

  return true;
}
