import { describe, expect, it } from "vitest";
import {
  ASSET_TYPES,
  assetPrefix,
  formatAssetCode,
  whatsappHref,
} from "@/lib/hr/registers";
import { codeOf } from "../fixtures/source-code";
import {
  ONB_DONT_HAVE,
  ONB_FIELD_BY_KEY,
  ONB_HAVE,
  isOnbFieldHidden,
  isOnbFieldRequired,
  isValidOnbDate,
  isValidOnbPhone,
  normaliseOnbDate,
  normaliseOnbPhone,
} from "@/lib/dossier/onboarding-schema";
import { employeeDirectoryDetailsFromOnboarding } from "@/lib/hr/employee-directory";
import { employeeDirectoryReport } from "@/lib/hr/directory";
import { panFromGstin } from "@/lib/hr/vendor-tax";

describe("HR register editors", () => {
  /**
   * WHO MAY EDIT IS A ROLE — isHrStaff (HR staff, or a super-admin), asked by
   * the actions and the pages. It was a list of three addresses until
   * 2026-09-21 (account holder): a role changes on the Employee Master, where
   * a list of people changed in a deploy.
   *
   * Asserted on the SOURCE, because the rule itself now reads the database and
   * this module must stay pure and client-safe.
   */
  it("keeps no list of people, and leaves the question to the role", () => {
    const registers = codeOf("lib/hr/registers.ts");
    expect(registers).not.toMatch(/@unleashed.in|altuscorp@gmail.com/);
    expect(registers).not.toMatch(/EDITOR_EMAILS|canEditHrRegisters/);

    for (const caller of [
      "app/(app)/hr/address-book/actions.ts",
      "app/(app)/hr/assets/actions.ts",
      "app/(app)/operations/directory/actions.ts",
    ]) {
      expect(codeOf(caller)).toContain("await isHrStaff(me)");
    }
  });

  it("governs the Operations Directory by the same role, not by an HR constant", () => {
    const directory = codeOf("lib/operations/directory.ts");
    expect(directory).not.toContain("canEditHrRegisters");
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

describe("onboarding date of birth", () => {
  it("keeps DOB in DD-MMM-YYYY form and validates real calendar dates", () => {
    expect(normaliseOnbDate("05-jan-1998")).toBe("05-Jan-1998");
    expect(isValidOnbDate("29-Feb-2024")).toBe(true);
    expect(isValidOnbDate("29-Feb-2023")).toBe(false);
    expect(isValidOnbDate("1998-01-05")).toBe(false);
  });
});

describe("onboarding phone numbers", () => {
  it("keeps only ten digits and rejects incomplete numbers", () => {
    expect(normaliseOnbPhone("vinbhcuyfv 98765-43210")).toBe("9876543210");
    expect(normaliseOnbPhone("123456789012")).toBe("1234567890");
    expect(isValidOnbPhone("9876543210")).toBe(true);
    expect(isValidOnbPhone("987654321")).toBe(false);
  });
});

describe("employee directory onboarding details", () => {
  it("reads the saved emergency-contact JSON and prioritises onboarding values", () => {
    const details = employeeDirectoryDetailsFromOnboarding(
      {
        firstName: "Test",
        lastName: "User",
        phone: "9876543210",
        emergencyContacts: JSON.stringify([
          { name: "Test Contact One", relation: "Parent", mobile: "9876500001" },
          { name: "Test Contact Two", relation: "Parent", mobile: "9876500002" },
        ]),
      },
      { name: "Legacy Test User", personalEmail: "test.user@example.invalid", email: "test.user@company.example.invalid", phone: "9000000000", whatsappPhone: null },
    );

    expect(details).toMatchObject({
      firstName: "Test",
      lastName: "User",
      cell: "9876543210",
      personalEmail: "test.user@example.invalid",
      contact1Name: "Test Contact One",
      contact1Cell: "9876500001",
      contact2Name: "Test Contact Two",
      contact2Cell: "9876500002",
    });
  });

  it("uses the same requested columns in the employee PDF export", () => {
    const report = employeeDirectoryReport([{
      id: "employee-1", name: "Test User", firstName: "Test", lastName: "User", designation: null,
      cell: "9876543210", email: "test.user@example.invalid", contact1Name: "Test Contact One", contact1Cell: "9876500001",
      contact2Name: "Test Contact Two", contact2Cell: "9876500002", isActive: true,
    }]);
    expect(report.columns.map((column) => column.label)).toEqual(["First Name", "Last Name", "Cell No.", "Personal Email", "Contact 1 Name", "Contact 1 Cell No.", "Contact 2 Name", "Contact 2 Cell No."]);
    expect(report.rows[0]).toEqual(["Test", "User", "9876543210", "test.user@example.invalid", "Test Contact One", "9876500001", "Test Contact Two", "9876500002"]);
  });
});

describe("vendor GST details", () => {
  it("derives PAN automatically from a valid GST number", () => {
    expect(panFromGstin("27ABCDE1234F1Z5")).toBe("ABCDE1234F");
    expect(panFromGstin("27 abcde1234f 1z5")).toBe("ABCDE1234F");
    expect(panFromGstin("27ABCDE1234F")).toBeNull();
  });
});
