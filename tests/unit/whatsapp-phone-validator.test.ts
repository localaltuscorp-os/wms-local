import { describe, it, expect } from "vitest";
import {
  WhatsAppPhoneSchema,
  isValidWhatsAppPhone,
} from "@/lib/validators/whatsapp";

describe("WhatsAppPhoneSchema", () => {
  it.each([
    "+919820062511",
    "+14155552671",
    "+442071234567",
  ])("accepts %s", (n) => {
    expect(WhatsAppPhoneSchema.safeParse(n).success).toBe(true);
  });

  it.each([
    "919820062511", // no +
    "+0820062511", // leading 0 after +
    "+91 9820062511", // whitespace
    "9820062511", // no country code
    "",
    "+1234567890123456", // too long (>15 digits)
  ])("rejects %s", (n) => {
    expect(WhatsAppPhoneSchema.safeParse(n).success).toBe(false);
  });
});

describe("isValidWhatsAppPhone", () => {
  it("returns boolean", () => {
    expect(isValidWhatsAppPhone("+919820062511")).toBe(true);
    expect(isValidWhatsAppPhone("nope")).toBe(false);
  });
});
