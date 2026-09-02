import { z } from "zod";
import { STAGES } from "@/lib/ambassadors/stages";

/** Trim + treat empty string as undefined (forms post "" for blank fields). */
const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  });

const optionalUuid = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  })
  .refine((v) => v == null || /^[0-9a-f-]{36}$/i.test(v), "Invalid id");

const optionalNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[,₹\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  });

const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s; // YYYY-MM-DD
  });

export const AmbassadorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  company: optionalText,
  email: optionalText,
  phone: optionalText,
  photoUrl: optionalText,
  ownerId: optionalUuid,
  status: z.enum(["active", "paused", "archived"]).default("active"),
  payoutType: z.enum(["percent", "flat"]).default("percent"),
  payoutValue: optionalNumber,
  payoutTermsNotes: optionalText,
  monthlyTarget: optionalNumber,
  monthlyTargetCount: optionalNumber,
  joinedOn: optionalDate,
  source: optionalText,
  productIds: z.array(z.string()).default([]),
});
export type AmbassadorInput = z.infer<typeof AmbassadorSchema>;

export const ReferralSchema = z.object({
  ambassadorId: z.string().min(1),
  prospectName: z.string().trim().min(1, "Prospect name is required").max(160),
  prospectCompany: optionalText,
  prospectPhone: optionalText,
  prospectEmail: optionalText,
  prospectNotes: optionalText,
  receivedOn: optionalDate,
  stage: z.enum(STAGES).default("received"),
  assignedToId: optionalUuid,
  productId: optionalUuid,
  dealAmount: optionalNumber,
  expectedClose: optionalDate,
  commissionOverride: optionalNumber,
});
export type ReferralInput = z.infer<typeof ReferralSchema>;

export const PayoutSchema = z.object({
  ambassadorId: z.string().min(1),
  amount: optionalNumber,
  paidOn: optionalDate,
  method: optionalText,
  reference: optionalText,
  note: optionalText,
  referralIds: z.array(z.string()).default([]),
});
export type PayoutInput = z.infer<typeof PayoutSchema>;

export const ActivitySchema = z.object({
  ambassadorId: z.string().min(1),
  referralId: optionalUuid,
  type: z.enum(["note", "call", "meeting", "email", "whatsapp"]).default("note"),
  title: optionalText,
  body: optionalText,
  occurredAt: optionalText, // ISO; null → now
  remindAt: optionalText, // ISO; null → not a reminder
});
export type ActivityInput = z.infer<typeof ActivitySchema>;
