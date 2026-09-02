import { DashboardHeader } from "@/components/layout/header";
import { TaskImport } from "@/components/tasks/task-import";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function ImportTasksPage() {
  // Bulk import is open to EVERY signed-in user (not admin-only) — same as
  // creating a single task, just many at once.
  await requireUser();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full">
        <TaskImport />
      </main>
    </>
  );
}
