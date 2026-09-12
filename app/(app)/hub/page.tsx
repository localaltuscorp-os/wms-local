import Link from "next/link";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace, WORKSPACE_LANDING, type WorkspaceId } from "@/lib/workspaces";
import { MODULE_THEME, MODULE_ORDER, moduleShortcut, type ModuleTheme } from "@/lib/module-theme";
import { EnterWorkspaceLink } from "@/components/hub/enter-workspace-link";
import { AuraSheen, AURA_LAYOUT_ID } from "@/components/hub/aura-chrome";
import { AuraTopBar } from "@/components/layout/aura-top-bar";
import { roomsFor } from "@/lib/aura-rooms";
import { AuraDonut, AuraBloom } from "@/components/hub/aura-charts";
import { AuraGlassRail } from "@/components/hub/aura-glass-rail";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NotificationBell } from "@/components/header/notification-bell";
import { getMyDayCounts, getMyTodayTasks, type MyTodayTask } from "@/lib/queries/my-day";
import { getDashboard } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { loadAuraDashboard, hhmmToMinutes, type OpenItem } from "@/lib/queries/aura-dashboard";
import type { ReactNode } from "react";
import { isManagerWithReports, managerDailyTaskGate } from "@/lib/manager-gates";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { gateSkipActive } from "@/lib/auth/gate-skip";
import { SkipGateButton } from "@/components/layout/skip-gate-button";
import { needsDailyChecklistPlan } from "@/lib/daily-checklist/gate";
import { loginPlanGateOn, loginDccGateOn, managerTaskGateOn, dccReviewGateOn } from "@/lib/goals/flag";
import { dccGateTarget, dccManagerReviewState } from "@/lib/dcc/gate";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { ManagerDailyTaskGate } from "@/components/manager-gates/manager-daily-task-gate";
import { DccGateView } from "@/components/dcc/dcc-gate-view";
import { DccManagerReviewGate } from "@/components/dcc/dcc-manager-review-gate";

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
 *   greeting            what today is and how much is on you
 *   two panes           the WMS daily loop · this week's goals
 *   attendance          your punch, your week, and the roster (admins only)
 *   three charts        open work by priority · this month's outcomes · your
 *                       WORK SHAPE, a petal per day sized by hours actually
 *                       worked, which is the design language's own idea and
 *                       the reason it is worth drawing
 *   the table           what is open on you, soonest first
 *   the grid            jump into a workspace
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

/** The one line under the greeting, built from what is actually waiting. */
function needsYouLine(open: number): string {
  if (open === 0) return "Nothing is due on you today.";
  if (open === 1) return "One thing needs you today.";
  return `${open} things need you today.`;
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

/**
 * A workspace tile: glass pane, the module's own glyph, its tagline, and either
 * a live count or the keyboard shortcut that opens it.
 *
 * The badge slot is deliberately two different things. WMS and Goals have real
 * numbers behind them, so they show those; no other module has a per-module
 * count anywhere in the codebase, so rather than invent one the slot falls back
 * to the digit that opens the room. The two are told apart by shape — a count
 * is plain text, a shortcut wears the `.aura-kbd` border.
 */
function WorkspaceTile({
  m,
  index,
  badge,
}: {
  m: ModuleTheme;
  index: number;
  badge: string | null;
}) {
  const shortcut = moduleShortcut(index);
  const Icon = m.Icon;

  return (
    <EnterWorkspaceLink
      id={m.id}
      href={WORKSPACE_LANDING[m.id]}
      ariaLabel={shortcut ? `Open ${m.label} (shortcut ${shortcut})` : `Open ${m.label}`}
      className="aura-glass aura-interactive aura-tile"
    >
      <div className="aura-tile-top">
        <span className="aura-tile-icon">
          <Icon size={19} strokeWidth={1.9} style={{ color: m.accentDeep }} aria-hidden />
        </span>
        {badge ? (
          <span className="aura-tile-badge">{badge}</span>
        ) : shortcut ? (
          <span className="aura-kbd" aria-hidden>
            {shortcut}
          </span>
        ) : null}
      </div>
      <div className="aura-tile-name">{m.label}</div>
      <div className="aura-tile-desc">{m.tagline}</div>
    </EnterWorkspaceLink>
  );
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
  // (DCC_GATE_OFF / MANAGER_GATES_OFF). Employees must commit ≥5 checklist
  // items + log goal progress; managers get their task-give gate; everyone
  // fills DCC.
  {
    // Keep in LOCK-STEP with app/(app)/layout.tsx. COMPULSORY: plan gate + own-DCC.
    // SKIPPABLE by super-admins: manager (assign) + DCC-review gates.
    // All four login walls are now OFF by default (Sir) — kept behind kill-switches,
    // restorable per-gate: LOGIN_PLAN_GATE_ON / LOGIN_DCC_GATE_ON / MANAGER_TASK_GATE_ON
    // / DCC_REVIEW_GATE_ON. Kept in lock-step with app/(app)/layout.tsx.
    const isManager = await isManagerWithReports(me.id).catch(() => false);
    if (loginPlanGateOn() && !isManager) {
      const mustPlan = await needsDailyChecklistPlan(me.id).catch(() => false);
      if (mustPlan) return <DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />;
    }
    if (loginDccGateOn()) {
      const dccTarget = await dccGateTarget(me.id).catch(() => null);
      if (dccTarget) return <DccGateView greetingName={firstName} date={dccTarget.date} items={dccTarget.items} entries={dccTarget.entries} />;
    }
    const canSkip = isSuperAdmin(me.email);
    const skipDuties = canSkip && (await gateSkipActive(me).catch(() => false));
    const withSkip = (node: ReactNode) => (canSkip ? <>{node}<SkipGateButton /></> : node);
    if (!skipDuties) {
      if (managerTaskGateOn()) {
        const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
        if (dailyGate && !dailyGate.satisfied) return withSkip(<ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />);
      }
      if (dccReviewGateOn()) {
        const dccReview = await dccManagerReviewState(me).catch(() => null);
        if (dccReview && !dccReview.satisfied) return withSkip(<DccManagerReviewGate greetingName={firstName} state={dccReview} />);
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
  const [counts, todayTasks, goals, org] = await Promise.all([
    canSeeWms ? getMyDayCounts(me.id).catch(() => null) : null,
    canSeeWms ? getMyTodayTasks(me.id).catch((): MyTodayTask[] => []) : [],
    canSeeGoals ? getDashboard(me.id, fyStartYearOf(now)).catch(() => null) : null,
    getOrgSettings().catch(() => null),
  ]);

  const board = await loadAuraDashboard({
    employeeId: me.id,
    isAdmin: me.isAdmin,
    tz,
    lateAfterMinutes: hhmmToMinutes(org?.attLateAfter ?? me.attLateAfter),
    now,
  }).catch(() => ({ shape: null, attendance: null, openWork: null, outcomes: null, items: [] }));

  const open = (counts?.dueToday ?? 0) + (counts?.overdue ?? 0);

  // Badges: only where a real number exists. See WorkspaceTile.
  const badges: Partial<Record<WorkspaceId, string>> = {};
  if (counts && open > 0) badges.wms = `${open} due`;
  if (goals) badges.goals = `${goals.weekScore}%`;

  const shape = board.shape;
  // The week strip's tallest bar is 34px; every other day is drawn in
  // proportion to it, so a light week is visibly light rather than rescaled to
  // look full.
  const peakMinutes = Math.max(...(shape?.days ?? []).map((d) => d.minutes), 1);

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

      <div className="aura-layout" id={AURA_LAYOUT_ID}>
        {/* The room switcher that stays put while a long dashboard scrolls.
            Only rooms the viewer can actually enter are listed, and the badges
            are the same live counts the tiles carry — one source, so the rail
            and the grid can never disagree. */}
        <AuraGlassRail rooms={roomsFor(visible)} badges={badges} />

        <main className="aura-main">
          <div className="aura-top">
            <div>
              <div className="aura-date">{istDateLabel(now)}</div>
              <h1 className="aura-h1">
                {istGreeting(now)}, {firstName}
              </h1>
              <p className="aura-sub">{needsYouLine(open)}</p>
            </div>
            <div className="aura-glass aura-chip">Today</div>
          </div>

          {/* ── the two status panes ─────────────────────────────────────── */}
          {(counts || goals) && (
            <section className="aura-panes">
              {counts && (
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
              )}

              {goals && (
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
              )}
            </section>
          )}

          {/* ── attendance ───────────────────────────────────────────────── */}
          {shape && (
            <section className="aura-glass aura-att">
              <div className="aura-att-head">
                <h2 className="aura-h2">Attendance — today</h2>
                <span>
                  {board.attendance
                    ? `${board.attendance.total} on roll`
                    : "Your punches, this week"}
                </span>
              </div>

              {/* The roster counters are ADMIN-ONLY: they span every employee,
                  which is exactly why /attendance/live-status is behind
                  requireAdmin. Everyone else gets their own week, full width. */}
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
          )}

          {/* ── the three charts ─────────────────────────────────────────── */}
          {(board.openWork || board.outcomes || shape) && (
            <section className="aura-trio">
              {board.openWork && <AuraDonut data={board.openWork} title="Where your work sits" />}
              {board.outcomes && <AuraDonut data={board.outcomes} title="This month's outcomes" />}
              {shape && <AuraBloom shape={shape} />}
            </section>
          )}

          {/* ── the open table ───────────────────────────────────────────── */}
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

          {/* ── the launcher ─────────────────────────────────────────────── */}
          <div className="aura-grid-head">
            <h2 className="aura-h2">Jump into a workspace</h2>
            <span>
              {visible.length} {visible.length === 1 ? "room" : "rooms"}
            </span>
          </div>

          {/* A workspace you can't enter is HIDDEN, not shown greyed as "No
              Access" (Sir 2026-08) — a normal doer only sees the modules that are
              actually theirs. The tile keeps its CANONICAL index so its shortcut
              still matches the global 1–9/0 handler in `(app)/layout.tsx`, even
              with some rooms hidden. */}
          <div className="aura-grid">
            {visible.map((id) => (
              <WorkspaceTile
                key={id}
                m={MODULE_THEME[id]}
                index={MODULE_ORDER.indexOf(id)}
                badge={badges[id] ?? null}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
