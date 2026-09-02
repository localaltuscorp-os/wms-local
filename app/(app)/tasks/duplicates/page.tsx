import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { DuplicateFinder } from "@/components/tasks/duplicate-finder";
import { findDuplicateGroups } from "@/lib/queries/duplicates";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { requireUser } from "@/lib/auth/current";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

export default async function DuplicateTasksPage() {
  const me = await requireUser();
  if (!me.isAdmin) redirect("/tasks");

  const [groups, statusDisplay] = await Promise.all([
    findDuplicateGroups(),
    getStatusDisplayMap(),
  ]);

  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full">
        <DuplicateFinder
          groups={groups}
          statusLabels={statusLabels}
          statusTones={statusTones}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
