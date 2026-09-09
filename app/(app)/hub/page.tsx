import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace, WORKSPACE_LANDING, type WorkspaceId } from "@/lib/workspaces";
import { MODULE_THEME, MODULE_ORDER, moduleShortcut, type ModuleTheme } from "@/lib/module-theme";
import { EnterWorkspaceLink } from "@/components/hub/enter-workspace-link";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { ModuleLogo } from "@/components/hub/module-logos";
import { GlobalSearch } from "@/components/header/global-search";
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
 * THE FRONT DOOR — post-login Hub launcher.
 *
 * Each workspace is a SOLID module-colour card with that module's cut-out
 * artwork (background removed) sitting on the right, fully visible — NO colour
 * scrim over the image. Text lives on the left so it never overlaps the art.
 * Colour, image and copy come from the single MODULE_THEME source of truth.
 * WMS has no art (the founder is designing its logo) → its icon stands in.
 * Server Component; the only interactive islands are sign-out + ⌘K search.
 */

/**
 * HUB-ONLY palette. Scoped to the front-door cards so each module's own strong
 * identity colour (MODULE_THEME) stays intact everywhere inside it — recolouring
 * the hub therefore leaves the module footer dock, every room's chrome and every
 * in-module accent exactly as they were.
 *
 * TWO COLOURS PER MODULE, and no more (Sir, 2026-08): one light BACKGROUND and
 * one PRIMARY. Primary carries the title, tagline, glyph, shortcut badge and the
 * Enter button; background fills the card. `from`/`to` are held at the same value
 * so the card renders FLAT — the gradient stops are identical, which keeps the
 * existing `linear-gradient` code path without producing a gradient.
 *
 * `inkSoft` is deliberately equal to `ink` rather than a lighter step. A third
 * tone per module is exactly the "additional decorative colour" the brief rules
 * out, and the primaries are dark enough to stay readable at the tagline's
 * 12.5px on these backgrounds.
 *
 * WMS IS UNTOUCHED — the brand's own card keeps its red, its two-stop gradient
 * and its softer tagline tone. It is the one module whose entry must not change.
 */
const HUB_PASTEL: Record<WorkspaceId, { from: string; to: string; ink: string; inkSoft: string }> = {
  wms:       { from: "#FEE2E2", to: "#FECACA", ink: "#B91C1C", inkSoft: "#DC2626" }, // red (unchanged)
  goals:        { from: "#F4E1D5", to: "#F4E1D5", ink: "#A85432", inkSoft: "#A85432" }, // 2 · terracotta
  productivity: { from: "#E5E4F7", to: "#E5E4F7", ink: "#5148A3", inkSoft: "#5148A3" }, // 3 · deep indigo
  billing:      { from: "#ECECEA", to: "#ECECEA", ink: "#5F5E59", inkSoft: "#5F5E59" }, // 4 · platinum grey
  hr:           { from: "#DDF1EC", to: "#DDF1EC", ink: "#147D73", inkSoft: "#147D73" }, // 5 · teal
  sales:        { from: "#EAE1F7", to: "#EAE1F7", ink: "#6838B8", inkSoft: "#6838B8" }, // 6 · royal purple
  admin:        { from: "#E3EAF4", to: "#E3EAF4", ink: "#315A9B", inkSoft: "#315A9B" }, // 7 · slate blue (the "Accounts" card)
  training:     { from: "#F5E0E9", to: "#F5E0E9", ink: "#C32968", inkSoft: "#C32968" }, // 8 · berry
  employees:    { from: "#DDF1E2", to: "#DDF1E2", ink: "#16803C", inkSoft: "#16803C" }, // 9 · forest green
  events:       { from: "#D9F1F5", to: "#D9F1F5", ink: "#167C91", inkSoft: "#167C91" }, // 0 · cyan/teal
  // Not rendered on the hub (MODULE_ORDER carries `admin` at position 7), but it
  // shadows that card's identity so the pair never disagrees if it is ever shown.
  accounts:     { from: "#E3EAF4", to: "#E3EAF4", ink: "#315A9B", inkSoft: "#315A9B" },
  // Hand-holding — orange, the module's own accent (lib/module-theme).
  "people-allocation": { from: "#FBE7D6", to: "#FBE7D6", ink: "#C2410C", inkSoft: "#C2410C" },
  // Project — the WMS red, matching the wms card above: the plan and the task
  // list are two windows onto the same records.
  "project-plan": { from: "#FEE2E2", to: "#FECACA", ink: "#B91C1C", inkSoft: "#DC2626" },
};

/**
 * A card whose module has no palette must not take the whole hub down with it —
 * MODULE_ORDER and HUB_PASTEL are two lists that have to be kept in step by
 * hand, and one of them WILL be forgotten again. Neutral grey, card still
 * clickable.
 */
const PASTEL_FALLBACK = { from: "#ECECEA", to: "#ECECEA", ink: "#5F5E59", inkSoft: "#5F5E59" };

function WorkspaceCard({ m, locked, i }: { m: ModuleTheme; locked: boolean; i: number }) {
  const p = HUB_PASTEL[m.id] ?? PASTEL_FALLBACK;
  const delay = { animationDelay: `${i * 70}ms` } as const;

  const shortcut = moduleShortcut(i);

  const inner = (
    <>
      {/* Faint oversized logo bottom-right for depth/texture. */}
      <ModuleLogo
        id={m.id}
        size={104}
        className="pointer-events-none absolute -bottom-5 -right-5 opacity-[0.07]"
      />

      {/* Keyboard-shortcut badge — deliberately quiet: it is a hint, not a
          heading, so it sits in the corner at a fraction of the title's weight
          and never competes with the module name. `aria-hidden` because the
          number is announced once, in the link's own label, rather than as a
          stray digit before every card. */}
      {shortcut && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-3 z-10 inline-flex size-[22px] items-center justify-center rounded-md text-[12px] font-bold tabular-nums"
          style={{ background: "rgba(255,255,255,0.55)", color: p.ink }}
        >
          {shortcut}
        </span>
      )}

      {/* Content — fully centred (logo + text) with no wasted middle gap. */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 p-5 text-center max-md:p-4">
        <ModuleLogo id={m.id} size={56} className="drop-shadow-[0_7px_16px_rgba(15,23,42,0.22)]" />
        <div className="w-full">
          <h3 className="text-[22px] font-extrabold leading-none tracking-tight max-md:text-[20px]" style={{ color: p.ink }}>
            {m.label}
          </h3>
          {/* Cards grow to fit (min-h + grid stretch equalises the row), so the
              full tagline shows without ever being clipped mid-line.

              The WMS branch removed this on 2026-09-08 to fit the grid on one
              screen; restored 2026-09-09 at the account holder's request. The
              tagline is what tells someone which workspace they want before
              they have learned the eleven glyphs, so a hub that scrolls is the
              cheaper cost. */}
          <p className="mt-1.5 line-clamp-3 text-[12.5px] font-medium leading-snug" style={{ color: p.inkSoft }}>
            {m.tagline}
          </p>
          {locked ? (
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill bg-black/10 px-3 py-1 text-[12.5px] font-bold" style={{ color: p.ink }}>
              <Lock size={13} strokeWidth={2.5} /> No Access
            </span>
          ) : (
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13px] font-bold text-white" style={{ background: p.ink }}>
              Enter
              <ArrowRight size={14} strokeWidth={2.8} className="transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          )}
        </div>
      </div>
    </>
  );

  const base =
    // Back to 236px alongside the restored tagline: 176px was sized for a card
    // with no prose under the title, and it clips the third line.
    "wg-rise group relative block h-full min-h-[236px] overflow-hidden rounded-[28px] shadow-md max-md:min-h-[204px]";
  const bg = { background: `linear-gradient(145deg, ${p.from}, ${p.to})` };

  if (locked) {
    return (
      <div className={`${base} grayscale`} style={{ ...bg, ...delay }} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <EnterWorkspaceLink
      id={m.id}
      href={WORKSPACE_LANDING[m.id]}
      ariaLabel={`Open ${m.label}`}
      className={`${base} transition duration-200 hover:-translate-y-1.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
      style={{ ...bg, ...delay, "--tw-ring-color": p.ink } as React.CSSProperties}
    >
      {inner}
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

  const access = await accessFor(me);

  return (
    <main
      className="flex min-h-[100dvh] w-full flex-col"
      style={{ background: "linear-gradient(180deg, #f6f7f9 0%, #fbfbfc 38%, #ffffff 100%)" }}
    >
      <div className="mx-auto flex w-full max-w-[1140px] flex-col px-8 py-6 max-md:px-5 max-md:py-5">
        {/* ONE BAND — logo (extreme left) · welcome hero (page-centered) · Hi over
            Sign out (right). Both side clusters are flex-1 so the centre block is
            truly centered on the page regardless of their differing widths. */}
        <header className="flex shrink-0 items-center gap-6 max-md:flex-col max-md:gap-4 max-md:text-center">
          <div className="flex flex-1 justify-start max-md:justify-center">
            <a
              href="https://altuscorp.in"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Altus Corp — altuscorp.in"
              className="shrink-0 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
            >
              <Image
                src="/logo.png"
                alt="Altus Corp"
                width={170}
                height={188}
                priority
                className="h-[84px] w-auto shrink-0 max-md:h-[64px]"
              />
            </a>
          </div>

          <div className="shrink-0 text-center">
            <span className="text-[12px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--color-altus-red)" }}>
              Altus&nbsp;/&nbsp;Workspaces
            </span>
            <h1 className="mt-1 font-extrabold tracking-tight text-ink-strong" style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.02 }}>
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-[15px] text-ink-muted">Choose your workspace to get started</p>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3 max-md:justify-center">
            <GlobalSearch />
            {/* Profile avatar → the full account/workspace menu (Admin Panel,
                Profile & Preferences, Documents, Inbox, Archived, Sign Out). */}
            <UserMenuServer />
          </div>
        </header>

        {/* Workspace grid. On xl the 5-wide grid fills the viewport; below xl it
            flows into fewer columns (3s on lg, so a row never ends in a single
            orphan card) and the page scrolls.

            Restored 2026-09-09 from the WMS branch's four-per-row. The reason
            given for four was that five left HandHolding alone on the last row
            — with Project added there are twelve modules, so five now reads
            5 · 5 · 2 and the orphan that motivated the change is gone. */}
        <section
          className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          aria-label="Workspaces"
        >
          {/* A workspace you can't enter is HIDDEN, not shown greyed as "No
              Access" (Sir 2026-08) — a normal doer only sees the modules that are
              actually theirs. The card keeps its CANONICAL index so its number
              badge still matches the global 1–9/0 keyboard shortcut (which is
              stable per module in the layout), even with some cards hidden. */}
          {MODULE_ORDER.filter((id) => canAccessWorkspace(id, access)).map((id) => (
            <WorkspaceCard key={id} m={MODULE_THEME[id]} locked={false} i={MODULE_ORDER.indexOf(id)} />
          ))}
        </section>

        {/* The number-row shortcuts (1–9, 0) that these cards badge are no
            longer mounted here — they live in `(app)/layout.tsx` so the same
            digits work from inside a module, not only on this page. */}
      </div>
    </main>
  );
}
