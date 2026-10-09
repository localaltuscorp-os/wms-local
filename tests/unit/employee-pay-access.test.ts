import { describe, it, expect, vi, beforeEach } from "vitest";
import { codeOf } from "../fixtures/source-code";

vi.mock("server-only", () => ({}));

/**
 * "MAY VIEW OR EDIT PAY" IS A DATABASE GRANT, NOT AN ADMIN BIT AND NOT AN EMAIL
 * LIST. Nobody holds `employee_pay.manage` by code, so an admin and a
 * super-admin are both refused until a grant row exists.
 */

const { granted, failRead } = vi.hoisted(() => ({
  granted: new Set<string>(),
  failRead: { on: false },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (failRead.on) throw new Error("read failed");
          return [...granted].map((email) => ({ email }));
        },
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  capabilityGrants: { employeeId: "employee_id", employeeEmail: "employee_email", capability: "capability" },
  capabilityGrantEvents: {},
  employees: { id: "id", email: "email" },
}));

const { canManageEmployeePay, EMPLOYEE_PAY_REFUSAL } = await import("@/lib/employees/pay-access");

const HOLDER = { email: "holder@example.com" };
const OTHER_ADMIN = { email: "admin@example.com" };

beforeEach(() => {
  granted.clear();
  failRead.on = false;
});

describe("canManageEmployeePay", () => {
  it("refuses everyone while no grant exists", async () => {
    expect(await canManageEmployeePay(HOLDER)).toBe(false);
    expect(await canManageEmployeePay(OTHER_ADMIN)).toBe(false);
  });

  it("admits only the address that holds the grant", async () => {
    granted.add("holder@example.com");
    expect(await canManageEmployeePay(HOLDER)).toBe(true);
    expect(await canManageEmployeePay(OTHER_ADMIN)).toBe(false);
  });

  it("compares the address case- and whitespace-insensitively", async () => {
    granted.add("holder@example.com");
    expect(await canManageEmployeePay({ email: "  Holder@Example.COM " })).toBe(true);
  });

  it("refuses a missing address", async () => {
    expect(await canManageEmployeePay({ email: "" })).toBe(false);
    expect(await canManageEmployeePay({ email: null as unknown as string })).toBe(false);
  });

  it("fails CLOSED when the grant table cannot be read", async () => {
    granted.add("holder@example.com");
    failRead.on = true;
    expect(await canManageEmployeePay(HOLDER)).toBe(false);
  });

  it("states the refusal without naming anyone", () => {
    expect(EMPLOYEE_PAY_REFUSAL).toMatch(/permission to view or change salary/i);
  });
});

describe("the pay surfaces use the capability, not isSuperAdmin", () => {
  const master = codeOf("app/(admin)/admin/employee-master/actions.ts");

  it("the CTC and payroll saves and the detail loader consult canManageEmployeePay", () => {
    expect(master.match(/canManageEmployeePay\(me\)/g)?.length).toBe(3);
  });

  it("the old super-admin pay refusal is gone from the Employee Master actions", () => {
    expect(master).not.toContain("Only a super-admin may change salary");
  });

  it("the Employee Master page decides pay visibility with the capability", () => {
    const page = codeOf("app/(admin)/admin/employee-master/page.tsx");
    expect(page).toMatch(/const canSeePay = await canManageEmployeePay\(me\)/);
  });

  it("inviteEmployee checks the capability BEFORE it creates the Firebase user", () => {
    const actions = codeOf("app/(admin)/admin/employees/actions.ts");
    const check = actions.indexOf("canManageEmployeePay(me)");
    const create = actions.indexOf("auth.createUser(");
    expect(check).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(check);
  });

  it("granting the capability is super-admin only", () => {
    const actions = codeOf("app/(admin)/admin/employees/actions.ts");
    const block = actions.slice(actions.indexOf("parsed.data.canManagePay !== undefined"));
    expect(block.slice(0, 700)).toContain("isSuperAdmin(me.email)");
  });
});
