import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { resolvePunchGeofence, insertPunchRow } from "@/lib/attendance/record-punch";
import { resolveMobileDevice } from "@/lib/attendance/mobile-devices";
import {
  notifyOnInPunch,
  notifyOnDayFinalized,
  alertAdminsNewAttendanceDevice,
  clockInTz,
} from "@/lib/attendance/punch-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Body = {
  kind?: "in" | "out";
  note?: string;
  location?: { lat: number; lng: number; accuracyM: number };
  deviceId?: string;
  deviceLabel?: string;
  platform?: string;
};

const ok = (data: object) => NextResponse.json(data, { headers: MOBILE_CORS });
const err = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status, headers: MOBILE_CORS });

/**
 * POST /api/mobile/attendance/punch — native check-in / check-out.
 * Anti-proxy: the app gates this with the device's own fingerprint/Face ID
 * (expo-local-authentication) and sends a keystore-bound `deviceId`; the server
 * binds the punch to that registered phone (one phone ↔ one employee) and runs
 * the SAME geofence + day-finalize + notification rules as the web punch.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return err(429, limited.error);

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || (body.kind !== "in" && body.kind !== "out")) {
    return err(400, "kind must be 'in' or 'out'.");
  }
  if (typeof body.deviceId !== "string" || !body.deviceId.trim()) {
    return err(400, "A device id is required.");
  }
  const location = body.location;
  if (
    location &&
    (typeof location.lat !== "number" ||
      typeof location.lng !== "number" ||
      typeof location.accuracyM !== "number")
  ) {
    return err(400, "Invalid location.");
  }

  // ── Gate 1: geofence (shared with web) ──
  const settings = await getOrgSettings();
  const geo = resolvePunchGeofence(settings, location);
  if (!geo.ok) return err(400, geo.error);

  // ── Gate 2: device binding (the mobile anti-proxy) ──
  const device = await resolveMobileDevice(me.id, {
    deviceId: body.deviceId,
    label: body.deviceLabel ?? null,
    platform: body.platform ?? null,
  });
  if (!device.ok) return err(403, device.error);
  if (device.isNewDevice) {
    await alertAdminsNewAttendanceDevice(me, body.deviceLabel ?? null, device.deviceCount);
  }

  const tz = me.timezone || "Asia/Kolkata";
  const inserted = await insertPunchRow(
    { id: me.id, timezone: tz },
    { kind: body.kind, note: body.note, location, distanceM: geo.distanceM },
    { verifyMethod: "biometric", mobileDeviceId: device.rowId, source: "self" },
  );
  if (!inserted.ok) return err(409, inserted.error);

  // Same best-effort notifications as the web punch.
  if (body.kind === "in") {
    await notifyOnInPunch(me, inserted.date, clockInTz(new Date(), tz));
  } else {
    await notifyOnDayFinalized(me, inserted.date);
  }

  return ok({ ok: true, date: inserted.date, newDevice: device.isNewDevice });
}
