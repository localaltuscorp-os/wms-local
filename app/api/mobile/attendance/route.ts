import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { listMyAttendance } from "@/lib/queries/attendance";
import { countMobileDevices } from "@/lib/attendance/mobile-devices";
import { localDateString, formatTimeInTz } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const HISTORY_DAYS = 14;

/**
 * GET /api/mobile/attendance — state for the native Attendance screen:
 * today's in/out, the last ~2 weeks of punches, whether the office geofence is
 * on (so the app knows to ask for location) and how many devices this employee
 * has enrolled (so it can say "this punch will register your phone").
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const sinceDate = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(since);

  const [days, settings, deviceCount] = await Promise.all([
    listMyAttendance(me.id, sinceDate),
    getOrgSettings(),
    countMobileDevices(me.id),
  ]);

  const todayRow = days.find((d) => d.date === today);

  return NextResponse.json(
    {
      today: {
        date: today,
        checkedIn: todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : null,
        checkedOut: todayRow?.out ? formatTimeInTz(todayRow.out.at, tz) : null,
      },
      history: days
        .filter((d) => d.date !== today)
        .map((d) => ({
          date: d.date,
          in: d.in ? formatTimeInTz(d.in.at, tz) : null,
          out: d.out ? formatTimeInTz(d.out.at, tz) : null,
        })),
      geofence: {
        enabled: settings.officeLat != null && settings.officeLng != null,
        radiusM: settings.attendanceRadiusM,
      },
      devicesEnrolled: deviceCount,
      biometricExempt: me.attendanceBiometricExempt,
    },
    { headers: MOBILE_CORS },
  );
}
