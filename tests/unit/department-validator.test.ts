import { describe, it, expect } from "vitest";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
  DepartmentIdSchema,
} from "@/lib/validators/department";

describe("CreateDepartmentSchema", () => {
  it("accepts name + default sort order", () => {
    const res = CreateDepartmentSchema.safeParse({ name: "Operations" });
    expect(res.success).toBe(true);
  });

  it("accepts name + explicit sort order", () => {
    const res = CreateDepartmentSchema.safeParse({
      name: "Operations",
      sortOrder: 50,
    });
    expect(res.success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const res = CreateDepartmentSchema.safeParse({ name: "  Sales  " });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.name).toBe("Sales");
  });

  it("rejects empty name", () => {
    expect(CreateDepartmentSchema.safeParse({ name: "" }).success).toBe(false);
    expect(CreateDepartmentSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects name longer than 80 chars", () => {
    const res = CreateDepartmentSchema.safeParse({ name: "X".repeat(81) });
    expect(res.success).toBe(false);
  });

  it("rejects sort order outside 0–9999", () => {
    expect(
      CreateDepartmentSchema.safeParse({ name: "X", sortOrder: -1 }).success,
    ).toBe(false);
    expect(
      CreateDepartmentSchema.safeParse({ name: "X", sortOrder: 10000 }).success,
    ).toBe(false);
    expect(
      CreateDepartmentSchema.safeParse({ name: "X", sortOrder: 0 }).success,
    ).toBe(true);
    expect(
      CreateDepartmentSchema.safeParse({ name: "X", sortOrder: 9999 }).success,
    ).toBe(true);
  });
});

describe("UpdateDepartmentSchema", () => {
  it("accepts a single-field patch", () => {
    expect(
      UpdateDepartmentSchema.safeParse({ name: "Renamed" }).success,
    ).toBe(true);
    expect(
      UpdateDepartmentSchema.safeParse({ isActive: false }).success,
    ).toBe(true);
    expect(
      UpdateDepartmentSchema.safeParse({ sortOrder: 1 }).success,
    ).toBe(true);
  });

  it("accepts a full patch", () => {
    const res = UpdateDepartmentSchema.safeParse({
      name: "Operations",
      isActive: true,
      sortOrder: 10,
    });
    expect(res.success).toBe(true);
  });

  it("rejects empty patch", () => {
    const res = UpdateDepartmentSchema.safeParse({});
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("No changes to save.");
    }
  });

  it("rejects unknown keys (strict)", () => {
    const res = UpdateDepartmentSchema.safeParse({
      name: "X",
      bogus: "value",
    });
    expect(res.success).toBe(false);
  });

  it("rejects empty renamed value", () => {
    expect(UpdateDepartmentSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("DepartmentIdSchema", () => {
  it("accepts canonical RFC4122 UUIDs", () => {
    expect(
      DepartmentIdSchema.safeParse("11111111-1111-4111-8111-111111111111")
        .success,
    ).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(DepartmentIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(DepartmentIdSchema.safeParse("").success).toBe(false);
  });
});
