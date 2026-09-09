import { redirect } from "next/navigation";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { resolveGoalsView } from "@/app/(app)/goals/cascade/view";
import { GoalsImport } from "@/components/goals/cascade/goals-import";

export const dynamic = "force-dynamic";

// Admin-only cascade bulk-import surface (fan rows across the team). Renders the
// real xlsx/CSV importer (Year / Quarter / Month) built by the CASCADE-UI slice;
// the visible roster feeds the "default owner" picker for rows without an
// Employee column.
export default async function GoalsImportPage() {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!isAdmin) redirect("/goals" as Route);

  const view = await resolveGoalsView(me, isAdmin);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <h1
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 32 }}
        >
          Bulk Import
        </h1>
        <p className="mt-2 max-w-[64ch] text-ink-muted">
          Upload a spreadsheet to create Yearly, Quarterly, and Monthly cascade goals in bulk —
          each row lands at the level its <strong>Period</strong> + <strong>PeriodKey</strong> name.
          Weekly goals import from the Weekly board.
        </p>
        <div className="mt-6">
          <GoalsImport roster={view.roster} />
        </div>
      </PageShell>
    </>
  );
}
