"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { jdAssignments, jdEntries, jdPositions, jdRanks } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { BUSINESS_FUNCTIONS, FUNCTION_LABELS } from "@/lib/org/functions";

const PATH = "/hr/job-description";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(4000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

const optUrl = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).optional())
  .transform((s) => (s ? s : null))
  .refine(
    (s) => s === null || /^https?:\/\//i.test(s),
    "Links must start with http:// or https://",
  );

const functionKey = z.enum(BUSINESS_FUNCTIONS as unknown as [string, ...string[]]);

/**
 * The recurrence shape, validated rather than trusted.
 *
 * A jsonb column accepts anything Postgres can parse, so the guard has to be
 * here — an unreadable recurrence would not fail on write, it would fail weeks
 * later inside the push job, at 00:15, with nobody watching.
 */
const Recurrence = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({ kind: z.literal("weekdays"), days: z.array(z.number().int().min(0).max(6)).min(1) }),
  z.object({
    kind: z.literal("interval"),
    everyDays: z.number().int().min(1).max(365),
    anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  }),
  z.object({
    kind: z.literal("monthly_ordinal"),
    ordinal: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
    weekday: z.number().int().min(0).max(6),
  }),
  z.object({ kind: z.literal("custom"), label: z.string().max(200) }),
]);

/* ── Positions ────────────────────────────────────────────────────────────── */

const CreatePosition = z.object({
  functionKey,
  rankId: z.string().uuid(),
  variant: optText,
});

/**
 * Create a seat.
 *
 * The title is GENERATED from function + rank + variant rather than typed, so
 * two people cannot create "Ops · Exec" and "Operations · Executive" and end up
 * with two seats that escalation treats as unrelated.
 */
export async function createJdPosition(input: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreatePosition.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid position.");
  const v = parsed.data;

  try {
    const rank = await db
      .select({ name: jdRanks.name })
      .from(jdRanks)
      .where(eq(jdRanks.id, v.rankId))
      .limit(1);
    if (rank.length === 0) return fail("That rank no longer exists.");

    const label = FUNCTION_LABELS[v.functionKey as keyof typeof FUNCTION_LABELS] ?? v.functionKey;
    const title = v.variant
      ? `${label} · ${rank[0]!.name} (${v.variant})`
      : `${label} · ${rank[0]!.name}`;

    const [row] = await db
      .insert(jdPositions)
      .values({
        functionKey: v.functionKey,
        rankId: v.rankId,
        variant: v.variant,
        title,
        createdById: me.id,
      })
      .returning({ id: jdPositions.id });

    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch {
    // The uniqueness rule is an expression index, so a duplicate surfaces here.
    return fail("That position already exists.");
  }
}

/* ── The JD Bank ──────────────────────────────────────────────────────────── */

const EntryFields = z.object({
  positionId: z.string().uuid({ message: "Pick the position this job belongs to." }),
  task: z.string().trim().min(1, "Describe the task.").max(2000),
  notesHtml: optText,
  recurrence: Recurrence,
  estimatedMinutes: z.coerce
    .number()
    .int()
    .min(1, "Estimated time must be at least 1 minute.")
    .max(960, "Estimated time cannot exceed 960 minutes (16 hours)."),
  videoUrl: optUrl,
  guidelinesUrl: optUrl,
  templateUrl: optUrl,
  pushDcc: z.boolean().default(false),
  pushWms: z.boolean().default(false),
  pushEvent: z.boolean().default(false),
  assigneeIds: z.array(z.string().uuid()).default([]),
});

export async function createJdEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EntryFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid job description.");
  const v = parsed.data;

  try {
    const pos = await db
      .select({ functionKey: jdPositions.functionKey })
      .from(jdPositions)
      .where(eq(jdPositions.id, v.positionId))
      .limit(1);
    if (pos.length === 0) return fail("That position no longer exists.");

    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(jdEntries)
        .values({
          positionId: v.positionId,
          // Denormalised from the position — never taken from the form, so the
          // two cannot drift apart and make the Bank's filters lie.
          functionKey: pos[0]!.functionKey,
          task: v.task,
          notesHtml: v.notesHtml,
          recurrence: v.recurrence,
          estimatedMinutes: v.estimatedMinutes,
          videoUrl: v.videoUrl,
          guidelinesUrl: v.guidelinesUrl,
          templateUrl: v.templateUrl,
          pushDcc: v.pushDcc,
          pushWms: v.pushWms,
          pushEvent: v.pushEvent,
          createdById: me.id,
          updatedById: me.id,
        })
        .returning({ id: jdEntries.id });

      if (v.assigneeIds.length > 0) {
        await tx.insert(jdAssignments).values(
          v.assigneeIds.map((employeeId) => ({
            jdId: row!.id,
            employeeId,
            source: "manual",
            assignedById: me.id,
          })),
        );
      }

      return row!.id;
    });

    revalidatePath(PATH);
    return { ok: true, id };
  } catch {
    return fail("Could not save the job description. Nothing was written.");
  }
}

const UpdateEntry = EntryFields.partial().extend({ id: z.string().uuid() });

export async function updateJdEntry(input: unknown): Promise<ActionResult> {
  const me = await requireHrStaff();

  const parsed = UpdateEntry.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");
  const { id, assigneeIds, ...rest } = parsed.data;

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  for (const k of [
    "task",
    "notesHtml",
    "recurrence",
    "estimatedMinutes",
    "videoUrl",
    "guidelinesUrl",
    "templateUrl",
    "pushDcc",
    "pushWms",
    "pushEvent",
  ] as const) {
    if (rest[k] !== undefined) patch[k] = rest[k];
  }

  try {
    await db.transaction(async (tx) => {
      if (rest.positionId !== undefined) {
        const pos = await tx
          .select({ functionKey: jdPositions.functionKey })
          .from(jdPositions)
          .where(eq(jdPositions.id, rest.positionId))
          .limit(1);
        if (pos.length > 0) {
          patch.positionId = rest.positionId;
          patch.functionKey = pos[0]!.functionKey;
        }
      }

      await tx.update(jdEntries).set(patch).where(eq(jdEntries.id, id));

      if (assigneeIds !== undefined) {
        // Retire every live assignment, then re-create the chosen set. The
        // history stays readable because retiring is a flag, not a delete.
        await tx
          .update(jdAssignments)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(jdAssignments.jdId, id), eq(jdAssignments.isActive, true)));

        if (assigneeIds.length > 0) {
          await tx
            .insert(jdAssignments)
            .values(
              assigneeIds.map((employeeId) => ({
                jdId: id,
                employeeId,
                source: "manual",
                assignedById: me.id,
              })),
            )
            .onConflictDoNothing();
        }
      }
    });

    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail("Could not save that change.");
  }
}

/** Retire a JD. Never deleted — history has to stay readable. */
export async function setJdEntryActive(input: unknown): Promise<ActionResult> {
  const me = await requireHrStaff();

  const parsed = z
    .object({ id: z.string().uuid(), isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  try {
    await db
      .update(jdEntries)
      .set({
        isActive: parsed.data.isActive,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(jdEntries.id, parsed.data.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail("Could not change that job description.");
  }
}
