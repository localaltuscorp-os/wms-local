import { describe, it, expect } from "vitest";
import { UpdateOrgSettingsSchema } from "@/lib/validators/org-settings";

describe("UpdateOrgSettingsSchema", () => {
  it("accepts a valid single-field patch", () => {
    const res = UpdateOrgSettingsSchema.safeParse({
      companyName: "Altus Corp",
    });
    expect(res.success).toBe(true);
  });

  it("accepts a full patch", () => {
    const res = UpdateOrgSettingsSchema.safeParse({
      companyName: "Altus Corp",
      logoUrl: "https://example.com/logo.png",
      digestHourIst: 9,
      workingDays: [1, 2, 3, 4, 5],
      timezone: "Asia/Kolkata",
      allowSelfRegister: false,
    });
    expect(res.success).toBe(true);
  });

  it("rejects an empty patch", () => {
    const res = UpdateOrgSettingsSchema.safeParse({});
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("No changes to save.");
    }
  });

  it("rejects unknown keys (strict)", () => {
    const res = UpdateOrgSettingsSchema.safeParse({
      companyName: "Altus Corp",
      bogus: "value",
    });
    expect(res.success).toBe(false);
  });

  it("rejects digest hour outside 0-23", () => {
    expect(
      UpdateOrgSettingsSchema.safeParse({ digestHourIst: 24 }).success,
    ).toBe(false);
    expect(
      UpdateOrgSettingsSchema.safeParse({ digestHourIst: -1 }).success,
    ).toBe(false);
    expect(
      UpdateOrgSettingsSchema.safeParse({ digestHourIst: 0 }).success,
    ).toBe(true);
    expect(
      UpdateOrgSettingsSchema.safeParse({ digestHourIst: 23 }).success,
    ).toBe(true);
  });

  it("rejects empty working-days array", () => {
    const res = UpdateOrgSettingsSchema.safeParse({ workingDays: [] });
    expect(res.success).toBe(false);
  });

  it("rejects working day outside 0-6", () => {
    const res = UpdateOrgSettingsSchema.safeParse({ workingDays: [1, 7] });
    expect(res.success).toBe(false);
  });

  it("accepts a single working day", () => {
    const res = UpdateOrgSettingsSchema.safeParse({ workingDays: [3] });
    expect(res.success).toBe(true);
  });

  it("treats empty logoUrl as a clear-the-field signal", () => {
    // The validator allows empty string; the action normalises it to null.
    const res = UpdateOrgSettingsSchema.safeParse({ logoUrl: "" });
    expect(res.success).toBe(true);
  });

  it("rejects malformed logoUrl", () => {
    const res = UpdateOrgSettingsSchema.safeParse({ logoUrl: "not a url" });
    expect(res.success).toBe(false);
  });

  it("rejects malformed timezone", () => {
    const res = UpdateOrgSettingsSchema.safeParse({ timezone: "" });
    expect(res.success).toBe(false);
    // Spaces/special chars not in [A-Za-z0-9+\-_/]
    expect(
      UpdateOrgSettingsSchema.safeParse({ timezone: "Asia / Kolkata" })
        .success,
    ).toBe(false);
  });

  it("accepts canonical IANA timezones", () => {
    expect(
      UpdateOrgSettingsSchema.safeParse({ timezone: "Asia/Kolkata" }).success,
    ).toBe(true);
    expect(
      UpdateOrgSettingsSchema.safeParse({ timezone: "America/Los_Angeles" })
        .success,
    ).toBe(true);
    expect(
      UpdateOrgSettingsSchema.safeParse({ timezone: "UTC" }).success,
    ).toBe(true);
  });
});

describe("idleTimeoutMinutes", () => {
  it("accepts 5–60", () => {
    expect(UpdateOrgSettingsSchema.safeParse({ idleTimeoutMinutes: 5 }).success).toBe(true);
    expect(UpdateOrgSettingsSchema.safeParse({ idleTimeoutMinutes: 60 }).success).toBe(true);
    expect(UpdateOrgSettingsSchema.safeParse({ idleTimeoutMinutes: 30 }).success).toBe(true);
  });
  it("rejects < 5 and > 60", () => {
    expect(UpdateOrgSettingsSchema.safeParse({ idleTimeoutMinutes: 4 }).success).toBe(false);
    expect(UpdateOrgSettingsSchema.safeParse({ idleTimeoutMinutes: 61 }).success).toBe(false);
  });
  it("rejects non-integer", () => {
    expect(UpdateOrgSettingsSchema.safeParse({ idleTimeoutMinutes: 10.5 }).success).toBe(false);
  });
});
