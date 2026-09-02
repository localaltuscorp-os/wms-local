"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { weeklyGoals, goals } from "@/db/schema";
import { TASK_STATUSES, GOAL_TYPES } from "@/db/enums";
import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import { autoPctDone } from "@/lib/goals/auto-pct";
import { effectivePct } from "@/lib/weekly-goals/effective";
import { mondayOf, nextWeekStart } from "@/lib/weekly-goals/week";

/**
 * Server actions for the Goals-workspace Weekly board (`/goals/weekly`).
 *
 * This surface REUSES the existing weekly engine (the `weekly_goals` table + its
 * helpers) — it never edits `app/(app)/weekly-goals/*`. It only mutates the
 * Goals-Cascade additive columns (month linkage / area / uom / targets & actuals
 * / team / dependency / evidence / adopted) plus a cascade-aware carry-forward.
 * Every write re-asserts access (`requireGoalsAccess`), rate-limits, zod-parses,
 * and revalidates both this surface and the legacy board so they stay in sync.
 */

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

function revalidate() {
  revalidatePath("/goals/weekly");
  revalidatePath("/goals/weekly");
  // 5-page restructure level routes (bug #17) — ALL level pages share one
  // canvas payload that includes the weekly rows (loadCanvasData), so every
  // weekly mutation must refresh all three, not just /goals/week.
  revalidatePath("/goals/week");
  revalidatePath("/goals/monthly");
  revalidatePath("/goals/yearly"); // yearly rootView shares the same canvas payload
  revalidatePath("/goals/quarterly");
  revalidatePath("/goals/cascade");
}

/** numeric(14,2) columns round-trip as strings; serialise at the boundary. */
function toMoney(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toFixed(2);
}

type WeeklyRow = typeof weeklyGoals.$inferSelect;
type LoadResult = { ok: false; error: string } | { ok: true; row: WeeklyRow };

/**
 * Fetch a weekly goal + decide whether the signed-in user may WRITE it. Owners
 * (the goal's employee), admins/super-admins, and managers (any goal owned by
 * someone in their full downline) may edit. Mirrors the weekly engine's
 * `loadWritableGoal` — replicated here so we never import a private action.
 */
async function loadWritableWeekly(
  id: string,
  me: { id: string; isAdmin: boolean },
): Promise<LoadResult> {
  const [row] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  if (me.isAdmin || row.employeeId === me.id) return { ok: true, row };
  const scope = await goalScopeFor(me);
  if (scope.ids.includes(row.employeeId)) return { ok: true, row };
  return { ok: false, error: "You can only edit your own weekly goals" };
}

/** Next Sr. No. for an (employee, week) — max(position)+1, 1-based. */
async function nextPosition(employeeId: string, weekStart: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${weeklyGoals.position}), 0)::int` })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.weekStart, weekStart)));
  return (row?.max ?? 0) + 1;
}

// --------------------------------------------------------------------------
// Adopt / cross-out a weekly leaf goal
// --------------------------------------------------------------------------

const SetAdoptedSchema = z.object({ id: z.string().uuid(), adopted: z.boolean() });

/**
 * Cross out (drop) or re-adopt a weekly goal from the committed set. The weekly
 * row is the cascade LEAF, so this only flips its own `adopted` flag (no further
 * descendants to mirror). Row is preserved for history.
 */
export async function setWeeklyAdopted(
  input: z.infer<typeof SetAdoptedSchema>,
): Promise<ActionResult<{ row: WeeklyRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SetAdoptedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const loaded = await loadWritableWeekly(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  try {
    const [row] = await db
      .update(weeklyGoals)
      .set({ adopted: parsed.data.adopted, updatedById: me.id, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, parsed.data.id))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidate();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// --------------------------------------------------------------------------
// Edit the cascade fields (area / uom / targets & actuals / dependency / evidence / parent)
// --------------------------------------------------------------------------

const numOrNull = z.number().finite().nullable().optional();

const UpdateFieldsSchema = z.object({
  id: z.string().uuid(),
  area: z.string().max(200).nullable().optional(),
  uom: z.string().max(60).nullable().optional(),
  targetQty: numOrNull,
  targetAmount: numOrNull,
  actualQty: numOrNull,
  actualAmount: numOrNull,
  teamDependencyPct: z.number().int().min(0).max(100).nullable().optional(),
  evidenceUrl: z.string().url().max(2048).nullable().optional().or(z.literal("")),
  monthGoalId: z.string().uuid().nullable().optional(),
  // Column parity with Y/Q/M (all real weekly_goals columns).
  weight: z.number().int().min(0).max(1000).optional(),
  goalType: z.enum(GOAL_TYPES).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  reviewedById: z.string().uuid().nullable().optional(),
  shareWithTeam: z.boolean().optional(),
  delegatedTo: z
    .array(z.object({ employeeId: z.string().uuid(), name: z.string().max(120).optional(), pct: z.number().int().min(0).max(100) }))
    .nullable()
    .optional(),
});

/**
 * Patch the additive cascade columns on a weekly goal. Only the keys present in
 * the payload are written (partial update). `monthGoalId` (parent monthly link)
 * is validated to belong to the SAME employee so a goal can't be re-parented to
 * someone else's cascade.
 */
export async function updateWeeklyCascadeFields(
  input: z.infer<typeof UpdateFieldsSchema>,
): Promise<ActionResult<{ row: WeeklyRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateFieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const loaded = await loadWritableWeekly(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  const d = parsed.data;

  // Validate the parent monthly goal links to the same person (or is being cleared).
  if (d.monthGoalId != null) {
    const [parent] = await db
      .select({ employeeId: goals.employeeId, period: goals.period })
      .from(goals)
      .where(eq(goals.id, d.monthGoalId))
      .limit(1);
    if (!parent) return { ok: false, error: "Parent goal not found" };
    if (parent.employeeId !== loaded.row.employeeId)
      return { ok: false, error: "Parent goal belongs to another person" };
    if (parent.period !== "month")
      return { ok: false, error: "A weekly goal can only link to a monthly goal" };
  }

  const set: Partial<typeof weeklyGoals.$inferInsert> = {
    updatedById: me.id,
    updatedAt: new Date(),
  };
  if ("area" in d) set.area = d.area ?? null;
  if ("uom" in d) set.uom = d.uom ?? null;
  if ("targetQty" in d) set.targetQty = toMoney(d.targetQty ?? null);
  if ("targetAmount" in d) set.targetAmount = toMoney(d.targetAmount ?? null);
  if ("actualQty" in d) set.actualQty = toMoney(d.actualQty ?? null);
  if ("actualAmount" in d) set.actualAmount = toMoney(d.actualAmount ?? null);
  if ("teamDependencyPct" in d) set.teamDependencyPct = d.teamDependencyPct ?? null;
  if ("evidenceUrl" in d) set.evidenceUrl = d.evidenceUrl ? d.evidenceUrl : null;
  if ("monthGoalId" in d) set.monthGoalId = d.monthGoalId ?? null;
  // Column parity with Y/Q/M.
  if ("weight" in d && d.weight !== undefined) set.weight = d.weight;
  if ("goalType" in d) set.goalType = d.goalType ?? null;
  if ("status" in d && d.status !== undefined) set.status = d.status;
  if ("reviewedById" in d) set.reviewedById = d.reviewedById ?? null;
  if ("shareWithTeam" in d && d.shareWithTeam !== undefined) set.shareWithTeam = d.shareWithTeam;
  if ("delegatedTo" in d) set.delegatedTo = d.delegatedTo ?? null;

  // Auto % Done from Actual ÷ Target (mirrors the cascade edit + inline table):
  // when target/actual just changed, progress rides on the two numbers.
  if ("targetQty" in d || "actualQty" in d) {
    const effT = "targetQty" in d ? d.targetQty ?? null : loaded.row.targetQty;
    const effA = "actualQty" in d ? d.actualQty ?? null : loaded.row.actualQty;
    const auto = autoPctDone(effT, effA);
    if (auto !== null) set.pctDone = auto;
  }

  try {
    const [row] = await db
      .update(weeklyGoals)
      .set(set)
      .where(eq(weeklyGoals.id, d.id))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidate();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// --------------------------------------------------------------------------
// Team Involved (jsonb) — stores employee ids; UI resolves live against ACTIVE
// employees (departed auto-drop) but we PRESERVE the stored id for history.
// --------------------------------------------------------------------------

const TeamMemberSchema = z.object({
  employeeId: z.string().uuid().optional(),
  name: z.string().max(120).optional(),
});
const SetTeamSchema = z.object({
  id: z.string().uuid(),
  members: z.array(TeamMemberSchema).max(30),
});

/** Replace the `team_involved` set on a weekly goal (add/remove members). */
export async function setWeeklyTeamInvolved(
  input: z.infer<typeof SetTeamSchema>,
): Promise<ActionResult<{ row: WeeklyRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SetTeamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const loaded = await loadWritableWeekly(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  try {
    const [row] = await db
      .update(weeklyGoals)
      .set({ teamInvolved: parsed.data.members, updatedById: me.id, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, parsed.data.id))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidate();
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// --------------------------------------------------------------------------
// Phase 3 (goals-canvas): the editable Week zoom stage
//   addWeekGoal      — create a weekly row in ANY week (the unified drill needs
//                      single-week creation; addChildGoal hard-refuses
//                      month→week and addNextWeekGoal only targets next week).
//   setWeeklyTitle   — inline title edit (writes target_done, the column every
//                      surface renders as the row's title).
// Both follow the invariant chain: requireGoalsAccess → rateLimit → zod →
// authorize → write → RETURN THE ROW (design §3.4). pctDone/ritual stamps are
// never touched here (locked decisions 1–2).
// --------------------------------------------------------------------------

/** Accept a numeric qty as a number OR a numeric string (kept OPTIONAL). */
const NumericQty = z.union([z.string(), z.number()]).nullish();

/** Coerce a qty input to a numeric(14,2) string (or null). Blank/non-finite → null. */
function toQty(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  const s = typeof v === "number" ? String(v) : v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Per-member team involvement (each with its OWN weight) → team_involved jsonb. */
const TeamWeightMemberSchema = z.object({
  employeeId: z.string().uuid().optional(),
  name: z.string().max(120).optional(),
  weight: z.number().int().min(0).max(1000).optional(),
});

const AddWeekGoalSchema = z.object({
  employeeId: z.string().uuid(),
  /** Monday of the target week (canvas passes the focused `wk`). */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid week"),
  title: z.string().trim().min(1, "Add a short goal").max(2000),
  area: z.string().trim().max(200).nullish(),
  /** Measure (unit of measure) → weekly_goals.uom. */
  uom: z.string().trim().max(60).nullish(),
  /** Type (goal taxonomy) → weekly_goals.goal_type. */
  category: z.string().trim().max(60).nullish(),
  /** numeric(14,2) qty columns — accept number|string, stored as string|null. */
  targetQty: NumericQty,
  actualQty: NumericQty,
  /** Weight: the goal's share of the weekly weighted-completion score. */
  weight: z.coerce.number().int().min(0).max(1000).optional(),
  /** Team members (each with their own weight) → team_involved jsonb. */
  teamInvolved: z.array(TeamWeightMemberSchema).max(30).nullish(),
  /** Optional month-goal linkage (validated: same person, period=month). */
  monthGoalId: z.string().uuid().nullish(),
  /** Deadline for this weekly goal (ISO 'YYYY-MM-DD') → weekly_goals.target_date.
   *  OPTIONAL ("" / null / absent all clear it) so existing callers stay valid. */
  targetDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"), z.literal(""), z.null()])
    .optional(),
});

/** Create a weekly goal in a specific week — self or manager-on-behalf. */
export async function addWeekGoal(
  input: z.infer<typeof AddWeekGoalSchema>,
): Promise<ActionResult<{ id: string; row: WeeklyRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AddWeekGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Authorize the TARGET person: self, admin, or in the caller's downline.
  if (d.employeeId !== me.id && !me.isAdmin) {
    const scope = await goalScopeFor(me);
    if (!scope.ids.includes(d.employeeId)) {
      return { ok: false, error: "You can't add goals for that person" };
    }
  }
  // Normalise to the week's Monday so grouping stays canonical.
  const weekStart = mondayOf(d.weekStart);

  // Validate the optional month linkage (same rules as updateWeeklyCascadeFields).
  if (d.monthGoalId != null) {
    const [parent] = await db
      .select({ employeeId: goals.employeeId, period: goals.period })
      .from(goals)
      .where(eq(goals.id, d.monthGoalId))
      .limit(1);
    if (!parent) return { ok: false, error: "Parent goal not found" };
    if (parent.employeeId !== d.employeeId)
      return { ok: false, error: "Parent goal belongs to another person" };
    if (parent.period !== "month")
      return { ok: false, error: "A weekly goal can only link to a monthly goal" };
  }

  const targetQty = toQty(d.targetQty);
  const actualQty = toQty(d.actualQty);
  // % Done rides on Actual ÷ Target when both are given (mirrors the inline
  // edit + import); otherwise the column keeps its 0 default.
  const auto = autoPctDone(targetQty, actualQty);

  try {
    const position = await nextPosition(d.employeeId, weekStart);
    const [row] = await db
      .insert(weeklyGoals)
      .values({
        employeeId: d.employeeId,
        weekStart,
        position,
        targetDone: d.title,
        area: d.area ?? null,
        uom: d.uom ?? null,
        goalType: d.category ?? null,
        targetQty,
        actualQty,
        weight: d.weight ?? 100,
        teamInvolved: d.teamInvolved && d.teamInvolved.length > 0 ? d.teamInvolved : null,
        ...(auto !== null ? { pctDone: auto } : {}),
        targetDate: d.targetDate || null,
        monthGoalId: d.monthGoalId ?? null,
        adopted: true,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning();
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidate();
    revalidatePath("/goals/cascade");
    return { ok: true, id: row.id, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const SetTitleSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "Title can't be empty").max(2000),
});

/** Inline title edit for a weekly row (writes `target_done`). */
export async function setWeeklyTitle(
  input: z.infer<typeof SetTitleSchema>,
): Promise<ActionResult<{ row: WeeklyRow }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SetTitleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const loaded = await loadWritableWeekly(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  try {
    const [row] = await db
      .update(weeklyGoals)
      .set({ targetDone: parsed.data.title, updatedById: me.id, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, parsed.data.id))
      .returning();
    if (!row) return { ok: false, error: "Goal not found" };
    revalidate();
    revalidatePath("/goals/cascade");
    return { ok: true, row };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// --------------------------------------------------------------------------
// Carry a weekly goal forward (clone) into a chosen target week
// --------------------------------------------------------------------------

const CloneForwardSchema = z.object({
  id: z.string().uuid(),
  toWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  retainProgress: z.boolean().optional(),
});

/**
 * Clone a weekly goal forward into `toWeekStart` (e.g. W1→W2/W4, W3→W2/W1). The
 * origin stays put (footprint preserved via `carriedFromId`); progress resets to
 * 0% unless `retainProgress`. The commit/approval stamps are always cleared on
 * the clone (a fresh week needs a fresh commit). Copies the cascade fields.
 */
export async function cloneWeeklyForward(
  input: z.infer<typeof CloneForwardSchema>,
): Promise<ActionResult<{ id: string; row: WeeklyRow | null }>> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CloneForwardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const loaded = await loadWritableWeekly(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  const src = loaded.row;
  const toWeek = mondayOf(parsed.data.toWeekStart);
  const retain = parsed.data.retainProgress === true;

  try {
    const id = await cloneRow(src, toWeek, retain, me.id);
    const [row] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
    revalidate();
    return { ok: true, id, row: row ?? null };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Insert a forward-clone of a weekly goal row into `toWeek`; returns new id. */
async function cloneRow(
  src: WeeklyRow,
  toWeek: string,
  retain: boolean,
  actorId: string,
): Promise<string> {
  const position = await nextPosition(src.employeeId, toWeek);
  const [row] = await db
    .insert(weeklyGoals)
    .values({
      employeeId: src.employeeId,
      weekStart: toWeek,
      position,
      client: src.client,
      subject: src.subject,
      priority: src.priority,
      incentive: src.incentive,
      kpi: src.kpi,
      targetDone: src.targetDone,
      explanation: src.explanation,
      linkUrl: src.linkUrl,
      weight: src.weight,
      notes: src.notes,
      // --- cascade fields carried forward ---
      monthGoalId: src.monthGoalId,
      area: src.area,
      uom: src.uom,
      targetQty: src.targetQty,
      targetAmount: src.targetAmount,
      actualQty: retain ? src.actualQty : null,
      actualAmount: retain ? src.actualAmount : null,
      teamInvolved: src.teamInvolved,
      teamDependencyPct: src.teamDependencyPct,
      evidenceUrl: retain ? src.evidenceUrl : null,
      adopted: true,
      // A carried row starts uncommitted / unapproved for the new week.
      committedAt: null,
      approvedByManagerAt: null,
      pctDone: retain ? src.pctDone : 0,
      carriedFromId: src.id,
      createdById: actorId,
      updatedById: actorId,
    })
    .returning({ id: weeklyGoals.id });
  return row!.id;
}

// --------------------------------------------------------------------------
// Carry ALL unfinished forward (the manual "auto-forward" opt-in trigger)
// --------------------------------------------------------------------------

const CarryAllSchema = z.object({
  employeeId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  retainProgress: z.boolean().optional(),
});

/**
 * Clone every UNFINISHED (effective % < 100), adopted, non-archived weekly goal
 * from (employee, weekStart) into the target week (defaults to the next week).
 * The opt-in "move week n → n+1 automatically" ritual, run on demand. Skips
 * goals already carried into the target week (same `carriedFromId`) so re-runs
 * are idempotent. Returns how many were carried.
 */
export async function carryAllUnfinishedForward(
  input: z.infer<typeof CarryAllSchema>,
): Promise<ActionResult<{ carried: number }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CarryAllSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { employeeId, weekStart } = parsed.data;

  // Permission: admin, self, or a manager of the target person.
  if (!isAdmin && employeeId !== me.id) {
    const scope = await goalScopeFor(me);
    if (!scope.ids.includes(employeeId))
      return { ok: false, error: "You can only carry your own or your team's goals" };
  }

  const toWeek = parsed.data.toWeekStart
    ? mondayOf(parsed.data.toWeekStart)
    : nextWeekStart(mondayOf(weekStart));
  const retain = parsed.data.retainProgress === true;

  try {
    const rows = await db
      .select()
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.employeeId, employeeId),
          eq(weeklyGoals.weekStart, mondayOf(weekStart)),
          eq(weeklyGoals.archived, false),
          eq(weeklyGoals.adopted, true),
        ),
      )
      .orderBy(asc(weeklyGoals.position));

    const unfinished = rows.filter(
      (r) => effectivePct({ acceptPct: r.acceptPct, pctDone: r.pctDone }) < 100,
    );
    if (unfinished.length === 0) return { ok: true, carried: 0 };

    // Idempotency: don't re-carry a source that already has a clone in toWeek.
    const already = await db
      .select({ carriedFromId: weeklyGoals.carriedFromId })
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.employeeId, employeeId),
          eq(weeklyGoals.weekStart, toWeek),
          inArray(
            weeklyGoals.carriedFromId,
            unfinished.map((r) => r.id),
          ),
        ),
      );
    const carriedIds = new Set(already.map((r) => r.carriedFromId));

    let carried = 0;
    for (const src of unfinished) {
      if (carriedIds.has(src.id)) continue;
      await cloneRow(src, toWeek, retain, me.id);
      carried++;
    }
    revalidate();
    return { ok: true, carried };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}
