import { requireUser } from "@/lib/auth/current";
import { listModuleSubmissions } from "@/lib/queries/modules";
import { resolveRequestFields, resolveAdminFields } from "@/lib/forms/server";
import { csvResponse, exportFilename } from "@/lib/exports/csv";

/**
 * GET /record-reference/export
 *
 * Streams the "Record Reference" dynamic-form submissions as a CSV download —
 * one row per reference. Because these submissions are schemaless jsonb
 * (`fields` + `adminFields` keyed by field key), the columns are derived from
 * the module's live field definitions so each header is the human-readable
 * label, not a raw key. Status / who recorded it / decided date / created date
 * are appended.
 *
 * Auth + scoping: any signed-in employee can export, but `listModuleSubmissions`
 * scopes non-admins to their OWN submissions (admins see everyone's) — the exact
 * same visibility the `/record-reference` page applies.
 *
 * Note: the primary, CRM-ready references export is `/people-gives/export`
 * (the structured People Gives introductions). This route covers references
 * captured through the dynamic Record Reference form instead.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined): string => (d ? d.toISOString() : "");

export async function GET(): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const [rows, requestFields, adminFields] = await Promise.all([
    listModuleSubmissions({ module: "reference", employeeId: me.id, isAdmin: me.isAdmin }),
    resolveRequestFields("reference"),
    resolveAdminFields("reference"),
  ]);

  // Stable column order: request fields, then admin fields, then meta. Labels
  // become the CSV headers; the matching key pulls the value from the jsonb.
  const requestCols = requestFields.map((f) => ({ key: f.key, label: f.label }));
  const adminCols = adminFields.map((f) => ({ key: f.key, label: f.label }));

  const headers = [
    ...requestCols.map((c) => c.label),
    ...adminCols.map((c) => c.label),
    "Status",
    "Recorded By",
    "Decided At",
    "Created At",
  ];

  return csvResponse({
    filename: exportFilename("record-references"),
    headers,
    rows: rows.map((r) => [
      ...requestCols.map((c) => r.fields[c.key] ?? ""),
      ...adminCols.map((c) => r.adminFields[c.key] ?? ""),
      r.status,
      r.employeeName,
      iso(r.decidedAt),
      iso(r.createdAt),
    ]),
  });
}
