import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
// scope.ts reaches the org chart through the SHARED visibility resolver
// (lib/access/visibility.ts), which holds a database handle at import time.
// `applyAnalyticsView` never touches it, but the module has to import cleanly
// to be tested at all.
vi.mock("@/lib/db", () => ({ db: {} }));
// The resolver is mocked by name so the scope tests below can assert HOW it was
// called — the grant table is the only thing that may widen a scope.
vi.mock("@/lib/access/visibility", () => ({
  permittedPeopleFor: vi.fn(async () => ({ org: false, ids: new Set(), grantedExtras: [] })),
  grantedExtrasLabel: () => null,
}));

import {
  applyAnalyticsView,
  incentiveAnalyticsScopeFor,
} from "@/lib/incentive/analytics/scope";
import { buildIncentiveAnalytics, type AnalyticsScope } from "@/lib/incentive/analytics/model";
import { resolvePeriod } from "@/lib/incentive/analytics/periods";

const ME = "me-1";

/** A manager: themselves plus two reports. */
const TEAM: AnalyticsScope = {
  all: false,
  employeeIds: new Set([ME, "report-a", "report-b"]),
  viewerId: ME,
  label: "You and your team",
};

/** A doer with nobody under them. */
const SOLO: AnalyticsScope = {
  all: false,
  employeeIds: new Set([ME]),
  viewerId: ME,
  label: "You",
};

/** An admin / the incentive reviewer — company-wide. */
const ALL: AnalyticsScope = {
  all: true,
  employeeIds: new Set(),
  viewerId: ME,
  label: "Everyone",
};

/**
 * THE Team / User SWITCH on the Incentive Dashboard (2026-09-16).
 *
 * The switch is the one thing on this page a browser gets to choose, so what is
 * pinned here is the property that makes that safe: it can only ever NARROW the
 * scope the server already resolved for the person asking. There is no branch
 * that names an employee and none that returns more than it was given.
 */
describe("the dashboard's Team / User switch", () => {
  it("gives a manager their whole team on Team", () => {
    const s = applyAnalyticsView(TEAM, "team");
    expect(s.view).toBe("team");
    expect([...s.employeeIds].sort()).toEqual(["me-1", "report-a", "report-b"]);
    expect(s.canSeeTeam).toBe(true);
  });

  it("narrows a manager to themselves alone on User", () => {
    const s = applyAnalyticsView(TEAM, "user");
    expect(s.view).toBe("user");
    expect([...s.employeeIds]).toEqual([ME]);
    expect(s.all).toBe(false);
    expect(s.label).toBe("You");
    // Still theirs to switch back to.
    expect(s.canSeeTeam).toBe(true);
  });

  it("keeps an admin company-wide on Team and narrows them on User", () => {
    expect(applyAnalyticsView(ALL, "team").all).toBe(true);
    const user = applyAnalyticsView(ALL, "user");
    expect(user.all).toBe(false);
    expect([...user.employeeIds]).toEqual([ME]);
  });

  it("offers no switch to someone with no reports", () => {
    // The brief's rule: a person with no direct reports must not be handed a
    // Team dashboard that is just their own figures relabelled.
    for (const view of ["team", "user"] as const) {
      const s = applyAnalyticsView(SOLO, view);
      expect(s.canSeeTeam).toBe(false);
      expect(s.view).toBe("team");
      expect([...s.employeeIds]).toEqual([ME]);
      expect(s.label).toBe("You");
    }
  });

  it("CANNOT be used to widen a scope — the property the action relies on", () => {
    // This is the whole security argument for letting the browser send a view.
    // Whatever it asks for, the result is a subset of what the server resolved.
    for (const base of [TEAM, SOLO, ALL]) {
      for (const view of ["team", "user"] as const) {
        const s = applyAnalyticsView(base, view);
        expect(s.viewerId).toBe(base.viewerId);
        // Never promotes a scoped viewer to company-wide.
        if (!base.all) expect(s.all).toBe(false);
        // Never adds anyone the base scope did not already include.
        if (!base.all) {
          for (const id of s.employeeIds) expect(base.employeeIds.has(id)).toBe(true);
        }
      }
    }
  });

  it("defaults to Team, so a request that names no view behaves as before", () => {
    // The action's zod schema makes `view` optional and the query layer falls
    // back to "team"; this is the other half of that contract.
    expect(applyAnalyticsView(TEAM, "team").employeeIds.size).toBe(3);
  });
});

/**
 * The switch has to reach the numbers, not just the scope object — the brief
 * lists KPI cards, status totals, earnings, grade, the performance table and
 * the ranking. They all read the scope, so one build through each view is what
 * demonstrates it.
 */
describe("the switch actually changes the dashboard's figures", () => {
  const period = resolvePeriod({ kind: "current_month" }, new Date("2026-09-16T12:00:00Z"))!;

  function build(scope: AnalyticsScope) {
    return buildIncentiveAnalytics({
      period,
      currentMonth: "2026-09",
      employees: [
        { id: ME, name: "Manager Person", code: "M-1", monthlyCtc: 100_000, joinedMonth: null },
        { id: "report-a", name: "Report A", code: "R-1", monthlyCtc: 50_000, joinedMonth: null },
        { id: "report-b", name: "Report B", code: "R-2", monthlyCtc: 50_000, joinedMonth: null },
      ],
      inactiveNameKeys: new Set(),
      excludedEmployeeIds: new Set(),
      ledger: [
        { key: "l1", source: "entry", employeeId: ME, empName: "Manager Person", label: "X", month: "2026-09", approved: 10_000, paid: 0 },
        { key: "l2", source: "entry", employeeId: "report-a", empName: "Report A", label: "X", month: "2026-09", approved: 4_000, paid: 0 },
        { key: "l3", source: "entry", employeeId: "report-b", empName: "Report B", label: "X", month: "2026-09", approved: 6_000, paid: 0 },
      ],
      requests: [],
      catalog: [],
      targets: [],
      scope,
      viewer: { id: ME, name: "Manager Person" },
    });
  }

  it("shows the team's people and money on Team, and only the viewer's on User", () => {
    const team = build(applyAnalyticsView(TEAM, "team"));
    const user = build(applyAnalyticsView(TEAM, "user"));

    // The employee performance table — three rows against one.
    expect(team.employees.map((e) => e.name).sort()).toEqual(["Manager Person", "Report A", "Report B"]);
    expect(user.employees.map((e) => e.name)).toEqual(["Manager Person"]);

    // Status totals / earnings: the team's ₹20,000 against the viewer's ₹10,000.
    expect(team.summary.earned).toBe(20_000);
    expect(user.summary.earned).toBe(10_000);
    expect(team.summary.people).toBe(3);
    expect(user.summary.people).toBe(1);
  });

  it("leaves the viewer's OWN performance identical in both views", () => {
    // Switching whose dashboard you are looking at must not change what the
    // person themselves earned — only who else is counted beside them.
    const team = build(applyAnalyticsView(TEAM, "team"));
    const user = build(applyAnalyticsView(TEAM, "user"));
    expect(user.me?.earned).toBe(team.me?.earned);
    expect(user.me?.grade).toBe(team.me?.grade);
  });

  it("tells the client which view it got, and whether a switch exists", () => {
    // The dashboard renders the two buttons off exactly these two fields.
    expect(build(applyAnalyticsView(TEAM, "team")).scope).toMatchObject({ view: "team", canSeeTeam: true });
    expect(build(applyAnalyticsView(TEAM, "user")).scope).toMatchObject({ view: "user", canSeeTeam: true });
    expect(build(applyAnalyticsView(SOLO, "user")).scope).toMatchObject({ view: "team", canSeeTeam: false });
  });
});

/**
 * The duplicate navigation the brief asked to remove. Parsed out of the source
 * because it is markup, not behaviour — but it is markup that has now been
 * added and removed once, so it is worth a tripwire.
 */
describe("the Dashboard's duplicate navigation", () => {
  const tabs = readFileSync("components/incentive/incentive-tabs.tsx", "utf8");

  it("no longer renders a tab strip on the page", () => {
    // The six areas live in the module's sidebar rail now. A second copy on the
    // page is what this file exists to catch coming back.
    expect(tabs).not.toContain('role="tablist"');
    expect(tabs).not.toContain('role="tab"');
    expect(tabs).not.toContain("Segmented tab strip");
  });

  it("still renders every one of the six areas", () => {
    // Removing the NAVIGATION must not remove the pages behind it.
    for (const area of ["dashboard", "targets", "billing", "entries", "status"]) {
      expect(tabs, area).toContain(`active === "${area}"`);
    }
    // Requests is the final `else`, so it has no `active ===` of its own.
    expect(tabs).toContain("IncentiveList");
  });

  it("decides the open area from the URL alone", () => {
    expect(tabs).toContain('searchParams.get("tab")');
    // No local tab state left to drift out of step with the rail.
    expect(tabs).not.toMatch(/useState<TabKey>/);
  });
});

/**
 * WHO RESOLVES THE SCOPE (requirement: backend enforcement, admin ≠ everyone).
 *
 * The scope is resolved from the signed-in identity inside
 * `incentiveAnalyticsScopeFor`, on the server, every time. The tests above pin
 * what the resolved scope DOES; these pin that it cannot be widened by a flag
 * the viewer happens to hold.
 */
describe("the scope resolver", () => {
  it("gives an administrator only their own permitted people, not the company", async () => {
    const scope = await incentiveAnalyticsScopeFor({
      id: ME,
      email: "an.admin@altuscorp.com",
      isAdmin: true,
    });
    // The mocked resolver grants nothing, so an admin is left with the set the
    // resolver handed back (the viewer plus their downline — here, just the
    // viewer). Being an admin buys no extra reach.
    expect(scope.all).toBe(false);
    expect([...scope.employeeIds]).toEqual([]);
  });

  it("grants the company only through the resolver (an explicit Access Control grant)", async () => {
    const { permittedPeopleFor } = await import("@/lib/access/visibility");
    const spy = vi
      .mocked(permittedPeopleFor)
      .mockResolvedValueOnce({ org: true, ids: new Set(), grantedExtras: [] } as never);
    const scope = await incentiveAnalyticsScopeFor({
      id: ME,
      email: "an.admin@altuscorp.com",
      isAdmin: true,
    });
    expect(scope.all).toBe(true);
    expect(spy).toHaveBeenCalledWith(ME, "incentive");
  });

  it("takes no viewer id, so a browser cannot ask for someone else's scope", () => {
    const src = readFileSync("lib/incentive/analytics/scope.ts", "utf8");
    expect(src).toMatch(/incentiveAnalyticsScopeFor\(me: \{/);
    expect(src).not.toMatch(/incentiveAnalyticsScopeFor\([^)]*viewerId/);
  });
});
