import { describe, it, expect } from "vitest";
import {
  WORKSPACE_IDS,
  WORKSPACE_LABEL,
  WORKSPACE_LANDING,
  workspaceForPath,
  canAccessWorkspace,
  isWorkspaceId,
} from "@/lib/workspaces";
import { MODULE_ORDER, MODULE_THEME } from "@/lib/module-theme";

/**
 * Operations absorbed two rooms (2026-09-11). The claims worth pinning are the
 * ones a later edit could quietly undo: that the absorbed prefixes still route
 * into Operations, that the two are gone from the hub, and that the room stays
 * open to non-admins so Hand-holding does not disappear behind Monthly Events
 * Master's admin gate.
 */
describe("the Operations room", () => {
  it("is a real workspace", () => {
    expect(WORKSPACE_IDS).toContain("operations");
    expect(isWorkspaceId("operations")).toBe(true);
    expect(WORKSPACE_LABEL.operations).toBe("Operations");
    expect(WORKSPACE_LANDING.operations).toBe("/operations");
  });

  it("owns its own paths AND the two it absorbed", () => {
    expect(workspaceForPath("/operations")).toBe("operations");
    expect(workspaceForPath("/operations/checklist")).toBe("operations");
    expect(workspaceForPath("/operations/guidelines")).toBe("operations");
    // The point of the move: these used to return their own rooms.
    expect(workspaceForPath("/people-allocation")).toBe("operations");
    expect(workspaceForPath("/people-allocation/participants")).toBe("operations");
    expect(workspaceForPath("/events")).toBe("operations");
    expect(workspaceForPath("/events/calendar")).toBe("operations");
  });

  it("does not swallow a prefix that merely starts the same way", () => {
    // /projects and /project-plan are WMS and Project respectively; neither is
    // an Operations path, and none of Operations' prefixes may claim them.
    expect(workspaceForPath("/projects")).toBe("wms");
    expect(workspaceForPath("/project-plan")).toBe("project-plan");
  });

  it("has a hub card, and the two absorbed rooms no longer do", () => {
    expect(MODULE_ORDER).toContain("operations");
    expect(MODULE_ORDER).not.toContain("events");
    expect(MODULE_ORDER).not.toContain("people-allocation");
  });

  it("keeps the absorbed WorkspaceIds valid, so old /ws links still resolve", () => {
    expect(isWorkspaceId("events")).toBe(true);
    expect(isWorkspaceId("people-allocation")).toBe(true);
    expect(MODULE_THEME.events).toBeTruthy();
    expect(MODULE_THEME["people-allocation"]).toBeTruthy();
  });

  it("wears the WMS theme, not a hue of its own", () => {
    // Account holder, 2026-09-11: the whole room takes the WMS accent pair.
    // Asserted against `wms` rather than against the literals, so the day WMS
    // is re-branded Operations follows it instead of silently diverging.
    expect(MODULE_THEME.operations.accent).toBe(MODULE_THEME.wms.accent);
    expect(MODULE_THEME.operations.accentDeep).toBe(MODULE_THEME.wms.accentDeep);
  });

  it("no longer wears the orange Hand-holding brought with it", () => {
    expect(MODULE_THEME.operations.accent).not.toBe(
      MODULE_THEME["people-allocation"].accent,
    );
  });

  it("stays OPEN — a non-admin must not lose Hand-holding to the events gate", () => {
    const plainEmployee = { departments: [], isAdmin: false, isSuperAdmin: false };
    expect(canAccessWorkspace("operations", plainEmployee)).toBe(true);
    // The gate that would have been inherited had Operations been admin-only.
    expect(canAccessWorkspace("events", plainEmployee)).toBe(false);
  });
});
