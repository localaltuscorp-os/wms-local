import { requireAdmin } from "@/lib/auth/current";
import { listSubjectsWithCounts } from "@/lib/queries/subjects";
import { SubjectList } from "@/components/admin/subject-list";
import { CreateSubjectDialog } from "@/components/admin/create-subject-dialog";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { Tag } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  await requireAdmin();
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
      actions={<CreateSubjectDialog />}
    >
      <SubjectList subjects={rows} />
    </AdminSection>
  );
}
