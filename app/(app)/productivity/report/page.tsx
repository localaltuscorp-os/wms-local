import { notFound } from "next/navigation";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { getProductivityViewer, canViewProductivityOf } from "@/lib/productivity/access";
import { loadProductivity } from "@/lib/productivity/data";
import { ProductivityReportView } from "@/components/productivity/report-view";

export const dynamic = "force-dynamic";

/**
 * Productivity Dashboard · Full Report — the detail view behind the dashboard's
 * "View Full Report" button.
 *
 * SAME DATA, SAME GATE: it calls the identical `loadProductivity` the dashboard
 * calls and re-runs `canViewProductivityOf` here rather than trusting the page
 * that linked in. The route is directly addressable, so editing `emp=` must be
 * refused at this boundary too — and refused with a 404, which does not
 * distinguish "no such employee" from "not yours" and therefore cannot be used
 * to enumerate the org chart.
 */
export default async function ProductivityReportPage({
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
      <PageShell as="main" width="standard" py={false} className="pt-7 pb-14 max-md:pt-5 max-md:pb-10">
        <ProductivityReportView
          snap={snap}
          // Back goes to the dashboard this report expands, carrying the subject
          // so a manager lands on the person they were reading, not themselves.
          backHref={(viewingOther ? `/productivity?emp=${targetId}` : "/productivity") as Route}
        />
      </PageShell>
    </>
  );
}
