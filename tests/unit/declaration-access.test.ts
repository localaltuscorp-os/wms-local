import { describe, it, expect } from "vitest";
import {
  DECLARATION_ADMINS_BY_EMAIL,
  canManageDeclarations,
  canReadDeclarationScan,
} from "@/lib/hr/declaration/access";

/**
 * WHO MAY READ A SIGNED DECLARATION.
 *
 * The rule is "the employee themselves, Ruchita, Rutvisha" — deliberately
 * narrower than admin and narrower than super-admin. So the tests that carry
 * the weight are the ones proving an admin, a super-admin and a colleague are
 * all turned away: a predicate that admitted everybody would pass every
 * positive case here and still be completely wrong.
 */

const RUCHITA = "ruchitaambre.altuscorp@gmail.com";
const RUTVISHA = "rutvishamehta.altuscorp@gmail.com";

describe("the allow-list itself", () => {
  it("is exactly the two custodians", () => {
    expect([...DECLARATION_ADMINS_BY_EMAIL]).toEqual([RUCHITA, RUTVISHA]);
  });

  it("does NOT include Manan — the brief named three parties and he was not one", () => {
    expect(canManageDeclarations({ email: "manan@unleashed.in" })).toBe(false);
  });
});

describe("who may manage every declaration", () => {
  it("admits the two named people by email", () => {
    expect(canManageDeclarations({ email: RUCHITA })).toBe(true);
    expect(canManageDeclarations({ email: RUTVISHA })).toBe(true);
  });

  it("ignores case and stray spaces around an address", () => {
    expect(canManageDeclarations({ email: "  RuchitaAmbre.AltusCorp@Gmail.COM " })).toBe(true);
  });

  it("admits Rutvisha by first name, who has no account yet", () => {
    // Verified 2026-09-21: no employees row for her address. The name fallback
    // is what admits her if she is given an account under a different one.
    expect(canManageDeclarations({ name: "Rutvisha Mehta", email: null })).toBe(true);
  });

  it("matches a first name as a WHOLE WORD, so a namesake is not admitted", () => {
    expect(canManageDeclarations({ name: "Rutvishaa Iyer", email: null })).toBe(false);
    expect(canManageDeclarations({ name: "Ruchitabh Rao", email: null })).toBe(false);
    // …and not on a surname or a middle name either.
    expect(canManageDeclarations({ name: "Asha Ruchita", email: null })).toBe(false);
  });

  it("TURNS AN ADMIN AWAY — the flag is not the rule", () => {
    expect(canManageDeclarations({ email: "someone@altuscorp.example", isAdmin: true })).toBe(false);
  });

  it("turns away a super-admin who is not named", () => {
    expect(canManageDeclarations({ email: "rohanchoudhary.altuscorp@gmail.com", isAdmin: true })).toBe(false);
  });

  it("turns away an empty or absent actor", () => {
    expect(canManageDeclarations({})).toBe(false);
    expect(canManageDeclarations({ email: "", name: "" })).toBe(false);
    expect(canManageDeclarations({ email: null, name: null })).toBe(false);
  });
});

describe("who may open one person's scan", () => {
  const ASHA = { id: "emp-asha", email: "asha@altuscorp.example", name: "Asha Kulkarni" };
  const BILAL = { id: "emp-bilal", email: "bilal@altuscorp.example", name: "Bilal Khan" };

  it("lets a person open their OWN", () => {
    expect(canReadDeclarationScan(ASHA, "emp-asha")).toBe(true);
  });

  it("does NOT let them open a colleague's", () => {
    expect(canReadDeclarationScan(ASHA, "emp-bilal")).toBe(false);
    expect(canReadDeclarationScan(BILAL, "emp-asha")).toBe(false);
  });

  it("lets the custodians open anybody's", () => {
    expect(canReadDeclarationScan({ id: "emp-ruchita", email: RUCHITA }, "emp-asha")).toBe(true);
    expect(canReadDeclarationScan({ id: "emp-rutvisha", email: RUTVISHA }, "emp-bilal")).toBe(true);
  });

  it("does not let an admin open somebody else's", () => {
    expect(
      canReadDeclarationScan({ id: "emp-x", email: "admin@altuscorp.example", isAdmin: true }, "emp-asha"),
    ).toBe(false);
  });

  it("FAILS CLOSED when either id is missing — two blanks must not match", () => {
    expect(canReadDeclarationScan({ id: null, email: "x@y.invalid" }, null)).toBe(false);
    expect(canReadDeclarationScan({ id: "", email: "x@y.invalid" }, "")).toBe(false);
    expect(canReadDeclarationScan({ email: "x@y.invalid" }, undefined)).toBe(false);
  });
});
