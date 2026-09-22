import Link from "next/link";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace, WORKSPACE_LANDING, type WorkspaceId } from "@/lib/workspaces";
import { MODULE_ORDER } from "@/lib/module-theme";
import { EnterWorkspaceLink } from "@/components/hub/enter-workspace-link";
import { AuraSheen } from "@/components/hub/aura-chrome";
import { AuraTopBar } from "@/components/layout/aura-top-bar";
import { roomsFor } from "@/lib/aura-rooms";
import { AuraDonut, AuraBloom } from "@/components/hub/aura-charts";
import { DashboardGrid } from "@/components/hub/dashboard-grid";
import {
  AnniversaryWidget,
  DelegatedWidget,
  HoursWidget,
  InboxWidget,
  QuickActionsWidget,
  TeamWidget,
  UpcomingWidget,
} from "@/components/hub/aura-widgets";
import type { WidgetId } from "@/lib/dashboard/widgets";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NotificationBell } from "@/components/header/notification-bell";
import { getMyDayCounts, getMyTodayTasks, type MyTodayTask } from "@/lib/queries/my-day";
import { getDashboard } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { getNavCounts } from "@/lib/queries/nav-counts";
import {
  loadAuraDashboard,
  hhmmToMinutes,
  type AuraDashboard,
  type OpenItem,
} from "@/lib/queries/aura-dashboard";
import type { ReactNode } from "react";
import { isManagerWithReports, managerDailyTaskGate } from "@/lib/manager-gates";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { gateSkipActive } from "@/lib/auth/gate-skip";
import { SkipGateButton } from "@/components/layout/skip-gate-button";
import { needsDailyChecklistPlan } from "@/lib/daily-checklist/gate";
import { loginPlanGateOn, managerTaskGateOn } from "@/lib/goals/flag";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { ManagerDailyTaskGate } from "@/components/manager-gates/manager-daily-task-gate";

// The dashboard is the post-login landing and MUST run the (app) layout's
// daily-ritual gate on every request — never a cached/prerendered copy that
// would let someone past the wall. Force dynamic so the gate is always
// evaluated per-user.
export const dynamic = "force-dynamic";

/**
 * THE DASHBOARD — what you land on after signing in, in the AURA liquid-glass
 * language.
 *
 * It used to be a launcher: twelve cards and nothing else, so the first thing
 * anyone did after logging in was click away from it. It is now the reference
 * screen from `.claude/skills/aura/reference/altus-home-heros.html` — your day,
 * your week and your open work, with the launcher kept at the bottom.
 *
 * IT IS ARRANGED BY THE PERSON LOOKING AT IT. Every widget can be one of three
 * widths, pushed up or down, removed or added back; `DashboardGrid` owns that
 * and `lib/dashboard/widgets.ts` is the catalogue. This file's job is to fetch
 * the data and render each widget's BODY on the server, then hand the grid a
 * map of finished nodes — so none of the dashboard's data crosses to the
 * client and a widget can stay an async Server Component.
 *
 * THE LAUNCHER GRID IS GONE. Twelve tiles under "Jump into a workspace" were a
 * second copy of the twelve links the rail already carries, permanently, two
 * clicks closer — and they took the bottom half of the screen to say it.
 *
 *   greeting            what today is and how much is on you
 *   wms-loop            what is due or overdue on you today
 *   goals-week          this week's score and the FY average
 *   quick-actions       the five things people come here to do
 *   hours-ledger        this week against your target, and the month
 *   upcoming            the next company holidays
 *   attendance          your punch, your week, and the roster (admins only)
 *   open-work           everything still on you, by priority
 *   outcomes            what was due this month, and how it went
 *   work-shape          a petal per day sized by hours actually worked
 *   team                each direct report's load (managers only)
 *   open-table          every open task, soonest first
 *
 * EVERY NUMBER IS REAL, and where the mock's dimension does not exist in this
 * schema the panel is re-cut onto one that does rather than filled in with
 * something plausible. `lib/queries/aura-dashboard.ts` carries the reasoning
 * per panel; the short version is that nothing here tags a record with a
 * WorkspaceId, so "hours by workspace" cannot be computed at all, and the
 * timer-based hour counts are replaced by attendance punches, which everyone
 * actually files.
 *
 * PERMISSIONS. The roster-wide attendance counters are ADMIN-ONLY — the same
 * rule /attendance/live-status enforces, since those counts span every
 * employee. Everyone sees their own punch and their own week.
 *
 * FAILURE. Everything on this page is on the critical path of signing in, so
 * every read fails soft and every panel is conditional on its own data. A dead
 * panel costs a panel; a thrown one costs the front door — which is how Daily
 * Goals took attendance punch-in down on 8 September.
 *
 * Server Component. The only client leaves are the pointer sheen, the rail
 * toggle, the top bar, ⌘K search and the account menu.
 */

const TZ = "Asia/Kolkata";

/** "Friday, 12 September" in IST, wherever the server happens to be. */
function istDateLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

/** Morning / afternoon / evening by the user's working day, not the server's. */
function istGreeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "2:00 PM" in IST. */
function istTimeLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Two initials for the table's assigner avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** A stable colour per person, so the same face keeps the same tint. */
const AVATAR_TINTS = ["#d81f12", "#1e5aa8", "#2fa36b", "#7a5ca8", "#c2410c", "#167c91"];
function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length]!;
}

/** A row in the open-items table. */
function ItemRow({ item }: { item: OpenItem }) {
  const state = item.overdue
    ? "aura-state-hot"
    : item.priority === "imp_urgent"
      ? "aura-state-warn"
      : item.dueAt
        ? "aura-state-idle"
        : "aura-state-idle";
  return (
    <tr>
      <td className="aura-cell-main">
        <Link href={`/tasks/${item.id}` as Route}>{item.title}</Link>
      </td>
      <td>{item.client ?? "—"}</td>
      <td>
        {item.assigner ? (
          <span className="aura-who-cell">
            <span className="aura-mini-av" style={{ background: tintFor(item.assigner) }}>
              {initials(item.assigner)}
            </span>
            <span>{item.assigner}</span>
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className={item.overdue ? "aura-due aura-due-late" : "aura-due"}>
        {item.dueAt ? (item.overdue ? "Overdue" : istTimeLabel(item.dueAt)) : "No date"}
      </td>
      <td>
        <span className={`aura-state ${state}`}>{item.priorityLabel}</span>
      </td>
    </tr>
  );
}

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;

  // COMPULSORY DAILY WALL — enforced HERE on the dashboard (the post-login
  // landing) in addition to the (app) layout, because the layout's gate return
  // wasn't reliably taking effect for this route on prod. Same policy:
  // fail-open, day-scoped, super-admin-skippable, kill-switchable
  // (MANAGER_GATES_OFF). Employees must commit ≥5 checklist items + log goal
  // progress; managers get their task-give gate.
  {
    // Keep in LOCK-STEP with app/(app)/layout.tsx. COMPULSORY: plan gate.
    // SKIPPABLE by super-admins: the manager (assign) gate.
    // Both login walls are now OFF by default (Sir) — kept behind kill-switches,
    // restorable per-gate: LOGIN_PLAN_GATE_ON / MANAGER_TASK_GATE_ON.
    const isManager = await isManagerWithReports(me.id).catch(() => false);
    if (loginPlanGateOn() && !isManager) {
      const mustPlan = await needsDailyChecklistPlan(me).catch(() => false);
      if (mustPlan) return <DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />;
    }
    const canSkip = isSuperAdmin(me.email);
    const skipDuties = canSkip && (await gateSkipActive(me).catch(() => false));
    const withSkip = (node: ReactNode) => (canSkip ? <>{node}<SkipGateButton /></> : node);
    if (!skipDuties) {
      if (managerTaskGateOn()) {
        const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
        if (dailyGate && !dailyGate.satisfied) return withSkip(<ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />);
      }
    }
  }

  const now = new Date();
  const tz = me.timezone || TZ;

  // Access first — it decides which panes may even be fetched.
  const access = await accessFor(me);
  const visible = MODULE_ORDER.filter((id) => canAccessWorkspace(id, access));
  const canSeeWms = canAccessWorkspace("wms", access);
  const canSeeGoals = canAccessWorkspace("goals", access);

  // One round of parallel reads, each caught on its own.
  const [counts, todayTasks, goals, org, nav] = await Promise.all([
    canSeeWms ? getMyDayCounts(me.id).catch(() => null) : null,
    canSeeWms ? getMyTodayTasks(me.id).catch((): MyTodayTask[] => []) : [],
    canSeeGoals ? getDashboard(me.id, fyStartYearOf(now)).catch(() => null) : null,
    getOrgSettings().catch(() => null),
    // The account menu calls this on every page: the task totals are a shared
    // cache hit, so the inbox widget costs one per-user unread query and
    // nothing more.
    getNavCounts({ userId: me.id, isAdmin: me.isAdmin, inboxSince: me.lastInboxVisitAt }).catch(
      () => null,
    ),
  ]);

  const board = await loadAuraDashboard({
    employeeId: me.id,
    isAdmin: me.isAdmin,
    isManager: await isManagerWithReports(me.id).catch(() => false),
    tz,
    lateAfterMinutes: hhmmToMinutes(org?.attLateAfter ?? me.attLateAfter),
    target: {
      weeklyTargetMinutes: me.weeklyTargetMinutes,
      fullDayMinutes: me.attFullDayMinutes,
      workingDays: me.workingDays,
    },
    now,
  }).catch(
    (): AuraDashboard => ({
      shape: null,
      attendance: null,
      openWork: null,
      outcomes: null,
      items: [],
      upcoming: [],
      team: [],
      anniversaries: [],
      delegated: [],
    }),
  );

  const open = (counts?.dueToday ?? 0) + (counts?.overdue ?? 0);

  const shape = board.shape;
  // The week strip's tallest bar is 34px; every other day is drawn in
  // proportion to it, so a light week is visibly light rather than rescaled to
  // look full.
  const peakMinutes = Math.max(...(shape?.days ?? []).map((d) => d.minutes), 1);

  /* EVERY WIDGET BODY, RENDERED HERE ON THE SERVER, handed to the grid as a map
     of finished nodes. The grid only decides order, size and presence — so the
     dashboard's data never crosses to the client, and a widget can go on being
     an async Server Component while still being furniture the user moves.

     A widget with no data is simply absent from both maps. `available` is what
     the viewer may ever see; the grid uses it for the "add a widget" list and
     to discard a stored layout entry that no longer applies. */
  const nodes: Partial<Record<WidgetId, ReactNode>> = {};

  if (counts) {
    nodes["wms-loop"] = (
      <EnterWorkspaceLink
        id="wms"
        href={WORKSPACE_LANDING.wms}
        ariaLabel="Open WMS"
        className="aura-glass aura-interactive aura-pane"
      >
        <div className="aura-pane-head">
          <span className="aura-pill" style={{ background: "rgba(216,31,18,.16)", color: "#8f1109" }}>
            WMS · DAILY LOOP
          </span>
          <span className="aura-go" style={{ color: "#b5170e" }}>
            Open →
          </span>
        </div>
        <div className="aura-bigrow">
          <b className="aura-big">{open}</b>
          <span>
            {open === 1 ? "task" : "tasks"} due or overdue
            {counts.doneToday > 0 ? ` · ${counts.doneToday} done today` : ""}
          </span>
        </div>
        <div className="aura-tasks">
          {todayTasks.slice(0, 3).map((t) => (
            <div className="aura-task" key={t.id}>
              <i className={t.overdue ? "aura-dot aura-dot-hot" : "aura-dot"} aria-hidden />
              <span className="aura-task-title">
                {t.title || t.subject || t.client || `Task ${t.taskNo ?? ""}`.trim()}
              </span>
              <time>{t.overdue ? "Overdue" : t.dueAt ? istTimeLabel(t.dueAt) : "Today"}</time>
            </div>
          ))}
          {todayTasks.length === 0 && (
            <div className="aura-task">
              <i className="aura-dot" aria-hidden />
              <span className="aura-task-title">Nothing due today — the loop is clear.</span>
            </div>
          )}
        </div>
      </EnterWorkspaceLink>
    );
  }

  if (goals) {
    nodes["goals-week"] = (
      <EnterWorkspaceLink
        id="goals"
        href={WORKSPACE_LANDING.goals}
        ariaLabel="Open Goals"
        className="aura-glass aura-interactive aura-pane"
      >
        <div className="aura-pane-head">
          <span className="aura-pill" style={{ background: "rgba(22,74,143,.16)", color: "#0f3569" }}>
            GOALS · THIS WEEK
          </span>
          <span className="aura-go" style={{ color: "#164a8f" }}>
            Open →
          </span>
        </div>
        <div className="aura-bigrow">
          <b className="aura-big">{goals.weekScore}%</b>
          <span>of this week&rsquo;s goals delivered</span>
        </div>
        <div className="aura-bar">
          <i style={{ width: `${Math.min(100, Math.max(0, goals.weekScore))}%` }} />
        </div>
        <div className="aura-stats">
          <div>
            <b>{goals.weeklyGoalCount}</b>
            <em>this week</em>
          </div>
          <div>
            <b>{goals.cascadeGoalCount}</b>
            <em>cascade goals</em>
          </div>
          <div>
            <b>{goals.ytdWeeklyAvg}%</b>
            <em>FY average</em>
          </div>
        </div>
      </EnterWorkspaceLink>
    );
  }

  // No data behind it at all — it is five links — so it is always offerable.
  nodes["quick-actions"] = <QuickActionsWidget />;

  if (shape) {
    nodes["hours-ledger"] = <HoursWidget shape={shape} />;
    nodes["work-shape"] = <AuraBloom shape={shape} />;

    nodes.attendance = (
      <section className="aura-glass aura-att">
        <div className="aura-att-head">
          <h2 className="aura-h2">Attendance — today</h2>
          <span>
            {board.attendance ? `${board.attendance.total} on roll` : "Your punches, this week"}
          </span>
        </div>

        {/* The roster counters are ADMIN-ONLY: they span every employee, which
            is exactly why /attendance/live-status is behind requireAdmin.
            Everyone else gets their own week, full width. */}
        <div className={board.attendance ? "aura-att-body" : "aura-att-body aura-att-mine-only"}>
          {board.attendance && (
            <>
              <div className="aura-att-stat">
                <b>{board.attendance.present}</b>
                <em>
                  <i style={{ background: "#2fa36b" }} />
                  Present
                </em>
              </div>
              <div className="aura-att-stat">
                <b>{board.attendance.late}</b>
                <em>
                  <i style={{ background: "#e8a11a" }} />
                  Late
                </em>
              </div>
              <div className="aura-att-stat">
                <b>{board.attendance.onLeave}</b>
                <em>
                  <i style={{ background: "#4f7cf7" }} />
                  On leave
                </em>
              </div>
              <div className="aura-att-stat">
                <b>{board.attendance.unmarked}</b>
                <em>
                  <i style={{ background: "#d81f12" }} />
                  Unmarked
                </em>
              </div>
            </>
          )}

          <div className="aura-att-week">
            <div className="aura-row">
              {shape.days.map((d) => {
                const height = Math.max(6, Math.round((d.minutes / peakMinutes) * 34));
                const tint =
                  d.minutes === 0
                    ? "rgba(20,26,46,.08)"
                    : d.open
                      ? "linear-gradient(180deg,rgba(232,161,26,.25),rgba(232,161,26,.55))"
                      : "linear-gradient(180deg,rgba(47,163,107,.25),rgba(47,163,107,.5))";
                return (
                  <div className="aura-day" key={d.ymd} title={`${d.letter} — ${hm(d.minutes)}`}>
                    <span>{d.letter}</span>
                    <i style={{ height, background: tint }} />
                  </div>
                );
              })}
            </div>
            <div className="aura-cap">
              {shape.totalMinutes > 0
                ? `${hm(shape.totalMinutes)} logged this week.`
                : "No punches recorded this week yet."}
            </div>
          </div>
        </div>

        <div className="aura-att-mine">
          <i
            className="aura-dot"
            style={{ background: shape.today ? "#2fa36b" : "#94a0c8" }}
            aria-hidden
          />
          {shape.today?.inLabel
            ? `You clocked in at ${shape.today.inLabel}` +
              (shape.today.outLabel ? ` and out at ${shape.today.outLabel}` : "") +
              ` · ${hm(shape.today.minutes)} logged`
            : "You have not clocked in today."}
          <Link href={"/attendance" as Route} className="aura-btn-mini">
            {shape.today?.inLabel && !shape.today.outLabel ? "Clock out" : "Attendance"}
          </Link>
        </div>
      </section>
    );
  }

  if (board.openWork) nodes["open-work"] = <AuraDonut data={board.openWork} title="Where your work sits" />;
  if (board.outcomes) nodes.outcomes = <AuraDonut data={board.outcomes} title="This month's outcomes" />;
  if (board.upcoming.length > 0) nodes.upcoming = <UpcomingWidget days={board.upcoming} />;
  if (board.team.length > 0) nodes.team = <TeamWidget team={board.team} />;
  if (board.delegated.length > 0) nodes.delegated = <DelegatedWidget people={board.delegated} />;
  if (board.anniversaries.length > 0)
    nodes.anniversaries = <AnniversaryWidget people={board.anniversaries} />;
  if (nav) nodes.inbox = <InboxWidget unread={nav.inboxUnread} archived={nav.archivedTasks} />;

  nodes["open-table"] = (
    <section className="aura-glass aura-tbl-card">
      <div className="aura-tbl-head">
        <h2 className="aura-h2">Open on you</h2>
        <Link href={"/tasks" as Route}>View all →</Link>
      </div>
      {board.items.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Client</th>
              <th>Given by</th>
              <th>Due</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {board.items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="aura-empty">Nothing is open on you right now.</div>
      )}
    </section>
  );

  const available = Object.keys(nodes) as WidgetId[];

  return (
    <div className="aura-app">
      {/* 1 — THE FIELD: the thing the glass refracts. */}
      <div className="aura-field" aria-hidden>
        <div className="aura-blob aura-b1" />
        <div className="aura-blob aura-b2" />
        <div className="aura-blob aura-b3" />
      </div>
      {/* 2 — THE GRAIN: so the glass reads as material, not white plastic. */}
      <div className="aura-grain" aria-hidden />
      <AuraSheen />

      {/* 3 — THE GLASS. The SAME bar the rest of the app gets, mounted inside
          this page rather than by the layout: here it has the field behind it
          to refract, which is the whole point of the material. ChromeShell
          suppresses the layout's copy on this route so there is only ever one. */}
      <AuraTopBar
        rooms={roomsFor(visible)}
        bell={<NotificationBell />}
        userMenu={<UserMenuServer />}
      />

      {/* The workspace rail is GONE from this page. Every room is in the top
          bar — as a tab or under "More" — so a second, permanent copy of the
          same list down the left was 252px spent saying it twice. Module pages
          keep THEIR rail: that one lists the sections inside a room, which the
          top bar does not. */}
      <div className="aura-layout aura-layout-bare">
        <main className="aura-main">
          {/* The greeting is passed IN rather than rendered here, so the grid
              can switch it off with everything else. A page whose whole point
              is that nothing is fixed should not have one fixed thing. */}
          <DashboardGrid
            nodes={nodes}
            available={available}
            greeting={
              <div className="aura-top">
                <div>
                  <div className="aura-date">{istDateLabel(now)}</div>
                  <h1 className="aura-h1">
                    {istGreeting(now)}, {firstName}
                  </h1>
                </div>
                <div className="aura-glass aura-chip">Today</div>
              </div>
            }
          />
        </main>
      </div>
    </div>
  );
}
