"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { delegatedAccessGrants } from "@/db/schema";
import { requireUser, getSignedInEmployee, forbiddenError } from "@/lib/auth/current";
import {
  createDelegatedGrant,
  revokeDelegatedGrant,
  setDelegationCookie,
  clearDelegationCookie,
  logDelegationEvent,
} from "@/lib/auth/delegated-access";
import {
  checkDelegationGrant,
  canOpenDelegatedAccess,
  DELEGATION_REFUSAL_MESSAGES,
} from "@/lib/auth/delegation-permission";
import {
  isValidDelegatedDuration,
  delegatedExpiry,
  delegatedExpiryBasis,
  isDelegationLive,
} from "@/lib/auth/delegated-expiry";
import { canGrantAnyDelegatedAccess } from "@/lib/security/capabilities";
import { rateLimitOrError } from "@/lib/rate-limit";

/**
 * TEMPORARY DELEGATED ACCESS — the server actions.
 *
 * ── EVERY ONE OF THESE RE-AUTHORISES ───────────────────────────────────────
 * The screen only offers choices that will pass, but the screen is not the
 * boundary: a server action is an HTTP endpoint, and it is reachable with any
 * arguments by anyone signed in. So each action below resolves the caller from
 * the session, re-runs `checkDelegationGrant` against the ids it was handed, and
 * refuses on its own account. Nothing trusts an id because a form sent it.
 *
 * ── THE ACTOR IS THE REAL PERSON, NOT THE EFFECTIVE ONE ────────────────────
 * These actions use `getSignedInEmployee()` rather than `getCurrentEmployee()`
 * wherever they record or authorise. Under an active delegation the latter is
 * the account being TESTED, and letting a delegated session grant further access
 * — or appear in the audit log as the person whose account it borrowed — would
 * make the trail unreadable at exactly the moment somebody needs to read it.
 */

const PATH = "/admin/temporary-access";
const UuidSchema = z.string().uuid();

const GrantSchema = z
  .object({
    targetEmployeeId: UuidSchema,
    delegateEmployeeId: UuidSchema,
    durationMinutes: z.number().int(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type GrantInput = z.infer<typeof GrantSchema>;

export type GrantResult =
  | {
      ok: true;
      /**
       * THE ONE-TIME TOKEN. Returned to the granting manager and never stored in
       * plaintext, so this is the only moment it exists outside the delegate's
       * cookie. If it is lost the grant is revoked and a new one issued.
       */
      token: string;
      grantId: string;
      expiresAt: string;
      expiryBasis: "selected_duration" | "evening_floor";
    }
  | { ok: false; error: string };

/**
 * GRANT temporary access.
 *
 * The manager picks the employee whose account is to be tested, the person who
 * will test it, and a duration. Expiry is computed server-side by
 * `delegatedExpiry` — `max(start + duration, 20:30 IST)` — and stored; the
 * duration the manager chose is stored beside it so the audit screen can show
 * which of the two decided the end time.
 */
export async function grantTemporaryAccess(input: GrantInput): Promise<GrantResult> {
  // requireUser applies the device check and the candidate fork; the identity we
  // then act and audit as is the REAL signed-in person.
  await requireUser();
  const me = await getSignedInEmployee();
  if (!me) throw forbiddenError();

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  // May they open this at all? Checked before the field validation so an
  // unauthorised caller learns nothing about which arguments would have been
  // valid.
  if (!(await canOpenDelegatedAccess(me))) {
    return { ok: false, error: DELEGATION_REFUSAL_MESSAGES.not_authorized };
  }

  const parsed = GrantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { targetEmployeeId, delegateEmployeeId, durationMinutes, reason } = parsed.data;

  if (!isValidDelegatedDuration(durationMinutes)) {
    return { ok: false, error: "Choose a duration between 1 minute and 24 hours." };
  }

  const check = await checkDelegationGrant(me, targetEmployeeId, delegateEmployeeId);
  if (!check.ok) {
    // A refused attempt is logged. Someone probing which accounts they can
    // borrow is exactly what this trail is for, and the refusal reason is not
    // secret — it is on the screen they were just refused by.
    await logDelegationEvent({
      kind: "denied",
      targetEmployeeId,
      delegateEmployeeId,
      actorEmployeeId: me.id,
      detail: `Grant refused: ${check.refusal}.`,
    });
    return {
      ok: false,
      error: DELEGATION_REFUSAL_MESSAGES[check.refusal ?? "not_authorized"],
    };
  }

  const now = new Date();
  const created = await createDelegatedGrant({
    targetEmployeeId,
    delegateEmployeeId,
    grantedById: me.id,
    durationMinutes,
    reason: reason ?? null,
    now,
  });
  if (!created.ok) return { ok: false, error: created.error };

  revalidatePath(PATH);
  return {
    ok: true,
    token: created.token,
    grantId: created.grantId,
    expiresAt: delegatedExpiry(now, durationMinutes).toISOString(),
    expiryBasis: delegatedExpiryBasis(now, durationMinutes),
  };
}

/**
 * REVOKE a grant, ending it immediately.
 *
 * Allowed for the manager who granted it, for anyone who could have granted it
 * over that target, and for a `grant_any` holder. Deliberately WIDER than
 * granting: the cost of a revocation somebody did not strictly need to make is
 * that a test session ends early, while the cost of a revocation being
 * impossible is that access nobody wants continues until its timer runs out.
 */
export async function revokeTemporaryAccess(
  grantId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const me = await getSignedInEmployee();
  if (!me) throw forbiddenError();

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  if (!UuidSchema.safeParse(grantId).success) return { ok: false, error: "Invalid id" };

  const [grant] = await db
    .select({
      id: delegatedAccessGrants.id,
      grantedById: delegatedAccessGrants.grantedById,
      targetEmployeeId: delegatedAccessGrants.targetEmployeeId,
      delegateEmployeeId: delegatedAccessGrants.delegateEmployeeId,
    })
    .from(delegatedAccessGrants)
    .where(eq(delegatedAccessGrants.id, grantId))
    .limit(1);
  if (!grant) return { ok: false, error: "Grant not found." };

  const mayRevoke =
    grant.grantedById === me.id ||
    canGrantAnyDelegatedAccess(me.email) ||
    // The delegate may always hand the access back. They are the person holding
    // it, and a "give this back" that needed a manager's attention would leave
    // borrowed access sitting open because nobody was around to end it.
    grant.delegateEmployeeId === me.id ||
    (await checkDelegationGrant(me, grant.targetEmployeeId, grant.delegateEmployeeId)).ok;

  if (!mayRevoke) {
    await logDelegationEvent({
      kind: "denied",
      grantId,
      targetEmployeeId: grant.targetEmployeeId,
      delegateEmployeeId: grant.delegateEmployeeId,
      actorEmployeeId: me.id,
      detail: "Revocation refused: not authorized over this grant.",
    });
    return { ok: false, error: "You are not authorized to revoke that grant." };
  }

  const res = await revokeDelegatedGrant(
    grantId,
    me.id,
    grant.delegateEmployeeId === me.id
      ? "Handed back by the person holding the access."
      : "Revoked from the Admin Panel.",
  );
  revalidatePath(PATH);
  return res;
}

/**
 * ACTIVATE a grant on THIS browser — the delegate pastes their token here.
 *
 * ── WHY THE DELEGATE ACTIVATES IT RATHER THAN THE MANAGER ──────────────────
 * A cookie can only be set on the browser making the request, and the browser
 * that must carry it is the delegate's. The manager's session is the wrong one:
 * setting it there would put the manager into the tested account, on the
 * manager's laptop, which is neither what they asked for nor what the audit
 * trail would then describe.
 *
 * So the manager hands over the token out of band and the delegate redeems it
 * here. The token is not sufficient on its own — the grant is bound to the
 * delegate's employee id, so anybody else who redeems it gets nothing.
 */
export async function activateTemporaryAccess(
  token: string,
): Promise<{ ok: boolean; error?: string; targetName?: string }> {
  await requireUser();
  const me = await getSignedInEmployee();
  if (!me) throw forbiddenError();

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = token.trim();
  if (!clean) return { ok: false, error: "Paste the access token you were given." };

  // The token is hashed and matched inside `lib/auth/delegated-access`, and the
  // lookup is scoped to this employee id there. We set the cookie first and let
  // the resolver be the single authority on whether it is usable — there is no
  // second place that decides what a token means.
  await setDelegationCookie(clean);

  // Confirm it actually resolves, so a mistyped token produces a message now
  // rather than a silently inert cookie the person then wonders about.
  const { resolveDelegation } = await import("@/lib/auth/delegated-access");
  const ctx = await resolveDelegation(me.id);
  if (!ctx) {
    await clearDelegationCookie();
    return {
      ok: false,
      error:
        "That token is not valid for your account, or the grant has already expired or been revoked.",
    };
  }
  if (!isDelegationLive({ expiresAt: ctx.expiresAt, revokedAt: null }, new Date())) {
    await clearDelegationCookie();
    return { ok: false, error: "That grant has expired." };
  }

  return { ok: true, targetName: ctx.target.name };
}

/** END the delegation on this browser and go back to being yourself. Always
 *  available, needs no authorization: giving up borrowed access is not a
 *  privileged act. */
export async function endTemporaryAccess(): Promise<{ ok: true }> {
  const me = await getSignedInEmployee();
  await clearDelegationCookie();
  if (me) {
    await logDelegationEvent({
      kind: "revoked",
      delegateEmployeeId: me.id,
      actorEmployeeId: me.id,
      detail: "The delegate ended the session from their own browser.",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
