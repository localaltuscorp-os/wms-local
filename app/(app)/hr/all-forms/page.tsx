import { desc, eq, sql } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { HrPageHeader } from "@/components/hr/hr-chrome";
import { requireHrStaff } from "@/lib/hr/access";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { hrFormSubmissions, asHrFormStatus } from "@/lib/hr/forms/schema";
import { hrSectionLabel } from "@/lib/hr/forms/registry";
import { formatDate } from "@/lib/format";
import {
  FilledFormsTable,
  type FilledFormRow,
} from "@/components/hr/forms/filled-forms-table";

export const dynamic = "force-dynamic";

/**
 * HR · All Filled Forms — every employee's submissions, for HR and admins.
 *
 * PERMISSION MODEL: `requireHrStaff()` is the entire boundary, and it runs
 * before any query. A normal employee never reaches the data; they use
 * /hr/my-forms, which is hard-scoped to their own id. The same check is
 * re-asserted inside the View page and the PDF/email routes, because a list
 * gate protects the list and nothing else.
 *
 * Search / section / form / status filtering and sorting happen client-side in
 * `FilledFormsTable`: the whole set ships in one query, which keeps filtering
 * instant and avoids a round trip per keystroke. If this ever outgrows a single
 * page, the ordering here is already the newest-first index the table expects.
 */

/**
 * Ceiling on what one page ships. Client-side filtering means every row lands in
 * the RSC payload, so unbounded here meant "serialise the entire table to the
 * browser" — fine at a hundred submissions, not at ten thousand. `listExitRecords`
 * caps at 100 for the same reason; this is looser because this list is the one
 * you actually search across. The table reports when the cap is in play rather
 * than quietly showing a truncated set.
 */
const ALL_FORMS_LIMIT = 500;

export default async function AllFilledFormsPage() {
  await requireHrStaff();

  const rows = await db
    .select({
      id: hrFormSubmissions.id,
      formKey: hrFormSubmissions.formKey,
      formName: hrFormSubmissions.formName,
      section: hrFormSubmissions.section,
      status: hrFormSubmissions.status,
      submittedAt: hrFormSubmissions.submittedAt,
      updatedAt: hrFormSubmissions.updatedAt,
      employeeName: employees.name,
    })
    .from(hrFormSubmissions)
    .innerJoin(employees, eq(hrFormSubmissions.employeeId, employees.id))
    // NULLS LAST is explicit because Postgres defaults DESC to NULLS FIRST —
    // which floats every draft to the top of a list captioned "newest first",
    // and leaves the (submitted_at DESC NULLS LAST) index unable to serve the
    // ordering. Raw sql because drizzle's desc() carries no nulls modifier.
    .orderBy(
      sql`${hrFormSubmissions.submittedAt} desc nulls last`,
      desc(hrFormSubmissions.updatedAt),
    )
    .limit(ALL_FORMS_LIMIT);

  const tableRows: FilledFormRow[] = rows.map((r) => ({
    id: r.id,
    formKey: r.formKey,
    formName: r.formName,
    section: r.section,
    sectionLabel: hrSectionLabel(r.section),
    employeeName: r.employeeName,
    submittedOn: r.submittedAt ? formatDate(r.submittedAt) : r.updatedAt ? formatDate(r.updatedAt) : "",
    submittedTs: r.submittedAt ? new Date(r.submittedAt).getTime() : 0,
    status: asHrFormStatus(r.status),
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <HrPageHeader
          title="All Filled Forms"
          subtitle="Every employee's HR form submissions — search, filter, view, download or mail."
        />
        <FilledFormsTable rows={tableRows} variant="all" />
        {/* Say so when the cap is in play. A silently truncated list reads as
            "this is everything", which is how someone concludes a submission
            was never filed. */}
        {rows.length === ALL_FORMS_LIMIT && (
          <p className="mt-3 text-[12.5px] text-ink-subtle">
            Showing the {ALL_FORMS_LIMIT} most recent submissions. Older ones aren&apos;t listed here yet.
          </p>
        )}
      </PageShell>
    </>
  );
}
