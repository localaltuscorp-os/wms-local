import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, lt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { punchNonces } from "@/db/schema";

/**
 * One-time punch nonces (anti-proxy Phase 2). Issue a short-lived random nonce
 * for an employee; the app requests a Play-Integrity / App-Attest token OVER it
 * and returns it with the punch. {@link consumePunchNonce} verifies it is this
 * employee's, unused, and unexpired — then BURNS it, so a replayed or relayed
 * request fails.
 */

const NONCE_TTL_MS = 90_000; // 90s — ample for the attestation round-trip.

/** Issue a fresh nonce (and opportunistically sweep this employee's expired ones). */
export async function issuePunchNonce(employeeId: string): Promise<{ nonce: string; expiresAt: Date }> {
  // Best-effort cleanup so the table doesn't grow unbounded (no dedicated cron).
  await db
    .delete(punchNonces)
    .where(and(eq(punchNonces.employeeId, employeeId), lt(punchNonces.expiresAt, new Date())))
    .catch(() => {});

  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await db.insert(punchNonces).values({ employeeId, nonce, expiresAt });
  return { nonce, expiresAt };
}

export type NonceResult = { ok: true } | { ok: false; reason: "missing" | "unknown" | "expired" | "used" };

/**
 * Verify + BURN a nonce. Atomic: a single UPDATE stamps used_at only when the
 * row is this employee's, unused and unexpired — so two concurrent requests
 * with the same nonce can't both succeed (the second updates 0 rows).
 */
export async function consumePunchNonce(employeeId: string, nonce: string | undefined | null): Promise<NonceResult> {
  const n = (nonce ?? "").trim();
  if (!n) return { ok: false, reason: "missing" };

  const burned = await db
    .update(punchNonces)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(punchNonces.nonce, n),
        eq(punchNonces.employeeId, employeeId),
        isNull(punchNonces.usedAt),
      ),
    )
    .returning({ id: punchNonces.id, expiresAt: punchNonces.expiresAt });

  const row = burned[0];
  if (!row) {
    // Distinguish unknown vs already-used for the audit trail.
    const existing = await db.query.punchNonces.findFirst({ where: eq(punchNonces.nonce, n) });
    if (!existing) return { ok: false, reason: "unknown" };
    return { ok: false, reason: "used" };
  }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true };
}
