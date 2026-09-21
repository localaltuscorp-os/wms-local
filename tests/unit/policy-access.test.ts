import { describe, it, expect } from "vitest";
import { canPublishPolicies } from "@/lib/hr/policies/access";

/**
 * Who may publish a policy. The rule is deliberately narrower than "admin", so
 * the tests that matter are the ones proving an admin is turned away.
 */

describe("who may publish a policy", () => {
  it("lets the two named people through by email", () => {
    expect(canPublishPolicies({ email: "manan@unleashed.in" })).toBe(true);
    expect(canPublishPolicies({ email: "ruchitaambre.altuscorp@gmail.com" })).toBe(true);
  });

  it("ignores case and stray spaces around an address", () => {
    expect(canPublishPolicies({ email: "  Manan@Unleashed.IN " })).toBe(true);
  });

  it("lets Rutvisha through by name, who has no account yet", () => {
    expect(canPublishPolicies({ name: "Rutvisha Mehta", email: null })).toBe(true);
  });

  it("TURNS AN ADMIN AWAY — the flag is not the rule", () => {
    expect(canPublishPolicies({ email: "someone.else@altus.example", isAdmin: true })).toBe(false);
  });

  it("turns away anyone else, signed in or not", () => {
    expect(canPublishPolicies({ email: "asha@example.invalid", name: "Asha Kulkarni" })).toBe(false);
    expect(canPublishPolicies({})).toBe(false);
    expect(canPublishPolicies({ email: "", name: "" })).toBe(false);
  });

  it("admits the dummy admin only while dummy mode is on", () => {
    const dummy = { email: "dummy.admin@example.invalid", name: "Dummy Admin", isAdmin: true };
    expect(canPublishPolicies(dummy, true)).toBe(true);
    expect(canPublishPolicies(dummy, false)).toBe(false);
  });

  it("matches a first name inside a full name, as the roster spells it", () => {
    expect(canPublishPolicies({ name: "Manan Vasa", email: "m.vasa@altus.example" })).toBe(true);
    expect(canPublishPolicies({ name: "Ruchita Ambre", email: null })).toBe(true);
  });
});
