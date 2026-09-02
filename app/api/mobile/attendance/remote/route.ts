import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { attendanceLogs } from "@/db/schema";
import type { PunchReason } from "@/db/enums";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { localDateString } from "@/lib/format";
import { withTimeout } from "@/lib/db/with-timeout";
import { assertRemoteWorkApproved } from "@/lib/attendance/remote-work";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const REMOTE_MODES = ["wfh", "client_site", "field", "other"] as const;

const RemoteSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    workMode: z.enum(REMOTE_MODES),
    reason: z.string().trim().min(1, "A reason / note is required.").max(500),
    lat: z.number().finite(),
    lng: z.number().finite(),
    accuracyM: z.number().finite().nonnegative().optional(),
    // A Supabase Storage path the app has already uploaded the evidence photo to
    // (via /api/mobile/storage/sign — which forces the `<employeeId>/…` prefix).
    evidencePath: z.string().trim().min(1, "A photo is required."),
  })
  .strict();

/**
 * POST /api/mobile/attendance/remote — WFH / on-site remote check-in, the mobile
 * twin of the web `punchRemote`. No geofence (that's the point): captures
 * location + a required reason + a work-mode tag + an evidence photo (uploaded
 * beforehand via /api/mobile/storage/sign, its path passed here). Logs a normal
 * punch (auto-present) carrying `workMode` + `evidencePath` so admins review it
 * with the same badge + photo the web report shows. One punch per kind per day.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = RemoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const d = parsed.data;

  // The evidence must live under the caller's own storage folder — the same
  // guard /api/mobile/storage/sign enforces on upload (one user can't attach
  // another's object).
  const evidencePath = d.evidencePath.replace(/^\/+/, "");
  if (!evidencePath.startsWith(`${me.id}/`)) {
    return NextResponse.json({ error: "evidencePath must be under your own folder" }, { status: 403, headers: MOBILE_CORS });
  }

  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // Same gate as the web action; see lib/attendance/remote-work.ts.
  const gate = await assertRemoteWorkApproved(me.id, today, d.workMode);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: 403, headers: MOBILE_CORS });
  }

  const values = {
    employeeId: me.id,
    logDate: today,
    kind: d.kind,
    note: d.reason.slice(0, 500),
    lat: d.lat,
    lng: d.lng,
    accuracyM: d.accuracyM ?? null,
    distanceM: null,
    verifyMethod: "gps_only" as const,
    source: "self" as const,
    reason: (d.workMode === "wfh" ? "wfh" : "client_visit") as PunchReason,
    workMode: d.workMode,
    clientLocationId: gate.clientLocationId,
    evidencePath,
  };

  const dupError = d.kind === "in" ? "You already checked in today." : "You already checked out today.";
  try {
    await withTimeout(db.insert(attendanceLogs).values(values), 12000, "mobile-remote-punch-insert");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("attendance_logs_employee_day_kind_uq")) {
      return NextResponse.json({ ok: false, error: dupError }, { status: 409, headers: MOBILE_CORS });
    }
    return NextResponse.json({ ok: false, error: `Could not save: ${msg.slice(0, 200)}` }, { status: 500, headers: MOBILE_CORS });
  }

  return NextResponse.json({ ok: true, date: today }, { headers: MOBILE_CORS });
}
