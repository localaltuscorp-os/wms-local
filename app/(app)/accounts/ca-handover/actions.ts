"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { caHandoverCredentials, caHandoverReturns } from "@/db/schema";
import { requireAccountsAccess, type AccountsAccess } from "@/lib/accounts/access";
import { encryptSecret, decryptSecret } from "@/lib/accounts/crypto";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CA_PORTAL_TYPES } from "@/lib/queries/accounts-ca";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/accounts/ca-handover";
const UUID = z.string().uuid();

/**
 * Every action in this file is ADMIN-ONLY within the Accounts module. We require
 * module access (admin/manager) and then assert `canViewCaHandover` (admins /
 * super-admins only) — managers are bounced out. The reveal action enforces the
 * same gate before decrypting a single password.
 */
async function requireCaAdmin(): Promise<AccountsAccess | { ok: false; error: string }> {
  const access = await requireAccountsAccess();
  if (!access.canViewCaHandover) {
    return { ok: false, error: "Not authorized to view CA-Handover credentials." };
  }
  return access;
}

// ── Credentials ──────────────────────────────────────────────────────────────

const optStr = z.string().trim().max(2000).optional().nullable();

const CredentialSchema = z.object({
  id: z.string().uuid().optional(),
  portalType: z.enum(CA_PORTAL_TYPES),
  entityName: z.string().trim().min(1, "Entity name is required.").max(200),
  username: z.string().trim().max(200).optional().nullable(),
  /** Write-only: when omitted/blank on edit, the existing password is KEPT. */
  password: z.string().max(1000).optional().nullable(),
  phone: z.string().trim().max(120).optional().nullable(),
  defaultEmail: z.string().trim().max(200).optional().nullable(),
  websiteLink: z.string().trim().max(2000).optional().nullable(),
  emailUpdated: z.boolean().optional(),
  passwordReset: z.boolean().optional(),
  primaryPhoneUpdated: z.boolean().optional(),
  secondaryPhoneUpdated: z.boolean().optional(),
  note: optStr,
  sortOrder: z.number().int().min(0).max(99999).optional(),
});

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").toString().trim();
  return t.length ? t : null;
}

/** Create one credential. Password is encrypted at rest via encryptSecret. */
export async function createCredential(
  input: z.input<typeof CredentialSchema>,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireCaAdmin();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  const parsed = CredentialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid credential." };
  }
  const v = parsed.data;

  try {
    const [row] = await db
      .insert(caHandoverCredentials)
      .values({
        portalType: v.portalType,
        entityName: v.entityName,
        username: clean(v.username),
        passwordEnc: encryptSecret(v.password), // null when blank
        phone: clean(v.phone),
        defaultEmail: clean(v.defaultEmail),
        websiteLink: clean(v.websiteLink),
        emailUpdated: v.emailUpdated ?? false,
        passwordReset: v.passwordReset ?? false,
        primaryPhoneUpdated: v.primaryPhoneUpdated ?? false,
        secondaryPhoneUpdated: v.secondaryPhoneUpdated ?? false,
        note: clean(v.note),
        sortOrder: v.sortOrder ?? 100,
      })
      .returning({ id: caHandoverCredentials.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Update one credential. Re-encrypts the password ONLY when a non-blank value is
 * supplied — a blank/omitted password leaves the stored ciphertext untouched so
 * an edit never silently wipes the password.
 */
export async function updateCredential(
  input: z.input<typeof CredentialSchema>,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireCaAdmin();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  const parsed = CredentialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid credential." };
  }
  const v = parsed.data;
  if (!v.id) return { ok: false, error: "Missing credential id." };

  const set: Partial<typeof caHandoverCredentials.$inferInsert> = {
    portalType: v.portalType,
    entityName: v.entityName,
    username: clean(v.username),
    phone: clean(v.phone),
    defaultEmail: clean(v.defaultEmail),
    websiteLink: clean(v.websiteLink),
    emailUpdated: v.emailUpdated ?? false,
    passwordReset: v.passwordReset ?? false,
    primaryPhoneUpdated: v.primaryPhoneUpdated ?? false,
    secondaryPhoneUpdated: v.secondaryPhoneUpdated ?? false,
    note: clean(v.note),
    sortOrder: v.sortOrder ?? 100,
    updatedAt: new Date(),
  };
  // Only touch passwordEnc when a new password was actually typed.
  const newPw = (v.password ?? "").toString();
  if (newPw.length > 0) set.passwordEnc = encryptSecret(newPw);

  try {
    await db.update(caHandoverCredentials).set(set).where(eq(caHandoverCredentials.id, v.id));
    revalidatePath(PATH);
    return { ok: true, id: v.id };
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Delete one credential. */
export async function deleteCredential(id: string): Promise<ActionResult> {
  const gate = await requireCaAdmin();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid credential." };

  try {
    await db.delete(caHandoverCredentials).where(eq(caHandoverCredentials.id, id));
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Reveal ONE credential's plaintext password. Re-checks the admin gate, rate-
 * limits as a read, fetches only the one ciphertext column, decrypts server-side
 * and returns the single plaintext. No batch decryption ever happens.
 */
export async function revealCredentialPassword(
  id: string,
): Promise<ActionResult<{ password: string }>> {
  const gate = await requireCaAdmin();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "read");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid credential." };

  try {
    const [row] = await db
      .select({ passwordEnc: caHandoverCredentials.passwordEnc })
      .from(caHandoverCredentials)
      .where(eq(caHandoverCredentials.id, id))
      .limit(1);
    if (!row) return { ok: false, error: "Credential not found." };
    if (!row.passwordEnc) return { ok: true, password: "" };
    return { ok: true, password: decryptSecret(row.passwordEnc) };
  } catch (err: unknown) {
    return { ok: false, error: `Could not decrypt: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Returns archive ──────────────────────────────────────────────────────────

const ReturnSchema = z.object({
  id: z.string().uuid().optional(),
  fy: z.string().trim().min(1, "Financial year is required.").max(20),
  entityName: z.string().trim().min(1, "Entity name is required.").max(200),
  // Income-tax document links
  itrV: optStr,
  filedComputation: optStr,
  filedItrForm: optStr,
  balanceSheet: optStr,
  pnl: optStr,
  taxAuditReport: optStr,
  selfAssessmentChallan: optStr,
  form26as: optStr,
  ais: optStr,
  assessmentOrder: optStr,
  refundAsPerReturn: optStr,
  refundReceived: optStr,
  // GST return links
  gstr1: optStr,
  gstr3b: optStr,
  gstr2b: optStr,
  gstWorkingExcel: optStr,
  gstr9: optStr,
  note: optStr,
});

function returnValues(v: z.infer<typeof ReturnSchema>) {
  return {
    fy: v.fy,
    entityName: v.entityName,
    itrV: clean(v.itrV),
    filedComputation: clean(v.filedComputation),
    filedItrForm: clean(v.filedItrForm),
    balanceSheet: clean(v.balanceSheet),
    pnl: clean(v.pnl),
    taxAuditReport: clean(v.taxAuditReport),
    selfAssessmentChallan: clean(v.selfAssessmentChallan),
    form26as: clean(v.form26as),
    ais: clean(v.ais),
    assessmentOrder: clean(v.assessmentOrder),
    refundAsPerReturn: clean(v.refundAsPerReturn),
    refundReceived: clean(v.refundReceived),
    gstr1: clean(v.gstr1),
    gstr3b: clean(v.gstr3b),
    gstr2b: clean(v.gstr2b),
    gstWorkingExcel: clean(v.gstWorkingExcel),
    gstr9: clean(v.gstr9),
    note: clean(v.note),
  };
}

/** Create one FY+entity returns record. */
export async function createReturn(
  input: z.input<typeof ReturnSchema>,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireCaAdmin();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  const parsed = ReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid record." };
  }

  try {
    const [row] = await db
      .insert(caHandoverReturns)
      .values(returnValues(parsed.data))
      .returning({ id: caHandoverReturns.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, error: "A record for that FY + entity already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
}

/** Update one returns record. */
export async function updateReturn(
  input: z.input<typeof ReturnSchema>,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireCaAdmin();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  const parsed = ReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid record." };
  }
  const v = parsed.data;
  if (!v.id) return { ok: false, error: "Missing record id." };

  try {
    await db
      .update(caHandoverReturns)
      .set({ ...returnValues(v), updatedAt: new Date() })
      .where(eq(caHandoverReturns.id, v.id));
    revalidatePath(PATH);
    return { ok: true, id: v.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, error: "A record for that FY + entity already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
}

/** Delete one returns record. */
export async function deleteReturn(id: string): Promise<ActionResult> {
  const gate = await requireCaAdmin();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid record." };

  try {
    await db.delete(caHandoverReturns).where(eq(caHandoverReturns.id, id));
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(PATH);
  return { ok: true };
}
