import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvalTokens } from "@/db/schema";
import { siteUrl } from "@/lib/site-url";

/**
 * WS-7 · one-click approval tokens.
 *
 * Backs the "approve directly from the email body" + WhatsApp URL-button flow
 * (spec WS-5 Monday attendance confirmations, WS-7 dispatch). Reuses the
 * `approval_tokens` table (migration 0121):
 *
 *   - The RAW token is a 32-byte URL-safe random string. It lives ONLY in the
 *     outbound link — never in the DB, never in a log.
 *   - We persist `sha256(rawToken)` as `token_hash`. A stolen DB row cannot be
 *     replayed as a link (you can't invert the hash), and an attacker cannot
 *     guess a 256-bit random.
 *   - Single-use is enforced atomically at consume time by a conditional UPDATE
 *     (`used_at IS NULL AND expires_at > now()` … RETURNING) — two racing
 *     clicks can never both win.
 *
 * The domain action (what "approve" actually does) is NOT performed here — see
 * `lib/approval/handlers.ts`. This module only mints and burns tokens.
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** sha256 hex of the raw token — exactly what we store + look up by. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** A cryptographically-random, URL-safe token (43 chars, ~256 bits). */
function mintRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface IssueApprovalTokenInput {
  /** Namespaced action family, e.g. "attendance_confirm". */
  kind: string;
  /** The entity the action applies to — see per-kind targetId contracts. */
  targetId: string;
  /** e.g. "approve" | "reject". */
  action: string;
  /** Who triggered issuance (nullable — set null for system crons). */
  createdById?: string | null;
  /** Time-to-live in ms; defaults to 7 days. */
  ttlMs?: number;
}

export interface IssuedApprovalToken {
  /** The raw token — belongs ONLY in the outbound link. */
  token: string;
  /** Absolute public approve URL to embed in email / WhatsApp button. */
  approveUrl: string;
  /** The path suffix (raw token) for a WhatsApp URL-button dynamic param. */
  urlSuffix: string;
  expiresAt: Date;
}

/** Absolute public approve URL for a raw token. */
export function approveUrlFor(rawToken: string): string {
  return `${siteUrl()}/api/approve/${encodeURIComponent(rawToken)}`;
}

/**
 * Mint + persist a single-use approval token. Returns the raw token and the
 * approve URL to embed. Callers are responsible for gating issuance behind the
 * DISPATCH_V2 kill-switch (a token should only exist when we're actually
 * dispatching a link that references it).
 */
export async function issueApprovalToken(
  input: IssueApprovalTokenInput,
): Promise<IssuedApprovalToken> {
  const raw = mintRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS));

  await db.insert(approvalTokens).values({
    tokenHash,
    kind: input.kind,
    targetId: input.targetId,
    action: input.action,
    createdById: input.createdById ?? null,
    expiresAt,
  });

  return {
    token: raw,
    approveUrl: approveUrlFor(raw),
    urlSuffix: raw,
    expiresAt,
  };
}

export interface ApprovalTokenView {
  id: string;
  kind: string;
  targetId: string;
  action: string;
  createdById: string | null;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Read a token by its raw value WITHOUT consuming it — used by the approve
 * route's GET landing page so it can show the recipient what they're about to
 * confirm. Returns `null` when the token doesn't exist. Callers still must
 * check `usedAt` / `expiresAt` for display.
 */
export async function peekApprovalToken(
  rawToken: string,
): Promise<ApprovalTokenView | null> {
  const hash = hashToken(rawToken);
  const [row] = await db
    .select({
      id: approvalTokens.id,
      kind: approvalTokens.kind,
      targetId: approvalTokens.targetId,
      action: approvalTokens.action,
      createdById: approvalTokens.createdById,
      expiresAt: approvalTokens.expiresAt,
      usedAt: approvalTokens.usedAt,
    })
    .from(approvalTokens)
    .where(eq(approvalTokens.tokenHash, hash))
    .limit(1);
  return row ?? null;
}

export type ConsumeApprovalResult =
  | { ok: true; token: ApprovalTokenView }
  | { ok: false; reason: "not_found" | "expired" | "used" };

/**
 * Atomically burn a token: flips `used_at` from NULL → now() only if it's
 * still unused and unexpired, then returns the row. A losing race (already
 * used, expired, or unknown token) returns `{ ok: false, reason }` with the
 * reason resolved by a cheap follow-up read so the UI can explain what
 * happened.
 */
export async function consumeApprovalToken(
  rawToken: string,
): Promise<ConsumeApprovalResult> {
  const hash = hashToken(rawToken);
  const now = new Date();

  const updated = await db
    .update(approvalTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(approvalTokens.tokenHash, hash),
        isNull(approvalTokens.usedAt),
        gt(approvalTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({
      id: approvalTokens.id,
      kind: approvalTokens.kind,
      targetId: approvalTokens.targetId,
      action: approvalTokens.action,
      createdById: approvalTokens.createdById,
      expiresAt: approvalTokens.expiresAt,
      usedAt: approvalTokens.usedAt,
    });

  if (updated[0]) return { ok: true, token: updated[0] };

  // Consume failed — resolve the reason for a helpful message.
  const existing = await peekApprovalToken(rawToken);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.usedAt) return { ok: false, reason: "used" };
  return { ok: false, reason: "expired" };
}
