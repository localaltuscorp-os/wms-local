import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listIntroductions } from "@/lib/queries/people-gives";
import { csvResponse, exportFilename } from "@/lib/exports/csv";

/**
 * GET /people-gives/export
 *
 * Streams ALL People Gives introductions (the structured references set) as a
 * single CRM-friendly CSV download — one row per reference, flat columns with
 * clear headers, every FK lookup (reference source / designation / business
 * category / salesperson / recorded-by) resolved to its display name by
 * `listIntroductions`. Includes the received/created dates and who recorded it.
 *
 * Auth + scoping: gated by `requireWorkspace("sales")` — the exact rule the
 * `/people-gives` page applies, so only Sales-dept members and super-admins can
 * download. The (app) layout gate does not run for route handlers, so this
 * guard is what actually restricts the room here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_HEADERS = [
  "received_on",
  "reference_source",
  "introducer_first_name",
  "introducer_last_name",
  "introducer_cell",
  "prospect_company",
  "prospect_first_name",
  "prospect_last_name",
  "designation",
  "business_category",
  "nature_of_business",
  "notes",
  "next_reminder_date",
  "sales_person",
  "recorded_by",
  "created_at",
];

export async function GET(): Promise<Response> {
  // requireWorkspace redirects non-members to /hub; a redirect Response is a
  // perfectly valid 3xx for a direct-URL hit, so we let it propagate.
  await requireWorkspace("sales");

  const rows = await listIntroductions();

  return csvResponse({
    filename: exportFilename("references"),
    headers: EXPORT_HEADERS,
    rows: rows.map((r) => [
      r.receivedOn,
      r.referenceSource,
      r.introducerFirstName,
      r.introducerLastName,
      r.introducerCell,
      r.prospectCompany,
      r.prospectFirstName,
      r.prospectLastName,
      r.designation,
      r.businessCategory,
      r.natureOfBusiness,
      r.notes,
      r.nextReminderDate,
      r.salesPerson,
      r.createdBy,
      r.createdAt,
    ]),
  });
}
