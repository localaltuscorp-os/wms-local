import Link from "next/link";
import type { Route } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { HrPageHeader } from "@/components/hr/hr-chrome";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { hrFormSubmissions, asHrFormStatus } from "@/lib/hr/forms/schema";
import { hrSectionLabel } from "@/lib/hr/forms/registry";
import { formatDate } from "@/lib/format";
import {
  FilledFormsTable,
  type FilledFormRow,
} from "@/components/hr/forms/filled-forms-table";

export const dynamic = "force-dynamic";

/**
 * HR · My Filled Forms — the signed-in employee's own submissions.
 *
 * PERMISSION MODEL: the query is hard-scoped to `employeeId = me.id`. There is
 * no employee picker and no id parameter to tamper with, so this page cannot
 * show another person's forms regardless of what the client sends. HR staff who
 * need everyone's use /hr/all-forms, which gates on `requireHrStaff`.
 *
 * Submitted and Drafts are separate TABS rather than one filtered list: a draft
 * is unfinished work you still owe, and mixing it into the submitted record
 * makes both harder to read. The split is done server-side off `status`, so the
 * tab you're on is a real URL you can link to.
 */
export default async function MyFilledFormsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: "submitted" | "drafts" = raw === "drafts" ? "drafts" : "submitted";

  const rows = await db
    .select({
      id: hrFormSubmissions.id,
      formKey: hrFormSubmissions.formKey,
      formName: hrFormSubmissions.formName,
      section: hrFormSubmissions.section,
      status: hrFormSubmissions.status,
      submittedAt: hrFormSubmissions.submittedAt,
      updatedAt: hrFormSubmissions.updatedAt,
    })
    .from(hrFormSubmissions)
    .where(
      and(
        eq(hrFormSubmissions.employeeId, me.id),
        eq(hrFormSubmissions.status, tab === "drafts" ? "draft" : "submitted"),
      ),
    )
    // NULLS LAST is explicit — Postgres defaults DESC to NULLS FIRST, which
    // sorts undated rows above dated ones and defeats the DESC NULLS LAST index.
    .orderBy(
      sql`${hrFormSubmissions.submittedAt} desc nulls last`,
      desc(hrFormSubmissions.updatedAt),
    );

  /** Rows in the CURRENT tab — not a submitted count; the query is tab-filtered. */
  const rowCount = rows.length;

  const tableRows: FilledFormRow[] = rows.map((r) => ({
    id: r.id,
    formKey: r.formKey,
    formName: r.formName,
    section: r.section,
    sectionLabel: hrSectionLabel(r.section),
    // A draft has no submission date — show its last-saved date instead of an
    // empty cell, since "when did I last touch this?" is the useful fact there.
    submittedOn: r.submittedAt ? formatDate(r.submittedAt) : r.updatedAt ? formatDate(r.updatedAt) : "",
    submittedTs: r.submittedAt ? new Date(r.submittedAt).getTime() : 0,
    status: asHrFormStatus(r.status),
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <HrPageHeader
          title="My Filled Forms"
          subtitle="The HR forms you've filled — view, download or mail any of them."
        />

        <div className="mb-4 inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong">
          <Tab href={"/hr/my-forms" as Route} active={tab === "submitted"} label="Submitted" />
          <Tab href={"/hr/my-forms?tab=drafts" as Route} active={tab === "drafts"} label="Drafts" />
        </div>

        {/* The empty state has to match the TAB, not the surface: the default
            copy ("you haven't filled any forms yet") is plainly wrong when you
            are looking at an empty Drafts tab having submitted several. */}
        <FilledFormsTable
          rows={tableRows}
          variant="mine"
          hideStatusFilter
          emptyTitle={tab === "drafts" ? "No drafts in progress." : "You haven't submitted any forms yet."}
          emptyBody={
            tab === "drafts"
              ? "A form you save without submitting waits here until you finish it."
              : "Once you fill and submit an HR form, it will appear here with options to view, download or mail it."
          }
        />

        {tab === "submitted" && rowCount === 0 && (
          <p className="mt-3 text-[12.5px] text-ink-subtle">
            Saved but not finished a form? Check{" "}
            <Link href={"/hr/my-forms?tab=drafts" as Route} className="font-bold text-altus-red underline underline-offset-2">
              Drafts
            </Link>
            .
          </p>
        )}
      </PageShell>
    </>
  );
}

function Tab({ href, active, label }: { href: Route; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="px-4 py-1.5 text-[13px] font-bold transition-colors"
      style={
        active
          ? { background: "var(--color-surface-soft)", color: "var(--color-ink-strong)" }
          : { background: "var(--color-surface-card)", color: "var(--color-ink-subtle)" }
      }
    >
      {label}
    </Link>
  );
}
