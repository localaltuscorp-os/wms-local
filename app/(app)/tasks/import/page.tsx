import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { TaskImport } from "@/components/tasks/task-import";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function ImportTasksPage() {
  const me = await requireUser();
  if (!me.isAdmin) redirect("/tasks");

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full">
        <TaskImport />
      </main>
      <DashboardFooter />
    </>
  );
}
