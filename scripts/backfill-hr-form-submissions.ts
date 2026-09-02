/**
 * Backfill the HR forms index from the tables that actually own the data.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `hr_form_submissions` is an INDEX over the HR lifecycle forms, and each form
 * writes its own row there from its save action. That only ever indexes saves
 * made AFTER the indexing code shipped. `submitOnboarding` gained its
 * `recordHrFormSubmission` call late, so on the production database every single
 * onboarding form predated it: 20 rows in `onboarding_submissions`, 18 of them
 * SUBMITTED, and not one of them present in the index.
 *
 * The visible symptom is the one worth naming, because it is not "a list is
 * short" — it is that HR Record, All Forms and My Forms all read the index and
 * therefore reported "Not Filled" for eighteen people who had demonstrably
 * filled and submitted their form. A status that contradicts the stored record
 * is worse than a missing feature: it gets acted on.
 *
 * ── IDEMPOTENT ─────────────────────────────────────────────────────────────
 * Every write is an upsert arbitrated by `hr_form_submissions_source_uniq`, the
 * same partial unique index the live recorder uses, so re-running this is a
 * no-op rather than a second set of rows. Safe to run as often as you like.
 *
 * ── STATUS AND TIMESTAMPS ARE COPIED, NOT INVENTED ─────────────────────────
 * A backfilled row carries the SOURCE row's status and its real `submitted_at`.
 * Stamping `now()` would have been easier and would have told eighteen people
 * they submitted their onboarding form today.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/backfill-hr-form-submissions.ts           # dry run
 *   pnpm tsx --env-file=.env.local scripts/backfill-hr-form-submissions.ts --apply
 */
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { onboardingSubmissions } from "../db/schema";
import { hrFormSubmissions } from "../lib/hr/forms/schema";
import { getHrForm } from "../lib/hr/forms/registry";
import { onboardingResponses } from "../lib/dossier/onboarding-responses";
import type { OnboardingFileRef } from "../lib/dossier/onboarding-schema";

const APPLY = process.argv.includes("--apply");

/**
 * The upsert is spelled out here rather than imported from
 * `lib/hr/forms/record.ts` because that module is `server-only` and throws
 * outside a Next server bundle. It mirrors that function's conflict target and
 * its two non-obvious rules — status never walks backwards, `submitted_at` is
 * never moved — so a backfill can never demote or re-date a live row.
 */
async function main() {
  const def = getHrForm("onboarding");
  if (!def) throw new Error('The "onboarding" form is not in the registry.');

  const rows = await db
    .select({
      id: onboardingSubmissions.id,
      employeeId: onboardingSubmissions.employeeId,
      fields: onboardingSubmissions.fields,
      files: onboardingSubmissions.files,
      status: onboardingSubmissions.status,
      submittedAt: onboardingSubmissions.submittedAt,
      createdById: onboardingSubmissions.createdById,
      updatedById: onboardingSubmissions.updatedById,
    })
    .from(onboardingSubmissions);

  console.log(`\nonboarding_submissions: ${rows.length} row(s)`);
  if (!APPLY) console.log("DRY RUN — nothing will be written. Re-run with --apply.\n");

  let written = 0;
  let skipped = 0;

  for (const r of rows) {
    const status = r.status === "submitted" ? "submitted" : "draft";
    const responses = onboardingResponses(
      (r.fields ?? {}) as Record<string, string>,
      (r.files ?? {}) as Record<string, OnboardingFileRef>,
    );

    if (!r.employeeId) {
      // The column is NOT NULL in practice, but a row without a subject cannot
      // be indexed and must be reported rather than silently dropped.
      console.log(`  SKIP  ${r.id} — no employee_id`);
      skipped += 1;
      continue;
    }

    console.log(
      `  ${APPLY ? "WRITE" : "would"}  ${r.employeeId}  status=${status.padEnd(9)} ` +
        `answers=${String(responses.length).padStart(3)}  ` +
        `submittedAt=${r.submittedAt ? r.submittedAt.toISOString().slice(0, 10) : "—"}`,
    );
    if (!APPLY) continue;

    await db
      .insert(hrFormSubmissions)
      .values({
        formKey: def.key,
        formName: def.name,
        section: def.section,
        employeeId: r.employeeId,
        // Best available attribution: whoever last touched the source row, else
        // whoever created it. Null is acceptable — the column is nullable and a
        // wrong name is worse than no name.
        submittedById: r.updatedById ?? r.createdById ?? null,
        status,
        responses,
        sourceTable: def.sourceTable,
        sourceId: r.id,
        submittedAt: r.submittedAt,
      })
      .onConflictDoUpdate({
        target: [
          hrFormSubmissions.formKey,
          hrFormSubmissions.employeeId,
          hrFormSubmissions.sourceId,
        ],
        targetWhere: sql`${hrFormSubmissions.sourceId} is not null`,
        set: {
          formName: def.name,
          section: def.section,
          responses,
          sourceTable: def.sourceTable,
          updatedAt: new Date(),
          status: sql`case when ${hrFormSubmissions.status} = 'submitted'
                           then 'submitted' else excluded.status end`,
          submittedAt: sql`coalesce(${hrFormSubmissions.submittedAt}, excluded.submitted_at)`,
        },
      });
    written += 1;
  }

  const counted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hrFormSubmissions);
  const n = counted[0]?.n ?? 0;

  console.log(
    `\n${APPLY ? `Wrote ${written} row(s)` : "Dry run complete"}` +
      `${skipped ? `, skipped ${skipped}` : ""}.`,
  );
  console.log(`hr_form_submissions now holds ${n} row(s).\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nBackfill FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
