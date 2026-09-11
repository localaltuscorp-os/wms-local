import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ScrollText } from "lucide-react";
import { requireUser, forbiddenError } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { canViewAttendanceAuditLog } from "@/lib/security/capabilities";
import {
  listAttendanceAudit,
  attendanceAuditParticipants,
  type AttendanceAuditFilters,
} from "@/lib/security/attendance-audit";
import { ATTENDANCE_AUDIT_ACTIONS, type AttendanceAuditAction } from "@/db/enums";
import { ChangeLogClient } from "@/components/attendance/change-log-client";

export const dynamic = "force-dynamic";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * ATTENDANCE · CHANGE LOG — the readable face of the immutable audit trail.
 *
 * Read-only by construction. There is no action on this page, no edit control
 * and no delete control, because `attendance_audit_log` refuses UPDATE and
 * DELETE at the database (migration 0215) — a control here would be a button
 * that always fails.
 *
 * Gated on `attendance.view_audit_log`, not on `isAdmin`: the log records who
 * changed whose attendance and is not general admin reading.
 */
export default async function AttendanceChangeLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireUser();
  if (!canViewAttendanceAuditLog(me.email)) throw forbiddenError();

  const sp = await searchParams;
  const one = (k: string): string | undefined => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };

  const rawAction = one("action");
  const filters: AttendanceAuditFilters = {
    employeeId: one("employee"),
    actorId: one("actor"),
    attendanceFrom: one("attFrom"),
    attendanceTo: one("attTo"),
    changedFrom: one("chgFrom"),
    changedTo: one("chgTo"),
    // Validated against the enum rather than passed through: an arbitrary
    // string here would reach the query as a comparison value.
    action: ATTENDANCE_AUDIT_ACTIONS.includes(rawAction as AttendanceAuditAction)
      ? (rawAction as AttendanceAuditAction)
      : undefined,
  };

  const [rows, participants] = await Promise.all([
    listAttendanceAudit(filters),
    attendanceAuditParticipants(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1180px] px-8 max-md:px-4 pt-8 pb-20">
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
            <ScrollText size={13} strokeWidth={2.6} /> Change Log
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px,3vw,40px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            Attendance changes
          </h1>
          <p className="mt-1.5 max-w-[74ch] text-[13.5px] font-medium text-ink-muted">
            Every privileged attendance change — someone editing another employee&rsquo;s record, or reaching past
            the 15-minute correction window or the monthly lock. Append-only: these entries cannot be edited or
            deleted by anyone, including the people who made them.
          </p>
        </header>

        <ChangeLogClient
          rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          subjects={participants.subjects}
          actors={participants.actors}
        />
      </main>
    </>
  );
}
