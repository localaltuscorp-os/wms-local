import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { PersonJdWorkbench } from "@/components/operations/job-description/person-jd-workbench";
import { loadJdBank } from "@/lib/operations/jd-bank-data";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → MASTERS → Person-specific JD.
 *
 * Pick a person from the dropdown beside the heading and see their whole JD —
 * from their seat, given to them by name, and personal. `?person=<id>` opens one
 * directly.
 *
 * The heading and the JD are one client island (PersonJdWorkbench) because the
 * picker sits in the heading and the JD reacts to it; the loading stays here.
 */
export default async function PersonJdMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  await requireWorkspace("operations");
  const [{ entries, positions, ranks, people, holders, demo }, sp] = await Promise.all([
    loadJdBank(),
    searchParams,
  ]);

  return (
    <PageShell>
      {demo && <DemoBanner migration="0222" what="Job Description" />}
      <PersonJdWorkbench
        entries={entries}
        positions={positions}
        ranks={ranks}
        people={people}
        holders={holders}
        initialPersonId={sp.person ?? null}
      />
    </PageShell>
  );
}
