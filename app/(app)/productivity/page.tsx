import { notFound } from "next/navigation";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import {
  getProductivityViewer,
  canViewProductivityOf,
} from "@/lib/productivity/access";
import { loadProductivity } from "@/lib/productivity/data";
import { ProductivityDashboardView } from "@/components/productivity/dashboard-view";

export const dynamic = "force-dynamic";

/**
 * Productivity Dashboard · My Dashboard (§20) — and the drill-down target for
 * Team Performance (§5, §22).
 *
 * ONE page serves both: with no `?emp=` it is your own dashboard; with `?emp=<id>`
 * it is that person's, provided you may see them. Admin does NOT get a separate
 * design — same component, different subject (§22).
 *
 * AUTHORISATION (§23) runs at the data layer, before anything loads:
 * `canViewProductivityOf` re-derives the relationship from the org chart on every
 * request, so editing the `emp` parameter cannot reach an unrelated employee. A
 * refusal 404s rather than explaining itself — distinguishing "no such employee"
 * from "not yours" would let a manager enumerate the org chart.
 */
export default async function ProductivityMyDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getProductivityViewer();
  const sp = await searchParams;
  const raw = Array.isArray(sp.emp) ? sp.emp[0] : sp.emp;

  const targetId = raw && raw !== viewer.id ? raw : viewer.id;
  const viewingOther = targetId !== viewer.id;

  if (viewingOther && !(await canViewProductivityOf(viewer, targetId))) notFound();

  const snap = await loadProductivity(targetId);
  if (!snap) notFound();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell as="main" width="full" py={false} className="pt-7 pb-14 max-md:pt-5 max-md:pb-10">
        {/* No page title here: the employee header IS the title — it already
            names the module, the person and the period. A second heading above
            it only pushed the first section further down the fold. */}
        <ProductivityDashboardView
          snap={snap}
          viewingOther={viewingOther}
          // The back-link only makes sense when you actually came from the team
          // list — on your own dashboard there is nothing to go back to.
          backHref={viewingOther ? ("/productivity/team" as Route) : undefined}
        />
      </PageShell>
    </>
  );
}
