import { listEmployees } from "@/lib/queries/employees";
import { csvResponse, exportFilename } from "@/lib/exports/csv";
import { requireAdmin } from "@/lib/auth/current";

/**
 * GET /admin/employees/export
 *
 * Streams the full employee roster as a CSV download using the unified
 * `csvResponse` helper from `lib/exports/csv` (T19 pattern).  Admin-only —
 * `requireAdmin` redirects/throws for non-admins.
 *
 * The endpoint is unfiltered: it ships the whole table in one go (the
 * roster is small — tens to a few hundred rows max).  The two integration
 * columns are emitted as a presence flag (`yes` / `no`) rather than the
 * raw Slack id / E.164 phone number so the CSV is safe to share with
 * non-IT recipients.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await requireAdmin();

  // Export ships the FULL roster, including deactivated rows — the
  // is_active column is in the CSV so consumers can filter themselves.
  const employees = await listEmployees({ includeInactive: true });

  return csvResponse({
    filename: exportFilename("employees"),
    headers: [
      "name",
      "email",
      "role",
      "department",
      "is_active",
      "is_admin",
      "joined_at",
      "last_inbox_visit_at",
      "slack_user_id_present",
      "whatsapp_phone_present",
    ],
    rows: employees.map((e) => [
      e.name,
      e.email,
      e.role,
      e.department ?? "",
      String(e.isActive),
      String(e.isAdmin),
      e.joinedAt?.toISOString() ?? "",
      e.lastInboxVisitAt.toISOString(),
      e.slackUserId ? "yes" : "no",
      e.whatsappPhone ? "yes" : "no",
    ]),
  });
}
