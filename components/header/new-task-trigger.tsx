import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { listProjectNodeOptions } from "@/lib/queries/projects";
import { getCurrentEmployee } from "@/lib/auth/current";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";

export async function NewTaskTrigger() {
  const me = await getCurrentEmployee();
  if (!me) return null;
  const [all, clients, subjects, projectNodes] = await Promise.all([
    listEmployees(),
    listActiveClientNames(),
    listActiveSubjectNames(),
    listProjectNodeOptions(),
  ]);
  const options = all.map((e) => ({ id: e.id, name: e.name }));
  return (
    <NewTaskDialog
      employees={options}
      clients={clients}
      subjects={subjects}
      projectNodes={projectNodes}
      defaultInitiatorId={me.id}
      isAdmin={me.isAdmin}
    />
  );
}
