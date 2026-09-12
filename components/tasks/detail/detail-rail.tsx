"use client";

import * as React from "react";
import {
  Clock,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  XCircle,
  Users2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { TaskTimeState, TimelineEntry } from "@/lib/queries/task-time";
import type { TaskInsight } from "@/lib/tasks/insight";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import { useTaskTimer } from "@/components/tasks/time/task-timer-store";
import { TimerControls, phaseCaption } from "@/components/tasks/time/timer-controls";
import { useNowMs } from "@/components/tasks/time/use-elapsed";

function initials(name: string): string {
  const p = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** `nowMs` is 0 before hydration (see useNowMs) — fall back to the live clock
 *  then, and let the first tick after hydration correct the text. */
function relTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  const diff = (nowMs || Date.now()) - then;
  const day = 86400000;
  const days = Math.floor(diff / day);
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs >= 1) return `${hrs}h ago`;
  const mins = Math.floor(diff / 60000);
  return mins <= 1 ? "just now" : `${mins}m ago`;
}

const TL: Record<TimelineEntry["kind"], { label: string; dot: string }> = {
  created: { label: "Task Created", dot: "#8b5cf6" },
  work_started: { label: "Started Work", dot: "#3b82f6" },
  work_resumed: { label: "Resumed", dot: "#3b82f6" },
  work_paused: { label: "Paused", dot: "#f59e0b" },
  work_stopped: { label: "Stopped", dot: "#B80D22" },
  /* Two kinds, one word on screen. `timer_restarted` is the OLD rewind-the-
     session behaviour and still appears on tasks restarted before 2026-09-12;
     `timer_reset` is the restart-from-zero the button does now. Spelling them
     differently in the timeline would be asking the reader to care about a
     migration. */
  timer_restarted: { label: "Timer Restarted", dot: "#f59e0b" },
  timer_reset: { label: "Timer Restarted", dot: "#f59e0b" },
  revision_started: { label: "Reopened", dot: "#3b82f6" },
  work_done: { label: "Task Done", dot: "#16a34a" },
  sent_back: { label: "Not Approved", dot: "#e10600" },
  approved: { label: "Task Approved", dot: "#16a34a" },
  auto_closed: { label: "Auto-closed", dot: "#f59e0b" },
};

function RailCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#EFECE6] bg-[#FDFBF7] p-4 text-slate-800 shadow-xs">
      {/* `space-y-3` owns the gap to the body, so no `mb-*` here — two sources
          of the same spacing is how the three cards drifted apart before. */}
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-altus-red" />
        <h2 className="text-[14px] font-black text-ink-strong">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Vertical activity timeline (right rail) — coloured dots + who + relative time. */
export function TaskTimelineRail({ entries }: { entries: TimelineEntry[] }) {
  const nowMs = useNowMs();
  return (
    <RailCard icon={Clock} title="Task Timeline">
      <ol className="flex flex-col">
        {entries.map((e, i) => {
          const m = TL[e.kind] ?? TL.created;
          const last = i === entries.length - 1;
          return (
            <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && <span aria-hidden className="absolute left-[5px] top-4 bottom-0 w-px bg-hairline" />}
              <span className="relative z-10 mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white" style={{ background: m.dot }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-ink-strong">
                  {m.label}
                  {e.revision > 1 && (
                    <span className="ml-1.5 text-[10.5px] font-bold text-ink-subtle">· rev {e.revision}</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-surface-soft text-[8px] font-black text-ink-muted">
                    {initials(e.actorName)}
                  </span>
                  {/* A relative stamp cannot agree across the SSR/hydration
                      gap — the server wrote "42m ago" and the browser reads
                      "43m ago" a minute later, which threw a hydration error
                      and made React discard this whole task-detail subtree,
                      timer and all. Suppressed here and corrected by the tick. */}
                  <span className="text-[11.5px] text-ink-muted" suppressHydrationWarning>
                    {e.actorName} · {relTime(e.at, nowMs)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </RailCard>
  );
}

/**
 * Time Intelligence control centre — live total, session bar, Start/Stop/
 * Restart, and the most recent session stamps.
 *
 * IT OWNS NEITHER THE TIMER NOR ITS BUTTONS. The state comes from
 * `useTaskTimer` and the buttons from <TimerControls>, both shared with the
 * crimson hero band at the top of the same screen. This card used to hold its
 * own optimistic state AND its own cluster, which is how the screen came to
 * show Pause at the top and Start Work down the side at the same instant, and
 * to call one action Stop here and Pause there.
 *
 * What is left here is presentation: the readout, the segmented bar and the
 * session stamps.
 */
export function TimeSpentCard({
  state,
  canOperate,
  locked,
  onViewHistory,
}: {
  state: TaskTimeState;
  canOperate: boolean;
  locked: boolean;
  onViewHistory?: () => void;
}) {
  const timer = useTaskTimer();
  const r = state.rollup;

  /* ONE source for the phase: the store when there is one (it carries the
     optimistic flip), the server's own answer otherwise. Never re-derived from
     `live` or `sessionCount` here — that second derivation is exactly what used
     to disagree with the hero band. */
  const phase = timer?.phase ?? state.phase;

  /* Sessions a Restart threw away are still listed in the Start/Stop history,
     but they are not in the total and must not be in the bar either. */
  const done = state.sessions.filter((s) => !s.live && !s.discarded && s.durationSeconds != null);
  const totalForBar = done.reduce((n, s) => n + (s.durationSeconds ?? 0), 0) || 1;
  const seg = ["#8b5cf6", "#6366f1", "#3b82f6", "#16a34a", "#f59e0b"];
  // Newest three stamped sessions. The full list lives behind View History —
  // this is a glance, not a log.
  const recent = [...done]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 3);

  return (
    <RailCard
      icon={Clock}
      title="Time Spent"
      action={
        onViewHistory ? (
          <button type="button" onClick={onViewHistory} className="text-[12px] font-bold text-altus-red-deep hover:underline">
            View History
          </button>
        ) : null
      }
    >
      {/* Tabular mono so the digits don't jitter as the clock ticks — a
          proportional face reflows the whole number every second. */}
      <div className="font-mono text-2xl font-bold leading-none tabular-nums text-ink-strong">
        {formatMinutesLabel(timer ? timer.totalSeconds : r.totalActiveSeconds)}
      </div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        {phaseCaption(phase)}
      </div>
      {/* Segmented session bar */}
      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-soft">
        {done.map((s, i) => (
          <span
            key={s.id}
            style={{ width: `${((s.durationSeconds ?? 0) / totalForBar) * 100}%`, background: seg[i % seg.length] }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] font-semibold text-ink-subtle">
        <span>{r.sessionCount} session{r.sessionCount === 1 ? "" : "s"}</span>
        <span>Auto calculated</span>
      </div>

      {/* The SAME cluster the hero band renders. It used to be a hand-written
          Stop / Resume / Restart here and a hand-written Pause / Restart up
          there, with an inline amber confirmation panel this one alone had. */}
      <TimerControls tone="onSurface" canOperate={canOperate} locked={locked} className="mt-4" />

      {/* Session stamps — start, end, duration. */}
      {recent.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            Recent sessions
          </p>
          <ul className="flex flex-col gap-1.5">
            {recent.map((sn) => (
              <li
                key={sn.id}
                className="flex items-baseline justify-between gap-2 text-[11.5px]"
              >
                <span className="min-w-0 truncate font-medium text-ink-soft">
                  {stampRange(sn.startedAt, sn.endedAt)}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-ink-strong">
                  {formatMinutesLabel(sn.durationSeconds ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </RailCard>
  );
}

/**
 * "19 Aug 2026, 04:11 PM → 05:00 PM".
 *
 * The end DATE is omitted when it matches the start date, which it almost
 * always does — repeating it doubles the line length for no information, and
 * this line has to fit a 360px rail.
 */
function stampRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const day = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  if (!endIso) return `${day(start)}, ${time(start)}`;
  const end = new Date(endIso);
  return day(start) === day(end)
    ? `${day(start)}, ${time(start)} → ${time(end)}`
    : `${day(start)}, ${time(start)} → ${day(end)}, ${time(end)}`;
}

/**
 * "AI Insights" — a transparent heuristic, labelled ANALYSIS.
 *
 * BACK IN THE RAIL, stacked rather than spread: it was moved to a full-width
 * strip at the foot of the screen a few iterations ago, and this returns it to
 * the sidebar per the current brief. The layout is stacked now instead of the
 * old inline row, because at 360px a badge-beside-verdict line wrapped to five.
 *
 * The REWORK LINE is the one piece of real analysis here and it is derived, not
 * written: `rejectionCount` is how many times this task was sent back, so the
 * warning states a fact the timeline can be checked against rather than an
 * impression.
 */
export function AIInsightsCard({
  insight,
  rejectionCount = 0,
}: {
  insight: TaskInsight;
  rejectionCount?: number;
}) {
  const Icon = insight.tone === "good" ? CheckCircle2 : insight.tone === "warn" ? AlertTriangle : XCircle;
  const ink =
    insight.tone === "good"
      ? "text-emerald-600"
      : insight.tone === "warn"
        ? "text-amber-600"
        : "text-altus-red";
  return (
    <section className="space-y-3 rounded-2xl border border-red-100 bg-red-50/50 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-altus-red" />
        <h2 className="text-[14px] font-black text-ink-strong">AI Insights</h2>
        <span className="ml-auto rounded-pill bg-[color-mix(in_srgb,var(--color-altus-red)_10%,white)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-altus-red-deep">
          Analysis
        </span>
      </div>

      {rejectionCount > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-red-100 bg-white/70 p-3 text-[12.5px] font-semibold leading-relaxed text-altus-red-deep">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {rejectionCount} rework {rejectionCount === 1 ? "loop" : "loops"} detected. Approval
            bounced back {rejectionCount === 1 ? "once" : `${rejectionCount} times`} - align
            acceptance criteria before resubmitting.
          </span>
        </p>
      )}

      <div className="flex items-start gap-2.5">
        <Icon size={18} className={`mt-0.5 shrink-0 ${ink}`} />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-ink-strong">{insight.title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{insight.body}</p>
        </div>
      </div>
    </section>
  );
}

/** One stakeholder row — avatar, name, and the role they hold on this task. */
function TeamMember({
  name,
  avatarUrl,
  role,
}: {
  name: string;
  avatarUrl?: string | null;
  role: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <Avatar name={name} avatarUrl={avatarUrl ?? null} size={30} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-slate-800">{name}</span>
        <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
          {role}
        </span>
      </span>
    </li>
  );
}

/**
 * TEAM MEMBERS — who is actually on this task.
 *
 * THREE ROLES, NOT FIVE. The brief asks for Created By, Assignee, Approver,
 * Reviewer and Watcher. The first three are real: the task row carries its
 * creator and its doer, and the approver is the doer's manager because approval
 * in this app is hierarchical (lib/auth/status-transitions.ts) rather than a
 * named field.
 *
 * Reviewer and Watcher have NO source — there is no column, no join table and
 * no event that records either. Rendering them with invented names would put
 * two people on a task who are not on it, which is worse than a card that is
 * honestly three rows long. Same reasoning retires "+ Add team member": a
 * control that cannot persist anything is a promise the schema cannot keep.
 */
export function TeamMembersCard({
  creatorName,
  creatorAvatarUrl,
  doerName,
  doerAvatarUrl,
  approverName,
  approverAvatarUrl,
}: {
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  doerName: string | null;
  doerAvatarUrl: string | null;
  approverName: string | null;
  approverAvatarUrl: string | null;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="flex items-center gap-2">
        <Users2 size={16} className="text-altus-red" />
        <h2 className="text-[14px] font-black text-ink-strong">Team Members</h2>
      </div>
      <ul className="flex flex-col gap-3">
        {creatorName && (
          <TeamMember name={creatorName} avatarUrl={creatorAvatarUrl} role="Created by" />
        )}
        {doerName && <TeamMember name={doerName} avatarUrl={doerAvatarUrl} role="Assignee" />}
        {approverName ? (
          <TeamMember name={approverName} avatarUrl={approverAvatarUrl} role="Approver" />
        ) : (
          <li className="text-[11.5px] font-medium text-slate-400">
            No approver - the assignee has no manager on file.
          </li>
        )}
      </ul>
    </section>
  );
}
