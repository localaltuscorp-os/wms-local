import "server-only";

import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, employees, mobileDevices } from "@/db/schema";

/**
 * Attendance-integrity review (anti-proxy Phase 2, L6 attribution). Surfaces the
 * punches the device-health checks flagged — mock-location attempts, integrity
 * failures, replay/nonce anomalies — so an admin can review real-device signals
 * during the `report` window and catch the residual collusion case once in
 * `enforce`. A row is "flagged" iff it carries `anomaly_flags`.
 */

export interface AnomalyPunch {
  id: string;
  employeeName: string;
  logDate: string;
  kind: "in" | "out";
  loggedAt: Date;
  integrityVerdict: string | null;
  mockLocation: boolean | null;
  anomalyFlags: string[];
  deviceLabel: string | null;
  distanceM: number | null;
}

/** Flagged punches in the last `days` days, newest first. */
export async function listAttendanceAnomalies(days = 14, limit = 200): Promise<AnomalyPunch[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: attendanceLogs.id,
      employeeName: employees.name,
      logDate: attendanceLogs.logDate,
      kind: attendanceLogs.kind,
      loggedAt: attendanceLogs.loggedAt,
      integrityVerdict: attendanceLogs.integrityVerdict,
      mockLocation: attendanceLogs.mockLocation,
      anomalyFlags: attendanceLogs.anomalyFlags,
      deviceLabel: mobileDevices.label,
      distanceM: attendanceLogs.distanceM,
    })
    .from(attendanceLogs)
    .leftJoin(employees, eq(employees.id, attendanceLogs.employeeId))
    .leftJoin(mobileDevices, eq(mobileDevices.id, attendanceLogs.mobileDeviceId))
    .where(and(gte(attendanceLogs.loggedAt, since), isNotNull(attendanceLogs.anomalyFlags)))
    .orderBy(desc(attendanceLogs.loggedAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    employeeName: r.employeeName ?? "—",
    anomalyFlags: r.anomalyFlags ?? [],
  }));
}
