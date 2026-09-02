import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { hrConfirmationReminders, notifications } from "@/db/schema";
import { getSalaryConfig } from "@/lib/salary/config";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";
import { hrConfirmationReminderOn } from "@/lib/reports/flags";

/**
 * Daily HR nudge (Sir #38/#39) — when a person's PROBATION or FREE-TRAINING period
 * is ending, notify the super-admins (who issue the confirmation letters in
 * Agreements). Each (person, kind) fires EXACTLY ONCE via `hr_confirmation_reminders`.
 *
 * Registered `0 4 * * *` (~09:30 IST). DEFAULT OFF via `HR_CONFIRMATION_REMINDER_ON`
 * — a no-op until flipped. Auth: Bearer CRON_SECRET. Node runtime.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** IST "today" as YYYY-MM-DD. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
function addDaysIso(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hrConfirmationReminderOn()) {
    return NextResponse.json({ ok: true, skipped: "HR_CONFIRMATION_REMINDER_ON is off" });
  }

  const today = istToday();
  const cfg = await getSalaryConfig();
  const freeTrainingDays = Math.max(0, cfg.freeTrainingDays ?? 0);

  // Super-admins receive the in-app nudge (they run Agreements).
  const admins = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.isActive, true), inArray(employees.email, [...SUPER_ADMIN_EMAILS])));
  const adminIds = admins.map((a) => a.id);

  const roster = await db
    .select({ id: employees.id, name: employees.name, joinedAt: employees.joinedAt, probationEnd: employees.probationEnd })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.joinedAt)));

  // Bound the windows so first activation doesn't flood on long-past dates.
  const probFrom = addDaysIso(today, -30);
  const probTo = addDaysIso(today, 7); // remind up to a week before probation ends
  const trainTo = addDaysIso(today, 3); // free-training ends within 3 days

  type Due = { emp: { id: string; name: string | null }; kind: "probation" | "training"; endDate: string };
  const dueList: Due[] = [];

  for (const e of roster) {
    if (e.probationEnd) {
      const end = String(e.probationEnd).slice(0, 10);
      if (end >= probFrom && end <= probTo) dueList.push({ emp: e, kind: "probation", endDate: end });
    }
    if (freeTrainingDays > 0 && e.joinedAt) {
      const end = addDaysIso(new Date(e.joinedAt).toISOString().slice(0, 10), freeTrainingDays);
      if (end >= probFrom && end <= trainTo) dueList.push({ emp: e, kind: "training", endDate: end });
    }
  }

  let reminded = 0;
  for (const d of dueList) {
    // Claim the reminder once (unique on employee+kind).
    const claimed = await db
      .insert(hrConfirmationReminders)
      .values({ employeeId: d.emp.id, kind: d.kind })
      .onConflictDoNothing({ target: [hrConfirmationReminders.employeeId, hrConfirmationReminders.kind] })
      .returning({ id: hrConfirmationReminders.id });
    if (claimed.length === 0) continue; // already reminded

    const label = d.kind === "probation" ? "probation" : "free-training";
    const title = d.kind === "probation" ? "Issue appointment confirmation" : "Issue training-completion confirmation";
    const body = `${d.emp.name ?? "An employee"}'s ${label} period ends ${d.endDate} — issue the confirmation letter in Agreements.`;
    for (const adminId of adminIds) {
      try {
        await db.insert(notifications).values({
          userId: adminId,
          kind: "hr_confirmation_due",
          title,
          body,
          taskId: null,
          eventId: null,
          actorId: null,
        });
      } catch (err) {
        console.error(`[cron/hr-confirmations] notify failed for ${adminId}`, err);
      }
    }
    reminded++;
  }

  return NextResponse.json({ ok: true, date: today, candidates: dueList.length, reminded, admins: adminIds.length });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
