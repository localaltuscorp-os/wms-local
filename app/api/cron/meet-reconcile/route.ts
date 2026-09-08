import { NextResponse } from "next/server";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db, workSessions } from "@/lib/db";
import { listParticipantSessions } from "@/lib/meet/client";

/**
 * Meet reconcile cron — Phase-2 "project / remote work sessions", MEET HOURS
 * path. The webhook (app/api/meet/events) books minutes from the live
 * join/leave events, but those can be lost/duplicated (Pub/Sub is at-least-once,
 * and a browser crash may drop the `left`). This job re-derives the AUTHORITATIVE
 * minutes from the Meet REST API `conferenceRecords.participants.participantSessions`
 * (each session has startTime/endTime) and stamps the row `reconciled`.
 *
 * No feature flag: with no Meet sessions in the DB (the case until Meet is
 * wired up) the scan returns nothing and this is a clean daily no-op. Scheduled
 * live in vercel.json; it simply starts reconciling once Meet sessions exist.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` — identical constant-shape 401 to
 * app/api/cron/salary-sync so the response never reveals whether the secret is
 * set.
 *
 * Manual test:
 *   curl -X POST https://wms.mananvasa.com/api/cron/meet-reconcile -H "Authorization: Bearer $CRON_SECRET"
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** How far back to look for closed sessions still needing reconciliation. */
const LOOKBACK_HOURS = 48;

async function handle(request: Request): Promise<NextResponse> {
  // Constant-shape rejection — never reveal whether CRON_SECRET is set.
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No feature flag: with no Meet sessions in the DB (the case until Meet is
  // wired up) the query below returns nothing and this is a clean no-op.
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);

  try {
    // Recently-closed Meet sessions that carry a conference record to reconcile.
    const rows = await db
      .select({
        id: workSessions.id,
        conferenceRecord: workSessions.meetConferenceRecord,
        participant: workSessions.meetParticipant,
      })
      .from(workSessions)
      .where(
        and(
          eq(workSessions.source, "meet"),
          eq(workSessions.status, "closed"),
          isNotNull(workSessions.meetConferenceRecord),
          gte(workSessions.updatedAt, since),
        ),
      );

    let reconciled = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.conferenceRecord) continue;
      try {
        const sessions = await listParticipantSessions(
          row.conferenceRecord,
          row.participant ?? undefined,
        );
        const minutes = sumSessionMinutes(sessions);
        await db
          .update(workSessions)
          .set({
            totalMinutes: minutes.toFixed(2),
            status: "reconciled",
            updatedAt: new Date(),
          })
          .where(eq(workSessions.id, row.id));
        reconciled += 1;
      } catch (err) {
        // One conference failing must not abort the batch.
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: rows.length,
      reconciled,
      errors: errors.length,
    });
  } catch (err) {
    console.error("[cron/meet-reconcile] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** Sum every participant session's (endTime − startTime) into whole minutes. */
function sumSessionMinutes(
  sessions: { startTime?: string; endTime?: string }[],
): number {
  let ms = 0;
  for (const s of sessions) {
    if (!s.startTime || !s.endTime) continue;
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      ms += end - start;
    }
  }
  return ms / 60000;
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
