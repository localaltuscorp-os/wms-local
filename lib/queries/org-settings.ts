import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSettings, type OrgSettings } from "@/db/schema";

/**
 * The single-row `org_settings` table has `id = 1` as the only valid row.
 * The seed migration inserts it; we never insert from app code.  If the
 * row is somehow missing (fresh DB without migrations), we fall back to
 * the schema defaults so the caller never has to null-check.
 */
const DEFAULTS: OrgSettings = {
  id: 1,
  companyName: "Altus Corp",
  logoUrl: null,
  digestHourIst: 9,
  idleTimeoutMinutes: 10,
  workingDays: [1, 2, 3, 4, 5],
  timezone: "Asia/Kolkata",
  allowSelfRegister: false,
  notificationMatrix: {
    task_assigned:  ["email", "slack", "whatsapp", "push"],
    task_initiated: ["email", "slack", "whatsapp", "push"],
    status_changed: ["email", "slack", "whatsapp", "push"],
    approved:       ["email", "slack", "whatsapp", "push"],
    declined:       ["email", "slack", "whatsapp", "push"],
    reassigned:     ["email", "slack", "whatsapp", "push"],
    transferred:    ["email", "slack", "whatsapp", "push"],
    cancelled:      ["email", "slack", "whatsapp", "push"],
    commented:      ["email", "slack", "whatsapp", "push"],
    overdue_digest: ["email"],
  },
  boardColumnOrder: null,
  incentiveSocialEarner: "Rohan Choudhary",
  officeLat: null,
  officeLng: null,
  attendanceRadiusM: 100,
  attLateAfter: "10:50",
  attEarlyBefore: "19:20",
  attFullDayHours: "9",
  attHalfDayHours: "5",
  updatedAt: new Date(0),
  updatedById: null,
};

export async function getOrgSettings(): Promise<OrgSettings> {
  const [row] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  return row ?? DEFAULTS;
}
