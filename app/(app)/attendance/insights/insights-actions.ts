"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { localDateString } from "@/lib/format";
import { requireUser } from "@/lib/auth/current";
import { isFinanceViewer } from "@/lib/auth/finance-access";
import { isHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { loadOrgAttendanceAnalytics } from "@/lib/attendance/analytics/org";
import {
  generateWorkforceInsights,
  type WorkforceInsights,
} from "@/lib/ai/attendance-workforce-insights";
import { computeSmartAlerts, type SmartAlert } from "@/lib/attendance/analytics/alerts";
import { sendFcmToEmployee } from "@/lib/push/fcm";

/**
 * Server actions for the Attendance Workforce Intelligence "AI Insights + Smart
 * Alerts" panels.
 *
 * `generateAttendanceInsights` is the on-demand entry the AiInsightsPanel calls:
 * it re-checks access (HR staff OR Finance viewer — the same audiences that own
 * the org dashboard), loads the org analytics for the requested month, and runs
 * the Gemini→heuristic read-out. The lib never throws, so the only failure this
 * wrapper reports is an access/DB error.
 *
 * `broadcastAttendanceAlert` is an EXPLICIT admin-only push: it re-derives the
 * Smart Alerts server-side (so a client can't spoof the text), then sends a
 * best-effort FCM push to the chosen recipients (or, by default, active admins).
 */

const DEFAULT_TZ = "Asia/Kolkata";

type InsightsResult =
  | { ok: true; insights: WorkforceInsights; alerts: SmartAlert[] }
  | { ok: false; error: string };

function validMonth(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2100 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}

/** HR staff OR Finance viewer — the org dashboard's audience. */
async function requireInsightsAccess() {
  const me = await requireUser();
  if ((await isFinanceViewer(me)) || (await isHrStaff(me))) return me;
  return null;
}

/**
 * On-demand: generate the AI (or heuristic) workforce read-out + the Smart
 * Alerts for a given month. Access-guarded; never leaks a raw error.
 */
export async function generateAttendanceInsights(
  year: number,
  month: number,
): Promise<InsightsResult> {
  const me = await requireInsightsAccess();
  if (!me) return { ok: false, error: "You don't have access to workforce insights." };
  if (!validMonth(year, month)) return { ok: false, error: "Invalid month." };

  try {
    const todayISO = localDateString(DEFAULT_TZ);
    const analytics = await loadOrgAttendanceAnalytics(year, month, todayISO);
    const [insights, alerts] = [
      await generateWorkforceInsights(analytics),
      computeSmartAlerts(analytics),
    ];
    return { ok: true, insights, alerts };
  } catch (err) {
    console.error("[attendance/insights] generate failed", err);
    return { ok: false, error: "Could not load workforce insights. Please retry in a moment." };
  }
}

type BroadcastResult =
  | { ok: true; sent: number }
  | { ok: false; error: string };

/**
 * EXPLICIT admin action: push one Smart Alert (identified by id, re-derived
 * server-side) to recipients. Super-admin only. Best-effort — a push failure
 * never throws. If `employeeIds` is omitted, targets active admins.
 */
export async function broadcastAttendanceAlert(
  year: number,
  month: number,
  alertId: string,
  employeeIds?: string[],
): Promise<BroadcastResult> {
  const me = await requireUser();
  if (!(me.isAdmin || isSuperAdmin(me.email)))
    return { ok: false, error: "Only an admin can broadcast an alert." };
  if (!validMonth(year, month)) return { ok: false, error: "Invalid month." };

  try {
    const todayISO = localDateString(DEFAULT_TZ);
    const analytics = await loadOrgAttendanceAnalytics(year, month, todayISO);
    const alert = computeSmartAlerts(analytics).find((a) => a.id === alertId);
    if (!alert) return { ok: false, error: "That alert is no longer active." };

    // Recipient set: explicit list, else active admins (deduped, self excluded
    // is fine — an admin broadcasting can receive their own copy).
    let recipients = (employeeIds ?? []).filter(Boolean);
    if (recipients.length === 0) {
      const admins = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.isAdmin, true), eq(employees.isActive, true)));
      recipients = admins.map((a) => a.id);
    }
    recipients = [...new Set(recipients)];
    if (recipients.length === 0) return { ok: true, sent: 0 };

    const title = `Attendance alert · ${analytics.monthLabel}`;
    const body = `${alert.title} — ${alert.detail}`;
    await Promise.allSettled(
      recipients.map((employeeId) =>
        sendFcmToEmployee(employeeId, {
          title,
          body,
          route: alert.actionRoute?.replace(/^\//, "") || "attendance",
        }),
      ),
    );
    return { ok: true, sent: recipients.length };
  } catch (err) {
    console.error("[attendance/insights] broadcast failed", err);
    return { ok: false, error: "Could not broadcast the alert." };
  }
}
