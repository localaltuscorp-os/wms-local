import { and, eq, gte, lte } from "drizzle-orm";
import { attendanceLogs, leaveRequests, remoteWorkRequests } from "@/db/schema";
import { db } from "@/lib/db";

export async function approvedLeaveCoversDate(employeeId: string, date: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.startDate, date),
        gte(leaveRequests.endDate, date),
      ),
    )
    .limit(1);
  return !!row;
}

type PunchMode = "office" | "remote";

/** Prevent a valid office/remote pair from being folded into one interval. */
export async function assertNoMixedAttendance(
  employeeId: string,
  date: string,
  requested: PunchMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await db
    .select({
      workMode: attendanceLogs.workMode,
      remoteStatus: remoteWorkRequests.status,
    })
    .from(attendanceLogs)
    .leftJoin(remoteWorkRequests, eq(attendanceLogs.remoteWorkRequestId, remoteWorkRequests.id))
    .where(and(eq(attendanceLogs.employeeId, employeeId), eq(attendanceLogs.logDate, date)));

  const hasOther = rows.some((row) => {
    const activeRemote = !!row.workMode && row.workMode !== "office" && row.remoteStatus !== "rejected";
    return requested === "remote" ? !activeRemote : activeRemote;
  });
  if (hasOther) {
    return {
      ok: false,
      error: "Office and remote attendance cannot be mixed on the same day.",
    };
  }
  return { ok: true };
}
