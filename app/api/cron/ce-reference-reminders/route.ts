import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ceAccounts, ceReferences, ceTeamMembers, notifications } from "@/db/schema";
import { localDateString } from "@/lib/format";
import { accountLabel, referenceProgramLabel } from "@/lib/client-engagement/constants";
import { needsWeeklyReminder } from "@/lib/client-engagement/references";
import { mondayOf } from "@/lib/client-engagement/schedule";

/**
 * Client Engagement — the weekly reference reminder (brief: "for accounts marked
 * Every Week, trigger weekly task notifications for the assigned collector until
 * the target is met").
 *
 * Every Monday, one in-app notification per unmet Every Week quota, to the
 * collector's login. `last_reminded_on` is stamped per quota, so a second run in
 * the same week (a retry, a manual trigger) sends nothing twice. A collector with
 * no login linked is skipped — there is nobody to notify — and is picked up the
 * week their login is linked.
 *
 * In-app only and inserted directly, like the ambassador reminders, so it
 * bypasses the notification matrix. Vercel sends `Authorization: Bearer
 * <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = localDateString("Asia/Kolkata");
  const monday = mondayOf(today);
  let sent = 0;
  let skipped = 0;

  try {
    const rows = await db
      .select({
        ref: ceReferences,
        accountName: ceAccounts.fullName,
        batchCode: ceAccounts.batchCode,
        collectorEmployeeId: ceTeamMembers.employeeId,
      })
      .from(ceReferences)
      .innerJoin(ceAccounts, eq(ceAccounts.id, ceReferences.accountId))
      .leftJoin(ceTeamMembers, eq(ceTeamMembers.id, ceReferences.collectorId))
      .where(eq(ceReferences.frequency, "every_week"));

    for (const { ref, accountName, batchCode, collectorEmployeeId } of rows) {
      if (!needsWeeklyReminder(ref, monday)) continue;
      if (!collectorEmployeeId) {
        skipped++;
        continue;
      }
      const left = ref.targetCount - ref.actualCollected;
      try {
        await db.insert(notifications).values({
          userId: collectorEmployeeId,
          kind: "ce_reference_reminder",
          title: `References to collect: ${accountLabel(accountName, batchCode)}`,
          body: `${left} more ${referenceProgramLabel(ref.targetProgram)} reference${left === 1 ? "" : "s"} to collect (${ref.actualCollected} of ${ref.targetCount}).`,
          taskId: null,
          eventId: null,
          actorId: null,
        });
        await db.update(ceReferences).set({ lastRemindedOn: today }).where(eq(ceReferences.id, ref.id));
        sent++;
      } catch (err) {
        console.error("[cron/ce-reference-reminders] insert failed", err);
      }
    }
  } catch (err) {
    // The tables may not exist yet (0238 not applied) — that is not an outage.
    console.error("[cron/ce-reference-reminders] query failed", err);
  }

  return NextResponse.json({ ok: true, sent, skipped });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
