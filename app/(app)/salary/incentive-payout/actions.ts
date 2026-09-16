"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  incentiveEntries,
  incentiveParticipants,
  incentivePayoutEvents,
  incentiveProjects,
  salaryPayments,
  salaryRuns,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { incentivePayoutEnabled, INCENTIVE_PAYOUT_FLAG } from "@/lib/incentive/payout-flag";
import {
  foldIncentiveSources,
  monthEndExclusive,
  sourcesForPerson,
} from "@/lib/incentive/payout-sources";
import { planIncentivePayout, round2 } from "@/lib/incentive/payout-math";
import { afterResponse } from "@/lib/after";
import { notifyIncentivesPaid, type PaidNotificationInput } from "@/lib/incentive/notifications/service";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const money2 = (n: number): string => round2(n).toFixed(2);

/** Sentinel thrown to abort the transaction if the flag flips mid-flight. */
class PayoutDisabledError extends Error {}

const Schema = z
  .object({
    /** The salary run to pay the incentive against — supplies the person + month. */
    salaryRunId: z.string().uuid(),
    /** Payable ceiling basis. "accrued" (default) = only what the client fully paid. */
    basis: z.enum(["accrued", "approved"]).default("accrued"),
    /** Payout date (YYYY-MM-DD); defaults to today (IST). */
    paidDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
      .optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

function todayIstIso(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function flagError(): { ok: false; error: string } {
  return { ok: false, error: `Incentive payout is turned off (${INCENTIVE_PAYOUT_FLAG}).` };
}

/**
 * WS-6 — pay a person's incentive FROM THE SAME PLACE as salary.
 *
 * For the employee + month behind `salaryRunId`, this records the incentive
 * PAYOUT (bookkeeping only — see the integration note; it does NOT disburse to a
 * bank). For each of the person's payable incentive legs (entry / project leg /
 * team-split participant) it, inside ONE transaction:
 *   1. re-reads the month's ledger rows FOR UPDATE (serialises concurrent runs),
 *   2. plans the payout — `payNow = max(0, ceiling − alreadyPaid)`,
 *   3. sets the leg's paid amount + date + `payout_run_id` (+ `paid` flag),
 *   4. inserts an `incentive_payout_events` audit row, and
 *   5. inserts a `salary_payments` row with `kind = 'incentive'` linked to the run.
 *
 * IDEMPOTENT: because `payNow` is `max(0, ceiling − alreadyPaid)`, a re-run (or a
 * double-click) pays 0 and writes no rows for already-settled legs — no
 * double-pay. GATED: no-op unless `INCENTIVE_PAYOUT=true`, re-checked inside the
 * transaction. Admin-only + rate-limited.
 */
export async function payIncentivesWithRun(
  input: unknown,
): Promise<ActionResult<{ paidCount: number; totalPaid: number; skipped: number; remainderAfter: number }>> {
  // Flag gate #1 (fast path).
  if (!incentivePayoutEnabled()) return flagError();

  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const paidDate = v.paidDate ?? todayIstIso();

  try {
    const result = await db.transaction(async (tx) => {
      // Flag gate #2 — re-read inside the transaction; abort if flipped off.
      if (!incentivePayoutEnabled()) throw new PayoutDisabledError();

      const [run] = await tx
        .select({
          id: salaryRuns.id,
          employeeId: salaryRuns.employeeId,
          month: salaryRuns.month,
        })
        .from(salaryRuns)
        .where(eq(salaryRuns.id, v.salaryRunId))
        .limit(1);
      if (!run) return { kind: "err" as const, error: "Salary run not found." };

      const month = run.month; // YYYY-MM
      const start = `${month}-01`;
      const end = monthEndExclusive(month);

      // Locked reads of the whole month's ledger — serialises concurrent payouts
      // for the month so two submits can never both see an unpaid leg.
      const [entries, projects, participants] = await Promise.all([
        tx
          .select()
          .from(incentiveEntries)
          .where(and(gte(incentiveEntries.periodMonth, start), lt(incentiveEntries.periodMonth, end)))
          .for("update"),
        tx
          .select()
          .from(incentiveProjects)
          .where(and(gte(incentiveProjects.periodMonth, start), lt(incentiveProjects.periodMonth, end)))
          .for("update"),
        tx
          .select()
          .from(incentiveParticipants)
          .where(
            and(
              gte(incentiveParticipants.periodMonth, start),
              lt(incentiveParticipants.periodMonth, end),
            ),
          )
          .for("update"),
      ]);

      const folded = foldIncentiveSources(entries, projects, participants);
      // Match by employeeId; a name match is also allowed via any leg that
      // already resolved to this employeeId. We look the person's name up from
      // the folded legs that carry this employeeId, then widen by that name.
      const byEmp = folded.filter((s) => s.employeeId === run.employeeId);
      const personName = byEmp[0]?.empName ?? null;
      const mine = sourcesForPerson(folded, { employeeId: run.employeeId, name: personName });

      const plan = planIncentivePayout(
        mine.map((s) => ({
          key: s.key,
          approved: s.approved,
          booked: s.booked,
          accrued: s.accrued,
          paid: s.paid,
        })),
        v.basis,
      );
      const bySource = new Map(mine.map((s) => [s.key, s] as const));

      // Labels for the "incentive paid" notices only — read off the rows already
      // loaded above; nothing below this changes what is paid.
      const entryName = new Map(entries.map((e) => [e.id, e.incentiveName] as const));
      const projectName = new Map(
        projects.map((p) => [p.id, p.projectName ?? p.subject ?? "Project incentive"] as const),
      );
      const participantById = new Map(participants.map((p) => [p.id, p] as const));
      const labelFor = (src: (typeof mine)[number]): string | null => {
        if (src.table === "entry") return entryName.get(src.rowId) ?? null;
        if (src.table === "project") return projectName.get(src.rowId) ?? null;
        const part = participantById.get(src.rowId);
        if (part?.entryId) return entryName.get(part.entryId) ?? null;
        if (part?.projectId) return projectName.get(part.projectId) ?? null;
        return null;
      };
      const paidNotices: PaidNotificationInput[] = [];

      let paidCount = 0;
      let totalPaid = 0;
      let skipped = 0;

      for (const leg of plan.sources) {
        const src = bySource.get(leg.key);
        if (!src) continue;
        if (leg.payNow <= 0) {
          skipped += 1;
          continue;
        }

        // 1) mark the incentive leg paid + link to the run.
        if (src.table === "entry") {
          await tx
            .update(incentiveEntries)
            .set({
              paidAmt: money2(leg.newPaidTotal),
              paid: true,
              paidDate,
              payoutRunId: v.salaryRunId,
              paidById: me.id,
              updatedAt: new Date(),
            })
            .where(eq(incentiveEntries.id, src.rowId));
        } else if (src.table === "project") {
          const set =
            src.leg === "supervisor"
              ? { empPaidAmt: money2(leg.newPaidTotal) }
              : { internPaidAmt: money2(leg.newPaidTotal) };
          await tx
            .update(incentiveProjects)
            .set({
              ...set,
              paid: true,
              paidDate,
              payoutRunId: v.salaryRunId,
              updatedAt: new Date(),
            })
            .where(eq(incentiveProjects.id, src.rowId));
        } else {
          await tx
            .update(incentiveParticipants)
            .set({
              paidAmt: money2(leg.newPaidTotal),
              paidDate,
              payoutRunId: v.salaryRunId,
              updatedAt: new Date(),
            })
            .where(eq(incentiveParticipants.id, src.rowId));
        }

        // 2) audit event.
        const [audit] = await tx
          .insert(incentivePayoutEvents)
          .values({
            employeeId: src.employeeId ?? run.employeeId ?? null,
            empName: src.empName,
            source: src.table,
            sourceId: src.rowId,
            salaryRunId: v.salaryRunId,
            periodMonth: src.periodMonth ?? `${month}-01`,
            amount: money2(leg.payNow),
            paidDate,
            createdById: me.id,
            note: [src.leg ? `${src.leg} leg` : null, v.note ?? null].filter(Boolean).join(" · ") || null,
          })
          .returning({ id: incentivePayoutEvents.id });
        if (audit) {
          // The payout event IS the "paid" event: its id versions the notice.
          paidNotices.push({
            employeeId: src.employeeId ?? run.employeeId ?? null,
            subjectId: src.rowId,
            versionKey: `payout-event:${audit.id}`,
            label: labelFor(src),
            amount: leg.payNow,
            paidDate,
            periodMonth: src.periodMonth ?? `${month}-01`,
            actorId: me.id,
          });
        }

        // 3) salary ledger row (kind='incentive'), linked to the same run.
        await tx.insert(salaryPayments).values({
          employeeId: src.employeeId ?? run.employeeId ?? null,
          salaryRunId: v.salaryRunId,
          month,
          kind: "incentive",
          incentiveEntryId: src.incentiveEntryId ?? null,
          amount: money2(leg.payNow),
          paidDate,
          method: "with_salary",
          note: v.note ?? null,
          createdById: me.id,
        });

        paidCount += 1;
        totalPaid = round2(totalPaid + leg.payNow);
      }

      return {
        kind: "ok" as const,
        paidCount,
        totalPaid,
        skipped,
        remainderAfter: plan.remainderAfter,
        paidNotices,
      };
    });

    if (result.kind === "err") return { ok: false, error: result.error };

    // Committed — tell each paid employee, after the response.
    if (result.paidNotices.length > 0) {
      const notices = result.paidNotices;
      afterResponse(() => notifyIncentivesPaid(notices));
    }

    revalidatePath("/salary/incentive-payout");
    revalidatePath("/salary");
    revalidatePath("/incentive");
    return {
      ok: true,
      paidCount: result.paidCount,
      totalPaid: result.totalPaid,
      skipped: result.skipped,
      remainderAfter: result.remainderAfter,
    };
  } catch (err: unknown) {
    if (err instanceof PayoutDisabledError) return flagError();
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
}
