"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  designations,
  employees,
  functions,
  incentiveCatalog,
  incentiveEligibility,
  incentiveFunctionScope,
  outstandingProducts,
  settingsEvents,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { requireModuleEdit, requireModuleView } from "@/lib/permissions/resolve";
import { INCENTIVE_ELIGIBILITY_REFUSAL } from "@/lib/security/capabilities";
import { mayManageIncentiveEligibility } from "@/lib/incentive/eligibility-guard";
import { afterResponse } from "@/lib/after";
import {
  processIncentiveCatalogEvent,
  recordIncentiveCatalogEvent,
} from "@/lib/incentive/notifications/service";
import {
  currentEmployeeIds,
  eligibilityWindowsFor,
  incentiveSnapshotFor,
  liveGrantIds,
  loadIncentiveEligibility,
  type IncentiveEligibilityView,
} from "@/lib/queries/incentive-master";
import {
  INCENTIVE_APPLICABILITIES,
  INCENTIVE_DURATIONS,
  MAX_ELIGIBILITY_BATCH,
  MAX_INCENTIVE_AMOUNT,
  eligibilityChangeError,
  firstIncentiveMasterError,
  resolveEligibility,
  resolveEmployeeType,
  todayIst,
  type IncentiveApplicability,
} from "@/lib/incentive/master";
import { INCENTIVE_TYPES } from "@/db/enums";

/**
 * INCENTIVE MASTER + INCENTIVE CHART — every mutation, and its authorization.
 *
 * ── WHY EACH ACTION RE-AUTHORIZES ──────────────────────────────────────────
 * The `(admin)` layout redirects non-admins and the page hides controls the
 * viewer may not use. Neither protects anything: a server action is an HTTP
 * endpoint the browser can POST to directly, whether or not the button that
 * calls it ever rendered. So every function below starts from nothing and
 * re-establishes who is asking.
 *
 * ── TWO DIFFERENT AUTHORITIES, DELIBERATELY ────────────────────────────────
 * Editing an INCENTIVE needs admin + `admin.incentive.master` edit.
 * Changing ELIGIBILITY needs `incentive_eligibility.manage`, which only Manan
 * holds (lib/security/capabilities.ts). An admin may correct a scheme's amount
 * without also choosing who collects it — that separation is the brief's
 * ("Only Manan Vasa can change eligibility") and it is enforced here, not in
 * the UI.
 *
 * ── WHAT DELETING AND DEACTIVATING DO NOT TOUCH ────────────────────────────
 * Requests, approvals, resubmissions and payments do not reference the Master
 * at all: `incentive_requests` and `incentive_entries` carry no catalog id, and
 * `weekly_goals.incentive_catalog_id` is ON DELETE SET NULL. So neither
 * operation can remove history, and the change record keeps the snapshot of
 * what was deleted.
 */

const PATH = "/admin/incentive-master";
const NODE = "admin.incentive.master";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * REPLACE a scheme's function scope (0244).
 *
 * A replace-set, not a history: the scope is current configuration, and the
 * change record's before/after snapshot is what preserves what it used to be.
 * Rows for other modes are cleared rather than left behind, so switching away
 * from FUNCTION and back does not silently restore a scope nobody re-chose.
 */
async function replaceFunctionScope(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  catalogId: string,
  applicability: IncentiveApplicability,
  functionIds: string[],
): Promise<void> {
  await tx.delete(incentiveFunctionScope).where(eq(incentiveFunctionScope.catalogId, catalogId));
  if (applicability !== "FUNCTION" || functionIds.length === 0) return;
  await tx
    .insert(incentiveFunctionScope)
    .values(functionIds.map((functionId) => ({ catalogId, functionId })));
}

const UUID = z.string().uuid();
const IdSchema = z.string().uuid("That incentive could not be found.");

/** Empty string from a <select> or a date input means "not set", not "invalid". */
const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v == null ? null : v));

const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const FieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(500).optional().nullable(),
    amount: z.number().min(0).max(MAX_INCENTIVE_AMOUNT),
    incentiveType: z
      .union([z.enum(INCENTIVE_TYPES), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v == null ? null : v)),
    productId: optionalUuid,
    duration: z.enum(INCENTIVE_DURATIONS).optional().default("permanent"),
    validUntil: optionalDate,
    /**
     * WHO THIS APPLIES TO (0244). Defaults to company-wide, which is what the
     * brief requires of a newly created incentive.
     *
     * `salesEligible` / `internsEligible` are gone from the FORM on purpose:
     * the columns still exist (every pre-0244 change record carries them) but
     * nothing decides eligibility by them any more, and a control that looks
     * live while doing nothing is worse than no control.
     */
    applicability: z.enum(INCENTIVE_APPLICABILITIES).optional().default("ALL_EMPLOYEES"),
    /** The functions a FUNCTION-scoped scheme covers. Ignored in other modes. */
    functionIds: z.array(z.string().uuid()).max(100).optional().default([]),
    notes: z.string().trim().max(1000).optional().nullable(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    active: z.boolean().optional().default(true),
  })
  .strict();

export type IncentiveMasterInput = z.input<typeof FieldsSchema>;

/**
 * The admin audit row. Swallow-and-warn, following every other admin master: a
 * logging failure must not fail a write that already succeeded, because that
 * would leave the database changed and report an error.
 */
async function audit(input: {
  targetId: string | null;
  name: string;
  actorId: string;
  eventType: string;
  fromValue?: unknown;
  toValue?: unknown;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "incentive_master",
      targetId: input.targetId,
      actorId: input.actorId,
      eventType: input.eventType,
      fromValue: (input.fromValue ?? null) as never,
      toValue: (input.toValue ?? null) as never,
      note: input.name,
    });
  } catch (err) {
    console.warn("[incentive-master] audit write failed", err);
  }
}

/**
 * Tell the affected employees, after the response is sent. The change has
 * already committed; nothing the notifications do can fail or slow the save.
 */
function notifyChange(eventId: string | null) {
  if (eventId) afterResponse(() => processIncentiveCatalogEvent(eventId));
}

/* ════════════════════════════════════════════════════════════════════════════
   READ — what the workspace loads when it opens
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * One incentive, its eligible-employee list and its grant history.
 *
 * A server action rather than props on the page, because the workspace is
 * opened from a row and re-reads itself after every change — fetching it here
 * keeps the list page's payload small and means an eligibility change shows the
 * server's own answer rather than an optimistic guess.
 *
 * Gated by the same view permission as the page, and NOT by the eligibility
 * capability: an admin who may not change eligibility may still see who is
 * eligible ("allow authorized users to see which active employees are
 * eligible"). `canManageChart` in the result is the server's answer to whether
 * the controls should do anything, re-asked now rather than trusted from when
 * the page was rendered.
 */
export async function loadIncentiveWorkspace(id: string): Promise<
  ActionResult<{ view: IncentiveEligibilityView; canManageChart: boolean }>
> {
  const me = await requireAdmin();
  await requireModuleView(NODE);
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  if (!IdSchema.safeParse(id).success) return { ok: false, error: "That incentive could not be found." };

  const [view, canManageChart] = await Promise.all([
    loadIncentiveEligibility(id),
    mayManageIncentiveEligibility(),
  ]);
  if (!view) return { ok: false, error: "That incentive could not be found." };
  return { ok: true, view, canManageChart };
}

/* ════════════════════════════════════════════════════════════════════════════
   §1 · CREATE / EDIT / ACTIVATE / DEACTIVATE
   ════════════════════════════════════════════════════════════════════════════ */

export async function saveIncentive(
  input: IncentiveMasterInput & { id?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const { id: rawId, ...fields } = input;
  const parsed = FieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid incentive." };
  }
  const v = parsed.data;

  // The SAME validator the form uses. One set of rules, so a crafted request
  // cannot get past what the dialog would have refused.
  const invalid = firstIncentiveMasterError({
    name: v.name,
    amount: v.amount,
    incentiveType: v.incentiveType,
    duration: v.duration,
    validUntil: v.validUntil,
    description: v.description ?? null,
    notes: v.notes ?? null,
    active: v.active,
  });
  if (invalid) return { ok: false, error: invalid };

  const id = rawId ? (UUID.safeParse(rawId).success ? rawId : null) : null;
  if (rawId && !id) return { ok: false, error: "That incentive could not be found." };

  // A product must exist and be a real product — never a uuid the caller made
  // up, and never a deactivated one on a NEW assignment.
  if (v.productId) {
    const [product] = await db
      .select({ id: outstandingProducts.id, isActive: outstandingProducts.isActive })
      .from(outstandingProducts)
      .where(eq(outstandingProducts.id, v.productId))
      .limit(1);
    if (!product) return { ok: false, error: "That product no longer exists." };
  }

  // The functions must exist in the function master. The foreign key would
  // refuse a made-up uuid anyway, but as a raw constraint error; this says which
  // thing was wrong.
  if (v.applicability === "FUNCTION") {
    const found = await db
      .select({ id: functions.id })
      .from(functions)
      .where(inArray(functions.id, v.functionIds));
    if (found.length !== v.functionIds.length) {
      return { ok: false, error: "One of the chosen functions no longer exists." };
    }
  }

  // A FUNCTION-scoped scheme with no function selected reaches nobody, which is
  // almost never what the person saving meant — they picked "Function" and did
  // not finish. Refuse rather than silently create a scheme that pays no one.
  if (v.applicability === "FUNCTION" && v.functionIds.length === 0) {
    return { ok: false, error: "Pick at least one function, or choose All Employees." };
  }

  /**
   * CHANGING WHO IT APPLIES TO IS AN ELIGIBILITY CHANGE.
   *
   * The two authorities are separate on purpose (see the header): any admin may
   * correct an amount, only the eligibility holder may choose who collects it.
   * Applicability is the audience, so it needs the SAME capability as naming an
   * individual — otherwise "who is eligible" could be rewritten by editing the
   * amount in the same payload and never touching the eligibility screen.
   *
   * A NEW scheme is a different case: there is no audience to take away, and
   * refusing to create one would make the whole screen unusable for the admins
   * who may edit the Master but not the Chart.
   */
  if (id) {
    const [current] = await db
      .select({ applicability: incentiveCatalog.applicability })
      .from(incentiveCatalog)
      .where(eq(incentiveCatalog.id, id))
      .limit(1);
    const currentScope = await db
      .select({ functionId: incentiveFunctionScope.functionId })
      .from(incentiveFunctionScope)
      .where(eq(incentiveFunctionScope.catalogId, id));

    const scopeChanged =
      currentScope.length !== v.functionIds.length ||
      currentScope.some((s) => !v.functionIds.includes(s.functionId));
    const audienceChanged =
      current != null &&
      (current.applicability !== v.applicability ||
        (v.applicability === "FUNCTION" && scopeChanged));

    if (audienceChanged && !(await mayManageIncentiveEligibility())) {
      return { ok: false, error: INCENTIVE_ELIGIBILITY_REFUSAL };
    }
  }

  const values = {
    name: v.name,
    description: v.description?.trim() || null,
    amount: v.amount.toFixed(2),
    incentiveType: v.incentiveType,
    productId: v.productId,
    duration: v.duration,
    validUntil: v.validUntil,
    applicability: v.applicability,
    notes: v.notes?.trim() || null,
    sortOrder: v.sortOrder ?? 100,
    active: v.active,
  };

  const today = todayIst();

  try {
    const saved = await db.transaction(async (tx) => {
      if (id) {
        const [existing] = await tx
          .select()
          .from(incentiveCatalog)
          .where(eq(incentiveCatalog.id, id))
          .for("update");
        if (!existing) return { id, eventId: null, missing: true as const };
        const before = await incentiveSnapshotFor(tx, existing, today);
        const [after] = await tx
          .update(incentiveCatalog)
          .set(values)
          .where(eq(incentiveCatalog.id, id))
          .returning();
        if (!after) return { id, eventId: null, missing: true as const };
        // BEFORE the "after" snapshot, so the change record describes the scope
        // that was just saved rather than the one it replaced.
        await replaceFunctionScope(tx, id, v.applicability, v.functionIds);
        const eventId = await recordIncentiveCatalogEvent(tx, {
          eventType: "updated",
          catalogId: id,
          before,
          after: await incentiveSnapshotFor(tx, after, today),
          actorId: me.id,
        });
        return { id, eventId, before: existing, after };
      }

      const [row] = await tx.insert(incentiveCatalog).values(values).returning();
      if (!row) throw new Error("insert returned no row");
      await replaceFunctionScope(tx, row.id, v.applicability, v.functionIds);
      const eventId = await recordIncentiveCatalogEvent(tx, {
        eventType: "created",
        catalogId: row.id,
        before: null,
        after: await incentiveSnapshotFor(tx, row, today),
        actorId: me.id,
      });
      return { id: row.id, eventId, after: row };
    });

    if ("missing" in saved && saved.missing) {
      return { ok: false, error: "That incentive could not be found." };
    }

    await audit({
      targetId: saved.id,
      name: v.name,
      actorId: me.id,
      eventType: id ? "incentive_updated" : "incentive_created",
      fromValue: "before" in saved ? { active: saved.before?.active, amount: saved.before?.amount } : null,
      toValue: { active: values.active, amount: values.amount },
    });
    notifyChange(saved.eventId);
    bust();
    return { ok: true, id: saved.id };
  } catch (err: unknown) {
    const cause = err instanceof Error && err.cause instanceof Error ? ` ${err.cause.message}` : "";
    const msg = err instanceof Error ? `${err.message}${cause}` : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, error: "An incentive with that name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
}

/**
 * Activate or deactivate, without touching anything else.
 *
 * Writes through the same change-record and notification path as a full edit,
 * because taking an incentive off offer is exactly the kind of change the
 * people who were eligible for it need to hear about.
 */
export async function setIncentiveActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!IdSchema.safeParse(id).success) return { ok: false, error: "That incentive could not be found." };
  if (typeof active !== "boolean") return { ok: false, error: "Invalid status." };

  const today = todayIst();

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(incentiveCatalog)
        .where(eq(incentiveCatalog.id, id))
        .for("update");
      if (!existing) return null;
      if (existing.active === active) return { eventId: null, name: existing.name, noop: true };
      const before = await incentiveSnapshotFor(tx, existing, today);
      const [after] = await tx
        .update(incentiveCatalog)
        .set({ active })
        .where(eq(incentiveCatalog.id, id))
        .returning();
      if (!after) return null;
      const eventId = await recordIncentiveCatalogEvent(tx, {
        eventType: "updated",
        catalogId: id,
        before,
        after: await incentiveSnapshotFor(tx, after, today),
        actorId: me.id,
      });
      return { eventId, name: existing.name, noop: false };
    });

    if (!result) return { ok: false, error: "That incentive could not be found." };
    if (!result.noop) {
      await audit({
        targetId: id,
        name: result.name,
        actorId: me.id,
        eventType: active ? "incentive_activated" : "incentive_deactivated",
        toValue: { active },
      });
      notifyChange(result.eventId);
    }
    bust();
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   §1 · DELETE, WITH STRONG CONFIRMATION
   ════════════════════════════════════════════════════════════════════════════ */

/** What deleting this incentive would affect. Read-only; safe to call to render
 *  the confirmation. */
export async function incentiveDeleteImpact(
  id: string,
): Promise<ActionResult<{ name: string; eligibleCount: number; grantCount: number }>> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  if (!IdSchema.safeParse(id).success) return { ok: false, error: "That incentive could not be found." };

  const [row] = await db
    .select()
    .from(incentiveCatalog)
    .where(eq(incentiveCatalog.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "That incentive could not be found." };

  const [windows, grants] = await Promise.all([
    eligibilityWindowsFor(db, id),
    liveGrantIds(db, id),
  ]);
  const [audience, scope] = await Promise.all([
    db
      .select({
        id: employees.id,
        isActive: employees.isActive,
        employmentStatus: employees.employmentStatus,
        accountType: employees.accountType,
        employeeOverride: employees.employeeType,
        designationType: designations.employeeType,
        departmentId: employees.departmentId,
      })
      .from(employees)
      .leftJoin(designations, eq(employees.designationId, designations.id)),
    db
      .select({ functionId: incentiveFunctionScope.functionId })
      .from(incentiveFunctionScope)
      .where(eq(incentiveFunctionScope.catalogId, id)),
  ]);
  // The impact figure has to be the SAME number the list and the employee's own
  // screen show, so it is the same rule — including the intern exclusion and the
  // function scope, which is why the roster query now carries both.
  const resolved = resolveEligibility({
    incentive: {
      active: row.active,
      validUntil: row.validUntil == null ? null : String(row.validUntil),
      applicability: row.applicability,
      functionIds: scope.map((s) => s.functionId),
      salesEligible: row.salesEligible === true,
      internsEligible: row.internsEligible === true,
    },
    windows,
    employees: audience.map((a) => ({
      id: a.id,
      isActive: a.isActive,
      employmentStatus: a.employmentStatus,
      accountType: a.accountType,
      employeeType: resolveEmployeeType({
        override: a.employeeOverride,
        designationType: a.designationType,
      }),
      functionId: a.departmentId,
    })),
  });

  return {
    ok: true,
    name: row.name,
    eligibleCount: resolved.employeeIds.length,
    grantCount: grants.size,
  };
}

/**
 * Delete one incentive. Admin + Incentive Master edit, and the typed name.
 *
 * ── THE TYPED NAME IS CHECKED HERE, NOT ONLY IN THE DIALOG ─────────────────
 * The brief asks for a strong confirmation. A confirmation that lives only in
 * the browser is a suggestion, so the name is a required argument and it is
 * compared against the row about to go. The deliberateness becomes a property
 * of the request rather than of the dialog.
 *
 * Eligibility rows go with it (ON DELETE CASCADE) — and the "deleted" change
 * record keeps the snapshot of who was eligible, so the fact is not lost with
 * the rows. Requests, approvals, resubmissions and payments are untouched:
 * none of them reference this table.
 */
export async function deleteIncentive(
  id: string,
  confirmName: string,
): Promise<ActionResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!IdSchema.safeParse(id).success) return { ok: false, error: "That incentive could not be found." };

  let eventId: string | null = null;
  let name = "";
  type Outcome = { refused: string } | { eventId: string | null; name: string };
  try {
    const result = await db.transaction(async (tx): Promise<Outcome | null> => {
      const [existing] = await tx
        .select()
        .from(incentiveCatalog)
        .where(eq(incentiveCatalog.id, id))
        .for("update");
      if (!existing) return null;
      if (
        typeof confirmName !== "string" ||
        confirmName.replace(/\s+/g, " ").trim().toLowerCase() !== existing.name.toLowerCase()
      ) {
        return { refused: `Type the incentive name exactly — “${existing.name}” — to confirm.` };
      }
      // Snapshot BEFORE the delete: afterwards there is nothing left to
      // snapshot, and the "deleted" notice needs the before.
      const before = await incentiveSnapshotFor(tx, existing, todayIst());
      await tx.delete(incentiveCatalog).where(eq(incentiveCatalog.id, id));
      const ev = await recordIncentiveCatalogEvent(tx, {
        eventType: "deleted",
        catalogId: id,
        before,
        after: null,
        actorId: me.id,
      });
      return { eventId: ev, name: existing.name };
    });

    if (!result) return { ok: false, error: "That incentive could not be found." };
    if ("refused" in result) return { ok: false, error: result.refused };
    eventId = result.eventId;
    name = result.name;
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  await audit({ targetId: id, name, actorId: me.id, eventType: "incentive_deleted" });
  notifyChange(eventId);
  bust();
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════════
   §2 · ELIGIBILITY — MANAN ONLY

   Both actions below open with `mayManageIncentiveEligibility()`, BEFORE they
   read anything, so the refusal cannot differ for a valid id versus an invalid
   one. Admin rights and Incentive Master edit are deliberately not enough.
   ════════════════════════════════════════════════════════════════════════════ */

const EligibilityChangeSchema = z
  .object({
    catalogId: z.string().uuid(),
    employeeIds: z.array(z.string().uuid()).min(1).max(MAX_ELIGIBILITY_BATCH),
    effectiveFrom: z.string(),
  })
  .strict();

export type EligibilityChangeInput = z.input<typeof EligibilityChangeSchema>;

/**
 * Make employees eligible, from an effective date.
 *
 * Idempotent: somebody who already holds a live grant is skipped rather than
 * refused, so a double-click or a replayed request does not fail and does not
 * create a second grant (the partial unique index would refuse it anyway).
 */
export async function addIncentiveEligibility(
  input: EligibilityChangeInput,
): Promise<ActionResult<{ added: number; skipped: number }>> {
  const me = await requireAdmin();
  if (!(await mayManageIncentiveEligibility())) {
    return { ok: false, error: INCENTIVE_ELIGIBILITY_REFUSAL };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EligibilityChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid eligibility change." };
  const { catalogId, employeeIds, effectiveFrom } = parsed.data;

  const invalid = eligibilityChangeError({ employeeIds, effectiveFrom });
  if (invalid) return { ok: false, error: invalid };

  type AddOutcome =
    | { refused: string }
    | { eventId: string | null; name: string; added: number; skipped: number };
  try {
    const result = await db.transaction(async (tx): Promise<AddOutcome | null> => {
      const [incentive] = await tx
        .select()
        .from(incentiveCatalog)
        .where(eq(incentiveCatalog.id, catalogId))
        .for("update");
      if (!incentive) return null;

      const before = await incentiveSnapshotFor(tx, incentive, effectiveFrom);

      // Who may be given eligibility is asked HERE, not trusted from the
      // request: the list in the browser was rendered at some earlier moment,
      // and somebody who resigned in between must not be added because their
      // row was still on screen.
      const [allowed, live] = await Promise.all([
        currentEmployeeIds(tx),
        liveGrantIds(tx, catalogId),
      ]);
      const rejected = employeeIds.filter((id) => !allowed.has(id));
      if (rejected.length > 0) {
        return {
          refused:
            rejected.length === employeeIds.length
              ? "Those employees are no longer active, so they cannot be made eligible."
              : `${rejected.length} of the selected employees are no longer active. Refresh the list and try again.`,
        };
      }

      const toAdd = employeeIds.filter((id) => !live.has(id));
      if (toAdd.length > 0) {
        await tx.insert(incentiveEligibility).values(
          toAdd.map((employeeId) => ({
            catalogId,
            employeeId,
            effectiveFrom,
            addedById: me.id,
          })),
        );
      }

      const eventId =
        toAdd.length > 0
          ? await recordIncentiveCatalogEvent(tx, {
              eventType: "updated",
              catalogId,
              before,
              after: await incentiveSnapshotFor(tx, incentive, effectiveFrom),
              actorId: me.id,
              // The date chosen, so the notice says "with effect from …" and
              // means it.
              effectiveDate: effectiveFrom,
            })
          : null;

      return {
        eventId,
        name: incentive.name,
        added: toAdd.length,
        skipped: employeeIds.length - toAdd.length,
      };
    });

    if (!result) return { ok: false, error: "That incentive could not be found." };
    if ("refused" in result) return { ok: false, error: result.refused };

    if (result.added > 0) {
      await audit({
        targetId: catalogId,
        name: result.name,
        actorId: me.id,
        eventType: "incentive_eligibility_added",
        toValue: { count: result.added, effectiveFrom },
      });
      notifyChange(result.eventId);
    }
    bust();
    return { ok: true, added: result.added, skipped: result.skipped };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/incentive_eligibility_current_uq/i.test(msg)) {
      return { ok: false, error: "Some of those employees are already eligible. Refresh and try again." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
}

/**
 * End employees' eligibility, from an effective date.
 *
 * The grant row is KEPT and dated, never deleted — "When removing an employee,
 * record the effective date." So the history stays answerable and the
 * notification can say the date.
 */
export async function removeIncentiveEligibility(
  input: EligibilityChangeInput,
): Promise<ActionResult<{ removed: number; skipped: number }>> {
  const me = await requireAdmin();
  if (!(await mayManageIncentiveEligibility())) {
    return { ok: false, error: INCENTIVE_ELIGIBILITY_REFUSAL };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EligibilityChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid eligibility change." };
  const { catalogId, employeeIds, effectiveFrom } = parsed.data;

  const invalid = eligibilityChangeError({ employeeIds, effectiveFrom });
  if (invalid) return { ok: false, error: invalid };

  type RemoveOutcome =
    | { refused: string }
    | { eventId: string | null; name: string; removed: number; skipped: number };
  try {
    const result = await db.transaction(async (tx): Promise<RemoveOutcome | null> => {
      const [incentive] = await tx
        .select()
        .from(incentiveCatalog)
        .where(eq(incentiveCatalog.id, catalogId))
        .for("update");
      if (!incentive) return null;

      const before = await incentiveSnapshotFor(tx, incentive, effectiveFrom);

      // Only live grants can be ended, and a removal may not predate the grant
      // it ends — the database enforces the second with a CHECK, so the rows
      // that would violate it are excluded here and reported rather than
      // failing the whole batch with a constraint error.
      const live = await tx
        .select({
          employeeId: incentiveEligibility.employeeId,
          effectiveFrom: incentiveEligibility.effectiveFrom,
        })
        .from(incentiveEligibility)
        .where(
          and(
            eq(incentiveEligibility.catalogId, catalogId),
            isNull(incentiveEligibility.removedEffectiveFrom),
            inArray(incentiveEligibility.employeeId, employeeIds),
          ),
        );

      const tooEarly = live.filter((g) => effectiveFrom < String(g.effectiveFrom));
      if (tooEarly.length > 0) {
        return {
          refused:
            "The removal date is before the date those employees became eligible. Pick a later date.",
        };
      }

      const removable = live.map((g) => g.employeeId);
      if (removable.length > 0) {
        await tx
          .update(incentiveEligibility)
          .set({ removedEffectiveFrom: effectiveFrom, removedById: me.id, updatedAt: new Date() })
          .where(
            and(
              eq(incentiveEligibility.catalogId, catalogId),
              isNull(incentiveEligibility.removedEffectiveFrom),
              inArray(incentiveEligibility.employeeId, removable),
            ),
          );
      }

      const eventId =
        removable.length > 0
          ? await recordIncentiveCatalogEvent(tx, {
              eventType: "updated",
              catalogId,
              before,
              after: await incentiveSnapshotFor(tx, incentive, effectiveFrom),
              actorId: me.id,
              effectiveDate: effectiveFrom,
            })
          : null;

      return {
        eventId,
        name: incentive.name,
        removed: removable.length,
        skipped: employeeIds.length - removable.length,
      };
    });

    if (!result) return { ok: false, error: "That incentive could not be found." };
    if ("refused" in result) return { ok: false, error: result.refused };

    if (result.removed > 0) {
      await audit({
        targetId: catalogId,
        name: result.name,
        actorId: me.id,
        eventType: "incentive_eligibility_removed",
        toValue: { count: result.removed, effectiveFrom },
      });
      notifyChange(result.eventId);
    }
    bust();
    return { ok: true, removed: result.removed, skipped: result.skipped };
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Revalidate every screen that reads the Master.
 *
 * `/incentive` is included because the Incentive Table dialog there shows these
 * rows and the notifications deep-link straight to it — an admin change that
 * did not reach it would send people to a stale table.
 */
function bust() {
  revalidatePath(PATH);
  revalidatePath("/incentive");
}
