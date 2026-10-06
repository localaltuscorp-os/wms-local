import { describe, expect, it } from "vitest";
import {
  ONB_ALL_FIELDS,
  countCompleteRepeaterRows,
  isRepeaterRowComplete,
  normaliseRepeaterValue,
  parseRepeaterRows,
} from "@/lib/dossier/onboarding-schema";

const emergency = ONB_ALL_FIELDS.find((field) => field.key === "emergencyContacts");

if (!emergency) throw new Error("Emergency Contacts field is missing from onboarding schema.");

describe("onboarding emergency contacts", () => {
  it("keeps only digits and caps a phone value at ten digits", () => {
    const rows = parseRepeaterRows(normaliseRepeaterValue(emergency, JSON.stringify([
      { name: "Emergency Contact", relation: "Parent", mobile: "98ab76 54321099" },
    ])));

    expect(rows[0]?.mobile).toBe("9876543210");
  });

  it("does not treat a short phone number as a complete emergency contact", () => {
    const row = { name: "Emergency Contact", relation: "Parent", mobile: "987654321" };

    expect(isRepeaterRowComplete(emergency, row)).toBe(false);
    expect(countCompleteRepeaterRows(emergency, JSON.stringify([row]))).toBe(0);
  });

  it("accepts a complete row only with a ten-digit mobile number", () => {
    const row = { name: "Emergency Contact", relation: "Parent", mobile: "9876543210" };

    expect(isRepeaterRowComplete(emergency, row)).toBe(true);
    expect(countCompleteRepeaterRows(emergency, JSON.stringify([row]))).toBe(1);
  });
});
