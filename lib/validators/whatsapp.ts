import { z } from "zod";

/**
 * E.164 phone-number schema used by WhatsApp Cloud API.
 * - Must start with `+`.
 * - First digit after `+` is 1–9 (no leading zero).
 * - Total digits after `+` must be 1–15 (per ITU E.164).
 * - No spaces, dashes, or parentheses.
 */
export const WhatsAppPhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Must be E.164 (e.g. +919820062511)");

export function isValidWhatsAppPhone(s: string): boolean {
  return WhatsAppPhoneSchema.safeParse(s).success;
}
