import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "@/next.config";
import {
  PERMISSION_CATALOG,
  PERMISSION_ACTIONS,
  PERMISSION_ACTION_LABELS,
  allPermissionNodes,
  allCatalogRoutes,
  isPermissionNodeKey,
  nodeChain,
  nodeKeyForPath,
  permissionNode,
} from "@/lib/permissions/catalog";

/**
 * THE CATALOGUE MUST DESCRIBE THE REAL APPLICATION.
 *
 * A permission node only means something if a route enforces it. The most
 * valuable test in this file is therefore the filesystem one: it walks every
 * route the catalogue claims and asserts a page actually exists at that path.
 * Without it the catalogue rots silently — a renamed route leaves a switch wired
 * to nothing, which reads as "denied" on the Master Admin screen while the
 * module stays wide open.
 */

const ROOT = process.cwd();

/**
 * Does a route resolve to a real page file?
 *
 * Next's App Router puts route groups in parenthesised directories that do NOT
 * appear in the URL, so `/tasks` lives at `app/(app)/tasks/page.tsx` and
 * `/admin/clients` at `app/(admin)/admin/clients/page.tsx`. The groups are
 * therefore tried in turn rather than derived from the path.
 *
 * A dynamic segment in the catalogue (`/hr/[stage]`) is checked literally,
 * because that IS the directory name on disk.
 */
/**
 * Sources answered by `redirects()` in next.config.ts.
 *
 * A handful of routes are pure forwards with no auth or data behind them
 * (`/billing` → `/billing/documents`, the three DCC ones, `/daily-checklist`,
 * `/appraisal`). They used to be pages whose whole body was `redirect(...)`,
 * which Next 16.2.6 turns into an MPA navigation — and its `Router` throws
 * before its last five hooks on that path, so the viewer got "This page
 * couldn't load" instead of the module. They answer from the routing layer
 * now, so they have no `page.tsx` — but they are still REAL, still reachable,
 * and their catalogue keys are persisted grants that must not be deleted.
 */
const redirectSources = new Set<string>(
  ((await nextConfig.redirects?.()) ?? []).map((r) => r.source),
);

function routeExists(route: string): boolean {
  if (redirectSources.has(route)) return true;
  const rel = route.replace(/^\//, "");
  const groups = ["(app)", "(admin)", ""];
  for (const g of groups) {
    const dir = g ? join(ROOT, "app", g, rel) : join(ROOT, "app", rel);
    if (existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "page.ts"))) return true;
  }
  return false;
}

describe("permission catalogue — structure", () => {
  it("has the three actions the brief names", () => {
    expect(PERMISSION_ACTIONS).toEqual(["show", "view", "edit"]);
    for (const a of PERMISSION_ACTIONS) expect(PERMISSION_ACTION_LABELS[a]).toBeTruthy();
  });

  it("is not a small hardcoded list", () => {
    // The brief: "DO NOT invent only a small hardcoded permission list. Audit
    // all existing routes/pages/modules and generate the permission tree from
    // the real application." A tree that has shrunk to a handful of nodes has
    // stopped describing the app.
    const nodes = allPermissionNodes();
    expect(nodes.length).toBeGreaterThan(120);
    expect(PERMISSION_CATALOG.length).toBeGreaterThanOrEqual(13);
    expect(nodes.filter((n) => n.depth === 2).length).toBeGreaterThan(80);
    expect(nodes.filter((n) => n.depth === 3).length).toBeGreaterThan(25);
  });

  it("reaches all three levels — module, sub-module, sub-sub-module", () => {
    const depths = new Set(allPermissionNodes().map((n) => n.depth));
    expect(depths).toEqual(new Set([1, 2, 3]));
  });

  it("carries the brief's worked example, WMS › Tasks › Task Report", () => {
    const node = permissionNode("wms.dashboard.task-report");
    expect(node).toBeDefined();
    expect(node!.depth).toBe(3);
    expect(node!.label).toBe("Task Report");
    expect(node!.routes).toContain("/dashboard/task-report");
  });

  it("every key is unique", () => {
    const keys = allPermissionNodes().map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every child key is prefixed by its parent's, so the chain is readable", () => {
    for (const n of allPermissionNodes()) {
      const parent = n.ancestors[n.ancestors.length - 1];
      if (!parent) continue;
      expect(n.key.startsWith(`${parent}.`)).toBe(true);
    }
  });

  it("every ancestor named by a node exists", () => {
    for (const n of allPermissionNodes()) {
      for (const a of n.ancestors) expect(isPermissionNodeKey(a)).toBe(true);
    }
  });
});

describe("permission catalogue — routes match the application", () => {
  it("EVERY route the catalogue claims resolves to a real page", () => {
    const missing = allCatalogRoutes().filter((r) => !routeExists(r));
    // Named individually, because the useful failure message is which route
    // moved — not "17 routes are wrong".
    expect(missing).toEqual([]);
  });

  it("no route is claimed by two different nodes", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const n of allPermissionNodes()) {
      for (const r of n.routes ?? []) {
        const prev = seen.get(r);
        if (prev) clashes.push(`${r}: ${prev} and ${n.key}`);
        else seen.set(r, n.key);
      }
    }
    // Two nodes governing one route means the effective permission depends on
    // which one a caller happened to name.
    expect(clashes).toEqual([]);
  });

  it("every route is absolute and has no trailing slash", () => {
    for (const r of allCatalogRoutes()) {
      expect(r.startsWith("/")).toBe(true);
      expect(r === "/" || !r.endsWith("/")).toBe(true);
    }
  });
});

describe("nodeKeyForPath", () => {
  it("prefers the most specific node", () => {
    // Both `/tasks` and `/tasks/kanban` are claimed; the child must win.
    expect(nodeKeyForPath("/tasks")).toBe("wms.tasks");
    expect(nodeKeyForPath("/tasks/kanban")).toBe("wms.tasks.kanban");
    expect(nodeKeyForPath("/attendance")).toBe("employees.attendance");
    expect(nodeKeyForPath("/attendance/leave")).toBe("employees.attendance.leave");
  });

  it("matches sub-paths of a claimed route", () => {
    expect(nodeKeyForPath("/tasks/abc-123")).toBe("wms.tasks");
    expect(nodeKeyForPath("/attendance/leave/requests")).toBe(
      "employees.attendance.leave",
    );
  });

  it("does NOT match a sibling that merely shares a prefix", () => {
    // `/goals/weekly` and `/goals/week` are different routes; a naive
    // startsWith would collapse them.
    expect(nodeKeyForPath("/goals/weekly")).toBe("goals.weekly");
    expect(nodeKeyForPath("/goals/week")).toBe("goals.weekly");
    // A genuinely unrelated path with a shared prefix resolves to neither.
    expect(nodeKeyForPath("/goalsomething")).toBeNull();
  });

  it("ignores a query string and a trailing slash", () => {
    expect(nodeKeyForPath("/tasks/kanban?filter=mine")).toBe("wms.tasks.kanban");
    expect(nodeKeyForPath("/tasks/kanban/")).toBe("wms.tasks.kanban");
  });

  it("returns null for an ungoverned path — which is NOT a denial", () => {
    // The matrix simply has no opinion; the resolver treats that as allowed.
    expect(nodeKeyForPath("/some/route/nobody/classified")).toBeNull();
    expect(nodeKeyForPath("/")).toBeNull();
  });

  it("resolves a route HANDLER path to the node that governs its screen", () => {
    // The point of apiRoutes: an endpoint is governed by the same node as the
    // screen it serves, so revoking a module refuses its pages AND its handlers
    // from one switch.
    expect(nodeKeyForPath("/api/hr/letters/email-pdf")).toBe("hr.letters");
    expect(nodeKeyForPath("/api/hr/letters/issue")).toBe("hr.letters");
    // Query strings are stripped here too — endpoints carry them routinely.
    expect(nodeKeyForPath("/api/hr/letters/pdf?template=appointment")).toBe("hr.letters");
  });

  it("ALREADY governs a handler nested under a page prefix — no apiRoutes entry needed", () => {
    // This is why most of the export/download endpoints needed no catalogue
    // change at all: they live under the page they export from, and the
    // existing prefix rule already reaches them. `apiRoutes` exists only for a
    // handler that sits OUTSIDE its page's path — `/api/hr/letters/*` serves
    // `/hr/letters`, which is a different URL subtree entirely.
    //
    // Asserted rather than assumed, because a future tidy-up that restricted
    // prefix matching to pages would silently un-govern ~29 endpoints that had
    // no explicit entry to catch it.
    expect(nodeKeyForPath("/salary/export.pdf")).toBe("accounts.payroll");
    expect(nodeKeyForPath("/tasks/export.xlsx")).toBe("wms.tasks");
    // A more specific sibling still wins: `/salary/documents/pdf` is governed by
    // the Documents node, not by Payroll. Longest-prefix is preserved.
    expect(nodeKeyForPath("/salary/documents/pdf")).toBe("accounts.payroll.documents");
  });

  it("does not let an API path match a PAGE prefix", () => {
    // `/hr` is a page node's prefix. An endpoint under /api/hr must not be
    // governed by it, or revoking the HR overview would take the whole API with
    // it — and vice versa, an endpoint could never be reached by its own node.
    expect(nodeKeyForPath("/api/hr/nothing-claims-this")).toBeNull();
  });

  it("still prefers the most specific match when a page and a handler nest", () => {
    // `/tasks` is a page node; a deeper handler must win over its parent prefix.
    // Asserted with real data rather than a synthetic pair: the letters node
    // claims both `/hr/letters` (page) and the four endpoints beneath it.
    expect(nodeKeyForPath("/hr/letters")).toBe("hr.letters");
    expect(nodeKeyForPath("/api/hr/letters/issue-rich")).toBe("hr.letters");
  });
});

describe("nodeChain", () => {
  it("runs outermost-first, ending at the node itself", () => {
    expect(nodeChain("wms.tasks.kanban")).toEqual(["wms", "wms.tasks", "wms.tasks.kanban"]);
    expect(nodeChain("wms.tasks")).toEqual(["wms", "wms.tasks"]);
    expect(nodeChain("wms")).toEqual(["wms"]);
  });

  it("is empty for an unknown key", () => {
    expect(nodeChain("nope.not.here")).toEqual([]);
  });
});
