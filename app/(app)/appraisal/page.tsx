import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * /appraisal — kept alive, but no longer a surface of its own.
 *
 * Appraisal moved INTO Team Productivity (`/productivity/appraisal`), where it
 * sits beside My Dashboard and Team Performance. This route stays because it is
 * bookmarked, deep-linked from five inbox notification types
 * (`appraisal_cycle_opened`, `_self_reminder`, `_manager_pending`,
 * `_management_pending`, `_finalized`) and linked from the admin panel — all of
 * which must keep landing somewhere real.
 *
 * It REDIRECTS rather than rendering a second copy of the workbench. Two live
 * copies of the same page is the duplicate-feature outcome this move exists to
 * avoid: they drift, and half the org ends up on the stale one. Everything that
 * used to happen here — the roster query, the scope rule, the scorecard load —
 * now happens in `lib/appraisal2/scope.ts`, which the destination calls.
 *
 * `?emp=` is carried across, so a link to a specific person's scorecard still
 * opens that person's scorecard.
 */
export default async function AppraisalPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string }>;
}) {
  const { emp } = await searchParams;
  redirect((emp ? `/productivity/appraisal?emp=${encodeURIComponent(emp)}` : "/productivity/appraisal") as Route);
}
