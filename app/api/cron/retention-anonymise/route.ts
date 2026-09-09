import { NextResponse } from "next/server";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dataRetentionPolicies,
  employeeExits,
  employees,
  settingsEvents,
} from "@/db/schema";
import { anonymisedIdentity } from "@/lib/employees/offboarding";

/**
 * RETENTION ANONYMISATION — the terminal state for a former employee.
 *
 * ── WHY ANONYMISE RATHER THAN DELETE ───────────────────────────────────────
 * When retention finally expires, the personal data has to go. Deleting the
 * ROW cannot be how that happens: `actor_id` is ON DELETE RESTRICT across
 * employee_events, task_events and settings_events, so a delete would once
 * again require destroying the audit trail first — the exact behaviour
 * migration 0212 existed to remove. Worse, it would knock holes in headcount
 * history and every join that resolves an actor name.
 *
 * So the row survives and its PII is replaced with a stable placeholder. The
 * personal data is genuinely gone; the referential shell that history depends
 * on is not.
 *
 * ── WHAT STOPS IT ──────────────────────────────────────────────────────────
 * Three independent brakes, all of which must be released:
 *   1. `data_retention_policies.purge_enabled` for `employee_pii` — OFF by
 *      default, so this cron is a no-op until someone deliberately arms it.
 *   2. `employees.legal_hold` — never touched, whatever the clock says.
 *   3. The retention period itself, measured from the archive date.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, as every other cron here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RECORD_CLASS = "employee_pii";

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [policy] = await db
    .select()
    .from(dataRetentionPolicies)
    .where(eq(dataRetentionPolicies.recordClass, RECORD_CLASS))
    .limit(1);

  if (!policy) {
    return NextResponse.json({ ok: true, skipped: "no policy row", anonymised: 0 });
  }
  if (!policy.purgeEnabled) {
    // The normal state. Say so explicitly rather than reporting a silent
    // success, so an operator reading the cron log can tell "disarmed" apart
    // from "armed and found nothing".
    return NextResponse.json({
      ok: true,
      skipped: "purge_enabled is false for employee_pii",
      anonymised: 0,
    });
  }

  const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);

  const due = await db
    .select({
      id: employees.id,
      name: employees.name,
      archivedAt: employeeExits.archivedAt,
    })
    .from(employees)
    .innerJoin(employeeExits, eq(employeeExits.employeeId, employees.id))
    .where(
      and(
        eq(employees.employmentStatus, "former"),
        eq(employees.legalHold, false),
        isNull(employees.anonymisedAt),
        lt(employeeExits.archivedAt, cutoff),
      ),
    )
    .limit(200);

  let anonymised = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of due) {
    const identity = anonymisedIdentity(row.id);
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(employees)
          .set({
            name: identity.name,
            email: identity.email,
            employmentStatus: "anonymised",
            anonymisedAt: new Date(),
            // Contact details are the point of the exercise.
            phone: null,
            personalEmail: null,
            officialEmail: null,
            slackUserId: null,
            googleEmail: null,
            avatarUrl: null,
            avatarPath: null,
          })
          .where(eq(employees.id, row.id));

        // The exit record keeps WHY they left and WHERE the work went — both
        // organisational facts — but loses the free-text fields, which are the
        // ones that carry personal detail.
        await tx
          .update(employeeExits)
          .set({ rehireNote: null, notes: null, exitInterview: null })
          .where(eq(employeeExits.employeeId, row.id));
      });
      anonymised++;
    } catch (err) {
      failures.push({
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Audited under the system: a data change nobody clicked still has to be
  // explainable afterwards.
  if (anonymised > 0 || failures.length > 0) {
    try {
      const [anyAdmin] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.isAdmin, true), eq(employees.employmentStatus, "active")))
        .limit(1);
      if (anyAdmin) {
        await db.insert(settingsEvents).values({
          scope: "employees",
          targetId: null,
          actorId: anyAdmin.id,
          eventType: "retention_anonymised",
          fromValue: { recordClass: RECORD_CLASS, retentionDays: policy.retentionDays },
          toValue: { anonymised, failures },
        });
      }
    } catch (err) {
      console.error("[cron/retention-anonymise] audit write failed", err);
    }
  }

  return NextResponse.json({ ok: true, considered: due.length, anonymised, failures });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
