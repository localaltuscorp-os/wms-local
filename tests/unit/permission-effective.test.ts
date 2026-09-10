import { describe, it, expect } from "vitest";
import { isPermissionNodeKey, nodeKeyForPath } from "@/lib/permissions/catalog";
import {
  allowAll,
  effectiveFor,
  isAllowed,
  isMeaningfulOverride,
  type OverrideMap,
  type PermissionOverride,
} from "@/lib/permissions/effective";

/**
 * HOW STORED OVERRIDES BECOME AN ANSWER.
 *
 * Two rules carry the whole design, and each has a test whose failure would be a
 * security or an availability incident:
 *
 *   1. A MISSING ROW IS NOT A DENIAL. If this inverts, every module locks for
 *      everybody the moment the feature ships.
 *   2. DENIAL CASCADES DOWNWARD. If this stops working, switching off a module
 *      leaves every page inside it reachable by typing the URL — the permission
 *      system would be decorative.
 */

const on: PermissionOverride = { canShow: true, canView: true, canEdit: true };
const off: PermissionOverride = { canShow: false, canView: false, canEdit: false };

const map = (entries: Record<string, PermissionOverride>): OverrideMap =>
  new Map(Object.entries(entries));

describe("rule 1 — a missing row means the matrix has no opinion", () => {
  it("allows everything when nothing is stored", () => {
    const eff = effectiveFor("wms.tasks.kanban", new Map());
    expect(eff).toEqual({ show: true, view: true, edit: true });
  });

  it("allows everything for a key the catalogue does not define", () => {
    // A guard naming a node that has since been renamed must not start refusing
    // everyone silently.
    expect(effectiveFor("no.such.node", new Map())).toEqual({
      show: true,
      view: true,
      edit: true,
    });
  });

  it("leaves siblings untouched when one node is restricted", () => {
    const overrides = map({ "wms.tasks.kanban": off });
    expect(effectiveFor("wms.tasks.kanban", overrides).view).toBe(false);
    expect(effectiveFor("wms.tasks.new", overrides).view).toBe(true);
    expect(effectiveFor("wms.projects", overrides).view).toBe(true);
    // And the PARENT is not dragged down by its child.
    expect(effectiveFor("wms.tasks", overrides).view).toBe(true);
    expect(effectiveFor("wms", overrides).view).toBe(true);
  });
});

describe("rule 2 — denial cascades downward", () => {
  it("a denied MODULE takes its sub-modules and sub-sub-modules with it", () => {
    const overrides = map({ wms: off });
    for (const key of ["wms", "wms.tasks", "wms.tasks.kanban", "wms.dashboard.task-report"]) {
      const eff = effectiveFor(key, overrides);
      expect(eff.show, key).toBe(false);
      expect(eff.view, key).toBe(false);
      expect(eff.edit, key).toBe(false);
    }
  });

  it("a denied SUB-module takes only its own children", () => {
    const overrides = map({ "wms.tasks": off });
    expect(effectiveFor("wms.tasks.kanban", overrides).view).toBe(false);
    expect(effectiveFor("wms.tasks.time", overrides).view).toBe(false);
    // Not a different branch of the same module.
    expect(effectiveFor("wms.dashboard", overrides).view).toBe(true);
    expect(effectiveFor("wms", overrides).view).toBe(true);
  });

  it("a child CANNOT re-open a denied parent", () => {
    // There is deliberately no allow-overrides-deny. A matrix where a leaf can
    // undo its module's restriction cannot be reasoned about from the screen.
    const overrides = map({ wms: off, "wms.tasks.kanban": on });
    expect(effectiveFor("wms.tasks.kanban", overrides).view).toBe(false);
  });

  it("names the ancestor responsible for a denial", () => {
    const eff = effectiveFor("wms.tasks.kanban", map({ wms: off }));
    expect(eff.deniedBy?.view).toBe("wms");
    expect(eff.deniedBy?.show).toBe("wms");

    // The node's own row is named when IT is the cause.
    const own = effectiveFor("wms.tasks.kanban", map({ "wms.tasks.kanban": off }));
    expect(own.deniedBy?.view).toBe("wms.tasks.kanban");
  });

  it("reports the OUTERMOST denial when several apply", () => {
    // The useful answer for "why is this off" is the switch that would have to
    // be turned back on first.
    const eff = effectiveFor("wms.tasks.kanban", map({ wms: off, "wms.tasks": off }));
    expect(eff.deniedBy?.view).toBe("wms");
  });

  it("leaves deniedBy absent when nothing is denied", () => {
    expect(effectiveFor("wms.tasks", new Map()).deniedBy).toBeUndefined();
  });
});

describe("the three actions are independent, with one ordering", () => {
  it("SHOW can be off while VIEW stays on — a page kept off the rail", () => {
    const overrides = map({
      "wms.tasks": { canShow: false, canView: true, canEdit: true },
    });
    const eff = effectiveFor("wms.tasks", overrides);
    expect(eff.show).toBe(false);
    expect(eff.view).toBe(true);
    expect(eff.edit).toBe(true);
  });

  it("the brief's example — Show YES, View YES, Edit NO", () => {
    const overrides = map({
      "wms.dashboard.task-report": { canShow: true, canView: true, canEdit: false },
    });
    const eff = effectiveFor("wms.dashboard.task-report", overrides);
    expect(eff).toEqual({
      show: true,
      view: true,
      edit: false,
      deniedBy: { edit: "wms.dashboard.task-report" },
    });
  });

  it("EDIT IMPLIES VIEW — no changing data you cannot read", () => {
    const overrides = map({
      "wms.tasks": { canShow: true, canView: false, canEdit: true },
    });
    const eff = effectiveFor("wms.tasks", overrides);
    expect(eff.view).toBe(false);
    // Stored as edit:true, but resolved to false — that combination is never a
    // policy anybody means.
    expect(eff.edit).toBe(false);
    expect(eff.deniedBy?.edit).toBe("wms.tasks");
  });

  it("an inherited VIEW denial also removes EDIT", () => {
    const overrides = map({
      wms: { canShow: true, canView: false, canEdit: true },
      "wms.tasks": on,
    });
    const eff = effectiveFor("wms.tasks", overrides);
    expect(eff.view).toBe(false);
    expect(eff.edit).toBe(false);
  });
});

describe("isAllowed", () => {
  it("answers one action at a time", () => {
    const overrides = map({
      "wms.tasks": { canShow: true, canView: true, canEdit: false },
    });
    expect(isAllowed("wms.tasks", "show", overrides)).toBe(true);
    expect(isAllowed("wms.tasks", "view", overrides)).toBe(true);
    expect(isAllowed("wms.tasks", "edit", overrides)).toBe(false);
  });
});

describe("isMeaningfulOverride", () => {
  it("an all-true row says nothing and is not worth storing", () => {
    expect(isMeaningfulOverride(on)).toBe(false);
  });

  it("any restriction is worth storing", () => {
    expect(isMeaningfulOverride(off)).toBe(true);
    expect(isMeaningfulOverride({ canShow: false, canView: true, canEdit: true })).toBe(true);
    expect(isMeaningfulOverride({ canShow: true, canView: true, canEdit: false })).toBe(true);
  });
});

describe("allowAll", () => {
  it("returns a fresh object each time, so a caller cannot poison the default", () => {
    const a = allowAll();
    a.view = false;
    expect(allowAll().view).toBe(true);
  });
});

describe("the hub is a governed node, and that has a consequence", () => {
  it("the fallback route the guards redirect to is itself in the catalogue", () => {
    // `requireModuleView` sends a refused request to /hub. If /hub were
    // ungoverned this would be unremarkable — but it IS governed
    // (`platform.hub`), which means a configuration can deny it, and a redirect
    // to a denied page loops forever.
    //
    // The guard handles that by throwing 403 when the hub is not viewable
    // (see lib/permissions/resolve.ts). This test exists so that the coupling is
    // visible: if the hub node is ever renamed or dropped from the catalogue,
    // the constant in the resolver has to move with it.
    expect(isPermissionNodeKey("platform.hub")).toBe(true);
    expect(nodeKeyForPath("/hub")).toBe("platform.hub");
  });

  it("denying the hub denies it — the guard cannot rely on it staying open", () => {
    const overrides = map({ "platform.hub": off });
    expect(effectiveFor("platform.hub", overrides).view).toBe(false);
  });

  it("denying the whole platform module takes the hub with it", () => {
    // The subtler version of the same trap: nobody switches off "Hub", they
    // switch off "Platform".
    const overrides = map({ platform: off });
    expect(effectiveFor("platform.hub", overrides).view).toBe(false);
  });
});
