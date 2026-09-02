import { describe, it, expect } from "vitest";
import {
  canAccessAdminArea,
  canInviteEmployees,
  type EmployeeView,
} from "@/lib/auth/predicates";

const baseUser: EmployeeView = {
  id: "u1",
  isAdmin: false,
  isActive: true,
};

const baseAdmin: EmployeeView = {
  id: "a1",
  isAdmin: true,
  isActive: true,
};

describe("canAccessAdminArea", () => {
  it("returns false for non-admin", () => {
    expect(canAccessAdminArea(baseUser)).toBe(false);
  });
  it("returns true for admin", () => {
    expect(canAccessAdminArea(baseAdmin)).toBe(true);
  });
  it("returns false for deactivated admin", () => {
    expect(canAccessAdminArea({ ...baseAdmin, isActive: false })).toBe(false);
  });
  it("returns false for null caller", () => {
    expect(canAccessAdminArea(null)).toBe(false);
  });
});

describe("canInviteEmployees", () => {
  it("requires admin", () => {
    expect(canInviteEmployees(baseUser)).toBe(false);
    expect(canInviteEmployees(baseAdmin)).toBe(true);
  });
});
