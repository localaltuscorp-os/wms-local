import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { listProjectNodeOptions } from "@/lib/queries/projects";
import { getTaskById } from "@/lib/queries/tasks";
import { requireUser } from "@/lib/auth/current";
import type { TaskPriority } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function NewTaskPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const { from } = await searchParams;
  const [all, clients, subjects, projectNodes] = await Promise.all([
    listEmployees(),
    listActiveClientNames(),
    listActiveSubjectNames(),
    listProjectNodeOptions(),
  ]);
  const options = all.map((e) => ({ id: e.id, name: e.name }));

  // Duplicate flow: prefill the form from an existing task (?from=<id>).
  let defaults: {
    initiatorId: string;
    doerId?: string;
    priority?: TaskPriority;
    title?: string;
    subject?: string;
    description?: string;
    notes?: string;
    projectNodeId?: string;
  } = { initiatorId: me.id };
  if (from) {
    const src = await getTaskById(from);
    if (src) {
      defaults = {
        initiatorId: src.initiatorId,
        doerId: src.doerId,
        priority: src.priority,
        title: src.title,
        subject: src.subject ?? undefined,
        description: src.description ?? undefined,
        notes: src.notes ?? undefined,
        projectNodeId: src.projectNodeId ?? undefined,
      };
    }
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[720px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">New Task</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Create a task and assign it to a doer. The initiator approves it
            once it's done.
          </p>
        </header>
        <div
          className="bg-surface-card rounded-section border border-hairline p-6"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <NewTaskForm
            employees={options}
            clients={clients}
            subjects={subjects}
            projectNodes={projectNodes}
            defaults={defaults}
          />
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
