import { describe, it, expect } from "vitest";
import { EditEmployeeSchema } from "@/lib/validators/employee";

describe("EditEmployeeSchema managerId", () => {
  it("accepts a uuid managerId", () => {
    expect(EditEmployeeSchema.safeParse({ managerId: "00000000-0000-4000-8000-000000000000" }).success).toBe(true);
  });
  it("accepts null (no manager)", () => {
    expect(EditEmployeeSchema.safeParse({ managerId: null }).success).toBe(true);
  });
  it("rejects a non-uuid managerId", () => {
    expect(EditEmployeeSchema.safeParse({ managerId: "not-a-uuid" }).success).toBe(false);
  });
});
