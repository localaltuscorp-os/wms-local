import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2,
  Fingerprint,
  LayoutDashboard,
} from "lucide-react";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import type { MyTodayTask } from "@/lib/queries/my-day";
import { MobileTodayTasks } from "./mobile-today-tasks";

const TZ = "Asia/Kolkata";

/**
 * Mobile-only "Today" home — the opening screen on phones. Greeting, the
 * Attendance punch CTA (kept up top so it's always reachable on login), then
 * the signed-in user's overdue + due-today tasks. The task list collapses to
 * the first couple of cards behind a "View all" toggle so a long backlog never
 * buries Attendance below the fold.
 *
 * Server component: pure render, links into /tasks/[id]. The collapsible list
 * is a small client island ({@link MobileTodayTasks}).
 *
 * Readability rules (non-negotiable): body ≥ 15px, titles 17px, touch
 * targets ≥ 48px, no emoji icons, brand tokens only.
 */
export function MobileToday({
  firstName,
  tasks,
  doneToday,
  statusLabels,
  statusTones,
}: {
  firstName: string;
  tasks: MyTodayTask[];
  doneToday: number;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const now = new Date();
  const hourIst = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(now),
  );
  const greeting =
    hourIst < 12 ? "Good morning" : hourIst < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const overdue = tasks.filter((t) => t.overdue);
  const dueToday = tasks.filter((t) => !t.overdue);

  const summary = [
    `${dueToday.length} due today`,
    overdue.length > 0 ? `${overdue.length} overdue` : null,
    doneToday > 0 ? `${doneToday} done` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="px-4 pt-5 pb-8" aria-label="Your tasks for today">
      {/* Greeting */}
      <p
        className="text-ink-subtle uppercase"
        style={{
          fontFamily: "var(--font-mono-display)",
          fontSize: 12,
          letterSpacing: "0.12em",
        }}
      >
        {dateLabel}
      </p>
      <h1
        className="text-ink-strong mt-1"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
        }}
      >
        {greeting}, {firstName}
      </h1>
      <p className="text-ink-soft mt-1.5" style={{ fontSize: 15.5 }}>
        {summary}
      </p>

      {/* Primary action — Attendance is the reason most people open the app on
          their phone, so it sits right under the greeting, always reachable
          without scrolling past the task backlog. */}
      <Link
        href={"/attendance" as Route}
        className="mt-5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-altus-red font-semibold text-white transition-colors hover:bg-altus-red-deep"
        style={{ fontSize: 16 }}
      >
        <Fingerprint size={19} strokeWidth={2.2} aria-hidden />
        Mark attendance
      </Link>

      {tasks.length === 0 ? (
        <div
          className="mt-6 rounded-section border border-hairline bg-surface-card px-6 py-10 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <CheckCircle2
            size={36}
            strokeWidth={1.8}
            className="mx-auto"
            style={{ color: "var(--color-green-deep)" }}
            aria-hidden
          />
          <p className="text-ink-strong mt-3 font-semibold" style={{ fontSize: 17 }}>
            You&rsquo;re all clear for today
          </p>
          <p className="text-ink-soft mt-1" style={{ fontSize: 15 }}>
            Nothing due or overdue right now.
          </p>
        </div>
      ) : (
        <MobileTodayTasks
          overdue={overdue}
          dueToday={dueToday}
          statusLabels={statusLabels}
          statusTones={statusTones}
        />
      )}

      {/* Secondary action */}
      <div className="mt-7">
        <Link
          href={"/?full=1" as Route}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-pill border border-hairline-strong bg-surface-card font-semibold text-ink-strong transition-colors hover:bg-surface-soft"
          style={{ fontSize: 15.5 }}
        >
          <LayoutDashboard size={18} strokeWidth={2.2} aria-hidden />
          Company dashboard
        </Link>
      </div>
    </section>
  );
}
