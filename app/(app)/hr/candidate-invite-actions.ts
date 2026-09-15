"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { candidateIntake, employees } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { siteUrl } from "@/lib/site-url";
import { issueAccessLink, revokeAccessLinks } from "@/lib/hr/candidate/access-link";
import type { CandidateLinkPurpose } from "@/db/schema";
import { sendCandidateAccessLink } from "@/lib/hr/candidate/access-link-email";

/**
 * PRE-INTERVIEW INVITES — hand an OUTSIDER their own interview form.
 *
 * HR types four things (first name, last name, cell, email). That creates the
 * candidate's intake row and their candidate `employees` row, mints a one-time
 * access link (lib/hr/candidate/access-link.ts) and mails it. The candidate
 * fills the form at /c/<token> with NO login, and the same link keeps working
 * afterwards so they can correct what they submitted.
 *
 * NO FIREBASE USER IS CREATED. That is the entire point of this flow versus
 * `createCandidateAccount`: an applicant should not have to hold credentials on
 * os.altuscorp.in before anyone has decided to hire them. The `employees` row
 * still exists (identity + ownership + audit are unchanged) — it simply has no
 * `firebase_uid`, so it is not sign-in-able at all.
 *
 * The PLAINTEXT TOKEN exists only inside these functions' return values. It is
 * never stored, so "copy the link again" is impossible by construction — the
 * only way to produce a working URL is to mint a fresh one (`resendCandidateFormLink`),
 * which revokes the previous one.
 */

type Result<T> =
  | ({ ok: true } & T)
  /**
   * `needsConfirm` marks the one refusal that is a QUESTION rather than a
   * failure: the address belongs to a candidate whose record was closed. The
   * caller re-submits with `reopenClosed: true` once HR has said yes.
   */
  | { ok: false; error: string; needsConfirm?: boolean };

const UUID = z.string().uuid();

const InviteSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(80),
  lastName: z.string().trim().min(1, "Enter a last name.").max(80),
  // Indian mobile numbers, but kept permissive: HR pastes these from a CV or a
  // WhatsApp chat, so spaces, dashes, +91 and a leading 0 all arrive. Digits are
  // what we validate; the stored value is the cleaned form.
  mobile: z
    .string()
    .trim()
    .min(1, "Enter a cell number.")
    .max(24)
    .refine((v) => {
      const d = v.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 15;
    }, "Enter a valid cell number."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  positionApplied: z.string().trim().max(160).optional(),
});

export interface CandidateInvite {
  intakeId: string;
  /** The full URL to hand over. Shown ONCE — it is not recoverable later. */
  url: string;
  expiresAt: Date;
  /** Set when the link could not be emailed; HR must pass the URL on by hand. */
  warning?: string;
}

function formUrl(token: string): string {
  return `${siteUrl()}/c/${token}`;
}

/**
 * What this invite is FOR (0222). 'form' asks the candidate for their details;
 * 'policies' asks them to read and sign. It decides where `/c/<token>` lands
 * them and which mail they get — and, importantly, re-issuing one does NOT
 * revoke the other, so a candidate part-way through their form does not lose it
 * because HR also sent them the policies.
 */
type Purpose = CandidateLinkPurpose;

/**
 * Create a candidate from their basic details and send them their form link.
 *
 * Idempotent-ish on email: re-inviting an address that is already a candidate
 * re-issues a link for THAT existing record rather than creating a second one,
 * because HR re-typing the same person is a normal mistake and two half-filled
 * records for one applicant is a much worse outcome than a re-sent link. A real
 * employee's address is refused outright.
 */
export async function inviteCandidateByLink(input: {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  positionApplied?: string;
  /**
   * Set only after HR has been ASKED. Re-opening a closed candidate is a
   * hiring decision, and it must not be reachable by typing an address.
   */
  reopenClosed?: boolean;
  /** 'form' (default) or 'policies' — which errand this link is for. */
  purpose?: Purpose;
}): Promise<Result<CandidateInvite>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const { firstName, lastName, email, positionApplied } = parsed.data;
  const purpose: Purpose = input.purpose === "policies" ? "policies" : "form";
  const mobile = parsed.data.mobile.replace(/[^\d+]/g, "");
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  // A super-admin address must never be turned into a candidate (priv-esc guard,
  // same as createCandidateAccount).
  if (isSuperAdmin(email)) return { ok: false, error: "This email can't be used for a candidate." };

  const existing = await db.query.employees.findFirst({
    where: sql`lower(${employees.email}) = ${email}`,
  });
  if (existing && existing.accountType !== "candidate") {
    return { ok: false, error: "That email belongs to an employee account." };
  }
  if (existing && !existing.candidateIntakeId) {
    // A candidate row with no intake link can't be re-used — it has no form to
    // open — and its email is taken, so a new row can't be inserted either.
    return { ok: false, error: "A candidate account with this email already exists." };
  }

  // ── Re-invite path: reuse the existing candidate + their intake row ──
  if (existing?.candidateIntakeId) {
    // A CLOSED RECORD IS NOT REOPENED BY TYPING AN ADDRESS. `candidateActive`
    // goes false when an applicant is rejected, withdraws, or is otherwise
    // finished with — a decision somebody made. Silently flipping it back
    // because HR typed a matching email hands that person access to their
    // record again with nobody having chosen it, and HR would not even learn
    // it happened: from this screen it looks identical to inviting a new
    // candidate. So we stop and ask; `reopenClosed` comes back only from a
    // human answering the question.
    if (!existing.candidateActive && !input.reopenClosed) {
      return {
        ok: false,
        needsConfirm: true,
        error:
          "This email belongs to a candidate whose record was closed. Sending a new link will reopen it and give them access to their form again.",
      };
    }
    if (!existing.candidateActive) {
      await db
        .update(employees)
        .set({ candidateActive: true, deactivatedAt: null })
        .where(eq(employees.id, existing.id));
    }
    return issueAndMail(existing.candidateIntakeId, me.id, purpose);
  }

  // ── New candidate ──
  // Pre-fill the four answers HR just typed, using the SAME value keys the
  // wizard reads (`sectionId.fieldKey`) — so the candidate opens the form with
  // their name, cell and email already in place instead of retyping them.
  const values: Record<string, string> = {
    "personal.fullName": fullName,
    "personal.mobile": mobile,
    "personal.email": email,
  };
  if (positionApplied) values["personal.position"] = positionApplied;

  let intakeId: string;
  try {
    const [row] = await db
      .insert(candidateIntake)
      .values({
        fullName,
        email,
        mobile,
        positionApplied: positionApplied ?? null,
        data: values,
        createdById: me.id,
      })
      .returning({ id: candidateIntake.id });
    if (!row) throw new Error("intake insert returned no row");
    intakeId = row.id;
  } catch (err) {
    return { ok: false, error: `Could not create the candidate: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    // is_active=false is enforced by the DB CHECK for candidates; candidateActive
    // is the liveness flag resolveAccessLink() re-reads on every request.
    const [emp] = await db
      .insert(employees)
      .values({
        name: fullName,
        email,
        role: "doer", // inert filler — a candidate never reaches role-driven surfaces
        isAdmin: false,
        isActive: false,
        accountType: "candidate",
        candidateActive: true,
        candidateIntakeId: intakeId,
        personalEmail: email,
        invitedAt: new Date(),
      })
      .returning({ id: employees.id });
    if (!emp) throw new Error("insert returned no row");
  } catch (err) {
    // Roll the intake row back — a candidate with no employees row has no
    // resolvable link, so leaving it behind just litters the records table.
    await db.delete(candidateIntake).where(eq(candidateIntake.id, intakeId)).catch(() => {});
    const e = err as { code?: string; message?: string };
    if (e?.code === "23505") return { ok: false, error: "An account with this email already exists." };
    return { ok: false, error: `Could not create the candidate: ${e?.message ?? String(err)}` };
  }

  return issueAndMail(intakeId, me.id, purpose);
}

/**
 * Mint + mail one link, and shape the show-once result.
 *
 * The mailer takes the INTAKE ID, not an address: it reads the destination off
 * the candidate's own row, so no caller here can redirect somebody's link.
 */
async function issueAndMail(
  intakeId: string,
  createdById: string,
  purpose: Purpose = "form",
): Promise<Result<CandidateInvite>> {
  const { token, expiresAt } = await issueAccessLink(intakeId, createdById, { purpose });
  const url = formUrl(token);

  const mailed = await sendCandidateAccessLink(intakeId, token, expiresAt, purpose).catch(() => false);

  revalidatePath("/hr/candidates");
  revalidatePath("/hr/pre-interview/basic-details");
  return {
    ok: true,
    intakeId,
    url,
    expiresAt,
    warning: mailed ? undefined : "Couldn't email the candidate — copy the link below and send it to them yourself.",
  };
}

/**
 * Mint a FRESH link for an existing candidate (the "resend / copy link" control).
 * This revokes the previous one: one candidate, one live URL.
 */
export async function resendCandidateFormLink(
  intakeId: string,
  purpose: Purpose = "form",
): Promise<Result<CandidateInvite>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.safeParse(intakeId).success) return { ok: false, error: "Invalid candidate." };

  const [row] = await db
    .select({ email: candidateIntake.email })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, intakeId))
    .limit(1);
  if (!row) return { ok: false, error: "Candidate not found." };
  if (!row.email) return { ok: false, error: "This candidate has no email on file." };

  // The link resolves through the candidate's employees row, so a candidate
  // created before this flow (or one that was deactivated) needs that row live
  // again — otherwise we'd hand out a URL that resolves to nothing.
  const emp = await db.query.employees.findFirst({
    where: eq(employees.candidateIntakeId, intakeId),
  });
  if (!emp) return { ok: false, error: "This candidate has no record to open — create them again." };

  // Unlike the invite dialog, this control was clicked on ONE named candidate's
  // own row, so the intent is unambiguous and we do not stop to ask. HR is still
  // told, because "send them their link again" and "reopen a closed applicant"
  // are different acts and the second one should never pass unremarked.
  const reopened = !emp.candidateActive;
  if (reopened) {
    await db
      .update(employees)
      .set({ candidateActive: true, deactivatedAt: null })
      .where(eq(employees.id, emp.id));
  }

  const res = await issueAndMail(intakeId, me.id, purpose);
  if (res.ok && reopened) {
    return {
      ...res,
      warning: [res.warning, "This candidate's record was closed — sending the link has reopened it."]
        .filter(Boolean)
        .join(" "),
    };
  }
  return res;
}

/** Cut off a candidate's link immediately (kept as a row for the audit trail). */
export async function revokeCandidateFormLink(
  intakeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.safeParse(intakeId).success) return { ok: false, error: "Invalid candidate." };
  await revokeAccessLinks(intakeId);
  revalidatePath("/hr/candidates");
  return { ok: true };
}
