import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Smartphone } from "lucide-react";
import { requireAttendanceAdmin } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { listAllDevices, MAX_DEVICES_PER_EMPLOYEE } from "@/lib/attendance/mobile-devices";
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
 * Attendance · Registered Devices (admin). The device register: every device
 * employees registered from the app or the web punch, newest first.
 *
 * Admin APPROVAL was removed 2026-09-09 - employees register their own devices
 * and punch from them at once. What admins keep here is oversight and the power
 * to REVOKE a lost, replaced or suspicious device, which is also how a capped
 * slot is freed (MAX_DEVICES_PER_EMPLOYEE per person, any mix of kinds). A
 * revoked or someone-else's device still gets "Incorrect device" at the punch.
 */
export default async function AttendanceDevicesPage() {
  const me = await requireAttendanceAdmin();
  const devices = await listAllDevices();
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
            Each employee registers up to {MAX_DEVICES_PER_EMPLOYEE} devices of any kind - two laptops, two
            phones or one of each - adopted the first time they punch in from that browser.
            No approval is needed: a registered device works <strong>immediately</strong>. Revoke one to
            retire it and free a slot; a revoked device, or someone else&rsquo;s, is refused with
            &ldquo;Incorrect device&rdquo;.
          </p>
        </header>

        {(
          <div className="mb-6">
            <OfficeNetworkEditor currentIp={currentIp} allowlist={settings?.officeIpAllowlist ?? []} />
          </div>
        )}

        <DevicesClient devices={devices} maxPerEmployee={MAX_DEVICES_PER_EMPLOYEE} />

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
