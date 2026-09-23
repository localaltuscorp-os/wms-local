import { describe, expect, it } from "vitest";
import {
  mergeEffectiveAccessLines,
  type EffectiveAccessLine,
} from "@/lib/permissions/effective-access";

/**
 * Multiple roles must combine without duplicating the same (module, action),
 * and conflicting scopes must not be invented.
 */
const line = (over: Partial<EffectiveAccessLine>): EffectiveAccessLine => ({
  nodeKey: "accounts.salary",
  module: "Accounts",
  page: "Salary",
  action: "view",
  scope: "function",
  source: "HR Admin",
  ...over,
});

describe("mergeEffectiveAccessLines", () => {
  it("combines two roles granting the same permission into one row", () => {
    const out = mergeEffectiveAccessLines([
      line({ source: "HR Admin" }),
      line({ source: "Reporting Viewer" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe("HR Admin · Reporting Viewer");
  });

  it("keeps distinct actions as separate rows", () => {
    const out = mergeEffectiveAccessLines([line({ action: "view" }), line({ action: "edit" })]);
    expect(out).toHaveLength(2);
  });

  it("drops scope when two sources disagree on it", () => {
    const out = mergeEffectiveAccessLines([
      line({ source: "A", scope: "function" }),
      line({ source: "B", scope: "company" }),
    ]);
    expect(out[0]!.scope).toBeNull();
  });

  it("sorts by module then action", () => {
    const out = mergeEffectiveAccessLines([
      line({ nodeKey: "wms.tasks", module: "WMS", action: "edit" }),
      line({ nodeKey: "accounts.salary", module: "Accounts", action: "view" }),
    ]);
    expect(out.map((r) => r.module)).toEqual(["Accounts", "WMS"]);
  });
});
