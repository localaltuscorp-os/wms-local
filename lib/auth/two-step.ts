import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, twoStepChallenges, twoStepVerifications, type Employee } from "@/db/schema";
import { sendTwoStepCodeEmail } from "@/lib/email/resend";
import { nextMidnightIst } from "@/lib/auth/two-step-pass";

/**
 * Two-step sign-in by emailed code — the server's half.
 *
 *   issueTwoStepChallenge  → a fresh 6-digit code, emailed; returns an opaque
 *                            handle the browser sends back with the code.
 *   verifyTwoStepCode      → checks the code against the handle, once.
 *   recordTwoStepVerification → the audit row: who verified, when, where.
 *
 * The plain code exists only in the email. The database holds an HMAC of it,
 * and a SHA-256 of the handle, so a read of these tables gives nobody a way in.
 */

/** How long an emailed code stays usable. */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses allowed against one code before it is dead. */
export const MAX_CODE_ATTEMPTS = 5;
/** Codes one person can be sent inside SEND_WINDOW_MS — stops inbox flooding. */
export const MAX_SENDS_PER_WINDOW = 5;
export const SEND_WINDOW_MS = 15 * 60 * 1000;

type RequestMeta = { ip: string | null; userAgent: string | null };

export function requestMeta(req: Request): RequestMeta {
  const xff = req.headers.get("x-forwarded-for");
  const ip = (xff ? xff.split(",")[0]?.trim() : req.headers.get("x-real-ip")?.trim()) || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) || null;
  return { ip, userAgent };
}

function codeSecret(): string {
  const secret = process.env.COOKIE_SECRET_CURRENT;
  if (!secret) throw new Error("COOKIE_SECRET_CURRENT is not set");
  return secret;
}

function hashCode(challengeId: string, code: string): string {
  return createHmac("sha256", codeSecret()).update(`${challengeId}:${code}`).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** "mohitgupta.altuscorp@gmail.com" → "mo•••••••@gmail.com" — enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local = "", domain] = email.split("@");
  if (!domain) return email;
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${"•".repeat(Math.max(3, local.length - shown.length))}@${domain}`;
}

export type IssueResult =
  | { ok: true; token: string; maskedEmail: string; expiresInSeconds: number }
  | { ok: false; error: "too-many-codes" | "email-failed"; message: string };

/**
 * Create a code for `emp`, email it, and return the handle for the browser.
 * Refuses when this person has already been sent MAX_SENDS_PER_WINDOW codes in
 * the window — whoever holds the password can otherwise flood their inbox.
 */
export async function issueTwoStepChallenge(
  emp: Pick<Employee, "id" | "email" | "name">,
  meta: RequestMeta,
): Promise<IssueResult> {
  const [counted] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(twoStepChallenges)
    .where(
      and(
        eq(twoStepChallenges.employeeId, emp.id),
        gte(twoStepChallenges.createdAt, new Date(Date.now() - SEND_WINDOW_MS)),
      ),
    );
  if ((counted?.recent ?? 0) >= MAX_SENDS_PER_WINDOW) {
    return {
      ok: false,
      error: "too-many-codes",
      message: "Too many codes sent. Wait 15 minutes, then sign in again.",
    };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = randomBytes(32).toString("base64url");
  const id = crypto.randomUUID();
  await db.insert(twoStepChallenges).values({
    id,
    employeeId: emp.id,
    tokenHash: hashToken(token),
    codeHash: hashCode(id, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const sent = await sendTwoStepCodeEmail({
    email: emp.email,
    code,
    recipientName: emp.name,
    minutes: CODE_TTL_MS / 60_000,
  });
  if (sent.error) {
    // Local development without Resend: print the code so sign-in can still be
    // tested. Never in a production build — there the code must only travel by
    // email, or the second step proves nothing.
    if (process.env.NODE_ENV !== "production" && sent.error === "RESEND_API_KEY not set") {
      console.warn(`[two-step] RESEND_API_KEY not set — code for ${emp.email}: ${code}`);
    } else {
      console.error("[two-step] could not send the code", sent.error);
      // Kill the code we could not deliver, so it does not count as usable.
      await db
        .update(twoStepChallenges)
        .set({ expiresAt: new Date() })
        .where(eq(twoStepChallenges.id, id));
      return {
        ok: false,
        error: "email-failed",
        message: "We couldn't send your sign-in code. Try again in a minute.",
      };
    }
  }

  return {
    ok: true,
    token,
    maskedEmail: maskEmail(emp.email),
    expiresInSeconds: CODE_TTL_MS / 1000,
  };
}

export type VerifyResult =
  | { ok: true; challengeId: string; employeeId: string }
  | { ok: false; error: "invalid-code" | "code-expired"; message: string; remaining?: number };

/**
 * Check `code` against the challenge behind `token`. Each call spends one
 * attempt BEFORE the comparison, in a single conditional UPDATE, so parallel
 * guesses cannot share an attempt. A right code marks the challenge used, also
 * conditionally, so the same code can never be redeemed twice.
 */
export async function verifyTwoStepCode(token: string, code: string): Promise<VerifyResult> {
  const expired = {
    ok: false as const,
    error: "code-expired" as const,
    message: "This code has expired or was used up. Sign in again to get a new one.",
  };
  if (!token || !/^\d{6}$/.test(code)) {
    return { ok: false, error: "invalid-code", message: "Enter the 6-digit code from the email." };
  }

  const [row] = await db
    .update(twoStepChallenges)
    .set({ attempts: sql`${twoStepChallenges.attempts} + 1` })
    .where(
      and(
        eq(twoStepChallenges.tokenHash, hashToken(token)),
        isNull(twoStepChallenges.consumedAt),
        gt(twoStepChallenges.expiresAt, new Date()),
        lt(twoStepChallenges.attempts, MAX_CODE_ATTEMPTS),
      ),
    )
    .returning();
  if (!row) return expired;

  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashCode(row.id, code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    const remaining = MAX_CODE_ATTEMPTS - row.attempts;
    if (remaining <= 0) return expired;
    return {
      ok: false,
      error: "invalid-code",
      remaining,
      message: `That code isn't right. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`,
    };
  }

  const [used] = await db
    .update(twoStepChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(twoStepChallenges.id, row.id), isNull(twoStepChallenges.consumedAt)))
    .returning({ id: twoStepChallenges.id });
  if (!used) return expired;

  return { ok: true, challengeId: row.id, employeeId: row.employeeId };
}

/** The audit row. Returns its id, which the pass cookie carries for tracing. */
export async function recordTwoStepVerification(args: {
  employeeId: string;
  email: string;
  challengeId: string;
  meta: RequestMeta;
  now?: Date;
}): Promise<{ id: string; validUntil: Date }> {
  const validUntil = nextMidnightIst(args.now);
  const [row] = await db
    .insert(twoStepVerifications)
    .values({
      employeeId: args.employeeId,
      email: args.email,
      challengeId: args.challengeId,
      validUntil,
      ip: args.meta.ip,
      userAgent: args.meta.userAgent,
    })
    .returning({ id: twoStepVerifications.id });
  if (!row) throw new Error("two_step_verifications insert returned no row");
  return { id: row.id, validUntil };
}

/** How long after the first code a "send a new code" is still honoured. */
const RESEND_WINDOW_MS = 30 * 60 * 1000;

/**
 * Retire the code behind `token` and email a fresh one to the same person. The
 * handle is only honoured while unused and recent — it stands in for the
 * password step, so it must not outlive a sign-in attempt.
 */
export async function resendTwoStepChallenge(
  token: string,
  meta: RequestMeta,
): Promise<IssueResult | { ok: false; error: "code-expired"; message: string }> {
  const [row] = await db
    .update(twoStepChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(twoStepChallenges.tokenHash, hashToken(token || "")),
        isNull(twoStepChallenges.consumedAt),
        gte(twoStepChallenges.createdAt, new Date(Date.now() - RESEND_WINDOW_MS)),
      ),
    )
    .returning({ employeeId: twoStepChallenges.employeeId });
  if (!row) {
    return {
      ok: false,
      error: "code-expired",
      message: "This sign-in attempt has expired. Sign in again to get a new code.",
    };
  }
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, row.employeeId),
    columns: { id: true, email: true, name: true },
  });
  if (!emp) {
    return { ok: false, error: "code-expired", message: "Sign in again to get a new code." };
  }
  return issueTwoStepChallenge(emp, meta);
}
