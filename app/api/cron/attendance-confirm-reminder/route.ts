import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { issueApprovalToken } from "@/lib/approval/tokens";
import {
  ATTENDANCE_CONFIRM_KIND,
  ATTENDANCE_CONFIRM_ACTION,
  attendanceConfirmTargetId,
  istWeekStartIso,
} from "@/lib/approval/attendance-confirm";
import { sendAttendanceConfirmRequestEmail } from "@/lib/dispatch/email";
import { sendAttendanceConfirmWhatsApp } from "@/lib/whatsapp/approval";
import { isDispatchV2On, isDispatchV2DryRun } from "@/lib/dispatch/flag";
import { siteUrl } from "@/lib/site-url";

/**
 * WS-5/WS-7 · Monday attendance-confirmation reminders.
 *
 * Registered (see INTEGRATION NOTE) at 05:00 UTC every Monday (10:30 IST):
 *   `0 5 * * 1`
 *
 * Recipients:
 *   - MANAGERS  (anyone referenced as another active employee's manager_id) →
 *     confirm THEIR team's outside-office attendance.
 *   - ACCOUNTANT (active employees in the "Accounts" department) → confirm the
 *     MANAGERS' outside-office attendance.
 *
 * For each recipient it mints a single-use approval token and sends an email +
 * (if opted-in) WhatsApp carrying a one-click approve link. Token issuance AND
 * sends are gated behind DISPATCH_V2 — with the flag off (default) this is a
 * dry-run that only counts recipients (no tokens minted, nothing sent).
 *
 * The pending-person ROWS shown in the email are owned by the WS-5 queue; this
 * cron sends an empty row set (button-only email) until WS-5 exposes a
 * `getPendingConfirmations(confirmerId, weekStartIso)` query — see TODO below.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
function weekLabel(weekStartIso: string): string {
  const d = new Date(`${weekStartIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return `week of ${weekStartIso}`;
  return `week of ${WEEK_FMT.format(d)}`;
}

function isAccounts(dept: string | null): boolean {
  return (dept ?? "").toLowerCase().includes("account");
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStartIso = istWeekStartIso();
  const label = weekLabel(weekStartIso);
  const armed = isDispatchV2On();
  const dryRun = isDispatchV2DryRun();
  const site = siteUrl();

  const roster = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      department: employees.department,
      managerId: employees.managerId,
      whatsappOptedIn: employees.whatsappOptedIn,
      whatsappPhone: employees.whatsappPhone,
      whatsappTemplateLocale: employees.whatsappTemplateLocale,
    })
    .from(employees)
    .where(eq(employees.isActive, true));

  // Managers = ids referenced by some active person's manager_id.
  const managerIds = new Set<string>();
  for (const p of roster) {
    if (p.managerId) managerIds.add(p.managerId);
  }

  // Recipients: managers ∪ accountants. Accountant scope overrides manager
  // scope when a person is both (they confirm the managers, not a team).
  const recipients = roster.filter(
    (p) => managerIds.has(p.id) || isAccounts(p.department),
  );

  let minted = 0;
  let emailed = 0;
  let whatsapped = 0;

  for (const person of recipients) {
    const scopeLabel = isAccounts(person.department) ? "the managers" : "your team";

    // TODO(WS-5): const rows = await getPendingConfirmations(person.id, weekStartIso);
    const rows: Array<{ name: string; summary: string; ok?: boolean }> = [];

    // Dry-run / disarmed: do not mint tokens or send. Count only.
    if (!armed) continue;

    const token = await issueApprovalToken({
      kind: ATTENDANCE_CONFIRM_KIND,
      targetId: attendanceConfirmTargetId({ confirmerId: person.id, weekStartIso }),
      action: ATTENDANCE_CONFIRM_ACTION,
      createdById: null,
      ttlMs: 8 * 24 * 60 * 60 * 1000, // survives the whole week + a day
    });
    minted++;

    const emailRes = await sendAttendanceConfirmRequestEmail({
      recipient: { email: person.email, name: person.name },
      scopeLabel,
      weekLabel: label,
      rows,
      approveUrl: token.approveUrl,
      siteUrl: site,
    });
    if (emailRes.sent) emailed++;
    else if (emailRes.error) {
      console.error(
        `[cron/attendance-confirm-reminder] email failed for ${person.email}:`,
        emailRes.error,
      );
    }

    const waRes = await sendAttendanceConfirmWhatsApp({
      recipient: person,
      name: person.name,
      scopeLabel,
      weekLabel: label,
      approveTokenSuffix: token.urlSuffix,
    });
    if (waRes.sent) whatsapped++;
  }

  return NextResponse.json({
    ok: true,
    week: weekStartIso,
    armed,
    dryRun,
    managers: managerIds.size,
    recipients: recipients.length,
    minted,
    emailed,
    whatsapped,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
