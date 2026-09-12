import Image from "next/image";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace, WORKSPACE_LANDING, type WorkspaceId } from "@/lib/workspaces";
import { MODULE_THEME, MODULE_ORDER, moduleShortcut, type ModuleTheme } from "@/lib/module-theme";
import { EnterWorkspaceLink } from "@/components/hub/enter-workspace-link";
import { AuraSheen, AuraRailToggle, AURA_LAYOUT_ID } from "@/components/hub/aura-chrome";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { GlobalSearch } from "@/components/header/global-search";
import { getMyDayCounts, getMyTodayTasks, type MyTodayTask } from "@/lib/queries/my-day";
import { getDashboard } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
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

// The hub is the post-login landing and MUST run the (app) layout's daily-ritual
// gate on every request — never a cached/prerendered copy that would let someone
// past the wall. Force dynamic so the gate is always evaluated per-user.
export const dynamic = "force-dynamic";

/**
 * THE FRONT DOOR — post-login Hub launcher, in the AURA liquid-glass language.
 *
 * The design language lives in `.claude/skills/aura/SKILL.md` and its tokens in
 * `app/aura.css`; the reference screen it replicates is
 * `.claude/skills/aura/reference/altus-home-heros.html`. Three layers, back to
 * front: a drifting colour FIELD, a noise GRAIN, and translucent GLASS on top.
 *
 * WHAT REPLACED WHAT (2026-09-12). The previous front door was twelve solid
 * pastel cards on a near-white page — one flat colour per module, no shell.
 * Aura keeps every module's identity (the tile glyph is still drawn in the
 * module's own `accentDeep`) but moves the colour into the GLYPH and lets the
 * glass carry the surface. That is the language's central move: colour is
 * redistributed from the fill to the mark, so the page reads as one material
 * instead of twelve competing ones.
 *
 * EVERY NUMBER ON THIS PAGE IS REAL. The reference mock also carries an
 * attendance block, two donuts, a work-shape bloom and a cross-workspace table.
 * Those are NOT here, because the queries behind them do not exist: nothing in
 * the codebase tags a record with a workspace, the task-time rollup has no
 * module dimension, and there is no "unmarked today" count anywhere. A front
 * door showing invented numbers is worse than one showing fewer, so the panes
 * that ship are the two whose data was already there — `getMyDayCounts` /
 * `getMyTodayTasks` (cached 15s, busted by the `tasks` tag) and `getDashboard`
 * (three indexed counts behind `withRetry`).
 *
 * Server Component. The only client leaves are the pointer sheen, the rail
 * toggle, ⌘K search and the account menu.
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

/**
 * A workspace tile: glass pane, the module's own glyph, its tagline, and either
 * a live count or the keyboard shortcut that opens it.
 *
 * The badge slot is deliberately two different things. WMS and Goals have real
 * numbers behind them, so they show those; no other module has a per-module
 * count anywhere in the codebase, so rather than invent one the slot falls back
 * to the digit that opens the room. The two are told apart by shape — a count
 * is plain text, a shortcut wears the `.aura-kbd` border — so neither is ever
 * read as the other.
 */
function WorkspaceTile({
  m,
  locked,
  index,
  badge,
}: {
  m: ModuleTheme;
  locked: boolean;
  index: number;
  badge: string | null;
}) {
  const shortcut = moduleShortcut(index);
  const Icon = m.Icon;

  const inner = (
    <>
      <div className="aura-tile-top">
        <span className="aura-tile-icon">
          <Icon size={19} strokeWidth={1.9} style={{ color: m.accentDeep }} aria-hidden />
        </span>
        {locked ? (
          <span className="aura-state aura-state-idle inline-flex items-center gap-1">
            <Lock size={11} strokeWidth={2.6} aria-hidden /> No access
          </span>
        ) : badge ? (
          <span className="aura-tile-badge">{badge}</span>
        ) : shortcut ? (
          <span className="aura-kbd" aria-hidden>
            {shortcut}
          </span>
        ) : null}
      </div>
      <div className="aura-tile-name">{m.label}</div>
      <div className="aura-tile-desc">{m.tagline}</div>
    </>
  );

  if (locked) {
    return (
      <div className="aura-glass aura-tile aura-tile-locked" aria-disabled="true">
        {inner}
      </div>
    );
  }

  return (
    <EnterWorkspaceLink
      id={m.id}
      href={WORKSPACE_LANDING[m.id]}
      ariaLabel={shortcut ? `Open ${m.label} (shortcut ${shortcut})` : `Open ${m.label}`}
      className="aura-glass aura-interactive aura-tile"
    >
      {inner}
    </EnterWorkspaceLink>
  );
}

/** One line in the rail: the module's colour, its name, its shortcut digit. */
function RailItem({ id, index }: { id: WorkspaceId; index: number }) {
  const m = MODULE_THEME[id];
  const shortcut = moduleShortcut(index);
  return (
    <EnterWorkspaceLink
      id={id}
      href={WORKSPACE_LANDING[id]}
      ariaLabel={`Open ${m.label}`}
      className="aura-nav"
    >
      <span className="aura-nav-dot" style={{ background: m.accent }} aria-hidden />
      <span className="min-w-0 truncate">{m.label}</span>
      {shortcut && (
        <span className="aura-nav-key" aria-hidden>
          {shortcut}
        </span>
      )}
    </EnterWorkspaceLink>
  );
}

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;

  // COMPULSORY DAILY WALL — enforced HERE on the hub (the post-login landing) in
  // addition to the (app) layout, because the layout's gate return wasn't
  // reliably taking effect for the /hub route on prod. Same policy: fail-open,
  // day-scoped, super-admin-skippable, kill-switchable (DCC_GATE_OFF /
  // MANAGER_GATES_OFF). Employees must commit ≥5 checklist items + log goal
  // progress; managers get their task-give gate; everyone fills DCC.
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

  // Access first — it decides which panes are even allowed to be fetched.
  const access = await accessFor(me);
  const visible = MODULE_ORDER.filter((id) => canAccessWorkspace(id, access));
  const canSeeWms = canAccessWorkspace("wms", access);
  const canSeeGoals = canAccessWorkspace("goals", access);

  // The hub is the post-login landing, so everything here is on the critical
  // path and EVERY call fails soft. A dead pane costs a panel; a thrown one
  // costs the front door — which is how Daily Goals took attendance punch-in
  // down on 8 September.
  const [counts, todayTasks, goals] = await Promise.all([
    canSeeWms ? getMyDayCounts(me.id).catch(() => null) : null,
    canSeeWms ? getMyTodayTasks(me.id).catch((): MyTodayTask[] => []) : [],
    canSeeGoals ? getDashboard(me.id, fyStartYearOf(now)).catch(() => null) : null,
  ]);

  const open = (counts?.dueToday ?? 0) + (counts?.overdue ?? 0);

  // Badges: only where a real number exists. See WorkspaceTile.
  const badges: Partial<Record<WorkspaceId, string>> = {};
  if (counts && open > 0) badges.wms = `${open} due`;
  if (goals) badges.goals = `${goals.weekScore}%`;

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

      {/* 3 — THE GLASS. Chrome first: more transparent than a pane, never lifts. */}
      <header className="aura-topbar">
        <AuraRailToggle />
        <a
          href="https://altuscorp.in"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Altus Corp — altuscorp.in"
          className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-80"
        >
          <Image src="/logo.png" alt="" width={170} height={188} priority className="h-8 w-auto" />
          <span className="aura-brand max-sm:hidden">Altus</span>
        </a>

        <div className="ml-auto flex items-center gap-2">
          <GlobalSearch />
          <UserMenuServer />
        </div>
      </header>

      <div className="aura-layout" id={AURA_LAYOUT_ID}>
        {/* The rail repeats the grid on purpose: it stays put while the page
            scrolls, so the twelfth room is one click away from the bottom of a
            long screen. Only rooms the viewer can actually enter are listed. */}
        <aside className="aura-rail">
          <div className="aura-rail-label" style={{ paddingTop: 2 }}>
            WORKSPACES
          </div>
          <nav aria-label="Workspaces">
            {visible.map((id) => (
              <RailItem key={id} id={id} index={MODULE_ORDER.indexOf(id)} />
            ))}
          </nav>
        </aside>

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
                locked={false}
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
