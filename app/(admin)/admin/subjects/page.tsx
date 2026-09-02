import { requireAdmin } from "@/lib/auth/current";
import { listSubjectsWithCounts } from "@/lib/queries/subjects";
import { SubjectList } from "@/components/admin/subject-list";
import { CreateSubjectDialog } from "@/components/admin/create-subject-dialog";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  await requireAdmin();
  const rows = await listSubjectsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const totalTasks = rows.reduce((sum, r) => sum + r.taskCount, 0);

  return (
    <div>
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Admin · Subjects
          </div>
          <h1
            className="mt-1 text-ink-strong"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Subjects
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
            {rows.length} total · {activeCount} active · {totalTasks} tasks mapped
          </p>
        </div>
        <div className="mt-1">
          <CreateSubjectDialog />
        </div>
      </header>
      <SubjectList subjects={rows} />
    </div>
  );
}
