"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { jdAssignments, jdEntries, jdPositions, jdRanks } from "@/db/schema";
/* AUTHORING STAYS WITH HR (2026-09-12). The Bank moved to the Operations room,
   which is OPEN to every employee — so switching these to the room's own gate
   would have handed "create, edit and retire a job description" to the whole
   company as a side effect of a nav change. Reading moved; writing did not. */
import { requireHrStaff } from "@/lib/hr/access";
import { toAssignmentRows } from "@/lib/jd/assignment-targets";
import { rateLimitOrError } from "@/lib/rate-limit";
import { BUSINESS_FUNCTIONS, FUNCTION_LABELS } from "@/lib/org/functions";
import {
  demoCreateEntry,
  demoCreatePosition,
  demoSetEntryActive,
  demoUpdateEntry,
  jdDemoActive,
} from "@/lib/demo/jd-demo";

const PATH = "/operations/job-description";

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
 * A uuid — or one of the demo dataset's readable ids while 0222 is unapplied.
 *
 * `jdDemoActive()` cannot be true unless a read has already failed with 42P01,
 * so this never widens what a real table would accept.
 */
const idText = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (v) => z.string().uuid().safeParse(v).success || (jdDemoActive() && v.startsWith("demo-")),
    "Invalid id.",
  );

/**
 * The recurrence shape, validated rather than trusted.
 *
 * A jsonb column accepts anything Postgres can parse, so the guard has to be
 * here — an unreadable recurrence would not fail on write, it would fail weeks
 * later inside the push job, at 00:15, with nobody watching.
 */
const Recurrence = z.discriminatedUnion("kind", [
  /* "Does not repeat" and "Annually on" both REQUIRE their date. A rule with no
     date can never come due, so a half-filled form would save a job description
     that quietly never happens — the failure that looks like the push job
     losing work months later. */
  z.object({
    kind: z.literal("once"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date this happens on."),
  }),
  z.object({
    kind: z.literal("yearly"),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
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
  rankId: idText,
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

  if (jdDemoActive()) {
    const id = demoCreatePosition(v);
    revalidatePath(PATH);
    return { ok: true, id };
  }

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
  positionId: idText.describe("Pick the position this job belongs to."),
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
  /* WHO, PER DESTINATION — one list per box on the form. A person may appear in
     more than one and becomes a single assignment row with several flags. See
     lib/jd/assignment-targets.ts for why it is one row and not three. */
  targetPeople: z
    .object({
      dcc: z.array(idText).default([]),
      wms: z.array(idText).default([]),
      event: z.array(idText).default([]),
    })
    .default({ dcc: [], wms: [], event: [] }),
});

export async function createJdEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EntryFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid job description.");
  const v = parsed.data;

  if (jdDemoActive()) {
    const id = demoCreateEntry(v);
    if (!id) return fail("That position no longer exists.");
    revalidatePath(PATH);
    return { ok: true, id };
  }

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

      /* Destinations that are switched OFF contribute nobody. A JD that does
         not push to the WMS cannot meaningfully have WMS people, and storing
         them anyway leaves assignments that do nothing until somebody ticks a
         box months later and is surprised by who receives the work. */
      const rows = toAssignmentRows(v.targetPeople, {
        dcc: v.pushDcc,
        wms: v.pushWms,
        event: v.pushEvent,
      });
      if (rows.length > 0) {
        await tx.insert(jdAssignments).values(
          rows.map((r) => ({
            jdId: row!.id,
            employeeId: r.employeeId,
            source: "manual",
            forDcc: r.forDcc,
            forWms: r.forWms,
            forEvent: r.forEvent,
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

const UpdateEntry = EntryFields.partial().extend({ id: idText });

export async function updateJdEntry(input: unknown): Promise<ActionResult> {
  const me = await requireHrStaff();

  const parsed = UpdateEntry.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");
  const { id, targetPeople, ...rest } = parsed.data;

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

  if (jdDemoActive()) {
    if (!demoUpdateEntry({ id, targetPeople, ...rest }))
      return fail("That job description is gone.");
    revalidatePath(PATH);
    return { ok: true };
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

      if (targetPeople !== undefined) {
        // Retire every live assignment, then re-create the chosen set. The
        // history stays readable because retiring is a flag, not a delete.
        await tx
          .update(jdAssignments)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(jdAssignments.jdId, id), eq(jdAssignments.isActive, true)));

        /* The destination switches as they will be AFTER this save — from the
           form when it sent them, from the stored row otherwise. Reading only
           the stored row would drop the people for a destination being switched
           on in the same submission, which is the ordinary case: you tick WMS
           and pick the people in one go. */
        const [stored] = await tx
          .select({
            pushDcc: jdEntries.pushDcc,
            pushWms: jdEntries.pushWms,
            pushEvent: jdEntries.pushEvent,
          })
          .from(jdEntries)
          .where(eq(jdEntries.id, id))
          .limit(1);
        const enabled = {
          dcc: rest.pushDcc ?? stored?.pushDcc ?? false,
          wms: rest.pushWms ?? stored?.pushWms ?? false,
          event: rest.pushEvent ?? stored?.pushEvent ?? false,
        };

        const rows = toAssignmentRows(targetPeople, enabled);
        if (rows.length > 0) {
          await tx
            .insert(jdAssignments)
            .values(
              rows.map((r) => ({
                jdId: id,
                employeeId: r.employeeId,
                source: "manual",
                forDcc: r.forDcc,
                forWms: r.forWms,
                forEvent: r.forEvent,
                assignedById: me.id,
              })),
            )
            // A retired row for the same person still occupies the partial
            // unique index only while it is active, so this collides with
            // nothing — but the guard costs nothing and a re-submitted form
            // must never fail on a duplicate.
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
    .object({ id: idText, isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  if (jdDemoActive()) {
    if (!demoSetEntryActive(parsed.data.id, parsed.data.isActive))
      return fail("That job description is gone.");
    revalidatePath(PATH);
    return { ok: true };
  }

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
