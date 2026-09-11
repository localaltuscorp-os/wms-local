import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  delegatedAccessEvents,
  delegatedAccessGrants,
  employees,
  type DelegatedAccessGrant,
  type Employee,
} from "@/db/schema";
import { delegatedExpiry, delegationState, isDelegationLive } from "@/lib/auth/delegated-expiry";

/**
 * TEMPORARY DELEGATED ACCESS — the server side.
 *
 * ── THE MECHANISM, IN ONE PARAGRAPH ────────────────────────────────────────
 * A manager creates a grant; the server mints one 256-bit random token, stores
 * only its SHA-256, and hands the token to the delegate. The delegate signs in
 * AS THEMSELVES (their own password, their own Firebase account, their own
 * device) and presents the token in a separate HttpOnly cookie. On every request
 * `resolveDelegation` re-reads the grant row, re-checks the clock and the
 * revocation, and only then does `getCurrentEmployee` answer with the TARGET's
 * row instead of the delegate's.
 *
 * ── WHAT IS DELIBERATELY NOT DONE ──────────────────────────────────────────
 *   · No password is read, copied, reset, or shown. The target's credentials are
 *     not an input to any function in this file.
 *   · No session is minted for the target. The delegate's `__session` cookie
 *     stays their own throughout, which is why expiry returns them cleanly to
 *     their own account instead of logging anybody out.
 *   · Nothing is stored in localStorage and no frontend timer is trusted. The
 *     cookie carries an opaque token and nothing else — not the expiry, not the
 *     target id, not a flag. Every fact about the grant is read from the
 *     database on the server, per request.
 *   · The token is never written to a log, an audit `detail`, or an error.
 *
 * ── WHY IT IS A SECOND COOKIE AND NOT A REPLACEMENT SESSION ────────────────
 * The obvious alternative is to mint the target a session cookie and hand it
 * over. That would be indistinguishable from account sharing: it would survive
 * revocation until it expired on its own, it would leave the delegate's own
 * identity nowhere in the request, and the audit trail would have no way to say
 * who was actually at the keyboard. Keeping the delegate's real session and
 * layering a revocable grant on top means the server always knows both
 * identities — which is exactly what the audit log needs to record.
 */

/**
 * The cookie carrying the opaque grant token.
 *
 * `__Host-`-style hardening is not used because the app is served from a path
 * root behind a proxy and the existing `__session` cookie does not use it
 * either; matching the established cookie shape matters more here than a prefix
 * that would need the whole cookie strategy revisited.
 */
export const DELEGATED_ACCESS_COOKIE = "__delegate";

/** How long the browser is told to keep the cookie, at most. The SERVER expiry
 *  is authoritative; this only stops a dead cookie lingering for weeks. */
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

/** `last_used_at` / `use_count` are bookkeeping, not authorization. Writing them
 *  on literally every request would add a write to the hottest path in the app,
 *  so they are stamped at most once a minute. */
const TOUCH_THROTTLE_MS = 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 256 bits, base64url. Long enough that guessing is not a threat model. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Constant-time comparison of two hex hashes.
 *
 * The lookup is already an indexed equality on `token_hash`, so this is not
 * guarding the lookup — it guards the RE-CHECK after the row is loaded, which
 * exists so that a future refactor introducing a non-exact match (a prefix
 * scan, a cache) cannot quietly become a timing oracle. Cheap insurance on a
 * path that decides who you are.
 */
function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface DelegationContext {
  grantId: string;
  /** The account being acted as. */
  target: Employee;
  /** The REAL signed-in person. Never replaced by the swap. */
  delegateId: string;
  delegateName: string;
  expiresAt: Date;
  startsAt: Date;
  reason: string | null;
}

/**
 * Write one audit row. Never throws: an audit failure must not take down the
 * request that was being audited, and every caller here is on a path where
 * throwing would either block a login or hide a refusal.
 */
export async function logDelegationEvent(input: {
  kind: "granted" | "started" | "expired" | "revoked" | "denied_after_expiry" | "denied";
  grantId?: string | null;
  targetEmployeeId?: string | null;
  delegateEmployeeId?: string | null;
  actorEmployeeId?: string | null;
  detail?: string | null;
  deviceId?: string | null;
}): Promise<void> {
  try {
    await db.insert(delegatedAccessEvents).values({
      kind: input.kind,
      grantId: input.grantId ?? null,
      targetEmployeeId: input.targetEmployeeId ?? null,
      delegateEmployeeId: input.delegateEmployeeId ?? null,
      actorEmployeeId: input.actorEmployeeId ?? null,
      detail: input.detail ?? null,
      deviceId: input.deviceId ?? null,
    });
  } catch (err) {
    console.error("delegated-access: audit write failed", err);
  }
}

/**
 * THE RESOLVER — the one function that decides whether a request is acting as
 * somebody else.
 *
 * Called from `getCurrentEmployee` on every authenticated request, so it is
 * React-`cache()`d exactly as the employee lookup and the device check are: one
 * cookie read and one indexed lookup per REQUEST, reused by the layout, the
 * page and every server action in it.
 *
 * @param delegateId the REAL signed-in employee's id (resolved from the session
 *   cookie before any swap). The grant must have been issued to THEM: a token
 *   presented by anybody else resolves to nothing, so a stolen or shared token
 *   is inert.
 * @returns the delegation context, or null to act as yourself.
 */
export const resolveDelegation = cache(
  async (delegateId: string): Promise<DelegationContext | null> => {
    const jar = await cookies();
    const token = jar.get(DELEGATED_ACCESS_COOKIE)?.value?.trim();
    if (!token) return null;

    const tokenHash = hashToken(token);

    let grant: DelegatedAccessGrant | undefined;
    try {
      [grant] = await db
        .select()
        .from(delegatedAccessGrants)
        .where(
          and(
            eq(delegatedAccessGrants.tokenHash, tokenHash),
            // THE GRANT MUST BELONG TO THE SIGNED-IN PERSON. Part of the WHERE,
            // not a check afterwards, so there is no branch in which a matching
            // token for a different delegate has already been loaded.
            eq(delegatedAccessGrants.delegateEmployeeId, delegateId),
          ),
        )
        .limit(1);
    } catch (err) {
      // A missing table (pre-migration) or a transient read error must not sign
      // anybody out. Failing CLOSED here means "act as yourself", which is the
      // safe direction: the delegation is refused, not the session.
      console.error("delegated-access: grant lookup failed, acting as self", err);
      return null;
    }

    if (!grant) {
      // A token that resolves to nothing. Logged because it is the signature of
      // a replayed or hand-crafted cookie, and because a delegate whose grant
      // was deleted deserves an entry explaining the silence.
      await logDelegationEvent({
        kind: "denied",
        delegateEmployeeId: delegateId,
        actorEmployeeId: delegateId,
        detail: "A delegated-access token was presented that matches no grant for this user.",
      });
      return null;
    }

    // Belt and braces — see `hashesMatch`.
    if (!hashesMatch(grant.tokenHash, tokenHash)) return null;

    const now = new Date();
    if (!isDelegationLive(grant, now)) {
      // ── EXPIRY IS ENFORCED HERE, SERVER-SIDE, ON EVERY REQUEST ───────────
      // The browser may keep the cookie as long as it likes. This is the branch
      // that makes that pointless: the grant is dead, so the request proceeds as
      // the delegate's OWN identity and every protected surface sees them, not
      // the target.
      const state = delegationState(grant, now);
      await logDelegationEvent({
        kind: grant.firstUsedAt ? "denied_after_expiry" : "expired",
        grantId: grant.id,
        targetEmployeeId: grant.targetEmployeeId,
        delegateEmployeeId: grant.delegateEmployeeId,
        actorEmployeeId: delegateId,
        detail:
          state === "revoked"
            ? "Request refused: the grant was revoked."
            : "Request refused: the grant had expired.",
      });
      return null;
    }

    const target = await db.query.employees.findFirst({
      where: eq(employees.id, grant.targetEmployeeId),
    });
    // The target was removed, or is no longer a usable login. Refuse rather than
    // half-impersonate: acting as a deactivated account would put the delegate
    // through login gates the real employee could not pass either.
    if (!target || !target.isActive) {
      await logDelegationEvent({
        kind: "denied",
        grantId: grant.id,
        targetEmployeeId: grant.targetEmployeeId,
        delegateEmployeeId: grant.delegateEmployeeId,
        actorEmployeeId: delegateId,
        detail: "Request refused: the account being tested is no longer active.",
      });
      return null;
    }

    const delegate = await db.query.employees.findFirst({
      where: eq(employees.id, delegateId),
      columns: { name: true },
    });

    // First activation — the "started" event the brief asks for. Stamped inside
    // a conditional UPDATE so two concurrent first requests cannot both log it.
    if (!grant.firstUsedAt) {
      try {
        const [claimed] = await db
          .update(delegatedAccessGrants)
          .set({ firstUsedAt: now, lastUsedAt: now, useCount: 1, updatedAt: now })
          .where(
            and(
              eq(delegatedAccessGrants.id, grant.id),
              isNull(delegatedAccessGrants.firstUsedAt),
            ),
          )
          .returning({ id: delegatedAccessGrants.id });
        if (claimed) {
          await logDelegationEvent({
            kind: "started",
            grantId: grant.id,
            targetEmployeeId: grant.targetEmployeeId,
            delegateEmployeeId: grant.delegateEmployeeId,
            actorEmployeeId: delegateId,
            detail: `${delegate?.name ?? "The delegate"} began acting as ${target.name}.`,
          });
        }
      } catch (err) {
        console.error("delegated-access: could not stamp first use", err);
      }
    } else if (
      !grant.lastUsedAt ||
      now.getTime() - grant.lastUsedAt.getTime() > TOUCH_THROTTLE_MS
    ) {
      // Bookkeeping only, and deliberately not awaited in a way that can fail
      // the request — same pattern as `touchLastSeen` on the device path.
      void db
        .update(delegatedAccessGrants)
        .set({
          lastUsedAt: now,
          useCount: sql`${delegatedAccessGrants.useCount} + 1`,
          updatedAt: now,
        })
        .where(eq(delegatedAccessGrants.id, grant.id))
        .catch((err: unknown) => {
          console.error("delegated-access: touch failed", err);
        });
    }

    return {
      grantId: grant.id,
      target,
      delegateId,
      delegateName: delegate?.name ?? "Unknown",
      expiresAt: grant.expiresAt,
      startsAt: grant.startsAt,
      reason: grant.reason,
    };
  },
);

/* ── Cookie plumbing. Only callable from a Server Action / Route Handler. ─── */

export async function setDelegationCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(DELEGATED_ACCESS_COOKIE, token, {
    httpOnly: true,
    // Never readable by script, and never sent cross-site. `lax` rather than
    // `strict` so following a link into the app keeps the delegation, matching
    // how the main session cookie behaves.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearDelegationCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(DELEGATED_ACCESS_COOKIE);
}

/** Does this request carry a delegation cookie at all? Used by the "you are
 *  acting as…" banner to decide whether to explain a cookie that no longer
 *  resolves, without needing the grant. */
export async function hasDelegationCookie(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(DELEGATED_ACCESS_COOKIE)?.value);
}

/* ── Creating and ending grants. Authorization lives in the caller. ───────── */

export interface CreateGrantInput {
  targetEmployeeId: string;
  delegateEmployeeId: string;
  grantedById: string;
  durationMinutes: number;
  reason?: string | null;
  /** Injected so tests can pin the clock; defaults to now. */
  now?: Date;
}

/**
 * Create a grant and return the ONE-TIME token.
 *
 * The token is returned to the caller and never persisted in plaintext, so it
 * can be shown to the granting manager exactly once. If they lose it, the grant
 * is revoked and a new one issued — there is no "show it again", by design.
 *
 * NOT AN AUTHORIZATION BOUNDARY. Every caller must have already decided that
 * this manager may grant this access; `canGrantDelegatedAccess` is that
 * decision, and the server action enforces it before reaching here.
 */
export async function createDelegatedGrant(
  input: CreateGrantInput,
): Promise<{ ok: true; token: string; grantId: string; expiresAt: Date } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const expiresAt = delegatedExpiry(now, input.durationMinutes);

  // One live grant per delegate. The DB has a partial unique index on
  // (delegate_employee_id) WHERE revoked_at IS NULL as the backstop, but that
  // index cannot see `expires_at`, so an EXPIRED-but-un-revoked grant would
  // block a new one with a raw constraint error. Closing it here keeps the
  // common case working and turns the race into a clean message.
  const [existing] = await db
    .select()
    .from(delegatedAccessGrants)
    .where(
      and(
        eq(delegatedAccessGrants.delegateEmployeeId, input.delegateEmployeeId),
        isNull(delegatedAccessGrants.revokedAt),
      ),
    )
    .orderBy(desc(delegatedAccessGrants.startsAt))
    .limit(1);

  if (existing) {
    if (isDelegationLive(existing, now)) {
      return {
        ok: false,
        error:
          "That person already holds a live temporary access grant. Revoke it before issuing another.",
      };
    }
    // Expired and never revoked: close it out so the unique index is free. This
    // is the only place a grant is auto-revoked, and it is recorded as such.
    await db
      .update(delegatedAccessGrants)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(delegatedAccessGrants.id, existing.id));
    await logDelegationEvent({
      kind: "revoked",
      grantId: existing.id,
      targetEmployeeId: existing.targetEmployeeId,
      delegateEmployeeId: existing.delegateEmployeeId,
      actorEmployeeId: input.grantedById,
      detail: "Closed automatically: the grant had already expired when a new one was issued.",
    });
  }

  const token = mintToken();
  let grantId: string;
  try {
    const [row] = await db
      .insert(delegatedAccessGrants)
      .values({
        targetEmployeeId: input.targetEmployeeId,
        delegateEmployeeId: input.delegateEmployeeId,
        grantedById: input.grantedById,
        reason: input.reason?.trim() || null,
        durationMinutes: input.durationMinutes,
        startsAt: now,
        expiresAt,
        tokenHash: hashToken(token),
      })
      .returning({ id: delegatedAccessGrants.id });
    if (!row) return { ok: false, error: "Could not create the grant." };
    grantId = row.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not create the grant: ${msg}` };
  }

  await logDelegationEvent({
    kind: "granted",
    grantId,
    targetEmployeeId: input.targetEmployeeId,
    delegateEmployeeId: input.delegateEmployeeId,
    actorEmployeeId: input.grantedById,
    detail: `Granted for ${input.durationMinutes} minute(s); expires ${expiresAt.toISOString()}.`,
  });

  return { ok: true, token, grantId, expiresAt };
}

/** End a grant now. Idempotent: revoking an already-revoked grant is a no-op
 *  that reports success, because the caller's intent is already satisfied. */
export async function revokeDelegatedGrant(
  grantId: string,
  revokedById: string,
  detail?: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date();
  const [grant] = await db
    .select()
    .from(delegatedAccessGrants)
    .where(eq(delegatedAccessGrants.id, grantId))
    .limit(1);
  if (!grant) return { ok: false, error: "Grant not found." };
  if (grant.revokedAt) return { ok: true };

  await db
    .update(delegatedAccessGrants)
    .set({ revokedAt: now, revokedById, updatedAt: now })
    .where(eq(delegatedAccessGrants.id, grantId));

  await logDelegationEvent({
    kind: "revoked",
    grantId,
    targetEmployeeId: grant.targetEmployeeId,
    delegateEmployeeId: grant.delegateEmployeeId,
    actorEmployeeId: revokedById,
    detail: detail ?? "Revoked from the Admin Panel.",
  });

  return { ok: true };
}
