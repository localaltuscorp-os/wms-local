import Link from "next/link";
import type { Route } from "next";
import {
  CalendarDays,
  CalendarClock,
  Cake,
  Inbox,
  ListChecks,
  Plus,
  Send,
  Target,
} from "lucide-react";
import type {
  Anniversary,
  DelegatedLoad,
  MyWorkShape,
  TeamMemberLoad,
  UpcomingDay,
} from "@/lib/queries/aura-dashboard";

/**
 * The widgets that are not charts — the small panes that fill out the home
 * screen now that it is a dashboard rather than a launcher.
 *
 * Server components, like the charts: nothing here needs a browser, and this is
 * the post-login landing, so every kilobyte of client JS is on the critical
 * path of signing in.
 */

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/* ───────────────────────────── quick actions ────────────────────────────── */

const ACTIONS: { href: string; label: string; Icon: typeof Plus }[] = [
  { href: "/tasks/new", label: "New task", Icon: Plus },
  { href: "/my-day", label: "Plan my day", Icon: ListChecks },
  { href: "/attendance", label: "Attendance", Icon: CalendarClock },
  { href: "/goals/dashboard", label: "Goals", Icon: Target },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
];

/**
 * The five things people come to the app to do, one click from the front door.
 *
 * Plain links, deliberately — not buttons that open dialogs. A link can be
 * middle-clicked, bookmarked and prefetched, and every one of these targets is
 * a real route that already exists.
 */
export function QuickActionsWidget() {
  return (
    <article className="aura-glass aura-pane aura-quick">
      <h2 className="aura-h2">Quick actions</h2>
      <div className="aura-quick-list">
        {ACTIONS.map(({ href, label, Icon }) => (
          <Link key={href} href={href as Route} className="aura-quick-item">
            <span className="aura-quick-icon">
              <Icon size={15} strokeWidth={2.1} aria-hidden />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </article>
  );
}

/* ───────────────────────────── hours ledger ─────────────────────────────── */

/**
 * This week against your target, and the month so far.
 *
 * Built from the SAME punches as the bloom — one query serves both — so the two
 * widgets can never disagree about how long you worked. The target is your own
 * `weekly_target_minutes` where you have one, otherwise your working days times
 * your full-day length.
 */
export function HoursWidget({ shape }: { shape: MyWorkShape }) {
  const target = shape.weeklyTargetMinutes;
  const pct = target > 0 ? Math.min(100, Math.round((shape.totalMinutes / target) * 100)) : 0;
  const delta = shape.totalMinutes - target;

  return (
    <article className="aura-glass aura-pane aura-hours-w">
      <div className="aura-pane-head">
        <h2 className="aura-h2">Hours</h2>
        <span className="aura-note" style={{ marginTop: 0 }}>
          this week
        </span>
      </div>

      <div className="aura-bigrow">
        <b className="aura-big">{hm(shape.totalMinutes)}</b>
        <span>of {hm(target)}</span>
      </div>
      <div className="aura-bar">
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className="aura-stats">
        <div>
          <b>{pct}%</b>
          <em>of target</em>
        </div>
        <div>
          {/* Signed on purpose: "+2h 10m" and "−2h 10m" are the same
              measurement read from opposite sides, and two clamped fields
              would let the pair drift. */}
          <b style={{ color: delta >= 0 ? "#1c6b45" : "#8f1109" }}>
            {delta >= 0 ? "+" : "−"}
            {hm(Math.abs(delta))}
          </b>
          <em>{delta >= 0 ? "ahead" : "to recover"}</em>
        </div>
        <div>
          <b>{hm(shape.monthMinutes)}</b>
          <em>this month · {shape.monthDaysPresent}d</em>
        </div>
      </div>
    </article>
  );
}

/* ──────────────────────────── what's coming ─────────────────────────────── */

/**
 * The next company holidays. Empty is a real answer and says so, rather than
 * leaving a pane that looks broken.
 */
export function UpcomingWidget({ days }: { days: UpcomingDay[] }) {
  return (
    <article className="aura-glass aura-pane">
      <div className="aura-pane-head">
        <h2 className="aura-h2">What&rsquo;s coming</h2>
        <CalendarDays size={15} strokeWidth={2} style={{ color: "var(--aura-ink-2)" }} aria-hidden />
      </div>
      {days.length > 0 ? (
        <div className="aura-tasks">
          {days.map((d) => (
            <div className="aura-task" key={d.ymd}>
              <i className="aura-dot" aria-hidden />
              <span className="aura-task-title">{d.label}</span>
              <time>{d.when}</time>
            </div>
          ))}
        </div>
      ) : (
        <div className="aura-tasks">
          <div className="aura-task">
            <i className="aura-dot" aria-hidden />
            <span className="aura-task-title">No holidays on the calendar yet.</span>
          </div>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────────── your team ──────────────────────────────── */

/**
 * Each direct report's load, heaviest first.
 *
 * Scoped to `manager_id = you`, not the roster: this is the handful of people
 * you are answerable for. Overdue leads the sort because a manager scanning
 * this wants the person in trouble, not the alphabet.
 */
export function TeamWidget({ team }: { team: TeamMemberLoad[] }) {
  const overdue = team.reduce((s, m) => s + m.overdue, 0);
  return (
    <article className="aura-glass aura-pane">
      <div className="aura-pane-head">
        <span className="aura-pill" style={{ background: "rgba(22,74,143,.16)", color: "#0f3569" }}>
          YOUR TEAM
        </span>
        <span className="aura-note" style={{ marginTop: 0 }}>
          {team.length} {team.length === 1 ? "report" : "reports"}
          {overdue > 0 ? ` · ${overdue} overdue` : ""}
        </span>
      </div>
      <div className="aura-team">
        {team.map((m) => (
          <div className="aura-team-row" key={m.id}>
            <span className="aura-team-name">{m.name}</span>
            <span className="aura-team-counts">
              <b>{m.open}</b>
              <em>open</em>
              {m.overdue > 0 && <span className="aura-state aura-state-hot">{m.overdue} overdue</span>}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ────────────────────────────── inbox & unread ──────────────────────────── */

/**
 * The two counts that otherwise only exist inside the account menu.
 *
 * Both come from `getNavCounts`, which the account menu already calls on every
 * page — the task totals are a shared cache hit, so putting them here costs one
 * per-user unread query and nothing else.
 */
export function InboxWidget({
  unread,
  archived,
}: {
  unread: number;
  archived: number;
}) {
  return (
    <article className="aura-glass aura-pane">
      <div className="aura-pane-head">
        <h2 className="aura-h2">Inbox</h2>
        <Inbox size={15} strokeWidth={2} style={{ color: "var(--aura-ink-2)" }} aria-hidden />
      </div>
      <div className="aura-bigrow">
        <b className="aura-big">{unread}</b>
        <span>{unread === 1 ? "unread update" : "unread updates"}</span>
      </div>
      <div className="aura-quick-list" style={{ marginTop: 14 }}>
        <Link href={"/inbox" as Route} className="aura-quick-item">
          <span className="aura-quick-icon">
            <Inbox size={15} strokeWidth={2.1} aria-hidden />
          </span>
          Open inbox
        </Link>
        <Link href={"/archived" as Route} className="aura-quick-item">
          <span className="aura-quick-icon">
            <ListChecks size={15} strokeWidth={2.1} aria-hidden />
          </span>
          Archived · {archived}
        </Link>
      </div>
    </article>
  );
}

/* ───────────────────────────── work anniversaries ───────────────────────── */

/**
 * Who joined this month, and how long ago.
 *
 * WORK ANNIVERSARIES ONLY. The employee row carries `joined_at` and no date of
 * birth, so the widget says "joined" rather than implying birthdays it has no
 * way to know.
 */
export function AnniversaryWidget({ people }: { people: Anniversary[] }) {
  return (
    <article className="aura-glass aura-pane">
      <div className="aura-pane-head">
        <h2 className="aura-h2">Joined this month</h2>
        <Cake size={15} strokeWidth={2} style={{ color: "var(--aura-ink-2)" }} aria-hidden />
      </div>
      <div className="aura-tasks">
        {people.map((p) => (
          <div className="aura-task" key={p.id}>
            <i className={p.offset === 0 ? "aura-dot aura-dot-hot" : "aura-dot"} aria-hidden />
            <span className="aura-task-title">{p.name}</span>
            <time>
              {p.years > 0 ? `${p.years} yr${p.years === 1 ? "" : "s"} · ` : ""}
              {p.dayLabel}
            </time>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ───────────────────────────── what you gave out ────────────────────────── */

/**
 * The mirror of "Open on you" — tasks YOU handed to other people and are still
 * waiting on. Distinct from the team widget: this is anyone you assigned to,
 * reports or not.
 */
export function DelegatedWidget({ people }: { people: DelegatedLoad[] }) {
  const overdue = people.reduce((s, p) => s + p.overdue, 0);
  return (
    <article className="aura-glass aura-pane">
      <div className="aura-pane-head">
        <span className="aura-pill" style={{ background: "rgba(22,74,143,.16)", color: "#0f3569" }}>
          WAITING ON
        </span>
        <span className="aura-note" style={{ marginTop: 0 }}>
          {people.length} {people.length === 1 ? "person" : "people"}
          {overdue > 0 ? ` · ${overdue} overdue` : ""}
        </span>
      </div>
      <div className="aura-team">
        {people.map((p) => (
          <div className="aura-team-row" key={p.id}>
            <span className="aura-team-name">{p.name}</span>
            <span className="aura-team-counts">
              <b>{p.open}</b>
              <em>open</em>
              {p.overdue > 0 && <span className="aura-state aura-state-hot">{p.overdue} overdue</span>}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
