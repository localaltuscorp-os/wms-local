import { describe, expect, it } from "vitest";
import { canAddTaskRoster } from "@/lib/auth/roster-permission";
import { canManageTaskRosters } from "@/lib/security/capabilities";

/**
 * THE SUBJECT AND CLIENT LISTS ARE LOCKED (account holder, 2026-09-15): only
 * Manan Sir, Jeevan and Rohan change them — in the Admin Panel and from the task
 * form's "+ Add new". Being an admin, or a super-admin, is not enough.
 */
describe("who may change the Subject and Client lists", () => {
  it("is Manan Sir, Jeevan and Rohan", () => {
    for (const email of [
      "manan@unleashed.in",
      "jeevanbharambe.altuscorp@gmail.com",
      "rohanchoudhary.altuscorp@gmail.com",
    ]) {
      expect(canManageTaskRosters(email)).toBe(true);
      expect(canAddTaskRoster({ isAdmin: false, email })).toBe(true);
    }
  });

  it("is not an ordinary admin", () => {
    expect(canAddTaskRoster({ isAdmin: true, email: "someone@altuscorp.in" })).toBe(false);
    expect(canManageTaskRosters("ruchitaambre.altuscorp@gmail.com")).toBe(false);
  });

  it("refuses a normal employee, and a missing email", () => {
    expect(canAddTaskRoster({ isAdmin: false, email: "employee@altuscorp.in" })).toBe(false);
    expect(canAddTaskRoster({ isAdmin: false, email: null })).toBe(false);
    expect(canAddTaskRoster({ isAdmin: false })).toBe(false);
  });

  it("matches the email case- and whitespace-insensitively", () => {
    expect(canAddTaskRoster({ isAdmin: false, email: "  Manan@Unleashed.IN " })).toBe(true);
    expect(canManageTaskRosters(" JeevanBharambe.AltusCorp@gmail.com")).toBe(true);
  });
});
