"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Route } from "next";
import {
  UserPlus,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Users,
  ArrowRightLeft,
  Ban,
  MessageSquare,
  AlarmClock,
  ArrowRight,
  Bell,
  Target,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { InboxNotificationRow as NotificationRowData } from "@/lib/queries/notifications";
import type { NotificationKind } from "@/db/schema";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { markNotificationRead } from "./actions";

interface Props {
  row: NotificationRowData;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}

// Per-kind icon + accent colour for the little badge that sits on the actor's
// avatar — gives each event type an at-a-glance identity.
const KIND_META: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  task_assigned: { icon: UserPlus, tone: "blue" },
  task_initiated: { icon: Sparkles, tone: "blue" },
  status_changed: { icon: RefreshCw, tone: "amber" },
  approved: { icon: CheckCircle2, tone: "green" },
  declined: { icon: XCircle, tone: "red" },
  reassigned: { icon: Users, tone: "purple" },
  transferred: { icon: ArrowRightLeft, tone: "purple" },
  cancelled: { icon: Ban, tone: "red" },
  commented: { icon: MessageSquare, tone: "blue" },
  overdue_digest: { icon: AlarmClock, tone: "amber" },
  weekly_goals_assigned: { icon: Target, tone: "blue" },
  weekly_goals_fill_reminder: { icon: AlarmClock, tone: "amber" },
  weekly_goals_incomplete: { icon: AlarmClock, tone: "red" },
  // Attendance Phase A — inbox-only kinds.
  attendance_late: { icon: AlarmClock, tone: "amber" },
  attendance_late_waived: { icon: CheckCircle2, tone: "green" },
  attendance_half_day: { icon: AlarmClock, tone: "amber" },
  attendance_device: { icon: Smartphone, tone: "blue" },
  attendance_late_deduction: { icon: AlarmClock, tone: "rose" },
};

/**
 * Parse the notification `body`. The body is INTERNAL JSON metadata (e.g.
 * `{"fromStatus":"approved","toStatus":"cancelled"}`) used by the Slack /
 * WhatsApp templates — it must never be shown raw. We extract a status
 * transition when present, treat genuine free text (a comment) as text, and
 * otherwise show nothing.
 */
function parseBody(
  body: string | null,
): { from: TaskStatus | null; to: TaskStatus | null } | { text: string } | null {
  if (!body) return null;
  const t = body.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      const from = typeof o.fromStatus === "string" ? (o.fromStatus as TaskStatus) : null;
      const to = typeof o.toStatus === "string" ? (o.toStatus as TaskStatus) : null;
      if (from || to) return { from, to };
    } catch {
      /* fall through */
    }
    // JSON metadata with nothing user-facing → suppress entirely.
    return null;
  }
  return { text: t };
}

function StatusPill({
  status,
  labels,
  tones,
}: {
  status: TaskStatus;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
}) {
  const tone = tones[status] ?? "blue";
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[12.5px] font-bold whitespace-nowrap"
      style={{
        color: `var(--color-${tone}-deep)`,
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 32%, transparent)`,
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}

/**
 * One inbox row, MNC-style: actor avatar + kind badge on the left, a clean
 * one-line headline, a coloured status transition (no raw JSON), and a muted
 * timestamp. Unread rows get a tinted background + left accent + dot.
 *
 * Click anywhere → mark read (if unread) and deep-link to the task in one
 * gesture. A <button> owns the navigation so we avoid nested anchors.
 */
export function NotificationRow({ row, statusLabels, statusTones }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unread = row.readAt === null;
  const href = (row.taskId ? `/tasks/${row.taskId}` : "/inbox") as Route;
  const when = formatDistanceToNow(row.createdAt, { addSuffix: true });
  const who = row.actorName ?? "System";
  const meta = parseBody(row.body);
  const kindMeta = KIND_META[row.kind] ?? { icon: Bell, tone: "blue" };
  const KindIcon = kindMeta.icon;

  // When we render the status pills, strip a redundant trailing "to <Label>"
  // off the title so it doesn't repeat what the pills already say.
  let title = row.title;
  if (meta && "to" in meta && meta.to) {
    const toLabel = statusLabels[meta.to];
    if (toLabel && title.endsWith(` to ${toLabel}`)) {
      title = title.slice(0, title.length - ` to ${toLabel}`.length);
    }
  }

  function onActivate() {
    startTransition(async () => {
      if (unread) await markNotificationRead(row.id);
      router.push(href);
    });
  }

  return (
    <li className="relative border-b border-hairline last:border-b-0">
      {/* Unread accent bar */}
      {unread && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: "var(--color-altus-red)" }}
        />
      )}
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="flex w-full items-start gap-4 px-7 py-5 max-md:px-4 text-left transition-colors hover:bg-[rgba(15,23,42,0.025)] disabled:opacity-70"
        style={{
          background: unread
            ? "color-mix(in srgb, var(--color-altus-red) 4%, transparent)"
            : undefined,
        }}
      >
        {/* Avatar + kind badge */}
        <span className="relative shrink-0">
          {row.actorName ? (
            <EmployeeAvatar name={row.actorName} size="md" />
          ) : (
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg, #475569, #1f2937)" }}
            >
              <Bell size={16} strokeWidth={2.4} />
            </span>
          )}
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full"
            style={{
              background: `var(--color-${kindMeta.tone})`,
              border: "2px solid var(--color-surface-card)",
              color: "#fff",
            }}
          >
            <KindIcon size={11} strokeWidth={2.6} />
          </span>
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p
            className="text-[16.5px] leading-snug text-ink-strong"
            style={{ fontWeight: unread ? 700 : 500 }}
          >
            {title}
          </p>

          {/* Status transition pills (replaces the old raw-JSON body) */}
          {meta && "to" in meta && (meta.from || meta.to) && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {meta.from && (
                <>
                  <StatusPill status={meta.from} labels={statusLabels} tones={statusTones} />
                  <ArrowRight size={13} strokeWidth={2.4} className="text-ink-subtle shrink-0" />
                </>
              )}
              {meta.to && (
                <StatusPill status={meta.to} labels={statusLabels} tones={statusTones} />
              )}
            </div>
          )}

          {/* Genuine free-text body (e.g. a comment) */}
          {meta && "text" in meta && (
            <p
              className="mt-1.5 text-[14px] text-ink-soft line-clamp-2 border-l-2 border-hairline-strong pl-2.5 italic"
            >
              {meta.text}
            </p>
          )}

          {/* Meta line */}
          <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-subtle">
            <span className="font-semibold text-ink-soft">{who}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{when}</span>
            {unread && (
              <span
                className="ml-1 inline-flex items-center rounded-pill px-2 py-0.5 text-[10.5px] font-black uppercase tracking-[0.06em]"
                style={{
                  color: "var(--color-altus-red-deep)",
                  background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                }}
              >
                New
              </span>
            )}
          </div>
        </div>

        {/* Unread dot on the far right */}
        {unread && (
          <span
            aria-hidden
            className="mt-1.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: "var(--color-altus-red)" }}
          />
        )}
      </button>
    </li>
  );
}
