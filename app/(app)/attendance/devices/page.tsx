import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Smartphone } from "lucide-react";
import { requireDeviceManager } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { listAllDevices, MAX_APPROVED_PER_KIND } from "@/lib/attendance/mobile-devices";
import { deviceAutoAdoptEnabled, deviceAccessEnforced } from "@/lib/security/device-access";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listAttendanceAnomalies } from "@/lib/attendance/integrity-review";
import { attendanceIntegrityMode } from "@/lib/attendance/integrity-mode";
import { getClientIp } from "@/lib/attendance/office-ip";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { DevicesClient } from "@/components/attendance/devices-client";
import { IntegrityReview } from "@/components/attendance/integrity-review";
import { OfficeNetworkEditor } from "@/components/attendance/office-network-editor";

export const dynamic = "force-dynamic";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * Attendance · Registered Devices (admin). The device-allowlist control room:
 * every device employees registered from the app or the web punch, newest/pending
 * first. Admins approve a pending device (cap MAX_DEVICES_PER_EMPLOYEE per
 * person, any mix of kinds) so its owner
 * can punch, or revoke a lost/replaced/suspicious one. Only APPROVED devices can
 * mark attendance - everything else gets "Incorrect device" at the punch.
 */
export default async function AttendanceDevicesPage() {
  // DEVICE MANAGERS ONLY. Was `requireAttendanceAdmin`; narrowed to the
  // `device.manage` capability, because approving a device is what lets someone
  // act as another person and so cannot ride along with attendance settings.
  const me = await requireDeviceManager();
  const devices = await listAllDevices();
  const employeeOptions = await listEmployeeOptions();
  const autoAdopt = deviceAutoAdoptEnabled();
  const enforcing = deviceAccessEnforced();
  const pending = devices.filter((d) => d.status === "pending").length;
  const anomalies = await listAttendanceAnomalies();
  const mode = attendanceIntegrityMode();
  // Everyone who can reach this page is an attendance administrator - the page
  // guard and setOfficeIpAllowlist now read the SAME predicate, so there is no
  // second capability left to branch on.
  const settings = await getOrgSettings();
  const currentIp = await getClientIp();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1000px] px-8 max-md:px-4 pt-8 pb-20">
        <Link
          href={"/attendance" as Route}
          className="inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red"
        >
          <ArrowLeft size={14} /> Attendance
        </Link>

        <header className="mt-5 mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Smartphone size={13} strokeWidth={2.6} /> Registered Devices
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
          >
            Device allowlist
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[13.5px] font-medium text-ink-muted">
            Each employee may hold <strong>{MAX_APPROVED_PER_KIND} approved laptop and {MAX_APPROVED_PER_KIND} approved
            phone</strong>. Only approved devices can reach the WMS at all — an unregistered laptop or phone is
            refused at sign-in, not merely stopped from punching.{" "}
            {pending > 0 ? `${pending} waiting for approval.` : "Nothing waiting for approval."}
          </p>

          {/* The two rollout switches, stated where they are acted on. An
              enforcement control that is off, or an enrolment window that was
              never closed, is invisible in an environment variable and obvious
              here. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold"
              style={
                enforcing
                  ? { background: "var(--color-green-bg, #e9f7ef)", color: "var(--color-green-deep, #15803d)" }
                  : { background: "var(--color-amber-bg, #fef3e2)", color: "var(--color-amber-deep, #b45309)" }
              }
            >
              {enforcing
                ? "Device access: enforced"
                : "Device access: NOT enforced (DEVICE_ACCESS_ENFORCEMENT=off)"}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold"
              style={
                autoAdopt
                  ? { background: "var(--color-amber-bg, #fef3e2)", color: "var(--color-amber-deep, #b45309)" }
                  : { background: "var(--color-green-bg, #e9f7ef)", color: "var(--color-green-deep, #15803d)" }
              }
            >
              {autoAdopt
                ? "Enrolment open — first device per kind self-approves"
                : "Enrolment closed — every new device needs approval"}
            </span>
          </div>
        </header>

        {(
          <div className="mb-6">
            <OfficeNetworkEditor currentIp={currentIp} allowlist={settings?.officeIpAllowlist ?? []} />
          </div>
        )}

        <DevicesClient devices={devices} maxPerKind={MAX_APPROVED_PER_KIND} employees={employeeOptions} />

        {/* ── Attendance Integrity - flagged punches (Phase 2 L6 attribution) ── */}
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[18px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
              Attendance Integrity
            </h2>
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={
                mode === "enforce"
                  ? { background: "var(--color-green-bg, #e9f7ef)", color: "var(--color-green-deep, #15803d)" }
                  : mode === "report"
                    ? { background: "var(--color-amber-bg, #fef3e2)", color: "var(--color-amber-deep, #b45309)" }
                    : { background: "#f1f2f4", color: "#6b7280" }
              }
            >
              Mode: {mode}
            </span>
          </div>
          <p className="mb-4 max-w-[70ch] text-[13px] text-ink-muted">
            Punches flagged by the device-health checks - mocked GPS, failed device/app integrity, or replay attempts.
            {mode === "off" ? " Set ATTENDANCE_INTEGRITY_MODE=report (then enforce) once the updated app is live." : mode === "report" ? " Currently recording only - nothing is blocked yet." : " Flagged punches are being refused."}
          </p>
          <IntegrityReview anomalies={anomalies} />
        </section>
      </main>
    </>
  );
}
