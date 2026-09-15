import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dccKpiItems, type Employee } from "@/db/schema";
import { isCandidateAccount } from "@/lib/auth/current";
import { isGoogleConfigured } from "@/lib/google/calendar";

/**
 * THE COMPULSORY GOOGLE CALENDAR CONNECT (account holder, 2026-09-15).
 *
 * Every employee's Daily Compliance must sit in their Altus Google Calendar.
 * Google lets the WMS write there only after the person connects it, so anyone
 * with DCC KPIs who has not connected sees a full-screen prompt after login
 * until they do (components/dcc/dcc-calendar-connect-gate.tsx, mounted in the
 * (app) layout's gate chain).
 *
 * Off switch: DCC_CALENDAR_GATE_OFF=true. It is also off while Google is not
 * configured on the server, since nobody could satisfy it. The layout catches
 * any error as "no prompt": a prompt must never take the app down.
 */
export function dccCalendarGateOn(): boolean {
  return process.env.DCC_CALENDAR_GATE_OFF !== "true";
}

export async function needsDccCalendarConnect(me: Employee): Promise<boolean> {
  if (!dccCalendarGateOn() || !isGoogleConfigured()) return false;
  if (isCandidateAccount(me) || me.googleRefreshToken) return false;
  const [kpi] = await db
    .select({ id: dccKpiItems.id })
    .from(dccKpiItems)
    .where(and(eq(dccKpiItems.ownerEmployeeId, me.id), eq(dccKpiItems.archived, false)))
    .limit(1);
  return Boolean(kpi);
}
