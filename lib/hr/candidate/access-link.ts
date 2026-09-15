import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidateAccessLinks,
  candidateIntake,
  employees,
  type CandidateLinkPurpose,
  type Employee,
} from "@/db/schema";

/**
 * CANDIDATE ACCESS LINKS — the HR forms, without a login.
 *
 * ── THE MECHANISM, IN ONE PARAGRAPH ────────────────────────────────────────
 * HR creates a candidate; the server mints one 256-bit random token, stores only
 * its SHA-256, and emails the token to the candidate's PERSONAL address as a
 * URL. Opening that URL is the whole authentication step: `resolveAccessLink`
 * re-reads the row, re-checks the clock and the revocation, and answers with the
 * candidate's own `employees` row. No password, no Firebase account, no session
 * cookie.
 *
 * ── WHAT IS DELIBERATELY NOT DONE ──────────────────────────────────────────
 *   · The token is never stored, logged, echoed in an error, or put in an audit
 *     `detail`. Only its hash reaches the database. A dump of this table gets an
 *     attacker nothing.
 *   · The URL carries an opaque string and NOTHING else — not the intake id, not
 *     the expiry, not the candidate's name. Every fact is re-read server-side on
 *     every request, so a link cannot be edited into a different candidate's.
 *   · No identity is invented. The link resolves to the REAL candidate
 *     `employees` row, so `documentSignatures.signerEmployeeId`, the intake row
 *     and the policy compliance rows are written exactly as they are today. This
 *     replaces the sign-in step, not the identity.
 *   · Nothing is trusted from the client. There is no "which candidate am I"
 *     parameter anywhere; the token IS the answer.
 *
 * ── WHY A SEPARATE TABLE AND NOT A FIREBASE GUEST ACCOUNT ──────────────────
 * The guest account is exactly what we are removing: an outsider should not have
 * to create credentials on os.altuscorp.in before they have been hired. The
 * candidate `employees` row still exists — it is the subject of the writes — but
 * it no longer needs to be sign-in-able for the forms to work.
 */

/** 30 days. Long enough that "let me check what I filled in" still works for as
 *  long as a hiring round realistically runs, short enough that a forwarded link
 *  does not stay live against someone's PII indefinitely. */
export const ACCESS_LINK_TTL_DAYS = 30;

/** `last_used_at` is a write on the hottest path a public link has, so it is
 *  stamped at most once an hour. It answers "did they ever open it", which does
 *  not need minute precision. Mirrors delegated-access's TOUCH_THROTTLE_MS. */
const TOUCH_THROTTLE_MS = 60 * 60 * 1000;

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
 * guarding the lookup — it guards the RE-CHECK after the row is loaded, so that
 * a future refactor introducing a non-exact match (a prefix scan, a cache)
 * cannot quietly become a timing oracle. Cheap insurance on the path that
 * decides who you are.
 */
function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface CandidateLinkContext {
  linkId: string;
  /** The candidate's REAL employee row — the subject of every write. */
  candidate: Employee;
  /** The intake row this link opens. */
  intakeId: string;
  /** Whether they have already submitted (drives read-only vs editable). */
  submitted: boolean;
  /** What the link was issued for — decides where `/c/<token>` lands them. */
  purpose: CandidateLinkPurpose;
  expiresAt: Date;
}

/** How many links may be live at once when issuing without revoking. Only the
 *  public self-service path does that, and only the candidate's own mailbox ever
 *  receives them; the cap stops a determined stranger from growing the table
 *  through the rate limiter. Oldest beyond the cap are revoked. */
const MAX_LIVE_LINKS = 5;

/**
 * Mint a link for one intake row and return the PLAINTEXT token — the only
 * moment it exists outside the caller's hand. Store nothing but what comes back
 * from here; the row keeps the hash.
 *
 * ── WHY `revokeExisting` IS THE CALLER'S DECISION ──────────────────────────
 * Revoking first is right when HR asks for a link: one candidate, one live URL,
 * and a re-send visibly supersedes what came before.
 *
 * It is WRONG on the public `/c/resume` page, which anyone can post any address
 * to. If that path revoked, then typing a candidate's email — guessable for
 * anyone who knows they applied — would invalidate the link that candidate is
 * filling their form with RIGHT NOW, mid-answer, with no explanation on their
 * end and none on ours (the page answers the same sentence to everyone by
 * design, so nothing is logged for them to be told about). That turns a
 * recovery page into a remote "cut off that applicant" button.
 *
 * So the recovery path issues an ADDITIONAL link instead. Both work; both were
 * only ever mailed to the candidate's own address, which `sendCandidateAccessLink`
 * reads off their row rather than from anything a visitor typed. The cap below
 * keeps "both" from becoming "hundreds".
 */
export async function issueAccessLink(
  intakeId: string,
  createdById: string | null,
  opts: { revokeExisting?: boolean; purpose?: CandidateLinkPurpose } = {},
): Promise<{ token: string; expiresAt: Date; purpose: CandidateLinkPurpose }> {
  const { revokeExisting = true, purpose = "form" } = opts;
  if (revokeExisting) {
    // SCOPED TO THIS PURPOSE (0222). Sending a candidate their policies must not
    // silently kill the interview-form link they are halfway through, and vice
    // versa — the two are separate errands that happen to share an identity.
    await revokeAccessLinks(intakeId, purpose);
  } else {
    await revokeOldestBeyondCap(intakeId, purpose, MAX_LIVE_LINKS - 1);
  }

  const token = mintToken();
  const expiresAt = new Date(Date.now() + ACCESS_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(candidateAccessLinks).values({
    intakeId,
    tokenHash: hashToken(token),
    expiresAt,
    createdById,
    purpose,
  });
  return { token, expiresAt, purpose };
}

/**
 * Revoke live links for an intake row. Keeps the rows for the audit trail.
 *
 * `purpose` omitted means EVERY live link, which is what HR's "cut this
 * candidate off" control wants; passing one narrows it to that errand.
 */
export async function revokeAccessLinks(
  intakeId: string,
  purpose?: CandidateLinkPurpose,
): Promise<void> {
  await db
    .update(candidateAccessLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(candidateAccessLinks.intakeId, intakeId),
        isNull(candidateAccessLinks.revokedAt),
        ...(purpose ? [eq(candidateAccessLinks.purpose, purpose)] : []),
      ),
    );
}

/**
 * Keep at most `keep` live links for an intake, revoking the oldest first.
 *
 * Used only by the non-revoking issue path. The candidate keeps the link they
 * are actually holding (the newest few), and the table cannot grow without
 * bound if someone leans on the recovery page for as long as the rate limiter
 * allows.
 */
async function revokeOldestBeyondCap(
  intakeId: string,
  purpose: CandidateLinkPurpose,
  keep: number,
): Promise<void> {
  const live = await db
    .select({ id: candidateAccessLinks.id })
    .from(candidateAccessLinks)
    .where(
      and(
        eq(candidateAccessLinks.intakeId, intakeId),
        eq(candidateAccessLinks.purpose, purpose),
        isNull(candidateAccessLinks.revokedAt),
      ),
    )
    .orderBy(desc(candidateAccessLinks.createdAt));

  const stale = live.slice(Math.max(keep, 0));
  if (stale.length === 0) return;
  await db
    .update(candidateAccessLinks)
    .set({ revokedAt: new Date() })
    .where(inArray(candidateAccessLinks.id, stale.map((r) => r.id)));
}

/**
 * Resolve a token to its candidate, or null.
 *
 * NULL FOR EVERY FAILURE, with no distinction between "no such token",
 * "expired", "revoked" and "the candidate row vanished". The caller shows one
 * message for all of them: telling a stranger WHICH of those it was is telling
 * them whether a token they are holding was ever real.
 */
export async function resolveAccessLink(
  token: string | undefined | null,
): Promise<CandidateLinkContext | null> {
  if (!token || typeof token !== "string" || token.length < 20) return null;
  const hash = hashToken(token);

  const [row] = await db
    .select({
      id: candidateAccessLinks.id,
      intakeId: candidateAccessLinks.intakeId,
      tokenHash: candidateAccessLinks.tokenHash,
      expiresAt: candidateAccessLinks.expiresAt,
      revokedAt: candidateAccessLinks.revokedAt,
      lastUsedAt: candidateAccessLinks.lastUsedAt,
      purpose: candidateAccessLinks.purpose,
    })
    .from(candidateAccessLinks)
    .where(eq(candidateAccessLinks.tokenHash, hash))
    .limit(1);

  if (!row) return null;
  if (!hashesMatch(row.tokenHash, hash)) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  // The intake row must still exist and the candidate's employee row must still
  // point at it. Resolved fresh per request rather than stored on the link, so
  // there is exactly one source of truth for "whose row is this".
  const [intake] = await db
    .select({ id: candidateIntake.id, submittedAt: candidateIntake.submittedAt })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, row.intakeId))
    .limit(1);
  if (!intake) return null;

  // Ordered rather than a bare `limit(1)`. Today this cannot matter: the unique
  // index `employees_candidate_intake_uidx` means one intake has at most one
  // employees row, so there is nothing to choose between (verified — a second
  // insert is rejected by the database). The ordering is here so that if that
  // index is ever relaxed, this lookup degrades into "always the original row"
  // instead of "whichever the planner picked", which on the path that decides
  // WHO THE CALLER IS would be a bug you could not reproduce.
  const [candidate] = await db
    .select()
    .from(employees)
    .where(eq(employees.candidateIntakeId, intake.id))
    .orderBy(asc(employees.createdAt), asc(employees.id))
    .limit(1);
  if (!candidate) return null;

  // A candidate who has been deactivated (offer withdrawn, record closed) loses
  // the link too — `candidateActive` is the same liveness flag isLoginLive()
  // uses, so the two paths cannot disagree about who is still a live candidate.
  if (!candidate.candidateActive) return null;

  void touch(row.id, row.lastUsedAt);

  return {
    linkId: row.id,
    candidate,
    intakeId: intake.id,
    submitted: intake.submittedAt != null,
    purpose: row.purpose,
    expiresAt: row.expiresAt,
  };
}

/** Throttled `last_used_at` stamp. Never throws and is never awaited by the
 *  request: a failed bookkeeping write must not fail the page it was recording. */
async function touch(linkId: string, lastUsedAt: Date | null): Promise<void> {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < TOUCH_THROTTLE_MS) return;
  try {
    await db
      .update(candidateAccessLinks)
      .set({ lastUsedAt: new Date() })
      .where(eq(candidateAccessLinks.id, linkId));
  } catch {
    /* bookkeeping only */
  }
}

/**
 * The live link for an intake row, for the HR screen's Copy / Resend controls.
 *
 * Returns metadata ONLY — never a token, because the plaintext no longer exists
 * anywhere by this point. "Copy the link" therefore means "mint a fresh one",
 * which is `issueAccessLink`. That is deliberate: a link HR can re-read at will
 * is a link that survives in a screenshot.
 */
export async function latestAccessLink(intakeId: string): Promise<{
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
} | null> {
  const [row] = await db
    .select({
      expiresAt: candidateAccessLinks.expiresAt,
      revokedAt: candidateAccessLinks.revokedAt,
      lastUsedAt: candidateAccessLinks.lastUsedAt,
      purpose: candidateAccessLinks.purpose,
      createdAt: candidateAccessLinks.createdAt,
    })
    .from(candidateAccessLinks)
    .where(eq(candidateAccessLinks.intakeId, intakeId))
    .orderBy(desc(candidateAccessLinks.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Find the intake row for a personal email, for the "email me a fresh link"
 * page. Matched case-insensitively against the address the candidate was
 * created with.
 *
 * The CALLER MUST NOT VARY ITS RESPONSE on the result of this — see the note in
 * app/c/resume/actions.ts. Returning null here means "no link was sent", not
 * "tell the visitor there is no such candidate".
 */
export async function intakeIdForEmail(email: string): Promise<string | null> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return null;
  // Case-insensitive on the STORED side too: intake rows are created by hand in
  // the HR screen, so the casing is whatever the typist used. Comparing the
  // trimmed-lowercase input against a raw column would silently fall through to
  // "no match" for anyone entered as "Name@Gmail.com", which reads to the
  // candidate as their email not being on file at all.
  const [row] = await db
    .select({ id: candidateIntake.id })
    .from(candidateIntake)
    .where(sql`lower(trim(${candidateIntake.email})) = ${clean}`)
    .orderBy(desc(candidateIntake.createdAt))
    .limit(1);
  return row?.id ?? null;
}
