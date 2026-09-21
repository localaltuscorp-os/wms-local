import { describe, expect, it } from "vitest";
import {
  ASSET_TYPES,
  assetPrefix,
  canEditHrRegisters,
  formatAssetCode,
  whatsappHref,
} from "@/lib/hr/registers";
import {
  ONB_DONT_HAVE,
  ONB_FIELD_BY_KEY,
  ONB_HAVE,
  isOnbFieldHidden,
  isOnbFieldRequired,
} from "@/lib/dossier/onboarding-schema";

describe("HR register editors", () => {
  it("allows only Ruchita, Rutvisha and Manan (case-insensitive)", () => {
    expect(canEditHrRegisters("ruchitaambre.altuscorp@gmail.com")).toBe(true);
    expect(canEditHrRegisters(" RutvishaMehta.altuscorp@gmail.com ")).toBe(true);
    expect(canEditHrRegisters("manan@unleashed.in")).toBe(true);
    expect(canEditHrRegisters("someone.altuscorp@gmail.com")).toBe(false);
    expect(canEditHrRegisters(null)).toBe(false);
  });
});

describe("whatsappHref", () => {
  it("adds +91 to a 10-digit number and strips formatting", () => {
    expect(whatsappHref("98765 43210")).toBe("https://wa.me/919876543210");
    expect(whatsappHref("+91-98765-43210")).toBe("https://wa.me/919876543210");
    expect(whatsappHref("09876543210")).toBe("https://wa.me/919876543210");
  });
  it("refuses numbers that can't be dialled", () => {
    expect(whatsappHref("12345")).toBeNull();
    expect(whatsappHref(null)).toBeNull();
  });
});

describe("asset codes", () => {
  it("prefixes per type and pads to four digits", () => {
    expect(formatAssetCode(assetPrefix("Laptop"), 1)).toBe("LAP-0001");
    expect(formatAssetCode(assetPrefix("Monitor"), 27)).toBe("MON-0027");
    expect(formatAssetCode(assetPrefix("Unknown"), 12345)).toBe("OTH-12345");
  });
  it("gives every type a unique prefix", () => {
    const prefixes = ASSET_TYPES.map((t) => t.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("onboarding passport / driving licence rules", () => {
  const passport = ONB_FIELD_BY_KEY.get("passportCopy")!;
  const signature = ONB_FIELD_BY_KEY.get("signaturePhoto")!;
  it("requires the copy only when the person has one", () => {
    expect(isOnbFieldRequired(passport, { passportStatus: ONB_HAVE })).toBe(true);
    expect(isOnbFieldRequired(passport, { passportStatus: ONB_DONT_HAVE })).toBe(false);
    expect(isOnbFieldHidden(passport, { passportStatus: ONB_DONT_HAVE })).toBe(true);
    expect(isOnbFieldRequired(passport, {})).toBe(false);
  });
  it("shows the Address Proof 'Other' box only for Other, and requires it then", () => {
    const other = ONB_FIELD_BY_KEY.get("addressProofOther")!;
    expect(isOnbFieldHidden(other, { addressProofType: "Aadhaar Card" })).toBe(true);
    expect(isOnbFieldRequired(other, { addressProofType: "Aadhaar Card" })).toBe(false);
    expect(isOnbFieldHidden(other, { addressProofType: "Other" })).toBe(false);
    expect(isOnbFieldRequired(other, { addressProofType: "Other" })).toBe(true);
  });
  it("lets the Aadhaar Card attachment stand in for the address proof", () => {
    const proof = ONB_FIELD_BY_KEY.get("addressProof")!;
    expect(proof.satisfiedBy).toEqual({ whenKey: "addressProofType", equals: "Aadhaar Card", fileKey: "aadharCopy" });
  });
  it("always requires the signature photo, PAN and Aadhaar copies", () => {
    expect(isOnbFieldRequired(signature, {})).toBe(true);
    expect(isOnbFieldRequired(ONB_FIELD_BY_KEY.get("panCopy")!, {})).toBe(true);
    expect(isOnbFieldRequired(ONB_FIELD_BY_KEY.get("aadharCopy")!, {})).toBe(true);
  });
});
