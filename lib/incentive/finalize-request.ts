import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  incentiveEntries,
  incentivePayoutEvents,
  incentiveParticipants,
  incentiveRequests,
  salaryPayments,
} from "@/db/schema";
import { incentiveLabel } from "@/lib/incentive-amount";
import type { IncentiveSplitShare } from "@/lib/incentive/split";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function requestDate(details: Record<string, string>, fallback: Date): string {
  const candidate = details.incentive_date || details.date || details.event_date;
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)
    ? candidate
    : fallback.toISOString().slice(0, 10);
}

function periodMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function sharesForRequest(split: unknown): IncentiveSplitShare[] | null {
  return Array.isArray(split) && split.length ? (split as IncentiveSplitShare[]) : null;
}

function ledgerName(type: Parameters<typeof incentiveLabel>[0], details: Record<string, string>): string {
  const product = details.product?.trim() || details.products?.trim();
  return product || incentiveLabel(type, details);
}

/**
 * Turn one approved New Incentive Request into the existing incentive ledger.
 * The request row is locked by the caller; the unique request link is a second
 * idempotency guard for retries/concurrent finalization.
 */
export async function finalizeApprovedIncentiveRequest(
  tx: Tx,
  input: { requestId: string; approvedAmount: number; actorId: string; note?: string | null },
): Promise<{ created: boolean; entryId: string }> {
  if (!Number.isFinite(input.approvedAmount) || input.approvedAmount <= 0) {
    throw new Error("An approved incentive amount greater than zero is required.");
  }

  const [request] = await tx
    .select({
      id: incentiveRequests.id,
      employeeId: incentiveRequests.employeeId,
      type: incentiveRequests.type,
      status: incentiveRequests.status,
      details: incentiveRequests.details,
      split: incentiveRequests.split,
      createdAt: incentiveRequests.createdAt,
      employeeName: employees.name,
    })
    .from(incentiveRequests)
    .innerJoin(employees, eq(incentiveRequests.employeeId, employees.id))
    .where(eq(incentiveRequests.id, input.requestId))
    .limit(1);
  if (!request) throw new Error("That incentive request no longer exists.");
  if (request.status !== "approved") throw new Error("Only an approved incentive request can enter the ledger.");

  const [existing] = await tx
    .select({ id: incentiveEntries.id })
    .from(incentiveEntries)
    .where(eq(incentiveEntries.incentiveRequestId, request.id))
    .limit(1)
    .for("update");
  if (existing) return { created: false, entryId: existing.id };

  const entryDate = requestDate(request.details, request.createdAt);
  const month = periodMonth(entryDate);
  const amount = Math.round(input.approvedAmount * 100) / 100;
  const shares = sharesForRequest(request.split);

  const [entry] = await tx
    .insert(incentiveEntries)
    .values({
      incentiveRequestId: request.id,
      entryDate,
      periodMonth: month,
      incentiveName: ledgerName(request.type, request.details),
      empName: request.employeeName,
      employeeId: request.employeeId,
      amount: money(amount),
      approved: true,
      approvedAmt: money(amount),
      approvedDate: entryDate,
      bookedAmt: money(amount),
      accruedAmt: money(amount),
      paid: false,
      paidAmt: "0.00",
      note: input.note?.trim() || "Finalized from New Incentive Request",
    })
    .returning({ id: incentiveEntries.id });
  if (!entry) throw new Error("Incentive ledger insert returned no row.");

  if (shares) {
    let allocated = 0;
    for (const [index, share] of shares.entries()) {
      const shareAmount = index === shares.length - 1
        ? Math.round((amount - allocated) * 100) / 100
        : Math.round((amount * share.pct) / 100 * 100) / 100;
      allocated += shareAmount;
      await tx.insert(incentiveParticipants).values({
        entryId: entry.id,
        periodMonth: month,
        empName: share.name,
        employeeId: share.employeeId,
        bookedAmt: money(shareAmount),
        accruedAmt: money(shareAmount),
        paidAmt: "0.00",
        note: "Finalized from New Incentive Request split",
      });
    }
  }

  return { created: true, entryId: entry.id };
}

/** Reverse a finalized request using the same negative payout/salary ledger
 * semantics as the existing incentive-entry reversal action. */
export async function reverseFinalizedIncentiveRequest(
  tx: Tx,
  input: { requestId: string; actorId: string },
): Promise<void> {
  const [entry] = await tx
    .select()
    .from(incentiveEntries)
    .where(and(eq(incentiveEntries.incentiveRequestId, input.requestId), eq(incentiveEntries.reversed, false)))
    .for("update");
  if (!entry) return;

  const participants = await tx
    .select()
    .from(incentiveParticipants)
    .where(eq(incentiveParticipants.entryId, entry.id))
    .for("update");
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const legs = participants.length
    ? participants.map((participant) => ({
        employeeId: participant.employeeId,
        empName: participant.empName,
        paid: Number(participant.paidAmt),
        salaryRunId: participant.payoutRunId,
        source: "participant" as const,
        sourceId: participant.id,
      }))
    : [{
        employeeId: entry.employeeId,
        empName: entry.empName,
        paid: Number(entry.paidAmt),
        salaryRunId: entry.payoutRunId,
        source: "entry" as const,
        sourceId: entry.id,
      }];
  for (const leg of legs) {
    const paid = Math.round(Math.max(0, leg.paid) * 100) / 100;
    if (paid <= 0) continue;
    const amount = money(-paid);
    await tx.insert(incentivePayoutEvents).values({
      employeeId: leg.employeeId,
      empName: leg.empName,
      source: leg.source,
      sourceId: leg.sourceId,
      salaryRunId: leg.salaryRunId,
      periodMonth: entry.periodMonth,
      amount,
      paidDate: today,
      createdById: input.actorId,
      note: "negative payable adjustment from reversed incentive request",
    });
    await tx.insert(salaryPayments).values({
      employeeId: leg.employeeId,
      salaryRunId: leg.salaryRunId,
      month: entry.periodMonth ? String(entry.periodMonth).slice(0, 7) : null,
      kind: "incentive",
      incentiveEntryId: entry.id,
      amount,
      paidDate: today,
      method: "reversal",
      note: "Reversed incentive request",
      createdById: input.actorId,
    });
  }
  await tx
    .update(incentiveEntries)
    .set({ reversed: true, reversedAt: new Date(), reversedById: input.actorId, updatedAt: new Date() })
    .where(eq(incentiveEntries.id, entry.id));
}
