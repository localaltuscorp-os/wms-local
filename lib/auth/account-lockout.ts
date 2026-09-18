import "server-only";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailHoldsAccountUnlock } from "@/lib/auth/security-roles";
import { accountLockouts, employees, loginAttemptIps } from "@/db/schema";
import {
  FAILED_ATTEMPT_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
  remainingAttempts,
} from "@/lib/auth/unlock-permission";

/**
 * Account lockout — the state machine behind "five wrong passwords locks you
 * out, and only four people can let you back in".
 *
 * SERVER-ONLY, AND THAT IS THE WHOLE POINT. An earlier design had the browser
 * report its own failed attempts to an endpoint. That counts honest users and
 * nobody else: the Firebase web API key ships in the page, so anyone who does
 * not wish to be counted can call Firebase's REST API directly and brute-force
 * without ever touching our server. A counter the person being counted can
 * decline to increment is not a control. These functions are therefore reached
 * ONLY from the server-side sign-in route, which holds the credential exchange.
 *
 * REACHED FROM app/api/auth/login/route.ts (the server-side credential
 * exchange) and from the Forgot Password guard. Who may release a lock is the
 * `account_unlock` role — the four addresses named in lib/auth/unlock-permission.ts
 * plus anyone granted it since (lib/auth/security-roles.ts, migration 0238).
 */

/** What the sign-in route needs to know before it decides what to say. */
export interface LockoutState {
  email: string;
  locked: boolean;
  failedCount: number;
  /** Attempts left before locking. 0 once locked. */
  remaining: number;
  lockedAt: Date | null;
}

const UNLOCKED: Omit<LockoutState, "email"> = {
  locked: false,
  failedCount: 0,
  remaining: MAX_FAILED_ATTEMPTS,
  lockedAt: null,
};

/** One spelling of an address, everywhere. */
function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Has the counting window lapsed?
 *
 * "Consecutive" in the requirement is handled by `clearFailedAttempts` on the
 * success path — a successful sign-in zeroes the count. This is the separate
 * question of whether five failures spread over months should still lock. They
 * should not: a mistyped password in January must not contribute to a lockout in
 * March.
 */
function windowLapsed(lastFailedAt: Date | null): boolean {
  if (!lastFailedAt) return true;
  return Date.now() - lastFailedAt.getTime() > FAILED_ATTEMPT_WINDOW_MS;
}

/**
 * Current state for an address, without writing anything.
 *
 * Called before the credential check so a locked account is refused WITHOUT
 * asking Firebase — a locked account must not have its password verified at all,
 * or a correct password still reveals itself through timing.
 */
export async function getLockoutState(emailInput: string): Promise<LockoutState> {
  const email = normalise(emailInput);
  // Holders of the `account_unlock` role are never locked — the four named in
  // code, plus anyone they have since granted it to (migration 0238). If every
  // holder could be locked, five wrong passwords against each would leave
  // nobody able to release anybody.
  if (await emailHoldsAccountUnlock(email)) return { email, ...UNLOCKED };

  const [row] = await db
    .select()
    .from(accountLockouts)
    .where(eq(accountLockouts.email, email))
    .limit(1);

  if (!row) return { email, ...UNLOCKED };

  if (row.lockedAt) {
    return { email, locked: true, failedCount: row.failedCount, remaining: 0, lockedAt: row.lockedAt };
  }

  // An expired window reads as a clean slate. The row is not rewritten here —
  // this function does not write — so the stale count is corrected on the next
  // failure, or left harmlessly in place if the person simply signs in.
  const failedCount = windowLapsed(row.lastFailedAt) ? 0 : row.failedCount;
  return {
    email,
    locked: false,
    failedCount,
    remaining: remainingAttempts(failedCount),
    lockedAt: null,
  };
}

/** Convenience for the Forgot Password guard, which needs only the verdict. */
export async function isAccountLocked(emailInput: string): Promise<boolean> {
  return (await getLockoutState(emailInput)).locked;
}

/**
 * Record one failed sign-in, and lock the account if that was the fifth.
 *
 * Returns the state AFTER the failure, so the caller can render the countdown
 * without a second read.
 *
 * ONE STATEMENT, NOT read-then-write. Two parallel sign-in attempts would
 * otherwise both read "3" and both write "4", losing a failure — the exact hole
 * a brute-force script widens by running requests concurrently. The upsert makes
 * the increment atomic, and the lock decision is taken from the value Postgres
 * actually stored.
 */
export async function recordFailedAttempt(
  emailInput: string,
  opts: { ip?: string | null; employeeId?: string | null } = {},
): Promise<LockoutState> {
  const email = normalise(emailInput);

  // The four who can unlock are never locked: if all of them were locked at
  // once — and their addresses are guessable — nobody could release anybody.
  // See lib/auth/security-roles.ts for the trade-off.
  if (await emailHoldsAccountUnlock(email)) {
    if (opts.ip) await recordIpFailure(opts.ip);
    return { email, ...UNLOCKED };
  }

  if (opts.ip) await recordIpFailure(opts.ip);

  const now = new Date();

  // THE WINDOW IS COMPUTED BY POSTGRES, NOT HERE.
  //
  // This used to interpolate a JS `Date` into the fragments below, and every
  // single write failed with the driver's own complaint — "the string argument
  // must be of type string … Received an instance of Date" — because a value
  // embedded in a raw fragment carries no column type to map it by. The counter
  // therefore counted nothing: each failure was logged and swallowed, and no
  // account could ever reach five. Letting the database do the arithmetic also
  // removes any clock skew between the app server and the database.
  const outsideWindow = () =>
    sql`${accountLockouts.lastFailedAt} is null
        or ${accountLockouts.lastFailedAt} < now() - ${sql.raw(`interval '${FAILED_ATTEMPT_WINDOW_MS} milliseconds'`)}`;

  const [row] = await db
    .insert(accountLockouts)
    .values({
      email,
      failedCount: 1,
      lastFailedAt: now,
      employeeId: opts.employeeId ?? null,
    })
    .onConflictDoUpdate({
      target: accountLockouts.email,
      set: {
        // Restart the count when the previous failure fell outside the window,
        // otherwise add to it. Evaluated by Postgres against the stored row, so
        // concurrent attempts cannot both read the same starting value.
        failedCount: sql`case
          when ${outsideWindow()}
          then 1
          else ${accountLockouts.failedCount} + 1
        end`,
        lastFailedAt: now,
        // Lock on reaching the threshold, and never move an existing lockedAt —
        // further failures against an already-locked account must not keep
        // refreshing the timestamp, or "locked since" becomes meaningless.
        lockedAt: sql`case
          when ${accountLockouts.lockedAt} is not null then ${accountLockouts.lockedAt}
          when (case
                  when ${outsideWindow()}
                  then 1
                  else ${accountLockouts.failedCount} + 1
                end) >= ${MAX_FAILED_ATTEMPTS}
          then now()
          else null
        end`,
        employeeId: sql`coalesce(${accountLockouts.employeeId}, cast(${opts.employeeId ?? null} as uuid))`,
        updatedAt: now,
      },
    })
    .returning();

  // An upsert with RETURNING always yields the row it wrote, so this cannot
  // happen — but the driver's type says it might, and a silent `!` here would
  // turn a future schema change (a trigger that suppresses the write, say) into
  // an unexplained crash on the login path. Fail loudly instead: the caller
  // treats a thrown error as "sign-in unavailable", which is the correct and
  // safe reading. It must never be read as "attempt not counted".
  if (!row) {
    throw new Error(`account_lockouts upsert returned no row for ${email}`);
  }

  return {
    email,
    locked: row.lockedAt !== null,
    failedCount: row.failedCount,
    remaining: row.lockedAt ? 0 : remainingAttempts(row.failedCount),
    lockedAt: row.lockedAt,
  };
}

/**
 * A successful sign-in. This is what makes the count CONSECUTIVE.
 *
 * Deliberately does not delete the row: the history of having been locked is
 * worth keeping, because a second lockout on the same account is a different
 * conversation from a first.
 */
export async function clearFailedAttempts(emailInput: string): Promise<void> {
  const email = normalise(emailInput);
  await db
    .update(accountLockouts)
    .set({ failedCount: 0, lastFailedAt: null, updatedAt: new Date() })
    .where(and(eq(accountLockouts.email, email), sql`${accountLockouts.lockedAt} is null`));
}

/**
 * Release a locked account.
 *
 * THE CALLER MUST HAVE CHECKED `canUnlockAccounts` ALREADY. This function does
 * not re-check, and that is a deliberate split: it is also the path used by
 * scripts/unlock-account.ts, the break-glass for when the app cannot be reached
 * and there is no signed-in actor to authorise. Authorisation belongs to the
 * server action; this is the mechanism.
 */
export async function unlockAccount(
  emailInput: string,
  actorEmployeeId: string | null,
): Promise<void> {
  const email = normalise(emailInput);
  const now = new Date();
  await db
    .update(accountLockouts)
    .set({
      failedCount: 0,
      lastFailedAt: null,
      lockedAt: null,
      unlockedAt: now,
      unlockedById: actorEmployeeId,
      updatedAt: now,
    })
    .where(eq(accountLockouts.email, email));
}

/** Every currently-locked account, newest first — the admin screen's query. */
export async function listLockedAccounts() {
  return db
    .select({
      email: accountLockouts.email,
      lockedAt: accountLockouts.lockedAt,
      failedCount: accountLockouts.failedCount,
      lastFailedAt: accountLockouts.lastFailedAt,
      employeeId: accountLockouts.employeeId,
      employeeName: employees.name,
    })
    .from(accountLockouts)
    .leftJoin(employees, eq(employees.id, accountLockouts.employeeId))
    .where(isNotNull(accountLockouts.lockedAt))
    .orderBy(sql`${accountLockouts.lockedAt} desc`);
}

/**
 * Count one failure against the source address.
 *
 * Buckets by the hour so the table stays small and prunes trivially. This feeds
 * a delay, never a lock: an office NAT is one address for the whole company, so
 * locking on it would take everyone down at once.
 */
async function recordIpFailure(ip: string): Promise<void> {
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);

  await db
    .insert(loginAttemptIps)
    .values({ ip, windowStart, failedCount: 1, lastFailedAt: new Date() })
    .onConflictDoUpdate({
      target: [loginAttemptIps.ip, loginAttemptIps.windowStart],
      set: {
        failedCount: sql`${loginAttemptIps.failedCount} + 1`,
        lastFailedAt: new Date(),
      },
    });
}

/** Failures from this address in the current hour. The route decides the policy. */
export async function ipFailureCount(ip: string): Promise<number> {
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);
  const [row] = await db
    .select({ n: loginAttemptIps.failedCount })
    .from(loginAttemptIps)
    .where(and(eq(loginAttemptIps.ip, ip), eq(loginAttemptIps.windowStart, windowStart)))
    .limit(1);
  return row?.n ?? 0;
}
