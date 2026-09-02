import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, ambActivities, ambReferrals, ambAmbassadors } from "@/db/schema";
import { STAGE_LABELS, type Stage } from "@/lib/ambassadors/stages";

/**
 * Ambassadors daily reminder cron. Two nudges, both in-app only (no email), so
 * they're load-neutral and bypass the notification matrix:
 *   1) Due reminders — `amb_activities` rows with a `remind_at` in the recent
 *      past that aren't done yet → ping whoever set them (the owner).
 *   2) Stalled referrals — open referrals untouched for 14–21 days → ping the
 *      assigned salesperson (or the ambassador's owner) to move them along.
 * The 14–21d / 3-day windows bound how long a single item keeps nudging.
 * Vercel sets `Authorization: Bearer <CRON_SECRET>` automatically.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_STAGES: Stage[] = ["received", "assigned", "qualified", "meeting", "proposal", "negotiation"];

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let reminders = 0;
  let stalled = 0;

  // 1) Due reminders (fired within the last 3 days, still open).
  try {
    const due = await db
      .select({
        id: ambActivities.id,
        ambassadorId: ambActivities.ambassadorId,
        ownerId: ambAmbassadors.ownerId,
        createdById: ambActivities.createdById,
        title: ambActivities.title,
        body: ambActivities.body,
        ambassadorName: ambAmbassadors.name,
      })
      .from(ambActivities)
      .innerJoin(ambAmbassadors, eq(ambAmbassadors.id, ambActivities.ambassadorId))
      .where(
        and(
          eq(ambActivities.done, false),
          sql`${ambActivities.remindAt} is not null`,
          sql`${ambActivities.remindAt} <= now()`,
          sql`${ambActivities.remindAt} >= now() - interval '3 days'`,
        ),
      );
    for (const r of due) {
      const userId = r.createdById ?? r.ownerId;
      if (!userId) continue;
      try {
        await db.insert(notifications).values({
          userId,
          kind: "ambassador_reminder",
          title: r.title || `Reminder: ${r.ambassadorName}`,
          body: r.body || `You set a reminder for ${r.ambassadorName}. Tap to follow up.`,
          taskId: null, eventId: null, actorId: null,
        });
        reminders++;
      } catch (err) {
        console.error(`[cron/ambassador-reminders] reminder insert failed`, err);
      }
    }
  } catch (err) {
    console.error(`[cron/ambassador-reminders] due-reminder query failed`, err);
  }

  // 2) Stalled referrals (open, untouched 14–21 days).
  try {
    const refs = await db
      .select({
        id: ambReferrals.id,
        ambassadorId: ambReferrals.ambassadorId,
        prospectName: ambReferrals.prospectName,
        stage: ambReferrals.stage,
        assignedToId: ambReferrals.assignedToId,
        ownerId: ambAmbassadors.ownerId,
        ambassadorName: ambAmbassadors.name,
      })
      .from(ambReferrals)
      .innerJoin(ambAmbassadors, eq(ambAmbassadors.id, ambReferrals.ambassadorId))
      .where(
        and(
          eq(ambReferrals.outcome, "open"),
          sql`${ambReferrals.stage} = any(${STALE_STAGES})`,
          sql`${ambReferrals.updatedAt} < now() - interval '14 days'`,
          sql`${ambReferrals.updatedAt} >= now() - interval '21 days'`,
        ),
      );
    for (const r of refs) {
      const userId = r.assignedToId ?? r.ownerId;
      if (!userId) continue;
      try {
        await db.insert(notifications).values({
          userId,
          kind: "ambassador_reminder",
          title: `Referral stalled: ${r.prospectName}`,
          body: `${r.ambassadorName}'s referral "${r.prospectName}" has sat in ${STAGE_LABELS[r.stage as Stage]} for 2 weeks. Tap to move it forward.`,
          taskId: null, eventId: null, actorId: null,
        });
        stalled++;
      } catch (err) {
        console.error(`[cron/ambassador-reminders] stalled insert failed`, err);
      }
    }
  } catch (err) {
    console.error(`[cron/ambassador-reminders] stalled query failed`, err);
  }

  return NextResponse.json({ ok: true, reminders, stalled });
}

export async function GET(request: Request): Promise<NextResponse> { return run(request); }
export async function POST(request: Request): Promise<NextResponse> { return run(request); }
