import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { gateSkipActive } from "@/lib/auth/gate-skip";
import { SkipGateButton } from "@/components/layout/skip-gate-button";
import { needsDailyChecklistPlan, needsGoalsPlanCommit } from "@/lib/daily-checklist/gate";
import { planGateOn, managerTaskGateOn, dccReviewGateOn, goalsCascadeEnabled, loginPlanGateOn, loginDccGateOn } from "@/lib/goals/flag";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { ChromeShell } from "@/components/layout/chrome-shell";
import { AppTopBar } from "@/components/layout/app-top-bar";
import { NewTaskTrigger } from "@/components/header/new-task-trigger";
import { NotificationBell } from "@/components/header/notification-bell";
import { ModuleFooter } from "@/components/layout/module-footer";
import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { FocusMode } from "@/components/layout/focus-mode";
import { MODULE_ORDER } from "@/lib/module-theme";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { workspaceForPath, canAccessWorkspace } from "@/lib/workspaces";
import { managerDailyTaskGate, isManagerWithReports } from "@/lib/manager-gates";
import { ManagerDailyTaskGate } from "@/components/manager-gates/manager-daily-task-gate";
import { dccGateTarget, dccManagerReviewState } from "@/lib/dcc/gate";
import { DccGateView } from "@/components/dcc/dcc-gate-view";
import { DccManagerReviewGate } from "@/components/dcc/dcc-manager-review-gate";
import { OnboardingNudge } from "@/components/onboarding/onboarding-nudge";
import { pendingLockBroadcastForEmployee } from "@/lib/ecos/queries";
import { BroadcastLockGate } from "@/components/communications/broadcast-lock-gate";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Load directly (no timeout wrapper). A slow read completes; wrapping auth in
  // a hard timeout turned slow-but-fine reads into thrown "We hit a snag" pages.
  const me = await requireUser();

  // `x-pathname` is set by the auth middleware (layouts can't read the path
  // otherwise) → which workspace this page belongs to.
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const ws = workspaceForPath(pathname);

  // Resolved ONCE and reused: the route gate below and the module footer at the
  // bottom both need it, and `accessFor` hits the DB for the employee's
  // departments — computing it twice would double that on every page.
  const access = await accessFor(me);

  // Workspace access control: department-restricted rooms (e.g. Sales) are
  // reachable only by super-admins or members of that department. Everyone else
  // is bounced to the hub before the page renders — covers deep links too.
  if (ws && !canAccessWorkspace(ws, access)) {
    redirect("/hub");
  }

  // The daily ritual gate chain. Policy: a COMPULSORY post-login wall — the daily
  // rituals (plan-your-day / DCC / manager duties) must be done before ANY app
  // surface opens, INCLUDING the hub launcher. There is no ungated landing spot:
  // you cannot slip past by going to /hub or any other route. All checks are
  // day-scoped + FAIL-OPEN, so a finished ritual / DB hiccup never traps anyone,
  // and each has a kill-switch (DCC_GATE_OFF / MANAGER_GATES_OFF).
  //
  // The gate view takes over full-screen and its ritual is filled inline (no
  // navigation), so gating every route is safe — the manager duty routes
  // (/tasks/new, /weekly-goals) stay reachable via the `onDutyRoute` exemption.
  //
  // Daily gate chain. COMPULSORY for everyone (incl. super-admins): the PLAN gate
  // (daily checklist) and the OWN-DCC fill. SKIPPABLE by super-admins ONLY: the
  // MANAGER (assign-tasks) gate + the DCC-REVIEW (sign-off-your-team) gate — Sir:
  // "me and manan get a skip button on the review and assigning page only, NOT
  // on the daily checklist page". A super-admin's "Skip for today" (sa_gate_skip
  // cookie) bypasses ONLY those two. Day-scoped + FAIL-OPEN.
  {
    const firstName = me.name.split(" ")[0] ?? me.name;
    const isManager = await isManagerWithReports(me.id).catch(() => false);

    // ── COMPULSORY — PLAN gate. Two implementations, switched by planGateOn():
    //    • NEW (planGateOn on): the redesigned Plan-Your-Day at /my-day with
    //      a role-based minimum (3 IC / 5 manager, design §4). Under-min → send
    //      them to /my-day; the plan route itself is exempt (else it loops).
    //      BOTH the exemption and the target moved with the planner when it
    //      left /goals/plan for the WMS room — they must always name the SAME
    //      path as the page, or the exemption stops matching the redirect and
    //      every gated request bounces forever.
    //    • LEGACY (default, planGateOn off): the daily-checklist plan gate for
    //      non-managers, rendered inline. UNCHANGED — flipping the flag on is the
    //      only thing that swaps behaviour. Counts the same committed-items set
    //      as the client either way, so it can't drift/buffer. ──
    if (planGateOn() && goalsCascadeEnabled()) {
      // `/goals/plan` stays exempt too: it is now a redirect stub to /my-day,
      // and gating it would bounce the request before the stub could forward.
      const onPlanRoute =
        pathname.startsWith("/my-day") || pathname.startsWith("/goals/plan");
      if (!onPlanRoute) {
        const minItems = isManager ? 5 : 3;
        const underMin = await needsGoalsPlanCommit(me.id, minItems).catch(() => false);
        if (underMin) redirect("/my-day");
      }
    } else if (loginPlanGateOn() && !isManager) {
      // Legacy "commit your day" wall — now OFF by default (Sir). LOGIN_PLAN_GATE_ON=true restores.
      const mustPlan = await needsDailyChecklistPlan(me.id).catch(() => false);
      if (mustPlan) {
        return <DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />;
      }
    }

    // ── Own-DCC "fill your DCC" wall — now OFF by default at login (Sir).
    //    LOGIN_DCC_GATE_ON=true restores. (The punch-out DCC block still uses
    //    DCC_GATE_OFF, so clock-out compliance is unaffected.) ──
    if (loginDccGateOn()) {
      const dccTarget = await dccGateTarget(me.id).catch(() => null);
      if (dccTarget) {
        return <DccGateView greetingName={firstName} date={dccTarget.date} items={dccTarget.items} entries={dccTarget.entries} />;
      }
    }

    // ── SKIPPABLE by super-admins — the manager duties (assign + review). ──
    const canSkip = isSuperAdmin(me.email);
    const skipDuties = canSkip && (await gateSkipActive(me).catch(() => false));
    const withSkip = (node: ReactNode) => (canSkip ? <>{node}<SkipGateButton /></> : node);
    if (!skipDuties) {
      // MANAGER gate: give each report their daily tasks. Duty routes exempt.
      // Rewired to managerTaskGateOn() (default OFF ⇒ the "manager must assign
      // tasks daily" rule is REMOVED, per design §4). Set MANAGER_TASK_GATE_ON=
      // true to restore it. The legacy MANAGER_GATES_OFF switch no longer gates
      // this branch.
      const onDutyRoute = pathname.startsWith("/tasks/new") || pathname.startsWith("/goals/weekly");
      if (!onDutyRoute && managerTaskGateOn()) {
        const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
        if (dailyGate && !dailyGate.satisfied) {
          return withSkip(<ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />);
        }
      }
      // DCC REVIEW gate: sign off your DIRECT reports' DCC. Rewired to
      // dccReviewGateOn() (default OFF ⇒ the review step is removed for now,
      // design §4). Set DCC_REVIEW_GATE_ON=true to restore it. (The COMPULSORY
      // own-DCC fill above still honors DCC_GATE_OFF — unchanged.)
      if (dccReviewGateOn()) {
        const dccReview = await dccManagerReviewState(me).catch(() => null);
        if (dccReview && !dccReview.satisfied) {
          return withSkip(<DccManagerReviewGate greetingName={firstName} state={dccReview} />);
        }
      }
    }
  }

  // ── ECOS "Compliance Lock Mode" — mandatory-broadcast APP-LOCK gate. ──
  // The LAST gate in the chain: after every daily ritual passes, if this
  // employee has an unacknowledged Critical/Emergency broadcast published with
  // `requireLock=true`, replace the whole app with a full-screen lock until they
  // acknowledge it. Acknowledging (in the gate) → router.refresh() → this layout
  // re-runs → the query no longer returns the broadcast → the lock clears.
  //
  // TRIPLE FAIL-OPEN so a DB hiccup can NEVER trap anyone (the app's gates were
  // once disabled after wrongly blocking attendance — we do not repeat that):
  //   1. kill-switch — ECOS_LOCK_OFF=true disables locking entirely. Default OFF
  //      (unset) = locking ACTIVE, since enforcement is the whole point; but it
  //      is trivially disableable if it ever misbehaves in prod.
  //   2. super-admin skip — the SAME `gateSkipActive` helper the manager/DCC
  //      gates use (sa_gate_skip cookie), so a super-admin is never locked out.
  //   3. `pendingLockBroadcastForEmployee` is itself fail-open (returns null on
  //      any error), and we .catch(() => null) on top for a second guarantee.
  if (process.env.ECOS_LOCK_OFF !== "true" && !(await gateSkipActive(me).catch(() => false))) {
    const lock = await pendingLockBroadcastForEmployee(me.id).catch(() => null);
    if (lock) {
      return (
        <BroadcastLockGate
          broadcast={{
            id: lock.id,
            title: lock.title,
            bodyHtml: lock.bodyHtml,
            priority: lock.priority,
            category: lock.category,
            senderName: lock.senderName,
            authorIdentity: lock.authorIdentity,
          }}
        />
      );
    }
  }

  // Auto sign-out after 15 minutes of inactivity → back to the login screen
  // (Sir's policy). On timeout IdleTimerClient revokes the Firebase + DB session
  // and hard-navigates to /login?reason=idle, so the next day starts fresh:
  // login → daily-checklist + weekly-goals gate → hub.
  // Sir's "left → right" layout: every module EXCEPT WMS uses a vertical LEFT-RAIL
  // instead of the top header. The rail is an IN-FLOW flex child so the page
  // (flex-1) is offset by its real width — content can never overlap it. WMS + the
  // hub keep their own top header (no rail).
  //
  // CRITICAL: the show/hide decision is made INSIDE ChromeShell (a client boundary
  // using usePathname), NOT here. This layout is SHARED and does not re-run on soft
  // navigation, so deciding here from the server `x-pathname` left the sidebar stuck
  // to the first-landed route (showing on the hub, missing on modules, only fixed by
  // a reload/HMR). ChromeShell re-evaluates on every client navigation.
  // Soft onboarding nudge — fixed-position + session-dismissible, fetches its own
  // status CLIENT-SIDE after mount (never a query on this SSR/dashboard load
  // path). Floats over any route without touching the chrome/layout branching.
  return (
    <>
      <KeyboardShortcuts />
      <FocusMode />
      {/* Number-row module shortcuts (1–9, 0), the keyboard half of the module
          footer below. Mounted HERE rather than on the hub so the digits the
          footer displays actually work from inside a room — pressing 3 in WMS
          opens the third module. Placed after the gate chain's early returns, so
          a digit can never be used to walk out of a daily ritual. The allow-list
          reuses the layout's single `accessFor` result — no extra query. */}
      <ModuleShortcuts allowed={MODULE_ORDER.filter((id) => canAccessWorkspace(id, access))} />
      <IdleTimerClient timeoutMinutes={15} />
      <OnboardingNudge />
      {/* The app's ONE New Task dialog, mounted above ChromeShell so it exists
          on every (app) route — including the hub and the full-screen HR
          surfaces, neither of which renders a sidebar. It draws nothing; the
          global header +, the rail button and the "N" shortcut all open it by
          dispatching NEW_TASK_OPEN_EVENT. It previously lived inside the
          sidebar, gated to WMS, so those triggers were inert everywhere else. */}
      <NewTaskTrigger />
      <ChromeShell
        sidebar={<DashboardSidebar />}
        footer={<ModuleFooter access={access} />}
        topBar={<AppTopBar bell={<NotificationBell />} />}
      >
        {children}
      </ChromeShell>
    </>
  );
}
