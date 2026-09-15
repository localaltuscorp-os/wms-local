import { UserRound } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { MastersHeader } from "@/components/operations/masters/masters-header";
import { JdBank } from "@/components/operations/job-description/jd-bank";
import { loadJdBank } from "@/lib/operations/jd-bank-data";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → MASTERS → Person-specific JD.
 *
 * Pick a person from the list on the left and see their whole JD — from their
 * seat, given to them by name, and personal. `?person=<id>` opens one directly.
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
      <MastersHeader
        Icon={UserRound}
        topic="Job Description"
        title="Person-specific JD"
        description="One person's whole Job Description — their seat's tasks, tasks given to them by name, and tasks written for them alone."
      />
      <JdBank
        entries={entries}
        positions={positions}
        ranks={ranks}
        people={people}
        holders={holders}
        mode="person"
        initialPersonId={sp.person ?? null}
      />
    </PageShell>
  );
}
