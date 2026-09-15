import { describe, expect, it } from "vitest";
import {
  digiLockerKycToFill,
  countFilled,
  safeReturnPath,
  isIntakeKycState,
  makeIntakeKycState,
  INTAKE_KYC_FALLBACK_RETURN,
  INTAKE_KYC_STATE_PREFIX,
} from "@/lib/hr/candidate/digilocker-intake";

describe("safeReturnPath", () => {
  /**
   * This value arrives as a query parameter on a route that then issues a 302.
   * Taken at face value it is an open redirect, so the tests are about the ways
   * a URL can name somewhere other than this app.
   */
  it("keeps a genuine intake path, query and all", () => {
    expect(safeReturnPath("/hr/intake?draft=abc-123")).toBe("/hr/intake?draft=abc-123");
    expect(safeReturnPath("/hr/candidates")).toBe("/hr/candidates");
  });

  it("refuses another origin, however it is spelled", () => {
    for (const evil of [
      "https://evil.test/hr/intake",
      "//evil.test/hr/intake", // protocol-relative - a real origin
      "/\evil.test/hr/intake", // backslash variant some parsers accept
      "http://localhost:3000/hr/intake",
      "javascript:alert(1)",
    ]) {
      expect(safeReturnPath(evil), evil).toBe(INTAKE_KYC_FALLBACK_RETURN);
    }
  });

  it("refuses paths outside /hr, so this cannot bounce around the app", () => {
    for (const p of ["/", "/hub", "/admin/employees", "/hrsomething", "/hr"]) {
      expect(safeReturnPath(p), p).toBe(INTAKE_KYC_FALLBACK_RETURN);
    }
  });

  it("refuses header-splitting characters and empty input", () => {
    expect(safeReturnPath("/hr/intake\nLocation: https://evil.test")).toBe(INTAKE_KYC_FALLBACK_RETURN);
    expect(safeReturnPath("/hr/intake\r\nSet-Cookie: a=b")).toBe(INTAKE_KYC_FALLBACK_RETURN);
    expect(safeReturnPath(null)).toBe(INTAKE_KYC_FALLBACK_RETURN);
    expect(safeReturnPath("")).toBe(INTAKE_KYC_FALLBACK_RETURN);
  });
});

describe("state dispatch", () => {
  /**
   * Both flows land on the same callback because DigiLocker validates
   * redirect_uri against one registered URL. A signing state is a bare UUID, so
   * it must never be mistaken for an intake one, or a signature verification
   * would be answered by the wrong handler.
   */
  it("recognises its own states and no others", () => {
    expect(isIntakeKycState(makeIntakeKycState("abc"))).toBe(true);
    expect(makeIntakeKycState("abc").startsWith(INTAKE_KYC_STATE_PREFIX)).toBe(true);
  });

  it("does not claim a document-signing state (a bare UUID)", () => {
    expect(isIntakeKycState("6f1c9d2e-6a3b-4a1e-9c2f-1b2c3d4e5f60")).toBe(false);
    expect(isIntakeKycState("")).toBe(false);
    expect(isIntakeKycState(null)).toBe(false);
    expect(isIntakeKycState(undefined)).toBe(false);
  });
});

describe("digiLockerKycToFill", () => {
  it("maps and normalises what DigiLocker returns", () => {
    const fill = digiLockerKycToFill({
      name: "  Asha Menon ",
      dob: "14-03-1992", // dd-mm-yyyy
      gender: "F",
      address: "12 Marine Drive, Mumbai, Maharashtra, 400020",
    });
    expect(fill).toEqual({
      name: "Asha Menon",
      dob: "1992-03-14", // the <input type="date"> format
      gender: "Female",
      location: "12 Marine Drive, Mumbai, Maharashtra, 400020",
    });
  });

  it("OMITS absent fields rather than sending empty strings", () => {
    // The form only writes truthy keys; an empty string here would still be a
    // key, and a future `?? ""` on the other side would blank something the
    // user had already typed.
    const fill = digiLockerKycToFill({ name: "Ravi", dob: null, gender: "", address: "   " });
    expect(fill).toEqual({ name: "Ravi" });
    expect("dob" in fill).toBe(false);
    expect("gender" in fill).toBe(false);
    expect("location" in fill).toBe(false);
  });

  it("never invents a mobile — DigiLocker's demographics carry none", () => {
    const fill = digiLockerKycToFill({ name: "Ravi", dob: "01-01-1990", gender: "M", address: "X" });
    expect(fill.mobile).toBeUndefined();
  });

  it("drops an unparseable date rather than writing a bad one", () => {
    expect(digiLockerKycToFill({ dob: "1992" }).dob).toBeUndefined();
    expect(digiLockerKycToFill({ dob: "not a date" }).dob).toBeUndefined();
  });

  it("counts only fields that will actually be written", () => {
    expect(countFilled({})).toBe(0);
    expect(countFilled({ name: "A", dob: "1990-01-01" })).toBe(2);
    expect(countFilled({ name: "  ", dob: "1990-01-01" })).toBe(1);
  });
});
