import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { registerMobileDevice } from "@/lib/attendance/mobile-devices";
import { alertAdminsNewAttendanceDevice } from "@/lib/attendance/punch-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Body = { deviceId?: string; deviceLabel?: string; platform?: string };

/**
 * POST /api/mobile/attendance/register-device — the one-time "Register this
 * device" button. Enrolls the phone's keystore device id as PENDING (capped at
 * MAX_DEVICES_PER_EMPLOYEE); an admin then approves it before it can punch.
 * Idempotent — re-tapping returns the current status. Admins are alerted on a
 * genuinely new registration so they can approve promptly.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) {
    return NextResponse.json({ ok: false, error: limited.error }, { status: 429, headers: MOBILE_CORS });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.deviceId !== "string" || !body.deviceId.trim()) {
    return NextResponse.json({ ok: false, error: "A device id is required." }, { status: 400, headers: MOBILE_CORS });
  }

  const res = await registerMobileDevice(me.id, {
    deviceId: body.deviceId,
    label: body.deviceLabel ?? null,
    platform: body.platform ?? null,
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 409, headers: MOBILE_CORS });
  }

  if (res.isNew && res.status === "pending") {
    await alertAdminsNewAttendanceDevice(me, body.deviceLabel ?? null, res.deviceCount).catch(() => {});
  }

  return NextResponse.json(
    { ok: true, status: res.status, deviceCount: res.deviceCount },
    { headers: MOBILE_CORS },
  );
}
