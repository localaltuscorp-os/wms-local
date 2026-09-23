import { describe, expect, it } from "vitest";
import {
  DATA_SCOPES,
  actionToEnforcement,
  isDataScope,
  isPermissionAction,
} from "@/lib/permissions/vocabulary";

describe("actionToEnforcement", () => {
  it("maps read-class actions to view", () => {
    expect(actionToEnforcement("view")).toBe("view");
    expect(actionToEnforcement("export")).toBe("view");
    expect(actionToEnforcement("download")).toBe("view");
  });

  it("maps every mutating action to edit", () => {
    for (const a of ["create", "edit", "delete", "approve", "reject", "import", "upload", "manage", "configure", "publish", "payment", "override"]) {
      expect(actionToEnforcement(a as Parameters<typeof actionToEnforcement>[0])).toBe("edit");
    }
  });
});

describe("validators", () => {
  it("accepts real actions and scopes, rejects junk", () => {
    expect(isPermissionAction("view")).toBe(true);
    expect(isPermissionAction("not-an-action")).toBe(false);
    expect(isDataScope("company")).toBe(true);
    expect(isDataScope(null)).toBe(false);
    expect(isDataScope("junk")).toBe(false);
  });

  it("exposes the full scope vocabulary", () => {
    expect(DATA_SCOPES).toContain("downline");
    expect(DATA_SCOPES).toContain("selected_users");
  });
});
