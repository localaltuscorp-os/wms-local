import { describe, expect, it } from "vitest";
import { applyScopedAccess } from "@/lib/permissions/scoped-overlay-effective";

const allowed = { show: true, view: true, edit: true };

describe("scoped temporary access overlay", () => {
  it("never elevates a pre-existing denial", () => {
    expect(applyScopedAccess({ show: true, view: false, edit: false }, "wms.tasks", [
      { moduleKey: "wms", accessLevel: "full", navigationKeys: [] },
    ])).toMatchObject({ show: true, view: false, edit: false });
  });

  it("denies modules omitted from an active scope", () => {
    expect(applyScopedAccess(allowed, "goals.weekly", [
      { moduleKey: "wms", accessLevel: "full", navigationKeys: [] },
    ])).toMatchObject({ show: false, view: false, edit: false });
  });

  it("makes viewing access read-only", () => {
    expect(applyScopedAccess(allowed, "wms.tasks", [
      { moduleKey: "wms", accessLevel: "viewing", navigationKeys: [] },
    ])).toMatchObject({ show: true, view: true, edit: false });
  });

  it("allows only selected custom navigation branches", () => {
    const scope = [{ moduleKey: "wms", accessLevel: "custom" as const, navigationKeys: ["wms.tasks"] }];
    expect(applyScopedAccess(allowed, "wms.tasks", scope).view).toBe(true);
    expect(applyScopedAccess(allowed, "wms.tasks.kanban", scope).view).toBe(true);
    expect(applyScopedAccess(allowed, "wms.dashboard", scope).view).toBe(false);
  });
});
