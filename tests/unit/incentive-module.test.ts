import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  WORKSPACE_IDS,
  WORKSPACE_LABEL,
  WORKSPACE_LANDING,
  workspaceForPath,
  canAccessWorkspace,
  isWorkspaceId,
} from "@/lib/workspaces";
import { MODULE_ORDER, MODULE_THEME } from "@/lib/module-theme";
import { nodeKeyForPath } from "@/lib/permissions/catalog";

/**
 * INCENTIVE BECAME ITS OWN ROOM (2026-09-16), lifted out of Employees where it
 * had been one rail entry.
 *
 * The extraction was deliberately a RE-PARENTING, not a rebuild: the route, the
 * page, the queries, the permission node and every link into the module are
 * untouched, and only the room that owns the path changed. So the claims worth
 * pinning here are the ones a later edit could quietly undo — that the path did
 * not move, that Employees no longer claims it, that the permission node is
 * still the one the stored overrides are keyed on, and that the room is open to
 * exactly the people it was open to before.
 */
describe("the Incentive room", () => {
  it("is a real workspace", () => {
    expect(WORKSPACE_IDS).toContain("incentive");
    expect(isWorkspaceId("incentive")).toBe(true);
    expect(WORKSPACE_LABEL.incentive).toBe("Incentive");
  });

  it("lands on the route the module has always been on", () => {
    // THE POINT OF THE WHOLE EXTRACTION. Every incentive notification, every
    // incentive email and both export routes already point at `/incentive`; a
    // new landing path would have needed a redirect and broken every bookmark.
    expect(WORKSPACE_LANDING.incentive).toBe("/incentive");
  });

  it("owns its path, which Employees used to claim", () => {
    expect(workspaceForPath("/incentive")).toBe("incentive");
    expect(workspaceForPath("/incentive/export.pdf")).toBe("incentive");
    expect(workspaceForPath("/incentive/export.xlsx")).toBe("incentive");
  });

  it("leaves the rest of the Employees room alone", () => {
    for (const p of ["/attendance", "/my-salary", "/reimbursements", "/dcc", "/queries"]) {
      expect(workspaceForPath(p), p).toBe("employees");
    }
  });

  it("does not swallow the Accounts payout screen", () => {
    // `/salary/incentive-payout` is where Accounts PAYS an incentive. It does
    // not start with `/incentive`, so the new rule cannot claim it — but the
    // two names are close enough that someone will eventually widen one of
    // them, and this is what stops that landing silently.
    expect(workspaceForPath("/salary/incentive-payout")).toBe("accounts");
    expect(workspaceForPath("/salary")).toBe("accounts");
  });

  it("has a hub card, appended so nothing was re-lettered", () => {
    expect(MODULE_ORDER).toContain("incentive");
    expect(MODULE_ORDER[MODULE_ORDER.length - 1]).toBe("incentive");
    expect(MODULE_THEME.incentive).toBeTruthy();
    expect(MODULE_THEME.incentive.label).toBe("Incentive");
    expect(MODULE_THEME.incentive.href).toBe("/ws/incentive");
  });

  it("keeps the Altus red INSIDE the room, like the module always had", () => {
    // Asserted against `wms` rather than the literals, so the day the brand red
    // moves this follows it instead of pinning a stale hex.
    expect(MODULE_THEME.incentive.accent).toBe(MODULE_THEME.wms.accent);
    expect(MODULE_THEME.incentive.accentDeep).toBe(MODULE_THEME.wms.accentDeep);
  });

  it("is open to exactly who it was open to before — everyone signed in", () => {
    // Incentive used to live in the Employees room, which is open, and the page
    // itself has only ever required a signed-in user; what each person SEES is
    // narrowed by lib/incentive/analytics/scope.ts, not by the door. Making the
    // room admin-gated here would have locked every employee out of their own
    // incentive page, so this is the assertion that says the extraction changed
    // no one's access.
    const employee = { departments: ["Delivery"], isAdmin: false, isSuperAdmin: false };
    const admin = { departments: [], isAdmin: true, isSuperAdmin: false };
    const noDept = { departments: [], isAdmin: false, isSuperAdmin: false };
    for (const who of [employee, admin, noDept]) {
      expect(canAccessWorkspace("incentive", who)).toBe(true);
    }
  });

  it("still answers to the permission node the overrides are stored under", () => {
    // `employees.incentive` is the key per-employee overrides are saved against
    // in the database. Renaming it to match the new room would have silently
    // dropped every override already stored, so the node deliberately did NOT
    // move — and the (app) layout's requirePathView keeps enforcing it.
    expect(nodeKeyForPath("/incentive")).toBe("employees.incentive");
  });
});

/**
 * The module's internal navigation. The rail and the tab strip are two views of
 * one list, and they agree only because both drive the same `?tab=` values —
 * so the values themselves are what this pins.
 */
describe("the Incentive module's internal navigation", () => {
  const nav = readFileSync("components/layout/main-nav.tsx", "utf8");
  const tabs = readFileSync("components/incentive/incentive-tabs.tsx", "utf8");

  /** The Incentive entry of WORKSPACE_NAV, sliced out of the source. */
  const railBlock = (() => {
    const start = nav.indexOf("  incentive: {");
    expect(start, "the Incentive rail is gone from WORKSPACE_NAV").toBeGreaterThan(-1);
    return nav.slice(start, nav.indexOf("  training: {", start));
  })();

  /** The `tab:` values on the rail, in rail order. */
  const railTabs = [...railBlock.matchAll(/tab: "(\w+)"/g)].map((m) => m[1]);

  /**
   * The areas the module can render, read off the `available` list the page
   * validates `?tab=` against.
   *
   * This used to be parsed from the on-page tab strip, which was removed
   * (2026-09-16) once the rail listed the same six areas — two identical
   * navigations on one page. The rail is the navigation now; `available` is
   * what it must stay in step with.
   */
  const pageAreas = [
    ...tabs
      .slice(tabs.indexOf("const available: TabKey[]"), tabs.indexOf("const searchParams"))
      .matchAll(/"(\w+)"/g),
  ].map((m) => m[1]);

  it("puts the same six areas on the rail that the page can render", () => {
    // Order is USAGE order (2026-09-16 restructure): the request loop first,
    // then the periodic admin/accounts areas. What this pins is that the rail
    // and the page's `available` list stay the same list in the same order —
    // the order itself is a product decision, the agreement is the invariant.
    expect(railTabs).toEqual(["dashboard", "requests", "targets", "entries", "status", "billing"]);
    expect(railTabs).toEqual(pageAreas);
  });

  it("marks exactly one rail entry as the default", () => {
    // The rail lights this one when the URL names no tab, which is what a plain
    // `/incentive` is. Two defaults would light two entries; none would light
    // none, and arriving on the module would look like arriving nowhere.
    expect([...railBlock.matchAll(/tabDefault: true/g)]).toHaveLength(1);
    // …and it is Dashboard, the area the module has always opened on.
    const beforeDefault = railBlock.slice(0, railBlock.indexOf("tabDefault"));
    expect([...beforeDefault.matchAll(/tab: "(\w+)"/g)].pop()?.[1]).toBe("dashboard");
  });

  it("keeps Entries and Status admin-only, exactly as the tab strip does", () => {
    for (const area of ["entries", "status"]) {
      const line = railBlock.split("\n").find((l) => l.includes(`tab: "${area}"`));
      expect(line, area).toContain("adminOnly: true");
    }
  });

  it("keeps the rail hrefs bare, so the permission node still resolves", () => {
    // `nodeKeyForPath` is handed `item.href`. A `?tab=` baked into the href
    // would resolve to no node at all and silently un-gate the whole rail.
    expect(railBlock).not.toMatch(/href: "\/incentive\?/);
    expect(nodeKeyForPath("/incentive")).toBe("employees.incentive");
  });

  it("corrects the URL on arrival without navigating", () => {
    // A notification link (`?request=<id>`) opens Requests without naming it,
    // and a link to an admin-only area opens Dashboard instead. Either way the
    // URL then disagrees with the screen, and the RAIL READS THE URL — so it
    // is written back with `replaceState`, which costs no server round trip and
    // leaves no history entry. Importing the router here would turn an arrival
    // correction into a second page load.
    expect(tabs).toContain("window.history.replaceState");
    expect(tabs).not.toMatch(/useRouter/);
  });

  it("takes Incentive off the Employees rail, leaving one door", () => {
    const employeesBlock = nav.slice(nav.indexOf("  employees: {"), nav.indexOf("  hr: HR_HUB_NAV"));
    expect(employeesBlock).not.toMatch(/href: "\/incentive"/);
  });
});
