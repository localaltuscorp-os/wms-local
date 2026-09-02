import { MapPin, ShieldCheck } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { PunchCard } from "@/components/attendance/punch-card";
import { TeamDatePicker } from "@/components/attendance/team-date-picker";
import { TeamPunchButton } from "@/components/attendance/team-punch-button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  listMyAttendance,
  listTeamAttendanceForDate,
  type DayPunches,
  type PunchDetail,
  type TeamAttendanceRow,
} from "@/lib/queries/attendance";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { formatTimeInTz, localDateString } from "@/lib/format";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DAY_LABEL_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
};

/** "2026-06-10" → "Wed, 10 Jun 2026" without timezone drift. */
function labelForDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", DAY_LABEL_FMT).format(
    new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12)),
  );
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // My last 14 calendar days.
  const since = localDateString(tz, new Date(Date.now() - 13 * 86_400_000));

  const rawDate = typeof sp.date === "string" ? sp.date : today;
  const teamDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  const [myDays, team, settings] = await Promise.all([
    listMyAttendance(me.id, since),
    me.isAdmin ? listTeamAttendanceForDate(teamDate) : Promise.resolve(null),
    getOrgSettings(),
  ]);

  const todayRow = myDays.find((d) => d.date === today);
  const office =
    settings.officeLat != null && settings.officeLng != null
      ? {
          lat: settings.officeLat,
          lng: settings.officeLng,
          radiusM: settings.attendanceRadiusM,
        }
      : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[860px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">Attendance</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            {office
              ? `Punch with your fingerprint, within ${office.radiusM}m of the office.`
              : "Check in when you start, check out when you wrap up. One of each per day."}
          </p>
        </header>

        <PunchCard
          todayLabel={labelForDate(today)}
          inLabel={todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : null}
          outLabel={todayRow?.out ? formatTimeInTz(todayRow.out.at, tz) : null}
          tz={tz}
          office={office}
          biometricExempt={me.attendanceBiometricExempt}
        />

        <MyLog days={myDays} tz={tz} />

        {team && (
          <TeamSection
            team={team}
            date={teamDate}
            tz={tz}
            canQuickPunch={isSuperAdmin(me.email) && teamDate === today}
          />
        )}
      </main>
      <DashboardFooter />
    </>
  );
}

/**
 * Punch time + verification badge: green shield = biometric-verified,
 * blue pin = location captured without biometric. Hover shows the distance
 * from office when a geofence was active.
 */
function PunchTime({ punch, tz }: { punch: PunchDetail | null; tz: string }) {
  if (!punch) return <>—</>;
  const dist =
    punch.distanceM != null ? `${Math.round(punch.distanceM)}m from office` : null;
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-soft">
      {formatTimeInTz(punch.at, tz)}
      {punch.verifyMethod === "biometric" ? (
        <span
          title={`Biometric-verified${dist ? ` · ${dist}` : ""}`}
          aria-label={`Biometric-verified${dist ? ` · ${dist}` : ""}`}
          className="inline-flex"
        >
          <ShieldCheck
            size={14}
            strokeWidth={2.4}
            style={{ color: "var(--color-green-deep)" }}
          />
        </span>
      ) : punch.verifyMethod === "gps_only" ? (
        <span
          title={`Location-verified${dist ? ` · ${dist}` : ""}`}
          aria-label={`Location-verified${dist ? ` · ${dist}` : ""}`}
          className="inline-flex"
        >
          <MapPin
            size={14}
            strokeWidth={2.4}
            style={{ color: "var(--color-blue-deep)" }}
          />
        </span>
      ) : null}
    </span>
  );
}

function MyLog({ days, tz }: { days: DayPunches[]; tz: string }) {
  return (
    <section
      className="mt-6 rounded-section bg-surface-card p-6 max-md:p-4"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <h2 className="text-display-2xs text-ink-strong mb-4">My last 14 days</h2>
      {days.length === 0 ? (
        <p className="text-[15px] text-ink-subtle">No punches yet — your log starts with today&apos;s first check-in.</p>
      ) : (
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-ink-subtle">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">In</th>
              <th className="py-2 pr-3 font-semibold">Out</th>
              <th className="py-2 font-semibold max-md:hidden">Notes</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr
                key={d.date}
                className="border-t"
                style={{ borderColor: "var(--color-hairline)" }}
              >
                <td className="py-2.5 pr-3 text-ink-strong whitespace-nowrap">
                  {labelForDate(d.date)}
                </td>
                <td className="py-2.5 pr-3 tabular-nums text-ink-soft">
                  <PunchTime punch={d.in} tz={tz} />
                </td>
                <td className="py-2.5 pr-3 tabular-nums text-ink-soft">
                  <PunchTime punch={d.out} tz={tz} />
                </td>
                <td className="py-2.5 text-ink-subtle max-md:hidden">
                  {[d.in?.note, d.out?.note].filter(Boolean).join(" · ") || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TeamSection({
  team,
  date,
  tz,
  canQuickPunch,
}: {
  team: TeamAttendanceRow[];
  date: string;
  tz: string;
  /** Super-admin viewing today — show inline Check in / Check out controls. */
  canQuickPunch: boolean;
}) {
  const present = team.filter((r) => r.in).length;
  return (
    <section
      className="mt-6 rounded-section bg-surface-card p-6 max-md:p-4"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-display-2xs text-ink-strong">Team — {labelForDate(date)}</h2>
          <p className="text-[14px] text-ink-subtle mt-1">
            {present} of {team.length} checked in
          </p>
        </div>
        <TeamDatePicker date={date} />
      </div>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-wide text-ink-subtle">
            <th className="py-2 pr-3 font-semibold">Employee</th>
            <th className="py-2 pr-3 font-semibold">In</th>
            <th className="py-2 pr-3 font-semibold">Out</th>
            <th className="py-2 font-semibold max-md:hidden">Notes</th>
          </tr>
        </thead>
        <tbody>
          {team.map((r) => (
            <tr
              key={r.employeeId}
              className="border-t"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <td className="py-2.5 pr-3">
                <span className="inline-flex items-center gap-2.5 text-ink-strong">
                  <EmployeeAvatar name={r.name} size="sm" />
                  {r.name}
                </span>
              </td>
              <td className="py-2.5 pr-3 tabular-nums">
                {r.in ? (
                  <PunchTime punch={r.in} tz={tz} />
                ) : canQuickPunch ? (
                  <TeamPunchButton
                    employeeId={r.employeeId}
                    logDate={date}
                    kind="in"
                    name={r.name}
                    tz={tz}
                  />
                ) : (
                  <span
                    className="rounded-pill px-2 py-0.5 text-[12px] font-semibold"
                    style={{
                      background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
                      color: "var(--color-altus-red)",
                    }}
                  >
                    Absent
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 tabular-nums text-ink-soft">
                {r.out ? (
                  <PunchTime punch={r.out} tz={tz} />
                ) : canQuickPunch && r.in ? (
                  <TeamPunchButton
                    employeeId={r.employeeId}
                    logDate={date}
                    kind="out"
                    name={r.name}
                    tz={tz}
                  />
                ) : (
                  <PunchTime punch={r.out} tz={tz} />
                )}
              </td>
              <td className="py-2.5 text-ink-subtle max-md:hidden">
                {[r.in?.note, r.out?.note].filter(Boolean).join(" · ") || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
