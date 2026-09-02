import "server-only";
import { and, eq, lte, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, employees, leaveRequests } from "@/db/schema";

/**
 * Live "who's where right now" snapshot for the admin attendance home — the
 * right-rail status panel. Derived from today's raw punches + approved leave,
 * graded against the org's late/early thresholds. One extra read on top of the
 * roster the page already loads, scoped to a single day.
 */
export interface LiveStatus {
  currentlyIn: number;
  lateArrivals: number;
  earlyDepartures: number;
  incomplete: number;
  onLeave: number;
  onBusinessField: number;
  /** Active headcount, for the "N of TOTAL" framing. */
  total: number;
}

/** "10:50" → 650 (minutes past midnight). */
function toMinutes(hhmm: string | null | undefined, fallback: number): number {
  if (!hhmm) return fallback;
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || Number.isNaN(h)) return fallback;
  return h * 60 + (Number.isNaN(m) ? 0 : (m ?? 0));
}

/** Minutes-past-midnight of `at` in the given IANA timezone. */
function localMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

/**
 * Work modes that count as "on business / field" (out of the office, but
 * working) — mirrors the `work_mode` column: office | wfh | client_site |
 * field | other. WFH is remote, not field, so it is excluded here.
 */
const FIELD_MODES = new Set(["field", "client_site", "client", "onsite", "site", "business", "travel"]);

export async function loadLiveStatus(
  date: string,
  tz: string,
  thresholds: { lateAfter: string | null; earlyBefore: string | null },
): Promise<LiveStatus> {
  const lateAfterMin = toMinutes(thresholds.lateAfter, 650); // 10:50
  const earlyBeforeMin = toMinutes(thresholds.earlyBefore, 1170); // 19:30

  const [activeRows, punches, leaves] = await Promise.all([
    db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.isActive, true)),
    db
      .select({
        employeeId: attendanceLogs.employeeId,
        kind: attendanceLogs.kind,
        loggedAt: attendanceLogs.loggedAt,
        workMode: attendanceLogs.workMode,
      })
      .from(attendanceLogs)
      .where(eq(attendanceLogs.logDate, date)),
    db
      .select({ employeeId: leaveRequests.employeeId })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, date),
          gte(leaveRequests.endDate, date),
        ),
      ),
  ]);

  type Slot = { in: Date | null; out: Date | null; field: boolean };
  const byEmp = new Map<string, Slot>();
  for (const p of punches) {
    let slot = byEmp.get(p.employeeId);
    if (!slot) {
      slot = { in: null, out: null, field: false };
      byEmp.set(p.employeeId, slot);
    }
    if (p.kind === "in") slot.in = p.loggedAt;
    else slot.out = p.loggedAt;
    if (p.workMode && FIELD_MODES.has(p.workMode)) slot.field = true;
  }

  const onLeaveSet = new Set(leaves.map((l) => l.employeeId));

  let currentlyIn = 0;
  let lateArrivals = 0;
  let earlyDepartures = 0;
  let incomplete = 0;
  let onBusinessField = 0;

  for (const [empId, slot] of byEmp) {
    if (slot.in && !slot.out) currentlyIn += 1;
    if (slot.in && localMinutes(slot.in, tz) > lateAfterMin) lateArrivals += 1;
    if (slot.out && localMinutes(slot.out, tz) < earlyBeforeMin) earlyDepartures += 1;
    // Genuinely incomplete: a lone check-out with no matching check-in.
    if (slot.out && !slot.in) incomplete += 1;
    if (slot.field && !onLeaveSet.has(empId)) onBusinessField += 1;
  }

  return {
    currentlyIn,
    lateArrivals,
    earlyDepartures,
    incomplete,
    onLeave: onLeaveSet.size,
    onBusinessField,
    total: activeRows.length,
  };
}
