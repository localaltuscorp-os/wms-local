import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/db/schema";

/**
 * This rule decides who can give the entire company a paid day off - a holiday
 * row is read straight back by attendance. It used to be two hardcoded email
 * addresses; it is now `isHrStaff` (HR department + super-admins), the same
 * move `canPublishPolicies` made for firm policies on 2026-09-21 (see
 * tests/unit/policy-access.test.ts, which this mirrors) — a role instead of a
 * list, so `isHrStaff` is mocked here rather than re-testing department lookup.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/hr/access", () => ({ isHrStaff: vi.fn() }));

const { canManageHolidays } = await import("@/lib/hr/holiday-admins");
const { isHrStaff } = await import("@/lib/hr/access");
const hrStaff = vi.mocked(isHrStaff);

const person = (email: string | null): Employee => ({ email }) as unknown as Employee;

beforeEach(() => hrStaff.mockReset());

describe("canManageHolidays", () => {
  it("admits whoever isHrStaff says — HR department or super-admin", async () => {
    hrStaff.mockResolvedValue(true);
    expect(await canManageHolidays(person("someone.new@altuscorp.in"))).toBe(true);
  });

  it("refuses everybody else", async () => {
    hrStaff.mockResolvedValue(false);
    expect(await canManageHolidays(person("asha@example.invalid"))).toBe(false);
  });

  it("refuses absent employees without asking isHrStaff", async () => {
    expect(await canManageHolidays(null)).toBe(false);
    expect(await canManageHolidays(undefined)).toBe(false);
    expect(hrStaff).not.toHaveBeenCalled();
  });

  it("admits the dummy admin only when dummyMode is on", async () => {
    hrStaff.mockResolvedValue(false);
    const dummy = person("dummy.admin@example.invalid");
    expect(await canManageHolidays(dummy, true)).toBe(true);
    expect(await canManageHolidays(dummy, false)).toBe(false);
  });

  it("does not let dummyMode admit anyone else", async () => {
    hrStaff.mockResolvedValue(false);
    expect(await canManageHolidays(person("someone@altuscorp.in"), true)).toBe(false);
  });
});
