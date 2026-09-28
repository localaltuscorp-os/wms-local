import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  WORKSPACE_IDS,
  WORKSPACE_LABEL,
  WORKSPACE_LANDING,
  canAccessWorkspace,
  isWorkspaceId,
  workspaceForPath,
  type WorkspaceAccessInput,
} from "@/lib/workspaces";
import {
  CONDITIONAL_MODULES,
  MODULE_ORDER,
  MODULE_THEME,
  listedModules,
} from "@/lib/module-theme";
import { allPermissionNodes, nodeChain, nodeKeyForPath } from "@/lib/permissions/catalog";

/**
 * THE CONTROL PANEL IS A MODULE, AND A HIDDEN ONE.
 *
 * It used to be a group inside the Admin Panel. It is now a room of its own at
 * `/control-panel`, listed beside the other modules — and, unlike every other
 * room, ABSENT rather than greyed out for a person who may not enter it.
 *
 * The two halves of that sentence are what this file pins:
 *
 *   1. PLACEMENT. It is a real workspace with a landing, a label, a theme, a
 *      rail of its own under `/control-panel/*`, and the old Admin Panel paths
 *      still forward to it.
 *
 *   2. VISIBILITY. `canAccessWorkspace("control-panel", …)` is false for
 *      everybody except a person `accessFor` marked `canControlPanel`, and
 *      `listedModules` omits it entirely for them — not "renders it locked".
 *      That distinction is the whole requirement: a greyed label is still a
 *      menu entry for the room that hands out access.
 *
 * The matrix itself (whether a stored override switches the module off) is
 * resolved in `accessFor`, which needs a database, so it is asserted here
 * through the flag it produces rather than by calling the loader.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const PLAIN_EMPLOYEE: WorkspaceAccessInput = {
  departments: [],
  isAdmin: false,
  isSuperAdmin: false,
};
const ADMIN: WorkspaceAccessInput = {
  departments: [],
  isAdmin: true,
  isSuperAdmin: false,
  canControlPanel: true,
};
const ADMIN_DENIED_BY_MATRIX: WorkspaceAccessInput = {
  departments: [],
  isAdmin: true,
  isSuperAdmin: false,
  canControlPanel: false,
};
const SUPER_ADMIN: WorkspaceAccessInput = {
  departments: [],
  isAdmin: true,
  isSuperAdmin: true,
  canControlPanel: false,
};

describe("the Control Panel is a workspace", () => {
  it("is a known workspace with a label and a landing", () => {
    expect(isWorkspaceId("control-panel")).toBe(true);
    expect(WORKSPACE_IDS).toContain("control-panel");
    expect(WORKSPACE_LABEL["control-panel"]).toBe("Control Panel");
    expect(WORKSPACE_LANDING["control-panel"]).toBe("/control-panel/users");
  });

  it("owns its path, so the layout gate reaches every screen under it", () => {
    // This is what makes the rule real rather than cosmetic: `(app)/layout.tsx`
    // gates every route on the workspace `workspaceForPath` returns, so an
    // unlisted page under the room is still refused.
    expect(workspaceForPath("/control-panel")).toBe("control-panel");
    expect(workspaceForPath("/control-panel/users")).toBe("control-panel");
    expect(workspaceForPath("/control-panel/temporary-access")).toBe("control-panel");
  });

  it("does not swallow the Admin Panel", () => {
    expect(workspaceForPath("/admin")).toBeNull();
    expect(workspaceForPath("/admin/logs")).toBeNull();
    // And no unrelated path was caught by the new prefix.
    expect(workspaceForPath("/control")).toBeNull();
  });

  it("has a theme, so the room switcher can render it", () => {
    const t = MODULE_THEME["control-panel"];
    expect(t).toBeTruthy();
    expect(t.label).toBe("Control Panel");
    expect(t.href).toBe("/ws/control-panel");
  });
});

describe("who may enter", () => {
  it("refuses an ordinary employee", () => {
    expect(canAccessWorkspace("control-panel", PLAIN_EMPLOYEE)).toBe(false);
  });

  it("refuses an admin the matrix switched off", () => {
    expect(canAccessWorkspace("control-panel", ADMIN_DENIED_BY_MATRIX)).toBe(false);
  });

  it("admits an admin the matrix left alone", () => {
    expect(canAccessWorkspace("control-panel", ADMIN)).toBe(true);
  });

  it("treats a MISSING flag as NO, which is what every other caller passes", () => {
    // The three-field object is still what most call sites build. Absent must
    // mean "closed", never "open" — the default for a room almost nobody enters.
    expect(
      canAccessWorkspace("control-panel", {
        departments: [],
        isAdmin: true,
        isSuperAdmin: false,
      }),
    ).toBe(false);
  });

  it("lets the matrix bind even for a super-admin", () => {
    // The order in canAccessWorkspace is load-bearing. It is the surface that
    // hands out the matrix, so a super-admin is not exempt from a row that
    // closes it — a MASTER ADMIN is, and is exempt inside accessFor instead,
    // where the two people who can always get back in are named.
    expect(canAccessWorkspace("control-panel", SUPER_ADMIN)).toBe(false);
    // Every other room still bypasses on the super-admin flag, unchanged.
    expect(canAccessWorkspace("sales", SUPER_ADMIN)).toBe(true);
  });
});

describe("listedModules", () => {
  it("omits the Control Panel entirely for somebody who may not enter it", () => {
    // NOT greyed, NOT present-and-locked: absent. The requirement is that it
    // does not appear ANYWHERE for that person.
    expect(listedModules(PLAIN_EMPLOYEE)).not.toContain("control-panel");
    expect(listedModules(ADMIN_DENIED_BY_MATRIX)).not.toContain("control-panel");
  });

  it("appends it for somebody who may", () => {
    const list = listedModules(ADMIN);
    expect(list).toContain("control-panel");
    // Appended last, so no existing module's position — and therefore no
    // existing module's letter, which is indexed off MODULE_ORDER — moves.
    expect(list[list.length - 1]).toBe("control-panel");
  });

  it("leaves the fixed set alone in every case", () => {
    for (const who of [PLAIN_EMPLOYEE, ADMIN, SUPER_ADMIN]) {
      for (const id of MODULE_ORDER) expect(listedModules(who)).toContain(id);
    }
  });

  it("keeps the Control Panel OUT of MODULE_ORDER", () => {
    // The distinction the whole design rests on: MODULE_ORDER is the fixed set
    // that is always listed, which is why a conditional module cannot live in
    // it. If this ever fails, every surface that renders MODULE_ORDER directly
    // starts leaking the room.
    expect(MODULE_ORDER).not.toContain("control-panel");
    expect(CONDITIONAL_MODULES).toContain("control-panel");
  });

  it("gives it no keyboard shortcut, so no cheatsheet advertises it", () => {
    // The "?" sheet and the profile cheatsheet are static lists with no access
    // context, shown to everybody. A letter for a room most people cannot enter
    // would be a discoverable menu entry — the thing the brief rules out.
    expect(MODULE_THEME["control-panel"].shortcut).toBe("");
  });
});

describe("the permission catalogue moved with it", () => {
  it("has a top-level Control Panel node governing the module route", () => {
    expect(nodeKeyForPath("/control-panel")).toBe("control-panel");
    expect(nodeChain("control-panel")).toEqual(["control-panel"]);
  });

  it("governs each screen", () => {
    expect(nodeKeyForPath("/control-panel/users")).toBe("control-panel.users");
    expect(nodeKeyForPath("/control-panel/roles")).toBe("control-panel.roles");
    expect(nodeKeyForPath("/control-panel/permissions")).toBe("control-panel.permissions");
    expect(nodeKeyForPath("/control-panel/effective-access")).toBe(
      "control-panel.effective-access",
    );
    expect(nodeKeyForPath("/control-panel/temporary-access")).toBe(
      "control-panel.temporary-access",
    );
  });

  it("chains every screen through the module, so one row hides the room", () => {
    // Switching off `control-panel` must take its screens with it. That cascade
    // is asserted by `effectiveFor` elsewhere; what is pinned here is that the
    // chain actually contains the module.
    for (const key of [
      "control-panel.users",
      "control-panel.roles",
      "control-panel.permissions",
      "control-panel.effective-access",
      "control-panel.temporary-access",
    ]) {
      expect(nodeChain(key)[0]).toBe("control-panel");
    }
  });

  it("is no longer inside the Admin Panel", () => {
    for (const n of allPermissionNodes()) {
      if (!n.key.startsWith("control-panel")) continue;
      expect(n.ancestors).not.toContain("admin");
    }
    // The old keys are gone — a grant stored under one would govern nothing.
    const keys = allPermissionNodes().map((n) => n.key);
    expect(keys).not.toContain("admin.control-panel");
    expect(keys).not.toContain("admin.control-panel.users");
    expect(keys).not.toContain("admin.temporary-access");
  });

  it("no longer claims the old paths as Control Panel nodes", () => {
    // The catalogue answers only for the new tree. `/admin/control-panel/*`
    // still matches on its `/admin` prefix — so it resolves to the Admin Panel's
    // own overview node — but nothing resolves it to a Control Panel node any
    // more, and the redirect in next.config.ts answers before any page renders.
    for (const old of ["/admin/control-panel/users", "/admin/temporary-access"]) {
      expect(nodeKeyForPath(old)).not.toMatch(/^control-panel/);
      expect(nodeKeyForPath(old)).toBe("admin.overview");
    }
  });
});

describe("the Admin Panel no longer contains it", () => {
  it("has no Control Panel entry in the admin navigation", () => {
    const src = readFileSync("components/admin/admin-nav-config.ts", "utf8");
    expect(src).not.toContain("/admin/control-panel");
    expect(src).toContain("/admin/access-control");
  });

  it("keeps the ADM path forwarding, so old links still land", () => {
    // Written two days before the move, so the old paths are in people's
    // history and in links already sent. The forward is the routing layer's, so
    // no Control Panel route exists inside `app/(admin)/admin/`.
    const cfg = readFileSync("next.config.ts", "utf8");
    expect(cfg).toContain('"/admin/control-panel/:path*"');
    expect(cfg).toContain('"/control-panel/:path*"');
    expect(cfg).toContain('"/admin/temporary-access"');
  });
});
