import { notFound } from "next/navigation";
import { getTaskById } from "@/lib/queries/tasks";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { requireUser } from "@/lib/auth/current";
import { type TaskStatus, type StatusColorToken } from "@/db/enums";
import { FocusWorkspace } from "@/components/tasks/focus-workspace";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Focus mode — full-viewport immersive single-task view for deep work.
 * No dashboard chrome, no audit feed, no action rail. Dark canvas with
 * red-radial drama (mirrors login + projects hero), a Pomodoro timer,
 * quick action sidebar, and large editorial type for the task itself.
 */
export default async function TaskFocusPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireUser();
  const task = await getTaskById(id);
  if (!task) notFound();

  const statusDisplay = await getStatusDisplayMap();
  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  return (
    <FocusWorkspace
      task={{
        id: task.id,
        title: task.title,
        description: task.description,
        subject: task.subject,
        notes: task.notes,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt,
        updatedAt: task.updatedAt,
        doerName: task.doerName,
        initiatorName: task.initiatorName,
        creatorName: task.creatorName,
      }}
      statusLabels={statusLabels}
      statusTones={statusTones}
      isAdmin={me.isAdmin}
    />
  );
}
