import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { canManageTaskRosters } from "@/lib/security/capabilities";
import { listSubjectsWithCounts } from "@/lib/queries/subjects";
import { SubjectList } from "@/components/admin/subject-list";
import { CreateSubjectDialog } from "@/components/admin/create-subject-dialog";
import { RosterLockedNote } from "@/components/admin/roster-locked-note";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { Tag } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Subjects — every admin can SEE the list; only Manan Sir, Jeevan and Rohan
 * (`task_rosters.manage`) can change it (2026-09-15). The actions re-check.
 */
export default async function SubjectsPage() {
  const me = await requireUser();
  const canEdit = canManageTaskRosters(me.email);
  if (!me.isAdmin && !canEdit) redirect("/hub");

  const rows = await listSubjectsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;
  const totalTasks = rows.reduce((sum, r) => sum + r.taskCount, 0);

  return (
    <AdminSection
      eyebrow="Admin · Subjects"
      title="Subjects"
      subtitle={`${rows.length} total · ${activeCount} active · ${totalTasks} tasks mapped`}
      icon={Tag}
      stats={[
        { label: "Total", value: rows.length },
        { label: "Active", value: activeCount, tone: "green" },
        { label: "Inactive", value: inactiveCount },
        { label: "Tasks mapped", value: totalTasks, tone: "red" },
      ]}
      actions={canEdit ? <CreateSubjectDialog /> : <RosterLockedNote noun="subjects" />}
    >
      <SubjectList subjects={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
