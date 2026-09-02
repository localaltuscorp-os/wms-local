import { describe, expect, it } from "vitest";
import { businessEmailFor, employeeEmailTargets } from "@/lib/email/recipients";

/**
 * The Sunday-morning manager / founder rollup mails ONE work address per
 * recipient. These reports carry other people's pay impact, so the personal
 * mailbox must never be a target — that is the whole point of keeping this
 * separate from `employeeEmailTargets`.
 */
describe("businessEmailFor", () => {
  it("prefers the official (work) address", () => {
    expect(
      businessEmailFor({
        email: "login@gmail.com",
        officialEmail: "priya.shah@altuscorp.in",
      }),
    ).toBe("priya.shah@altuscorp.in");
  });

  it("falls back to the login address when no work address is on file", () => {
    expect(businessEmailFor({ email: "login@gmail.com", officialEmail: null })).toBe(
      "login@gmail.com",
    );
    expect(businessEmailFor({ email: "login@gmail.com", officialEmail: "   " })).toBe(
      "login@gmail.com",
    );
  });

  it("returns null when there is nothing to send to", () => {
    expect(businessEmailFor({ email: null, officialEmail: null })).toBeNull();
    expect(businessEmailFor({ email: "  ", officialEmail: undefined })).toBeNull();
  });

  it("never reaches the personal mailbox, unlike employeeEmailTargets", () => {
    const emp = {
      email: "login@gmail.com",
      officialEmail: "priya.shah@altuscorp.in",
      personalEmail: "priya.personal@gmail.com",
    };
    expect(employeeEmailTargets(emp)).toContain("priya.personal@gmail.com");
    expect(businessEmailFor(emp)).toBe("priya.shah@altuscorp.in");
  });
});
