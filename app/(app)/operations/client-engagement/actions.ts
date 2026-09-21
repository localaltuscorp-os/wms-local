"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { ceAccounts, ceAuditLog, ceEngagements, ceReferences, ceTeamMembers } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { canEditAccount, canManageCe, CE_MANAGER_NAMES } from "@/lib/client-engagement/access";
import {
  accountLabel,
  categoryNeedsBatch,
  categoryOf,
  CE_FREQUENCY_CODES,
  CE_REFERENCE_PROGRAM_CODES,
  CE_ROLE_CODES,
  isCeCategory,
} from "@/lib/client-engagement/constants";
import {
  CE_HH_STATUS_CODES,
  CE_LIFECYCLE_CODES,
  hhStatusMeta,
  lifecycleLabel,
} from "@/lib/client-engagement/status";
import { findClash, isYmd, validateEngagement } from "@/lib/client-engagement/schedule";
import type { Employee } from "@/db/schema";

/**
 * CLIENT ENGAGEMENT — the writes (rebuild, 0238).
 *
 *   · ADD an account — anyone signed in; it lands in Unassigned.
 *   · ASSIGN / TRANSFER — Manan and Ruchita only (canManageCe).
 *   · EDIT an account or SCHEDULE its calls — a manager, or its assignee.
 *   · TEAM ROSTER — managers only.
 *   · REFERENCES — managers, the account's assignee, or the collector.
 *
 * Every change writes a ce_audit_log row in the SAME transaction as the change,
 * so the log cannot claim something that did not happen, or miss something that
 * did.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const BASE = "/operations/client-engagement";

function revalidate(): void {
  revalidatePath(BASE, "layout");
}

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: (e as Error)?.message ?? "Something went wrong.",
});

async function guard(): Promise<{ me: Employee; error: string | null }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  return { me, error: limited ? limited.error : null };
}

const isManager = (me: Employee) => canManageCe(me, DUMMY_MODE);

const clean = (v: string | null | undefined, max = 200): string => (v ?? "").trim().slice(0, max);
const orNull = (v: string | null | undefined, max = 200): string | null => clean(v, max) || null;
const dateOrNull = (v: string | null | undefined): string | null => (isYmd((v ?? "").trim()) ? v!.trim() : null);

function cleanTags(tags: readonly string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const t of tags ?? []) {
    const v = t.trim().slice(0, 40);
    if (v) out.add(v);
  }
  return [...out].slice(0, 20);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function audit(
  tx: Tx,
  row: {
    entityType: "account" | "engagement" | "reference" | "team_member";
    entityId: string;
    action: string;
    summary: string;
    before?: unknown;
    after?: unknown;
    actorId: string;
  },
): Promise<void> {
  await tx.insert(ceAuditLog).values({
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    summary: row.summary.slice(0, 500),
    before: (row.before ?? null) as object | null,
    after: (row.after ?? null) as object | null,
    actorId: row.actorId,
  });
}

/** The account plus the login behind its assignee — what edit permission turns on. */
async function loadAccount(id: string) {
  const [row] = await db
    .select({
      account: ceAccounts,
      assigneeEmployeeId: ceTeamMembers.employeeId,
      assigneeName: ceTeamMembers.name,
    })
    .from(ceAccounts)
    .leftJoin(ceTeamMembers, eq(ceTeamMembers.id, ceAccounts.assignedTo))
    .where(eq(ceAccounts.id, id))
    .limit(1);
  return row ?? null;
}

async function memberName(id: string | null): Promise<string> {
  if (!id) return "Unassigned";
  const [m] = await db.select({ name: ceTeamMembers.name }).from(ceTeamMembers).where(eq(ceTeamMembers.id, id)).limit(1);
  return m?.name ?? "Unknown";
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export interface AccountInput {
  fullName: string;
  organization?: string | null;
  category: string;
  batchCode?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  lifecycleStatus?: string | null;
  hhStatus?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

/** Validate + normalise the editable fields; returns an error string or the values. */
function readAccount(input: AccountInput):
  | { error: string }
  | {
      values: {
        fullName: string;
        organization: string | null;
        category: string;
        batchCode: string | null;
        startDate: string | null;
        endDate: string | null;
        lifecycleStatus: string;
        hhStatus: string;
        tags: string[];
        notes: string | null;
      };
    } {
  const fullName = clean(input.fullName, 160);
  if (!fullName) return { error: "Give them a name." };
  if (!isCeCategory(input.category)) return { error: "Pick a product type." };
  const batchCode = categoryNeedsBatch(input.category) ? orNull(input.batchCode, 20) : null;
  if (categoryNeedsBatch(input.category) && !batchCode) {
    return { error: `${categoryOf(input.category)!.label} needs a batch number.` };
  }
  const startDate = dateOrNull(input.startDate);
  const endDate = dateOrNull(input.endDate);
  if (startDate && endDate && endDate < startDate) return { error: "The end date is before the start date." };
  const lifecycleStatus = input.lifecycleStatus ?? "active";
  if (!CE_LIFECYCLE_CODES.includes(lifecycleStatus)) return { error: "Unknown lifecycle status." };
  const hhStatus = input.hhStatus ?? "standard";
  if (!CE_HH_STATUS_CODES.includes(hhStatus)) return { error: "Unknown hand-holding status." };
  return {
    values: {
      fullName,
      organization: orNull(input.organization, 160),
      category: input.category,
      batchCode,
      startDate,
      endDate,
      lifecycleStatus,
      hhStatus,
      tags: cleanTags(input.tags),
      notes: orNull(input.notes, 2000),
    },
  };
}

/**
 * Add a participant, client or ambassador. Anyone may; it lands in Unassigned.
 * A manager may assign it in the same step (`assignTo`).
 */
export async function ceAddAccount(input: AccountInput & { assignTo?: string | null }): Promise<Result<{ id: string }>> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  const parsed = readAccount(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const assignTo = input.assignTo || null;
  if (assignTo && !isManager(me)) {
    return { ok: false, error: `Only ${CE_MANAGER_NAMES} can assign. Add it unassigned and ask them.` };
  }

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(ceAccounts)
        .values({ ...parsed.values, assignedTo: assignTo, createdBy: me.id })
        .returning({ id: ceAccounts.id });
      const label = accountLabel(parsed.values.fullName, parsed.values.batchCode);
      await audit(tx, {
        entityType: "account",
        entityId: row!.id,
        action: "create",
        summary: `Added ${label} (${categoryOf(parsed.values.category)!.section})`,
        after: { ...parsed.values, assignedTo: assignTo },
        actorId: me.id,
      });
      if (assignTo) {
        await audit(tx, {
          entityType: "account",
          entityId: row!.id,
          action: "assign",
          summary: `Assigned ${label} to ${await memberName(assignTo)}`,
          before: { assignedTo: null },
          after: { assignedTo: assignTo },
          actorId: me.id,
        });
      }
      return row!.id;
    });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Edit an account's details and statuses. Managers, or its assignee. */
export async function ceUpdateAccount(id: string, input: AccountInput): Promise<Result> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  const found = await loadAccount(id);
  if (!found) return { ok: false, error: "That record no longer exists." };
  if (!canEditAccount(me, found.assigneeEmployeeId, DUMMY_MODE)) {
    return { ok: false, error: `Only ${CE_MANAGER_NAMES}, or the person it is assigned to, can edit it.` };
  }
  const parsed = readAccount(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const before = found.account;
  const v = parsed.values;
  const label = accountLabel(v.fullName, v.batchCode);

  try {
    await db.transaction(async (tx) => {
      await tx.update(ceAccounts).set({ ...v, updatedAt: new Date() }).where(eq(ceAccounts.id, id));

      // A status change gets its own line, so the colour history of an account
      // can be read straight off the log.
      if (before.hhStatus !== v.hhStatus) {
        await audit(tx, {
          entityType: "account",
          entityId: id,
          action: "status",
          summary: `${label}: ${hhStatusMeta(before.hhStatus).label} → ${hhStatusMeta(v.hhStatus).label}`,
          before: { hhStatus: before.hhStatus },
          after: { hhStatus: v.hhStatus },
          actorId: me.id,
        });
      }
      if (before.lifecycleStatus !== v.lifecycleStatus) {
        await audit(tx, {
          entityType: "account",
          entityId: id,
          action: "status",
          summary: `${label}: ${lifecycleLabel(before.lifecycleStatus)} → ${lifecycleLabel(v.lifecycleStatus)}`,
          before: { lifecycleStatus: before.lifecycleStatus },
          after: { lifecycleStatus: v.lifecycleStatus },
          actorId: me.id,
        });
      }
      const changed = (
        ["fullName", "organization", "category", "batchCode", "startDate", "endDate", "notes"] as const
      ).filter((k) => (before[k] ?? null) !== (v[k] ?? null));
      const tagsChanged = before.tags.join("|") !== v.tags.join("|");
      if (changed.length || tagsChanged) {
        await audit(tx, {
          entityType: "account",
          entityId: id,
          action: "update",
          summary: `Edited ${label} (${[...changed, ...(tagsChanged ? ["tags"] : [])].join(", ")})`,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, v[k]])),
          actorId: me.id,
        });
      }
    });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Assign an account out of Unassigned, or transfer it between team members —
 * Manan and Ruchita only. Its scheduled calls move with it, so the new owner's
 * calendar shows them; `clashes` reports any that now overlap something the new
 * owner already had, so they can be re-timed rather than silently double-booked.
 *
 * Returning an account to Unassigned is refused while it still has calls: a call
 * needs someone to take it.
 */
export async function ceAssignAccount(
  id: string,
  toMemberId: string | null,
): Promise<Result<{ clashes: number }>> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  if (!isManager(me)) return { ok: false, error: `Only ${CE_MANAGER_NAMES} can assign or transfer.` };

  const found = await loadAccount(id);
  if (!found) return { ok: false, error: "That record no longer exists." };
  const from = found.account.assignedTo;
  if ((from ?? null) === (toMemberId ?? null)) return { ok: true, clashes: 0 };

  if (toMemberId) {
    const [m] = await db
      .select({ id: ceTeamMembers.id, isActive: ceTeamMembers.isActive })
      .from(ceTeamMembers)
      .where(eq(ceTeamMembers.id, toMemberId))
      .limit(1);
    if (!m || !m.isActive) return { ok: false, error: "Pick an active team member." };
  }

  const calls = await db.select().from(ceEngagements).where(eq(ceEngagements.accountId, id));
  if (!toMemberId && calls.length) {
    return { ok: false, error: "It still has scheduled calls. Delete them, or transfer it to someone instead." };
  }

  let clashes = 0;
  if (toMemberId && calls.length) {
    const theirs = await db
      .select()
      .from(ceEngagements)
      .where(and(eq(ceEngagements.teamMemberId, toMemberId), ne(ceEngagements.accountId, id)));
    const norm = (r: typeof theirs[number]) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
      startDate: r.startDate,
      endDate: r.endDate,
    });
    const existing = theirs.map(norm);
    clashes = calls.filter((c) => findClash(norm(c), existing)).length;
  }

  const label = accountLabel(found.account.fullName, found.account.batchCode);
  const [fromName, toName] = await Promise.all([memberName(from), memberName(toMemberId)]);

  try {
    await db.transaction(async (tx) => {
      await tx.update(ceAccounts).set({ assignedTo: toMemberId, updatedAt: new Date() }).where(eq(ceAccounts.id, id));
      if (toMemberId && calls.length) {
        await tx
          .update(ceEngagements)
          .set({ teamMemberId: toMemberId, updatedAt: new Date() })
          .where(eq(ceEngagements.accountId, id));
      }
      await audit(tx, {
        entityType: "account",
        entityId: id,
        action: from ? "transfer" : "assign",
        summary: from
          ? `Transferred ${label} from ${fromName} to ${toName}${calls.length ? ` (${calls.length} call${calls.length === 1 ? "" : "s"} moved)` : ""}`
          : `Assigned ${label} to ${toName}`,
        before: { assignedTo: from },
        after: { assignedTo: toMemberId },
        actorId: me.id,
      });
    });
    revalidate();
    return { ok: true, clashes };
  } catch (e) {
    return fail(e);
  }
}

/** Delete an account and everything hanging off it. Managers only. */
export async function ceDeleteAccount(id: string): Promise<Result> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  if (!isManager(me)) return { ok: false, error: `Only ${CE_MANAGER_NAMES} can delete a record.` };
  const found = await loadAccount(id);
  if (!found) return { ok: true };
  try {
    await db.transaction(async (tx) => {
      await tx.delete(ceAccounts).where(eq(ceAccounts.id, id));
      await audit(tx, {
        entityType: "account",
        entityId: id,
        action: "delete",
        summary: `Deleted ${accountLabel(found.account.fullName, found.account.batchCode)}`,
        before: found.account,
        actorId: me.id,
      });
    });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Engagements (weekly call slots)                                     */
/* ------------------------------------------------------------------ */

export interface EngagementInput {
  id?: string | null;
  /** An existing account… */
  accountId?: string | null;
  /** …or a new one, created and assigned to `teamMemberId` in the same step (managers). */
  newAccount?: AccountInput | null;
  /** Who takes the call. Must be the account's assignee. */
  teamMemberId: string;
  callType: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
}

/**
 * Create or edit one weekly call slot. The call belongs to the account's
 * assignee — scheduling is not a back door to assigning — and it may not
 * overlap anything else that person has that week.
 */
export async function ceSaveEngagement(input: EngagementInput): Promise<Result<{ id: string }>> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };

  const slot = {
    callType: input.callType,
    dayOfWeek: input.dayOfWeek,
    startTime: clean(input.startTime, 5),
    endTime: clean(input.endTime, 5),
    startDate: clean(input.startDate, 10),
    endDate: dateOrNull(input.endDate),
  };
  const invalid = validateEngagement(slot);
  if (invalid) return { ok: false, error: invalid };

  const [member] = await db
    .select({ id: ceTeamMembers.id, name: ceTeamMembers.name, employeeId: ceTeamMembers.employeeId, isActive: ceTeamMembers.isActive })
    .from(ceTeamMembers)
    .where(eq(ceTeamMembers.id, input.teamMemberId))
    .limit(1);
  if (!member || !member.isActive) return { ok: false, error: "Pick an active employee." };

  // Resolve the account: an existing one, or a new one created here.
  let accountId = input.accountId ?? null;
  let parsedNew: Extract<ReturnType<typeof readAccount>, { values: unknown }>["values"] | null = null;
  if (!accountId) {
    if (!input.newAccount) return { ok: false, error: "Pick who the call is with." };
    if (!isManager(me)) {
      return { ok: false, error: `A new person has to be assigned first, and only ${CE_MANAGER_NAMES} can assign. Add them on Overview.` };
    }
    const parsed = readAccount(input.newAccount);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    parsedNew = parsed.values;
  } else {
    const found = await loadAccount(accountId);
    if (!found) return { ok: false, error: "That record no longer exists." };
    if (found.account.assignedTo !== member.id) {
      return {
        ok: false,
        error: found.account.assignedTo
          ? `${accountLabel(found.account.fullName, found.account.batchCode)} is with ${found.assigneeName}. Transfer it first.`
          : `${accountLabel(found.account.fullName, found.account.batchCode)} is unassigned. ${CE_MANAGER_NAMES} need to assign it first.`,
      };
    }
    if (!canEditAccount(me, found.assigneeEmployeeId, DUMMY_MODE)) {
      return { ok: false, error: `Only ${CE_MANAGER_NAMES}, or ${member.name}, can schedule ${member.name}'s calls.` };
    }
  }

  // No double-booking the person taking the call.
  const theirs = await db.select().from(ceEngagements).where(eq(ceEngagements.teamMemberId, member.id));
  const existing = theirs.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime.slice(0, 5),
    endTime: r.endTime.slice(0, 5),
    startDate: r.startDate,
    endDate: r.endDate,
  }));
  const clash = findClash({ ...slot, id: input.id ?? null }, existing);
  if (clash) {
    const [other] = await db
      .select({ fullName: ceAccounts.fullName, batchCode: ceAccounts.batchCode })
      .from(ceAccounts)
      .where(eq(ceAccounts.id, clash.accountId))
      .limit(1);
    return {
      ok: false,
      // Name the start date when the clashing call begins later than this one:
      // otherwise the clash is invisible in the week on screen (found in testing).
      error: `${member.name} already has ${other ? accountLabel(other.fullName, other.batchCode) : "a call"} ${clash.startTime}–${clash.endTime} that day${
        clash.startDate > slot.startDate
          ? ` (from ${new Date(`${clash.startDate}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })})`
          : ""
      }.`,
    };
  }

  try {
    const id = await db.transaction(async (tx) => {
      if (parsedNew) {
        const [row] = await tx
          .insert(ceAccounts)
          .values({ ...parsedNew, assignedTo: member.id, createdBy: me.id })
          .returning({ id: ceAccounts.id });
        accountId = row!.id;
        await audit(tx, {
          entityType: "account",
          entityId: accountId,
          action: "create",
          summary: `Added ${accountLabel(parsedNew.fullName, parsedNew.batchCode)} and assigned to ${member.name}`,
          after: { ...parsedNew, assignedTo: member.id },
          actorId: me.id,
        });
      }

      const values = {
        accountId: accountId!,
        teamMemberId: member.id,
        ...slot,
        notes: orNull(input.notes, 1000),
      };

      if (input.id) {
        const [before] = await tx.select().from(ceEngagements).where(eq(ceEngagements.id, input.id)).limit(1);
        if (!before) throw new Error("That call no longer exists.");
        await tx.update(ceEngagements).set({ ...values, updatedAt: new Date() }).where(eq(ceEngagements.id, input.id));
        await audit(tx, {
          entityType: "engagement",
          entityId: input.id,
          action: "update",
          summary: `Moved a call for ${member.name}: ${before.dayOfWeek} ${before.startTime.slice(0, 5)} → ${slot.dayOfWeek} ${slot.startTime}–${slot.endTime}`,
          before,
          after: values,
          actorId: me.id,
        });
        return input.id;
      }

      const [row] = await tx.insert(ceEngagements).values({ ...values, createdBy: me.id }).returning({ id: ceEngagements.id });
      await audit(tx, {
        entityType: "engagement",
        entityId: row!.id,
        action: "create",
        summary: `Scheduled a ${slot.dayOfWeek} ${slot.startTime}–${slot.endTime} call for ${member.name}`,
        after: values,
        actorId: me.id,
      });
      return row!.id;
    });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function ceDeleteEngagement(id: string): Promise<Result> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  const [row] = await db.select().from(ceEngagements).where(eq(ceEngagements.id, id)).limit(1);
  if (!row) return { ok: true };
  const found = await loadAccount(row.accountId);
  if (!found || !canEditAccount(me, found.assigneeEmployeeId, DUMMY_MODE)) {
    return { ok: false, error: `Only ${CE_MANAGER_NAMES}, or the person it is assigned to, can remove it.` };
  }
  try {
    await db.transaction(async (tx) => {
      await tx.delete(ceEngagements).where(eq(ceEngagements.id, id));
      await audit(tx, {
        entityType: "engagement",
        entityId: id,
        action: "delete",
        summary: `Removed the ${row.dayOfWeek} ${row.startTime.slice(0, 5)} call with ${accountLabel(found.account.fullName, found.account.batchCode)}`,
        before: row,
        actorId: me.id,
      });
    });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Team roster                                                         */
/* ------------------------------------------------------------------ */

export interface MemberInput {
  id?: string | null;
  name: string;
  employeeId?: string | null;
  email?: string | null;
  role: string;
  activeClientLimit: number;
  isActive: boolean;
}

export async function ceSaveMember(input: MemberInput): Promise<Result<{ id: string }>> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  if (!isManager(me)) return { ok: false, error: `Only ${CE_MANAGER_NAMES} can change the team.` };

  const name = clean(input.name, 80);
  if (!name) return { ok: false, error: "Give them a name." };
  if (!CE_ROLE_CODES.includes(input.role)) return { ok: false, error: "Pick a role." };
  const limit = Math.floor(Number(input.activeClientLimit));
  if (!Number.isFinite(limit) || limit < 0 || limit > 500) return { ok: false, error: "The capacity must be 0–500." };

  const values = {
    name,
    employeeId: input.employeeId || null,
    email: orNull(input.email, 160),
    role: input.role,
    activeClientLimit: limit,
    isActive: Boolean(input.isActive),
  };

  if (values.employeeId) {
    const [dupe] = await db
      .select({ id: ceTeamMembers.id, name: ceTeamMembers.name })
      .from(ceTeamMembers)
      .where(eq(ceTeamMembers.employeeId, values.employeeId))
      .limit(1);
    if (dupe && dupe.id !== input.id) return { ok: false, error: `That login is already linked to ${dupe.name}.` };
  }

  try {
    const id = await db.transaction(async (tx) => {
      if (input.id) {
        const [before] = await tx.select().from(ceTeamMembers).where(eq(ceTeamMembers.id, input.id)).limit(1);
        if (!before) throw new Error("That team member no longer exists.");
        await tx.update(ceTeamMembers).set({ ...values, updatedAt: new Date() }).where(eq(ceTeamMembers.id, input.id));
        await audit(tx, {
          entityType: "team_member",
          entityId: input.id,
          action: "update",
          summary: `Edited team member ${name}`,
          before,
          after: values,
          actorId: me.id,
        });
        return input.id;
      }
      const [row] = await tx
        .insert(ceTeamMembers)
        .values({ ...values, sortOrder: 1000, createdBy: me.id })
        .returning({ id: ceTeamMembers.id });
      await audit(tx, {
        entityType: "team_member",
        entityId: row!.id,
        action: "create",
        summary: `Added team member ${name}`,
        after: values,
        actorId: me.id,
      });
      return row!.id;
    });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Reference pipeline                                                  */
/* ------------------------------------------------------------------ */

export interface ReferenceInput {
  id?: string | null;
  accountId: string;
  collectorId?: string | null;
  targetProgram: string;
  targetCount: number;
  frequency: string;
  dueDate?: string | null;
  notes?: string | null;
}

/** May this person work on a reference quota? Managers, the account's assignee, or its collector. */
async function canWorkReference(me: Employee, accountId: string, collectorId: string | null): Promise<boolean> {
  if (isManager(me)) return true;
  const found = await loadAccount(accountId);
  if (found && canEditAccount(me, found.assigneeEmployeeId, DUMMY_MODE)) return true;
  if (!collectorId) return false;
  const [c] = await db
    .select({ employeeId: ceTeamMembers.employeeId })
    .from(ceTeamMembers)
    .where(eq(ceTeamMembers.id, collectorId))
    .limit(1);
  return Boolean(c?.employeeId && c.employeeId === me.id);
}

export async function ceSaveReference(input: ReferenceInput): Promise<Result<{ id: string }>> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  if (!CE_REFERENCE_PROGRAM_CODES.includes(input.targetProgram)) return { ok: false, error: "Pick a target program." };
  if (!CE_FREQUENCY_CODES.includes(input.frequency)) return { ok: false, error: "Pick how often." };
  const target = Math.floor(Number(input.targetCount));
  if (!Number.isFinite(target) || target < 1 || target > 1000) return { ok: false, error: "The target must be 1 or more." };

  const found = await loadAccount(input.accountId);
  if (!found) return { ok: false, error: "Pick who the references come from." };
  const collectorId = input.collectorId || null;
  if (!(await canWorkReference(me, input.accountId, collectorId))) {
    return { ok: false, error: `Only ${CE_MANAGER_NAMES}, the account's owner or the collector can set this.` };
  }

  const values = {
    accountId: input.accountId,
    collectorId,
    targetProgram: input.targetProgram,
    targetCount: target,
    frequency: input.frequency,
    dueDate: dateOrNull(input.dueDate),
    notes: orNull(input.notes, 1000),
  };
  const label = accountLabel(found.account.fullName, found.account.batchCode);

  try {
    const id = await db.transaction(async (tx) => {
      if (input.id) {
        const [before] = await tx.select().from(ceReferences).where(eq(ceReferences.id, input.id)).limit(1);
        if (!before) throw new Error("That reference quota no longer exists.");
        await tx.update(ceReferences).set({ ...values, updatedAt: new Date() }).where(eq(ceReferences.id, input.id));
        await audit(tx, {
          entityType: "reference",
          entityId: input.id,
          action: "update",
          summary: `Edited the reference quota for ${label} (target ${target})`,
          before,
          after: values,
          actorId: me.id,
        });
        return input.id;
      }
      const [row] = await tx.insert(ceReferences).values({ ...values, createdBy: me.id }).returning({ id: ceReferences.id });
      await audit(tx, {
        entityType: "reference",
        entityId: row!.id,
        action: "create",
        summary: `Set a reference quota of ${target} for ${label}`,
        after: values,
        actorId: me.id,
      });
      return row!.id;
    });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** +1 (or −1 to undo a slip) on the collected count. */
export async function ceBumpReference(id: string, delta: 1 | -1): Promise<Result<{ actual: number }>> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  const [row] = await db.select().from(ceReferences).where(eq(ceReferences.id, id)).limit(1);
  if (!row) return { ok: false, error: "That reference quota no longer exists." };
  if (!(await canWorkReference(me, row.accountId, row.collectorId))) {
    return { ok: false, error: `Only ${CE_MANAGER_NAMES}, the account's owner or the collector can update this.` };
  }
  const next = Math.max(0, row.actualCollected + (delta === -1 ? -1 : 1));
  if (next === row.actualCollected) return { ok: true, actual: next };
  const found = await loadAccount(row.accountId);
  const label = found ? accountLabel(found.account.fullName, found.account.batchCode) : "an account";
  try {
    await db.transaction(async (tx) => {
      await tx.update(ceReferences).set({ actualCollected: next, updatedAt: new Date() }).where(eq(ceReferences.id, id));
      await audit(tx, {
        entityType: "reference",
        entityId: id,
        action: "reference_count",
        summary: `References from ${label}: ${row.actualCollected} → ${next} of ${row.targetCount}`,
        before: { actualCollected: row.actualCollected },
        after: { actualCollected: next },
        actorId: me.id,
      });
    });
    revalidate();
    return { ok: true, actual: next };
  } catch (e) {
    return fail(e);
  }
}

export async function ceDeleteReference(id: string): Promise<Result> {
  const { me, error } = await guard();
  if (error) return { ok: false, error };
  if (!isManager(me)) return { ok: false, error: `Only ${CE_MANAGER_NAMES} can delete a reference quota.` };
  const [row] = await db.select().from(ceReferences).where(eq(ceReferences.id, id)).limit(1);
  if (!row) return { ok: true };
  try {
    await db.transaction(async (tx) => {
      await tx.delete(ceReferences).where(eq(ceReferences.id, id));
      await audit(tx, {
        entityType: "reference",
        entityId: id,
        action: "delete",
        summary: "Deleted a reference quota",
        before: row,
        actorId: me.id,
      });
    });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
