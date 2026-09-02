import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs } from "@/db/schema";
import { localDateString } from "@/lib/format";
import { compulsoryPunchoutOn } from "@/lib/goals/flag";

/**
 * Compulsory punch-out enforcement (Goals Cascade design, decision 2).
 *
 * Runs late in the IST day (23:30). Anyone who clocked IN today but never
 * clocked OUT gets a SYSTEM out-punch stamped at their clock-in time — so the
 * day finalizes as a Half-Day (H/D, 0.5) via the normal grade (worked ≈ 0 <
 * halfDayMinutes) instead of sitting "incomplete" (0). This is the penalty for
 * forgetting to clock out: half a day, not a full day, not nothing.
 *
 * GATED on `compulsoryPunchoutOn()` (COMPULSORY_PUNCHOUT_ON) — default OFF, so
 * this is a hard no-op until Hetesh flips it on. Idempotent: the out-punch is
 * inserted onConflictDoNothing against the (employee, day, kind) unique index,
 * so re-runs (or a real out that lands first) never double-write. The stamp is
 * `source:"admin", reason:"forgot", verifyMethod:"none", recordedById:null` —
 * a system correction, distinguishable from a self or admin punch in the log.
 *
 * Vercel sets `Authorization: Bearer <CRON_SECRET>`. Node runtime for postgres-js.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Hard no-op until the compulsory-punchout policy is switched on.
  if (!compulsoryPunchoutOn()) {
    return NextResponse.json({ ok: true, skipped: "compulsory_punchout_off" });
  }

  const today = localDateString(TZ);

  // Today's punches (small daily set — one team). Pair up in JS.
  const rows = await db
    .select({
      employeeId: attendanceLogs.employeeId,
      kind: attendanceLogs.kind,
      loggedAt: attendanceLogs.loggedAt,
    })
    .from(attendanceLogs)
    .where(eq(attendanceLogs.logDate, today));

  const inAt = new Map<string, Date>();
  const hasOut = new Set<string>();
  for (const r of rows) {
    if (r.kind === "in") inAt.set(r.employeeId, r.loggedAt);
    else hasOut.add(r.employeeId);
  }

  const missing = [...inAt.entries()].filter(([id]) => !hasOut.has(id));
  let closed = 0;
  for (const [employeeId, loggedAt] of missing) {
    try {
      const res = await db
        .insert(attendanceLogs)
        .values({
          employeeId,
          logDate: today,
          kind: "out",
          // = clock-in time, so the pair reads as ZERO minutes worked. That
          // does NOT grade half-day on its own — the ordinary three-tier rule
          // puts zero below the half-day floor and returns Absent. What makes
          // this a half-day is the grader recognising this exact row shape
          // (admin + forgot + no recordedById) and setting DayContext.autoClosed;
          // see isAutoPunchOut in lib/queries/attendance-status.ts. Change the
          // stamp, the source or the reason here and that link silently breaks.
          loggedAt,
          source: "admin",
          reason: "forgot",
          verifyMethod: "none",
          note: "Auto punch-out — no manual clock-out (compulsory punch-out policy → half-day).",
        })
        .onConflictDoNothing({
          target: [attendanceLogs.employeeId, attendanceLogs.logDate, attendanceLogs.kind],
        })
        .returning({ id: attendanceLogs.id });
      if (res.length > 0) closed++;
    } catch (err) {
      console.error(`[cron/attendance-autoout] insert failed for ${employeeId}`, err);
    }
  }

  return NextResponse.json({ ok: true, date: today, candidates: missing.length, closed });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
