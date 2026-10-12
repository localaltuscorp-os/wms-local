import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

const { isMissingTemporaryBreakSchema } = await import("@/lib/queries/hierarchy");

describe("hierarchy temporary-break compatibility", () => {
  it.each(["42P01", "42703"])("recognises schema-behind SQLSTATE %s", (code) => {
    expect(isMissingTemporaryBreakSchema({ cause: { code } })).toBe(true);
  });

  it.each(["42501", "08006", "57014"])("does not hide operational SQLSTATE %s", (code) => {
    expect(isMissingTemporaryBreakSchema({ cause: { code } })).toBe(false);
  });

  it("does not classify ordinary errors as missing schema", () => {
    expect(isMissingTemporaryBreakSchema(new Error("connection failed"))).toBe(false);
  });
});
