import { Briefcase } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { MastersHeader } from "@/components/operations/masters/masters-header";
import { JdBank } from "@/components/operations/job-description/jd-bank";
import { loadJdBank } from "@/lib/operations/jd-bank-data";

export const dynamic = "force-dynamic";

/** OPERATIONS → MASTERS → Master JD — the JD Bank by position, without personal tasks. */
export default async function GeneralJdMasterPage() {
  await requireWorkspace("operations");
  const { entries, positions, ranks, people, holders, demo } = await loadJdBank();

  return (
    <PageShell>
      {demo && <DemoBanner migration="0222" what="Job Description" />}
      <MastersHeader
        Icon={Briefcase}
        topic="Job Description"
        title="Master JD"
        description="Job descriptions owned by a position — the work stays with the seat when people change. Add one at a time or bulk upload from Excel."
      />
      <JdBank
        entries={entries.filter((e) => !e.ownerEmployeeId)}
        positions={positions}
        ranks={ranks}
        people={people}
        holders={holders}
        mode="general"
      />
    </PageShell>
  );
}
