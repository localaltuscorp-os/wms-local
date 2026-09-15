import "server-only";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { delegatedAccessEvents, delegatedAccessGrants, employees } from "@/db/schema";
import { delegationState } from "@/lib/auth/delegated-expiry";

/**
 * READ SIDE of temporary delegated access — the Admin Panel screen.
 *
 * Nothing here returns a token or a hash. `token_hash` is not selected by any
 * query in this file, so it cannot reach a component by accident: the screen has
 * no legitimate use for it, and the one time the plaintext token exists is in
 * the return value of `createDelegatedGrant`.
 */

export interface GrantRow {
  id: string;
  targetId: string;
  targetName: string;
  targetEmail: string;
  delegateId: string;
  delegateName: string;
  delegateEmail: string;
  grantedByName: string | null;
  revokedByName: string | null;
  reason: string | null;
  durationMinutes: number;
  startsAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  /** Derived from the clock at read time — never stored, so it cannot go stale. */
  state: "live" | "revoked" | "expired";
}

/**
 * Recent grants, newest first.
 *
 * Four joins onto `employees` for the four roles a grant names. Aliased tables
 * rather than four separate lookups: the screen shows names, and resolving them
 * in the query keeps this one round trip instead of one per row.
 */
export async function listDelegatedGrants(limit = 50, now = new Date()): Promise<GrantRow[]> {
  const target = alias(employees, "target_emp");
  const delegate = alias(employees, "delegate_emp");
  const granter = alias(employees, "granter_emp");
  const revoker = alias(employees, "revoker_emp");

  const rows = await db
    .select({
      id: delegatedAccessGrants.id,
      targetId: delegatedAccessGrants.targetEmployeeId,
      targetName: target.name,
      targetEmail: target.email,
      delegateId: delegatedAccessGrants.delegateEmployeeId,
      delegateName: delegate.name,
      delegateEmail: delegate.email,
      grantedByName: granter.name,
      revokedByName: revoker.name,
      reason: delegatedAccessGrants.reason,
      durationMinutes: delegatedAccessGrants.durationMinutes,
      startsAt: delegatedAccessGrants.startsAt,
      expiresAt: delegatedAccessGrants.expiresAt,
      revokedAt: delegatedAccessGrants.revokedAt,
      firstUsedAt: delegatedAccessGrants.firstUsedAt,
      lastUsedAt: delegatedAccessGrants.lastUsedAt,
      useCount: delegatedAccessGrants.useCount,
    })
    .from(delegatedAccessGrants)
    .innerJoin(target, eq(target.id, delegatedAccessGrants.targetEmployeeId))
    .innerJoin(delegate, eq(delegate.id, delegatedAccessGrants.delegateEmployeeId))
    .leftJoin(granter, eq(granter.id, delegatedAccessGrants.grantedById))
    .leftJoin(revoker, eq(revoker.id, delegatedAccessGrants.revokedById))
    .orderBy(desc(delegatedAccessGrants.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    state: delegationState({ expiresAt: r.expiresAt, revokedAt: r.revokedAt }, now),
  }));
}

export interface AccessEventRow {
  id: string;
  kind: string;
  detail: string | null;
  occurredAt: Date;
  targetName: string | null;
  delegateName: string | null;
  actorName: string | null;
}

/**
 * The audit trail, newest first.
 *
 * LEFT joins throughout, because these rows are built to outlive the people and
 * the grants they describe (the FKs are ON DELETE SET NULL). An inner join here
 * would silently hide exactly the events that matter most — the ones about
 * somebody who has since left.
 */
export async function listDelegatedAccessEvents(limit = 200): Promise<AccessEventRow[]> {
  const target = alias(employees, "ev_target");
  const delegate = alias(employees, "ev_delegate");
  const actor = alias(employees, "ev_actor");

  return await db
    .select({
      id: delegatedAccessEvents.id,
      kind: delegatedAccessEvents.kind,
      detail: delegatedAccessEvents.detail,
      occurredAt: delegatedAccessEvents.occurredAt,
      targetName: target.name,
      delegateName: delegate.name,
      actorName: actor.name,
    })
    .from(delegatedAccessEvents)
    .leftJoin(target, eq(target.id, delegatedAccessEvents.targetEmployeeId))
    .leftJoin(delegate, eq(delegate.id, delegatedAccessEvents.delegateEmployeeId))
    .leftJoin(actor, eq(actor.id, delegatedAccessEvents.actorEmployeeId))
    .orderBy(desc(delegatedAccessEvents.occurredAt))
    .limit(limit);
}
