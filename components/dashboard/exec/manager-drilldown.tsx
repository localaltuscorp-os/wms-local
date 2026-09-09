"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ExternalLink,
  CheckCircle2,
  UserCog,
  Flag,
  Bell,
  Loader2,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Sparkline } from "@/components/dashboard/exec/viz/sparkline";
import { StatusDonut } from "@/components/dashboard/exec/viz/status-donut";
import { TargetActualBars } from "@/components/dashboard/exec/viz/target-actual-bars";
import { useReducedMotion } from "@/lib/motion-utils";
import { fireToast } from "@/lib/toast";
import { getManagerDrilldown } from "@/app/(app)/dashboard/drilldown-actions";
import type { ManagerDrilldown } from "@/lib/queries/manager-drilldown";
import {
  DELEGATION_CHANNEL_LABELS,
  type DelegationChannel,
} from "@/lib/transforms/initiator-scorecard";
import {
  approveTask,
  setTaskStatus,
  nudgeTask,
} from "@/app/(app)/tasks/actions";
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";

type Delivery = "on_time" | "late" | "aging";

interface Props {
  /** When non-null the centered modal is open and fetches this manager's card. */
  managerId: string | null;
  windowDays: 3 | 7;
  /** Set when a specific delegation cell was clicked — the task list opens
   *  narrowed to that channel. Null opens the whole list. */
  channel?: DelegationChannel | null;
  onClose: () => void;
}

/** Delivery badge tone → brand token. on_time=green / late=red / aging=amber. */
const DELIVERY_TONE: Record<Delivery, string> = {
  on_time: "green",
  late: "altus-red",
  aging: "amber",
};
const DELIVERY_LABEL: Record<Delivery, string> = {
  on_time: "On time",
  late: "Late",
  aging: "Aging",
};

function priorityLabel(p: string): string {
  return PRIORITY_LABELS[p as TaskPriority] ?? p;
}

/**
 * Resolve a human-readable task row out of {title, client, subject, description}.
 *
 * Many legacy/imported tasks have a `title` that is just the company name
 * (e.g. "Altus Corp"), which reads as noise in the list. So:
 *  - eyebrow = "{client} · {subject}" with nulls/blank omitted; if client and
 *    subject are equal we keep just one.
 *  - heading = the title, UNLESS the title is empty or equals the client (the
 *    bare-company case) — then fall back to the subject, then a trimmed
 *    description snippet, then the title, and finally "Untitled task". This
 *    guarantees a row is never just the bare company name.
 */
function taskLabel(t: {
  title: string;
  client: string | null;
  subject: string | null;
  description: string | null;
}): { heading: string; eyebrow: string | null } {
  const norm = (s: string | null | undefined) => (s ?? "").trim();
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const title = norm(t.title);
  const client = norm(t.client);
  const subject = norm(t.subject);
  const description = norm(t.description);

  // Eyebrow: client · subject (omit blanks / collapse duplicates).
  const eyebrowParts: string[] = [];
  if (client) eyebrowParts.push(client);
  if (subject && !(client && eq(subject, client))) eyebrowParts.push(subject);
  const eyebrow = eyebrowParts.length > 0 ? eyebrowParts.join(" · ") : null;

  // Heading: the title, unless it's empty or just the company name.
  const titleIsBareCompany = !title || (client && eq(title, client));
  let heading: string;
  if (titleIsBareCompany) {
    if (subject) heading = subject;
    else if (description)
      heading =
        description.length > 90 ? `${description.slice(0, 90).trimEnd()}…` : description;
    else heading = title || "Untitled task";
  } else {
    heading = title;
  }

  return { heading, eyebrow };
}

export function ManagerDrilldown({ managerId, windowDays, channel = null, onClose }: Props) {
  const open = managerId !== null;
  const reduce = useReducedMotion() ?? false;

  const [, startTransition] = React.useTransition();
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<ManagerDrilldown | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch ON-DEMAND, only when the modal opens. Never touches the dashboard
  // load path. A bumping token guards against an out-of-order resolve when the
  // window toggles mid-flight.
  const tokenRef = React.useRef(0);
  React.useEffect(() => {
    if (!open || !managerId) return;
    const token = ++tokenRef.current;
    setLoading(true);
    setError(null);
    setData(null);
    startTransition(async () => {
      const res = await getManagerDrilldown(managerId, windowDays);
      if (token !== tokenRef.current) return; // stale resolve, drop it
      if ("error" in res) {
        setError(res.error);
        setData(null);
      } else {
        setData(res);
        setError(null);
      }
      setLoading(false);
    });
  }, [open, managerId, windowDays]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[120]"
          style={{
            background:
              "radial-gradient(120% 120% at 50% 30%, color-mix(in srgb, var(--color-altus-red-deep) 16%, transparent), color-mix(in srgb, var(--color-ink-strong) 58%, transparent))",
            backdropFilter: "blur(3px)",
            animation: reduce ? "none" : "fadeUp 0.3s ease both",
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          /* RIGHT-ANCHORED SLIDE-OVER, not a centred modal. Matches the aging
             heatmap and leaderboard drawers, so every drill-down in the
             dashboard enters from the same edge at the same width. */
          className="exec-drilldown-content wms-card fixed right-0 top-0 z-[121] h-full outline-none
                     overflow-hidden border-l bg-white
                     max-md:w-full"
          style={{
            boxShadow: "0 40px 120px color-mix(in srgb, var(--color-ink-strong) 30%, transparent)",
            animation: reduce
              ? "none"
              : "drilldownIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* The decorative red aurora wash that used to sit here is gone with
              the cream canvas: a 520px radial of 22% Altus red re-tinted the
              whole panel warm, which is precisely what the white surface was
              meant to remove. */}

          {/* Sizing + keyframes scoped to this component. Slide-over: the panel
              is pinned to the right edge, so the entrance translates on X only
              and no centring transform is involved. */}
          <style>{`
            .exec-drilldown-content {
              width: 75vw;
              max-width: 72rem;
            }
            @keyframes drilldownIn {
              from { transform: translateX(3%); opacity: 0; }
              to   { transform: translateX(0);  opacity: 1; }
            }
            @media (max-width: 767px) {
              .exec-drilldown-content {
                width: 100%;
                max-width: none;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-drilldown-stagger] { animation: none !important; }
            }
          `}</style>

          {open && (
            <DrilldownBody
              loading={loading}
              error={error}
              data={data}
              windowDays={windowDays}
              channel={channel}
              reduce={reduce}
              onClose={onClose}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ───────────────────────── Body (header + sections) ───────────────────── */

function DrilldownBody({
  loading,
  error,
  data,
  windowDays,
  channel,
  reduce,
  onClose,
}: {
  loading: boolean;
  error: string | null;
  data: ManagerDrilldown | null;
  windowDays: 3 | 7;
  channel: DelegationChannel | null;
  reduce: boolean;
  onClose: () => void;
}) {
  const windowLabel = `Last ${windowDays} days`;

  return (
    <>
      {/* ── Header ── */}
      <header
        className="relative z-10 flex items-center gap-4 px-7 py-6 max-md:px-5 max-md:py-5"
        style={{
          borderBottom: "1px solid var(--color-hairline)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--color-surface-card) 50%, transparent), transparent)",
        }}
      >
        {data ? (
          <Avatar
            name={data.manager.name}
            avatarUrl={data.manager.avatarUrl}
            size={56}
            className="ring-2"
          />
        ) : (
          <Shimmer className="rounded-full" style={{ width: 56, height: 56 }} />
        )}

        <div className="min-w-0 flex-1">
          <Dialog.Title
            className="truncate"
            style={{
              fontFamily: "var(--font-serif), system-ui, sans-serif",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "var(--color-ink-strong)",
              lineHeight: 1.1,
            }}
          >
            {data ? data.manager.name : loading ? "Loading…" : "Manager"}
          </Dialog.Title>
          <p
            className="mt-0.5 uppercase font-bold tracking-[0.16em]"
            style={{
              fontFamily: "var(--font-mono-display), ui-monospace, monospace",
              fontSize: 11,
              color: "var(--color-ink-muted)",
            }}
          >
            Workload · {windowLabel}
          </p>
        </div>

        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Close"
            className="grid place-items-center rounded-full size-10 transition-colors shrink-0"
            style={{
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              color: "var(--color-ink-soft)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-altus-red)";
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--color-altus-red) 30%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-ink-soft)";
              e.currentTarget.style.borderColor =
                "var(--color-hairline-strong)";
            }}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </Dialog.Close>
      </header>

      {/* ── Scroll body ── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-7 py-6 max-md:px-5 max-md:py-5">
        {error ? (
          <ErrorState error={error} onClose={onClose} />
        ) : loading || !data ? (
          <SkeletonBody />
        ) : (
          <LoadedBody data={data} reduce={reduce} channel={channel} />
        )}
      </div>
    </>
  );
}

/* ───────────────────────────── Loaded body ────────────────────────────── */

function LoadedBody({
  data,
  reduce,
  channel,
}: {
  data: ManagerDrilldown;
  reduce: boolean;
  channel: DelegationChannel | null;
}) {
  const { delegationEfficiency } = data;
  // Only the task LIST narrows to the clicked channel. The stats above it —
  // sparkline, delegation efficiency, per-report goals — deliberately keep
  // describing the whole window: they are the context that makes the filtered
  // list meaningful, and recomputing them for one channel would misreport the
  // manager's actual delegation.
  const visibleTasks = React.useMemo(
    () => (channel ? data.tasks.filter((t) => t.channel === channel) : data.tasks),
    [data.tasks, channel],
  );
  const TrendIcon =
    delegationEfficiency.deltaPct > 0
      ? ArrowUpRight
      : delegationEfficiency.deltaPct < 0
        ? ArrowDownRight
        : Minus;
  const trendTone =
    delegationEfficiency.deltaPct > 0
      ? "var(--color-green-deep)"
      : delegationEfficiency.deltaPct < 0
        ? "var(--color-altus-red-deep)"
        : "var(--color-ink-muted)";

  return (
    <div className="flex flex-col gap-7">
      {/* ── 3 stat cards ── */}
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <StatCard index={0} reduce={reduce} label="Total Initiated" tone="altus-red">
          <div className="flex items-end justify-between gap-2">
            <BigNumber value={data.totalInitiated} />
            <Sparkline points={data.initiatedSparkline} width={96} height={38} />
          </div>
        </StatCard>

        <StatCard
          index={1}
          reduce={reduce}
          label="Delegation Efficiency"
          tone="blue"
        >
          <div className="flex items-baseline gap-2">
            <BigNumber value={delegationEfficiency.pct} suffix="%" />
            <span
              className="inline-flex items-center gap-0.5 font-bold tabular-nums"
              style={{ fontSize: 13.5, color: trendTone }}
            >
              <TrendIcon size={15} strokeWidth={2.6} />
              {Math.abs(delegationEfficiency.deltaPct)}%
            </span>
          </div>
        </StatCard>

        <StatCard index={2} reduce={reduce} label="Avg Task Aging" tone="amber">
          <BigNumber value={data.avgTaskAgingDays} suffix=" d" />
        </StatCard>
      </div>

      {/* ── Per-report target vs actual ── */}
      {data.perReport.length > 0 && (
        <Section title="Delegation by report" index={3} reduce={reduce}>
          <TargetActualBars
            rows={data.perReport.map((r) => ({
              label: r.name,
              actual: r.given,
              goal: r.goal,
            }))}
          />
        </Section>
      )}

      {/* ── Status donut ── */}
      <Section title="Initiated-task status" index={4} reduce={reduce}>
        <StatusDonut slices={data.statusBreakdown} />
      </Section>

      {/* ── Tasks table ──
          Narrowed to one delegation channel when the drawer was opened from a
          specific column, so the list matches the number that was clicked. */}
      <Section
        title={
          channel
            ? `${DELEGATION_CHANNEL_LABELS[channel]} tasks (${visibleTasks.length})`
            : `Initiated tasks (${visibleTasks.length})`
        }
        index={5}
        reduce={reduce}
      >
        {visibleTasks.length === 0 ? (
          <p
            className="py-8 text-center"
            style={{ color: "var(--color-ink-muted)", fontSize: 14 }}
          >
            No tasks initiated in this window.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visibleTasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ───────────────────────────── Task row ───────────────────────────────── */

function TaskRow({ task }: { task: ManagerDrilldown["tasks"][number] }) {
  // Optimistic UI: hide the row after a successful approve/follow-up/reassign,
  // and mirror inline-status-cell's toast pattern.
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState<
    null | "approve" | "reassign" | "follow_up" | "nudge"
  >(null);
  const delTone = DELIVERY_TONE[task.delivery];

  async function run<T extends { ok: boolean }>(
    kind: NonNullable<typeof pending>,
    fn: () => Promise<T>,
    successMsg: string,
    opts?: { dismissOnSuccess?: boolean },
  ) {
    if (pending) return;
    setPending(kind);
    try {
      const res = await fn();
      if (res.ok) {
        fireToast({ message: successMsg });
        if (opts?.dismissOnSuccess) setDone(true);
      } else {
        const r = res as { ok: false; error?: string; message?: string };
        const msg =
          r.error === "forbidden"
            ? "Not allowed to do that."
            : r.error === "stale"
              ? "This task changed elsewhere — reopen to refresh."
              : r.message ?? r.error ?? "Action failed.";
        fireToast({ message: msg });
      }
    } catch {
      fireToast({ message: "Action failed — please retry." });
    } finally {
      setPending(null);
    }
  }

  if (done) return null;

  // Optimistic-lock value: the task's real updatedAt (the action compares this
  // against the row's current updatedAt and returns `stale` on mismatch).
  // Crosses the server-action boundary as a Date|string, so normalise to ISO.
  const expectedUpdatedAt = new Date(task.updatedAt).toISOString();

  // Human-readable label — never just the bare company name.
  const { heading, eyebrow } = taskLabel(task);

  return (
    <li
      className="group rounded-chip wg-sheen"
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        padding: "12px 14px",
      }}
    >
      <div className="flex flex-col gap-2.5">
        {/* ── Info: eyebrow (client · subject) + heading + assignee/badges ── */}
        <div className="min-w-0">
          {eyebrow && (
            <p
              className="truncate font-black uppercase tracking-[0.08em]"
              style={{
                fontSize: 10.5,
                color: "var(--color-altus-red-deep)",
              }}
              title={eyebrow}
            >
              {eyebrow}
            </p>
          )}
          <p
            className="truncate font-bold"
            style={{
              fontSize: 14.5,
              color: "var(--color-ink-strong)",
              marginTop: eyebrow ? 1 : 0,
            }}
            title={heading}
          >
            {heading}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar
                name={task.doerName}
                avatarUrl={task.doerAvatarUrl}
                size={18}
              />
              <span
                className="truncate"
                style={{ fontSize: 12.5, color: "var(--color-ink-muted)" }}
              >
                {task.doerName}
              </span>
            </span>
            <span
              className="rounded-pill px-2 py-0.5 font-semibold shrink-0"
              style={{
                fontSize: 11,
                background: "var(--color-surface-soft)",
                color: "var(--color-ink-soft)",
                border: "1px solid var(--color-hairline)",
              }}
            >
              {priorityLabel(task.priority)}
            </span>
            {/* Delivery badge */}
            <span
              className="rounded-pill px-2 py-0.5 font-bold tabular-nums shrink-0"
              style={{
                fontSize: 11,
                background: `color-mix(in srgb, var(--color-${delTone}) 12%, transparent)`,
                color: `var(--color-${delTone}-deep)`,
                border: `1px solid color-mix(in srgb, var(--color-${delTone}) 30%, transparent)`,
              }}
            >
              {DELIVERY_LABEL[task.delivery]}
            </span>
          </div>
        </div>

        {/* ── Compact action rail (info-first; buttons stay out of the way) ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionLink href={`/tasks/${task.id}` as Route} label="Review">
            <ExternalLink size={12} strokeWidth={2.4} />
            Review
          </ActionLink>

          <ActionButton
            label="Approve"
            tone="green"
            busy={pending === "approve"}
            onClick={() =>
              run(
                "approve",
                () =>
                  approveTask(task.id, { decision: "approved" }, expectedUpdatedAt),
                "Task approved.",
                { dismissOnSuccess: true },
              )
            }
          >
            <CheckCircle2 size={12} strokeWidth={2.4} />
            Approve
          </ActionButton>

          <ActionButton
            label="Reassign"
            tone="blue"
            busy={pending === "reassign"}
            // Reassign needs a doer-picker; the lightweight, load-safe path is
            // to deep-link into the task where the existing reassign flow lives.
            href={`/tasks/${task.id}?reassign=1` as Route}
          >
            <UserCog size={12} strokeWidth={2.4} />
            Reassign
          </ActionButton>

          <ActionButton
            label="Follow-up"
            tone="amber"
            busy={pending === "follow_up"}
            onClick={() =>
              run(
                "follow_up",
                () =>
                  setTaskStatus(task.id, "follow_up", expectedUpdatedAt),
                "Marked as follow-up.",
                { dismissOnSuccess: true },
              )
            }
          >
            <Flag size={12} strokeWidth={2.4} />
            Follow-up
          </ActionButton>

          <ActionButton
            label="Nudge"
            tone="altus-red"
            busy={pending === "nudge"}
            onClick={() =>
              run("nudge", () => nudgeTask(task.id), "Nudge sent.")
            }
          >
            <Bell size={12} strokeWidth={2.4} />
            Nudge
          </ActionButton>
        </div>
      </div>
    </li>
  );
}

/* ─────────────────────────── Small UI atoms ───────────────────────────── */

function BigNumber({ value, suffix }: { value: number; suffix?: string }) {
  return (
    <span
      className="tabular-nums leading-none"
      style={{
        fontFamily: "var(--font-display, var(--font-serif)), system-ui, sans-serif",
        fontWeight: 900,
        fontSize: 38,
        letterSpacing: "-0.03em",
        color: "var(--color-ink-strong)",
      }}
    >
      {value}
      {suffix && (
        <span
          style={{ fontSize: 18, fontWeight: 800, color: "var(--color-ink-muted)" }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

function StatCard({
  label,
  tone,
  index,
  reduce,
  children,
}: {
  label: string;
  tone: string;
  index: number;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-drilldown-stagger
      className="relative overflow-hidden rounded-chip"
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.05), 0 10px 28px rgba(15,23,42,0.05)",
        padding: "16px 18px",
        ...(reduce
          ? {}
          : {
              animation: "fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both",
              animationDelay: `${index * 70}ms`,
            }),
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--color-${tone}) 14%, transparent), transparent 60%)`,
          opacity: 0.7,
        }}
      />
      <p
        className="relative uppercase font-bold tracking-[0.12em]"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 10.5,
          color: "var(--color-ink-muted)",
          marginBottom: 10,
        }}
      >
        {label}
      </p>
      <div className="relative">{children}</div>
    </div>
  );
}

function Section({
  title,
  index,
  reduce,
  children,
}: {
  title: string;
  index: number;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-drilldown-stagger
      style={
        reduce
          ? {}
          : {
              animation: "fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both",
              animationDelay: `${index * 70}ms`,
            }
      }
    >
      <h3
        className="mb-3 uppercase font-bold tracking-[0.14em]"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 11,
          color: "var(--color-ink-subtle)",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function ActionButton({
  label,
  tone,
  busy,
  onClick,
  href,
  children,
}: {
  label: string;
  tone: string;
  busy?: boolean;
  onClick?: () => void;
  href?: Route;
  children: React.ReactNode;
}) {
  const base =
    "brand-btn inline-flex items-center gap-1 rounded-pill px-2 py-1 font-bold transition-colors";
  const style: React.CSSProperties = {
    fontSize: 11.5,
    background: `color-mix(in srgb, var(--color-${tone}) 10%, transparent)`,
    color: `var(--color-${tone}-deep)`,
    border: `1px solid color-mix(in srgb, var(--color-${tone}) 26%, transparent)`,
    opacity: busy ? 0.6 : 1,
    cursor: busy ? "wait" : "pointer",
  };
  const inner = busy ? (
    <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />
  ) : (
    children
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={base} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={base}
      style={style}
    >
      {inner}
    </button>
  );
}

function ActionLink({
  href,
  label,
  children,
}: {
  href: Route;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="brand-btn inline-flex items-center gap-1 rounded-pill px-2 py-1 font-bold transition-colors"
      style={{
        fontSize: 11.5,
        background: "var(--color-surface-soft)",
        color: "var(--color-ink-soft)",
        border: "1px solid var(--color-hairline-strong)",
      }}
    >
      {children}
    </Link>
  );
}

/* ───────────────────────────── States ─────────────────────────────────── */

function Shimmer({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        background:
          "linear-gradient(100deg, var(--color-surface-track) 30%, var(--color-surface-soft) 50%, var(--color-surface-track) 70%)",
        backgroundSize: "200% 100%",
        animation: "shimmerSweep 1.4s ease-in-out infinite",
        ...style,
      }}
    >
      <style>{`@keyframes shimmerSweep{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @media (prefers-reduced-motion: reduce){[style*="shimmerSweep"]{animation:none !important}}`}</style>
    </div>
  );
}

function SkeletonBody() {
  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        {[0, 1, 2].map((i) => (
          <Shimmer
            key={i}
            className="rounded-chip"
            style={{ height: 96 }}
          />
        ))}
      </div>
      <Shimmer className="rounded-chip" style={{ height: 160 }} />
      <Shimmer className="rounded-chip" style={{ height: 200 }} />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Shimmer key={i} className="rounded-chip" style={{ height: 64 }} />
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onClose,
}: {
  error: string;
  onClose: () => void;
}) {
  const msg =
    error === "forbidden"
      ? "You don't have access to this manager's drill-down."
      : "We couldn't load this drill-down right now.";
  return (
    <div className="grid place-items-center py-20 text-center">
      <div
        className="rounded-chip px-8 py-7"
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-hairline)",
          maxWidth: 380,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif), system-ui, sans-serif",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--color-ink-strong)",
            marginBottom: 6,
          }}
        >
          {msg}
        </p>
        <p style={{ fontSize: 13, color: "var(--color-ink-muted)", marginBottom: 16 }}>
          {error === "forbidden" ? "" : "The dashboard is unaffected."}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-pill px-5 py-2 font-bold text-white"
          style={{
            fontSize: 13,
            background:
              "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
