import "server-only";
import { notFound } from "next/navigation";
import { TaskDetailView } from "@/components/tasks/task-detail-view";
import { getTaskById } from "@/lib/queries/tasks";
import { listTaskEvents } from "@/lib/queries/audit";
import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { listProjectNodeOptions } from "@/lib/queries/projects";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import {
  canEditTaskFields,
  canApprove,
  canReassign,
  canComment,
} from "@/lib/auth/task-permissions";

interface Props {
  taskId: string;
  me: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
    isAdmin: boolean;
  };
}

/**
 * Async server component that owns the entire task-detail data fan-out.
 *
 * Lives behind a `<Suspense>` boundary on the page so the dashboard
 * header/footer paint instantly; this component awaits the seven queries
 * (one per-task `getTaskById` + six picker payloads, of which five are
 * already cached as of Phase 1.1) and streams the rendered TaskDetailView
 * once they all settle. Cold task open goes from "blank page for ~2s
 * then full render" to "shell + skeleton instantly, content fills in".
 */
export async function TaskDetailLoader({ taskId, me }: Props) {
  const task = await getTaskById(taskId);
  if (!task) notFound();

  const [events, all, statusDisplay, clients, subjects, projectNodes] = await Promise.all([
    listTaskEvents(taskId),
    listEmployees(),
    getStatusDisplayMap(),
    listActiveClientNames(),
    listActiveSubjectNames(),
    listProjectNodeOptions(),
  ]);
  const employeeOptions = all.map((e) => ({ id: e.id, name: e.name }));
  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const permInput = {
    employee: { id: me.id, isAdmin: me.isAdmin },
    task: {
      createdById: task.createdById,
      initiatorId: task.initiatorId,
      doerId: task.doerId,
      status: task.status,
    },
  };

  // Workflow-gated visibility for Approve/Decline. The matrix lets admins
  // jump from any status to "approved" via override, which surfaces those
  // cards on a "Not Started" task — misleading. Restrict the CTA to the
  // moment it's meaningful (doer has marked work done). Admins keep the
  // override at the server level if they ever need to force a verdict.
  const isDoersManager = !!task.doerManagerId && task.doerManagerId === me.id;
  const showApproveCard =
    canApprove({ ...permInput, isDoersManager }) && task.status === "done";

  return (
    <TaskDetailView
      task={task}
      canEdit={canEditTaskFields(permInput)}
      canApproveTask={showApproveCard}
      canReassignTask={canReassign(permInput)}
      canCommentOnTask={canComment(permInput)}
      events={events}
      employees={employeeOptions}
      clients={clients}
      subjects={subjects}
      projectNodes={projectNodes}
      me={me}
      statusLabels={statusLabels}
      statusTones={statusTones}
    />
  );
}
