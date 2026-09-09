import { Award } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { loadAppraisalWorkspace } from "@/lib/appraisal2/scope";
import { AppraisalWorkspace } from "@/components/appraisal2/appraisal-workspace";

export const dynamic = "force-dynamic";

/**
 * Team Productivity · Appraisal — the module's third surface, beside My
 * Dashboard and Team Performance.
 *
 * NOTHING WAS REBUILT. This is the existing Appraisal v2 workbench: the same
 * `AppraisalWorkspace` client component, the same `getScorecardData` engine, the
 * same `appr_*` tables, the same server actions for scoring and finalising. The
 * page's whole job is to mount it at this route and hand the picker a `basePath`
 * so navigating between people keeps you inside the Productivity room.
 *
 * Scope and authorisation are the APPRAISAL module's own, unchanged, and shared
 * with the legacy `/appraisal` entry point through `loadAppraisalWorkspace` —
 * admin sees everyone, everyone else sees themselves plus whoever they are the
 * assigned manager/management for. That is deliberately not this module's
 * direct-reports rule: Appraisal's tiers are assignments in `appr_config`, and
 * re-deciding who may score whom on the way in would have quietly changed who
 * can appraise whom.
 *
 * It is therefore NOT manager-gated, and does not need to be: an employee lands
 * on their own scorecard and can reach no one else's, which is the "appraisal
 * information they are allowed to see" half of My Productivity.
 */
export default async function ProductivityAppraisalPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string }>;
}) {
  const { emp } = await searchParams;
  const { roster, departments, selectedId, data, isAdmin } = await loadAppraisalWorkspace(emp);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell as="main" width="full" py={false} className="pt-7 pb-14 max-md:pt-5 max-md:pb-10">
        {/* The module's own header idiom — eyebrow, display title, one line of
            orientation — the same shape My Dashboard and Team Performance use,
            rather than the standalone page's full-bleed gradient banner. Landing
            here should feel like a third tab of one module, not a different app. */}
        <header className="mb-6">
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            <Award size={13} strokeWidth={2.6} /> Team Productivity
          </div>
          <h1
            className="mt-0.5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: "clamp(22px, 2.2vw, 30px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.08,
            }}
          >
            Appraisal
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[13px] font-medium text-ink-muted">
            One live rolling scorecard per person — the KPI bucket drives the incentive payout,
            Monthly Goals and the culture/competency dimensions round out the rest. Self and Manager
            advise, Management is final.
          </p>
        </header>

        <AppraisalWorkspace
          people={roster}
          departments={departments}
          selectedId={selectedId}
          data={data}
          isAdmin={isAdmin}
          basePath="/productivity/appraisal"
        />
      </PageShell>
    </>
  );
}
