"use client";

import { Avatar as SharedAvatar } from "@/components/ui/avatar";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  ChevronLeft,
  Pencil,
  Copy,
  MoreHorizontal,
  CheckCircle2,
  Building2,
  Calendar,
  ChevronDown,
  Loader2,
  Flag,
  Timer,
  Archive,
  Trash2,
  Paperclip,
  History as HistoryIcon,
  ListChecks,
  Link as LinkIcon,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { TaskDetail as TaskDetailModel } from "@/lib/queries/tasks";
import type { AuditFeedRow } from "@/lib/queries/audit";
import type { ChecklistItemView, AttachmentView } from "@/lib/queries/task-detail-extras";
import type { TaskInsight } from "@/lib/tasks/insight";
import { progressFromStatus, formatEstimate } from "@/lib/tasks/insight";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import {
  DOER_TASK_STATUSES,
  PRIORITY_LABELS,
  type TaskStatus,
} from "@/db/enums";
import { setTaskStatus, archiveTask, deleteTask } from "@/app/(app)/tasks/actions";
import { duplicateTask } from "@/app/(app)/tasks/duplicate-action";
import { setTaskEstimatedMinutes } from "@/app/(app)/tasks/estimate-action";
import { markDoneAction, decideApprovalAction } from "@/app/(app)/tasks/time-actions";
import { AuditFeed } from "@/components/tasks/audit-feed";
import { CommentInput } from "@/components/tasks/comment-input";
import { TaskEditForm } from "@/components/tasks/task-edit-form";
import { TaskTimePanel, type TaskTimePanelData } from "@/components/tasks/time/task-time-panel";
import { TaskChecklist } from "@/components/tasks/detail/task-checklist";
import { TaskHeroBand } from "@/components/tasks/detail/task-hero-band";
import { TaskAttachments } from "@/components/tasks/detail/task-attachments";
import {
  TaskTimelineRail,
  TimeSpentCard,
  AIInsightsCard,
  TeamMembersCard,
} from "@/components/tasks/detail/detail-rail";
import { useElapsedSeconds } from "@/components/tasks/time/use-elapsed";

type Me = { id: string; name: string; avatarUrl: string | null; department: string | null; isAdmin: boolean };

interface Props {
  task: TaskDetailModel;
  me: Me;
  canEdit: boolean;
  canManageContent: boolean;
  events: AuditFeedRow[];
  clients: string[];
  subjects: string[];
  projectNodes?: { id: string; label: string }[];
  statusLabels: Record<TaskStatus, string>;
  timePanel: TaskTimePanelData | null;
  checklist: ChecklistItemView[];
  attachments: AttachmentView[];
  insight: TaskInsight;
}

const PRIORITY_TONE: Record<string, { bg: string; fg: string }> = {
  imp_urgent: { bg: "color-mix(in srgb, #e10600 12%, white)", fg: "#a80400" },
  imp_not_urgent: { bg: "#fef3c7", fg: "#b45309" },
  not_imp_urgent: { bg: "#dbeafe", fg: "#1d4ed8" },
  not_imp_not_urgent: { bg: "var(--color-surface-soft)", fg: "var(--color-ink-muted)" },
};

/* Overview · Checklist · Files · Timeline · Activity.
   `comments` is gone as a TAB because the comment box is a fixed footer now —
   a composer you have to navigate to is a composer people stop using. The
   audit feed it used to sit above is what Activity shows. */
type Tab = "overview" | "checklist" | "files" | "timeline" | "activity";

function Avatar({ name, url, size = 28 }: { name: string | null; url?: string | null; size?: number }) {
  // Shared <Avatar>: the local version returned a bare <img> with no onError,
  // so a dead URL showed the broken-image glyph instead of falling through to
  // the initials branch right below it.
  return <SharedAvatar name={name} avatarUrl={url} size={size} />;
}

export function TaskDetailRedesign(props: Props) {
  const { task, me, canEdit, canManageContent, events, clients, subjects, projectNodes, statusLabels, timePanel, checklist, attachments, insight } = props;
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [statusOpen, setStatusOpen] = React.useState(false);

  const expectedUpdatedAt = task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt);
  const locked = task.approvalStatus === "approved";
  const progress = progressFromStatus(task.status, task.approvalStatus);
  // The SAME six doer statuses the row chip and the bulk Status dropdown offer.
  // This drawer opens inline on /tasks (?task=<id>), so an admin could
  // previously see the row chip offering six options and this pill — on the very
  // same screen, for the very same task — offering nine. The manager's rulings
  // (hold / approve / decline / cancel) live in the bulk "Mark Status" control
  // and, per-task, in this drawer's Edit form, which carries approvalStatus.
  const statusList: readonly TaskStatus[] = DOER_TASK_STATUSES;
  // Submitted, not yet signed off, and this viewer is the one who signs off.
  const awaitingApproval =
    Boolean(timePanel?.canApprove) && task.status === "done" && task.approvalStatus !== "approved";

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string } | void>, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res && "ok" in res && res.ok === false) fireToast({ message: res.message ?? res.error ?? "Failed", type: "error" });
      else after?.();
      router.refresh();
    });
  }

  function changeStatus(s: TaskStatus) {
    setStatusOpen(false);
    if (s === task.status) return;
    run(() => setTaskStatus(task.id, s, expectedUpdatedAt));
  }

  if (editing) {
    return (
      <div className="relative">
        <button onClick={() => setEditing(false)} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-muted hover:text-ink-strong">
          <ChevronLeft size={16} /> Back to task
        </button>
        <TaskEditForm
          taskId={task.id}
          clients={clients}
          subjects={subjects}
          projectNodes={projectNodes}
          initial={{
            title: task.title,
            description: task.description,
            subject: task.subject,
            notes: task.notes,
            priority: task.priority,
            dueAt: task.revisedTargetDate ?? task.dueAt,
            tags: task.tags,
            approvalStatus: task.approvalStatus,
            revisedTargetDate: task.revisedTargetDate,
            startsAt: task.startsAt,
            endsAt: task.endsAt,
            allDay: task.allDay,
            recurrence: (task.recurrence as never) ?? null,
            recurrenceRule: task.recurrenceRule,
            projectNodeId: task.projectNodeId,
          }}
          expectedUpdatedAt={expectedUpdatedAt}
          isAdmin={me.isAdmin}
          onCancel={() => { setEditing(false); router.refresh(); }}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* ── CRIMSON HERO BAND ──
      
          Replaces the plain breadcrumb strip. The breadcrumb and the action
          cluster below are the SAME nodes that were here before, passed into
          the band as slots rather than rebuilt: those buttons carry real
          permission checks (`canEdit`, `me.isAdmin`) and server actions, and a
          copy of them made to change their colour is a copy that drifts. */}
      <TaskHeroBand
        taskId={task.id}
        title={task.title}
        /* `DONE · AWAITING APPROVAL` — two facts the reader needs together.
           The status alone says "Done", which is exactly the moment someone
           mistakes submitted for signed off. The suffix appears only while the
           task really is sitting unapproved. */
        statusLabel={
          task.status === "done" && task.approvalStatus !== "approved"
            ? `${statusLabels[task.status] ?? task.status} · Awaiting approval`
            : (statusLabels[task.status] ?? task.status)
        }
        progressPct={progress}
        time={timePanel?.state ?? null}
        canOperate={Boolean(timePanel?.canOperate)}
        locked={locked}
        /* THE PATH IS BACK. It was stripped a few iterations ago on the
           reasoning that the module never changes and the hash is an internal
           id; the current brief asks for `← WMS / Tasks / #2736`, so it
           returns. The arrow and "Tasks" are both live links — a breadcrumb
           whose segments do not navigate is decoration. */
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white/75">
            <Link
              href="/tasks"
              aria-label="Back to tasks"
              className="grid h-7 w-7 place-items-center rounded-lg border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <ChevronLeft size={15} strokeWidth={2.6} />
            </Link>
            <span>WMS</span>
            <span aria-hidden className="text-white/40">/</span>
            <Link href="/tasks" className="transition-colors hover:text-white">Tasks</Link>
            <span aria-hidden className="text-white/40">/</span>
            {/* The TITLE, not `#2803`. A hash is an internal row id: it tells a
                reader nothing and tells a colleague being shown the screen even
                less. Truncated, because a long title must not push the action
                row onto a second line — which is the whole point of a compact
                banner. The number stays in the tooltip for anyone who needs it
                to quote a ticket. */}
            <span
              className="max-w-[260px] truncate font-black text-white"
              title={task.taskNo != null ? `${task.title} (#${task.taskNo})` : task.title}
            >
              {task.title}
            </span>
          </nav>
        }
        actions={
          <>

          {canEdit && (
            <button onClick={() => setEditing(true)} className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-white/20">
              <Pencil size={14} /> Edit Task
            </button>
          )}
          {/* COPY LINK, not Duplicate-as-a-word. The icon row is Edit · Link ·
              More; duplication moves into the ⋯ menu with the other
              record-level actions, where a destructive-adjacent verb belongs. */}
          <button
            onClick={() => {
              const url = `${window.location.origin}/tasks/${task.id}`;
              void navigator.clipboard
                ?.writeText(url)
                .then(() => fireToast({ message: "Link copied", type: "success" }))
                // `clipboard` is undefined on an insecure origin and rejects
                // when the document is not focused — say so rather than
                // silently doing nothing.
                .catch(() => fireToast({ message: "Couldn't copy the link", type: "error" }));
            }}
            title="Copy link to this task"
            aria-label="Copy link to this task"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <LinkIcon size={15} />
          </button>

          {/* PULLED OUT OF THE ⋯ MENU. Duplicate, Archive and Delete were one
              click deeper than Edit for no reason other than menu habit; on a
              banner this wide there is room to state them. Delete keeps a red
              hover so the destructive one never reads as a peer of the other
              two at a glance. */}
          <button
            onClick={() => run(async () => { const r = await duplicateTask(task.id); if (r.ok) router.push(`/tasks/${r.id}`); return r; })}
            title="Duplicate this task"
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-white/20"
          >
            <Copy size={14} /> Duplicate
          </button>
          <button
            onClick={() => run(() => archiveTask(task.id))}
            title="Archive this task"
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-white/20"
          >
            <Archive size={14} /> Archive
          </button>
          {me.isAdmin && (
            <button
              onClick={() => { if (confirm("Delete this task permanently?")) run(() => deleteTask(task.id), () => router.push("/tasks")); }}
              title="Delete this task permanently"
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 text-[12.5px] font-bold text-white transition-colors hover:border-white hover:bg-white hover:text-[#B80D22]"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {/* NO ⋯ MENU. The brief asks to retain it for overflow — but it also
              asks to promote Duplicate, Archive and Delete onto the top line,
              and those three WERE the menu. What was left was a button that
              opened an empty box, which is worse than no button. The moment a
              fourth record-level action exists it comes back; the state and the
              dismiss-scrim pattern are one commit away in history. */}
          {/* THE PRIMARY CTA IS WHOEVER'S TURN IT IS.
              The brief asks for [✓ Approve]. That is the right button only for
              someone who can actually approve, on a task that is actually
              waiting for it — otherwise it is a control that either does
              nothing or is refused server-side. So: Approve for the approver
              once the work is submitted, Mark as Done for the doer before that.
              Both wear the same white-on-crimson pill, because from the
              reader's side both are "the one thing to press here". */}
          {!locked && (
            awaitingApproval ? (
              <button
                disabled={pending}
                onClick={() => run(() => decideApprovalAction(task.id, "approved"))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-[#B80D22] shadow-xs transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Approve
              </button>
            ) : (
              <button
                disabled={pending}
                onClick={() => run(() => (timePanel ? markDoneAction(task.id) : setTaskStatus(task.id, "done", expectedUpdatedAt)))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-[#B80D22] shadow-xs transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark as Done
              </button>
            )
          )}
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-8 max-lg:grid-cols-1">
        {/* ── MAIN COLUMN ── */}
        <div className="min-w-0">
          {/* ONE BADGE STRIP, directly above the tabs.
              Category, status and priority were spread over two rows — the
              subject chip rendered on its own line under the other two — which
              cost a whole band of white space for three pills that belong
              together. Category leads because it is the coarsest label. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {task.subject && (
              <span className="inline-flex h-8 items-center rounded-full bg-[color-mix(in_srgb,#B80D22_9%,white)] px-3 text-[12.5px] font-bold text-[#B80D22]">
                {task.subject}
              </span>
            )}
              {/* Status pill */}
              <div className="relative">
                <button onClick={() => setStatusOpen((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-soft px-3.5 text-[12.5px] font-bold text-ink-strong hover:bg-hairline">
                  <span className="h-2 w-2 rounded-full bg-ink-subtle" /> {statusLabels[task.status] ?? task.status}
                  <ChevronDown size={13} />
                </button>
                {statusOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                    <div className="absolute left-0 z-20 mt-1 w-52 rounded-xl border border-hairline bg-white p-1 shadow-lg">
                      {statusList.map((s) => (
                        <button key={s} onClick={() => changeStatus(s)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-semibold hover:bg-surface-soft ${s === task.status ? "text-altus-red-deep" : "text-ink-strong"}`}>
                          {statusLabels[s] ?? s}
                          {s === task.status && <CheckCircle2 size={14} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Priority pill */}
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold" style={{ background: PRIORITY_TONE[task.priority]?.bg, color: PRIORITY_TONE[task.priority]?.fg }}>
                <Flag size={13} /> {PRIORITY_LABELS[task.priority] ?? task.priority}
              </span>
          </div>

          {/* Tabs */}
          <div className="mb-5 flex flex-wrap gap-1 border-b border-hairline">
            <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} icon={<ListChecks size={14} />} label="Overview" />
            <TabBtn active={tab === "checklist"} onClick={() => setTab("checklist")} icon={<ListChecks size={14} />} label="Checklist" count={checklist.length} />
            <TabBtn active={tab === "files"} onClick={() => setTab("files")} icon={<Paperclip size={14} />} label="Files" count={attachments.length} />
            <TabBtn active={tab === "timeline"} onClick={() => setTab("timeline")} icon={<Timer size={14} />} label="Timeline" />
            <TabBtn active={tab === "activity"} onClick={() => setTab("activity")} icon={<HistoryIcon size={14} />} label="Activity" />
          </div>

          {/* Tab content */}
          {/* OVERVIEW reads top to bottom in one column: what the task IS, the
              facts about it, the files that belong to it, then how the time on
              it was actually spent. The old two-column split put the fields in
              a 320px rail where a four-across grid could not breathe. */}
          {tab === "overview" && (
            <div className="flex flex-col gap-5">
              <section className="rounded-xl border border-slate-200/80 bg-white p-4">
                <h2 className="mb-2 text-[14px] font-black text-ink-strong">Description</h2>
                {task.description ? (
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-strong">{task.description}</p>
                ) : (
                  <p className="text-[13.5px] text-ink-muted">No description.</p>
                )}
              </section>

              <TaskFieldsGrid
                task={task}
                totalActiveSeconds={timePanel?.state.rollup.totalActiveSeconds ?? 0}
                canEdit={canManageContent}
                onEstimate={(m) => run(() => setTaskEstimatedMinutes(task.id, m))}
              />

              <TaskAttachments taskId={task.id} items={attachments} canEdit={canManageContent} />

              {timePanel && (
                <SessionHistory
                  sessions={timePanel.state.sessions}
                  liveStartedAt={timePanel.state.live?.startedAt ?? null}
                  byName={task.doerName ?? "—"}
                />
              )}
            </div>
          )}
          {tab === "checklist" && (
            <Card title="Checklist" flush>
              <TaskChecklist taskId={task.id} items={checklist} canEdit={canManageContent} />
            </Card>
          )}
          {tab === "files" && (
            <TaskAttachments taskId={task.id} items={attachments} canEdit={canManageContent} />
          )}
          {tab === "timeline" && (
            timePanel ? <TaskTimePanel taskId={task.id} {...timePanel} /> : <Card title="Timeline"><p className="text-[13.5px] text-ink-muted">Time tracking is disabled.</p></Card>
          )}
          {tab === "activity" && <AuditFeed events={events} statusLabels={statusLabels} me={me} />}
        </div>

        {/* ── RIGHT INSIGHT SIDEBAR ──
            AI Insights is back in the rail (it spent an iteration as a
            full-width strip at the foot) and now leads, because a rework
            warning is the thing to read before anything else on the card. */}
        <aside className="flex flex-col gap-4">
          <AIInsightsCard
            insight={insight}
            rejectionCount={timePanel?.state.rollup.rejectionCount ?? 0}
          />
          <TeamMembersCard
            creatorName={task.creatorName}
            creatorAvatarUrl={task.creatorAvatarUrl}
            doerName={task.doerName}
            doerAvatarUrl={task.doerAvatarUrl}
            approverName={task.doerManagerName}
            approverAvatarUrl={task.doerManagerAvatarUrl}
          />
          {timePanel && (
            <>
              <TaskTimelineRail entries={timePanel.state.timeline} />
              <TimeSpentCard taskId={task.id} state={timePanel.state} canOperate={timePanel.canOperate} locked={locked} onViewHistory={() => setTab("timeline")} />
            </>
          )}
        </aside>
      </div>

      {/* ── QUICK COMMENT ──
          STICKY, not fixed. `position: fixed` is relative to the VIEWPORT, so
          inside the task drawer the bar would escape the panel and sit across
          the page behind it. Sticky pins it to the bottom of the drawer's own
          scroll region, which is what "fixed footer" means here. */}
      <div className="sticky bottom-0 z-20 -mx-6 mt-6 border-t border-slate-200/80 bg-slate-50/95 px-6 py-3 backdrop-blur-sm max-md:-mx-4 max-md:px-4">
        <CommentInput taskId={task.id} me={{ name: me.name, avatarUrl: me.avatarUrl }} compact />
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    // The active line is a real `border-b-2` on the button, not an absolutely
    // positioned span: the strip sits on the row's own bottom border, so the
    // two now share a baseline instead of the indicator floating a pixel off
    // it. `-mb-px` pulls it over that border rather than stacking under it.
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13.5px] transition-colors ${
        active
          ? "border-[#B80D22] font-bold text-[#B80D22]"
          : "border-transparent font-bold text-ink-muted hover:text-ink-strong"
      }`}
    >
      {icon}
      {label}
      {count != null && count > 0 && <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10.5px] font-bold text-ink-muted">{count}</span>}
    </button>
  );
}

/** Every section on the detail screen is one of these: white card, one warm
 *  hairline, on the beige canvas. The separation comes from the border and the
 *  gap between cards — no dark panel needed to tell two blocks apart. */
function Card({ title, children, flush }: { title: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="rounded-2xl border border-[#EBE7E0] bg-white p-4 shadow-xs">
      <h2 className="mb-3 text-[14px] font-black text-ink-strong">{title}</h2>
      <div className={flush ? "" : ""}>{children}</div>
    </section>
  );
}


/* ── THE 4x3 FIELDS GRID ────────────────────────────────────────────────
   Twelve facts, four across. Every one is read from the task row except the
   two the schema has no home for:

     MODULE     there is no module column. Every task in this database belongs
                to WMS, so the constant is the truth here rather than a
                placeholder — and it is stated once, not typed into a cell.
     TASK TYPE  no column, no enum, no event. It is OMITTED rather than shown
                as an em-dash: an empty field invites someone to go looking for
                the setting that fills it, and there isn't one.

   APPROVER is real, via the doer's manager — see the note on `doerManagerName`
   in lib/queries/tasks.ts. This grid REPLACED the old "Task Details" rail card
   and the four metadata pills above the tabs; all three showed overlapping
   subsets of the same twelve facts. */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 truncate text-[13px] font-bold text-slate-800">{children}</div>
    </div>
  );
}

function TaskFieldsGrid({
  task,
  totalActiveSeconds,
  canEdit,
  onEstimate,
}: {
  task: TaskDetailModel;
  totalActiveSeconds: number;
  canEdit: boolean;
  onEstimate: (m: number | null) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(task.estimatedMinutes ? String(task.estimatedMinutes) : "");
  const tags = task.tags ?? [];
  return (
    <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
      <Field label="Company">{task.client ?? "—"}</Field>
      <Field label="Category">{task.subject ?? "—"}</Field>
      <Field label="Module">WMS</Field>
      <Field label="Priority">{PRIORITY_LABELS[task.priority] ?? task.priority}</Field>

      <Field label="Start date">{task.startsAt ? formatDate(task.startsAt) : "—"}</Field>
      <Field label="Due date">{formatDate(task.revisedTargetDate ?? task.dueAt)}</Field>
      <Field label="Estimated">
        {editing ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="min"
              className="w-16 rounded-md border border-hairline px-2 py-0.5 text-[12.5px] outline-none focus:border-altus-red"
            />
            <button
              onClick={() => { onEstimate(val ? Number(val) : null); setEditing(false); }}
              className="rounded-md bg-ink-strong px-2 py-0.5 text-[11px] font-bold text-white"
            >
              Save
            </button>
          </span>
        ) : (
          <button
            disabled={!canEdit}
            onClick={() => setEditing(true)}
            className={canEdit ? "hover:text-altus-red-deep" : ""}
          >
            {formatEstimate(task.estimatedMinutes)}
          </button>
        )}
      </Field>
      <Field label="Actual">{formatMinutesLabel(totalActiveSeconds)}</Field>

      <Field label="Recurring">{task.recurrence ? "Yes" : "No"}</Field>
      <Field label="Tags">
        {tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-[color-mix(in_srgb,#B80D22_9%,white)] px-1.5 py-0.5 text-[11px] font-bold text-[#B80D22]"
              >
                {t}
              </span>
            ))}
          </span>
        ) : (
          "—"
        )}
      </Field>
      <Field label="Approver">{task.doerManagerName ?? "—"}</Field>
      <Field label="Assignee">{task.doerName ?? "—"}</Field>
    </div>
  );
}

/* ── START / STOP HISTORY ──────────────────────────────────────────────
   One row per work session, newest first, with the RUNNING one highlighted and
   ticking. `BY` names the task's doer: sessions are recorded against the
   assignee (lib/queries/task-time.ts carries no per-session employee), so the
   column states that rather than inventing a per-row actor. */

function hms(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function LiveClock({ startedAt }: { startedAt: string }) {
  const secs = useElapsedSeconds(startedAt);
  return <span className="tabular-nums">{hms(secs)}</span>;
}

function stampOf(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function SessionHistory({
  sessions,
  liveStartedAt,
  byName,
}: {
  sessions: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    live: boolean;
  }[];
  liveStartedAt: string | null;
  byName: string;
}) {
  const rows = [...sessions].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
      <h2 className="border-b border-slate-200/80 px-4 py-3 text-[14px] font-black text-ink-strong">
        Start / Stop History
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-ink-muted">No sessions yet.</p>
      ) : (
        <div className="max-h-[280px] overflow-y-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                {["Started", "Stopped", "Duration", "By"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 ${
                      i === 2 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-slate-100 ${
                    r.live ? "bg-red-50/70 font-semibold text-red-600" : "text-slate-700"
                  }`}
                >
                  <td className="px-4 py-2 text-[12.5px]">{stampOf(r.startedAt)}</td>
                  <td className="px-4 py-2 text-[12.5px]">
                    {r.live ? "Running…" : r.endedAt ? stampOf(r.endedAt) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-[12.5px] tabular-nums">
                    {r.live && liveStartedAt ? (
                      <LiveClock startedAt={liveStartedAt} />
                    ) : (
                      hms(r.durationSeconds ?? 0)
                    )}
                  </td>
                  <td className="px-4 py-2 text-[12.5px]">{byName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
