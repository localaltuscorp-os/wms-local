import "server-only";
import { notFound } from "next/navigation";
import { TaskDetailRedesign } from "@/components/tasks/detail/task-detail-redesign";
import { getTaskById } from "@/lib/queries/tasks";
import { getTaskChecklist, getTaskAttachments } from "@/lib/queries/task-detail-extras";
import { computeTaskInsight } from "@/lib/tasks/insight";
import { listTaskEvents } from "@/lib/queries/audit";
import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { listProjectNodeOptions } from "@/lib/queries/projects";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { canManagerApprove, canAdminApprove } from "@/lib/tasks/approval-permissions";
import {
  canEditTaskFields,
  canApprove,
  canReassign,
  canComment,
} from "@/lib/auth/task-permissions";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { taskTimeConsent } from "@/db/schema";
import { getTaskTimeState } from "@/lib/queries/task-time";
import { getTaskSnapshots } from "@/lib/queries/work-snapshots";
import { timeIntelEnabled, workCameraEnabled, snapshotIntervalMinutes } from "@/lib/tasks/time/flags";

interface Props {
  taskId: string;
  me: {
    id: string;
    /** Needed for the founder check that gates ADMIN approval. Optional so
     *  callers that predate two-stage approval (e.g. the main tasks page) still
     *  satisfy the prop; a missing email simply means no admin-approve button. */
    email?: string | null;
    name: string;
    avatarUrl: string | null;
    department: string | null;
    isAdmin: boolean;
    isSuperAdmin: boolean;
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

  const timeOn = timeIntelEnabled();
  const [events, all, statusDisplay, clients, subjects, projectNodes, timeState, myConsent, snapshots, checklist, attachments] =
    await Promise.all([
      listTaskEvents(taskId),
      listEmployees(),
      getStatusDisplayMap(),
      listActiveClientNames(),
      listActiveSubjectNames(),
      listProjectNodeOptions(),
      timeOn ? getTaskTimeState(taskId) : Promise.resolve(null),
      timeOn
        ? db.select({ id: taskTimeConsent.employeeId }).from(taskTimeConsent).where(eq(taskTimeConsent.employeeId, me.id)).limit(1)
        : Promise.resolve([] as { id: string }[]),
      timeOn && me.isSuperAdmin ? getTaskSnapshots(taskId) : Promise.resolve([]),
      getTaskChecklist(taskId),
      getTaskAttachments(taskId),
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

  // Task Time Intelligence gating: the doer + their manager (+ admins) operate the
  // timer; managers + admins issue verdicts; super-admins see the camera gallery.
  const isDoer = me.id === task.doerId;
  const timePanel =
    timeOn && timeState
      ? {
          state: timeState,
          isDoer,
          canOperate: me.isAdmin || isDoer || isDoersManager,
          canApprove: me.isAdmin || isDoersManager,
          // Two-stage approval (mig 0185) — computed server-side ONLY to decide
          // which button to draw; decideTaskApproval re-derives both rules.
          canManagerApprove: canManagerApprove(
            { id: me.id, email: me.email ?? null, isAdmin: me.isAdmin },
            {
              status: task.status,
              approvalLevel: (task.approvalLevel ?? "none") as "none" | "manager" | "admin",
              doerId: task.doerId,
              assignerId: task.initiatorId ?? task.createdById ?? null,
            },
            { isDoersManager, assignerIsAdmin: true, assignerIsManager: true },
          ),
          canAdminApprove: canAdminApprove(
            { id: me.id, email: me.email ?? null, isAdmin: me.isAdmin },
            {
              status: task.status,
              approvalLevel: (task.approvalLevel ?? "none") as "none" | "manager" | "admin",
              doerId: task.doerId,
              assignerId: task.initiatorId ?? task.createdById ?? null,
            },
          ),
          taskUpdatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null,
          approvalStatus: task.approvalStatus,
          taskStatus: task.status,
          isSuperAdmin: me.isSuperAdmin,
          snapshots,
          camera: {
            enabled: workCameraEnabled(),
            hasConsent: myConsent.length > 0,
            intervalMin: snapshotIntervalMinutes(),
          },
        }
      : null;

  const insight = computeTaskInsight({
    status: task.status,
    approvalStatus: task.approvalStatus,
    dueAt: task.dueAt,
    totalActiveSeconds: timeState?.rollup.totalActiveSeconds ?? 0,
    estimatedMinutes: task.estimatedMinutes,
    rejectionCount: timeState?.rollup.rejectionCount ?? 0,
    now: new Date(),
  });

  return (
    <TaskDetailRedesign
      task={task}
      me={{ id: me.id, name: me.name, avatarUrl: me.avatarUrl, department: me.department, isAdmin: me.isAdmin }}
      canEdit={canEditTaskFields(permInput)}
      canManageContent={me.isAdmin || isDoer || isDoersManager}
      events={events}
      clients={clients}
      subjects={subjects}
      projectNodes={projectNodes}
      statusLabels={statusLabels}
      timePanel={timePanel}
      checklist={checklist}
      attachments={attachments}
      insight={insight}
    />
  );
}
