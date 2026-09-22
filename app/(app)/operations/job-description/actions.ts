"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  employees,
  jdAssignments,
  jdAttachments,
  jdDoerNotes,
  jdEntries,
  jdPositionHolders,
  jdPositions,
  jdRanks,
  opsChecklistItems,
  opsChecklistRuns,
} from "@/db/schema";
import { isOfferedFunction } from "@/lib/jd/functions";
import { JD_BULK_MAX } from "@/lib/jd/bulk";
/* AUTHORING STAYS WITH HR (2026-09-12). The Bank moved to the Operations room,
   which is OPEN to every employee — so switching these to the room's own gate
   would have handed "create, edit and retire a job description" to the whole
   company as a side effect of a nav change. Reading moved; writing did not. */
import { canActAsHrStaff, requireHrStaff } from "@/lib/hr/access";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { toAssignmentRows } from "@/lib/jd/assignment-targets";
import { buildJdAttachmentRows } from "@/lib/jd/attachments";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseRRule } from "@/lib/recurrence/rrule";
import { BUSINESS_FUNCTIONS, FUNCTION_LABELS } from "@/lib/org/functions";
import {
  demoCreateEntry,
  demoCreatePosition,
  demoSetEntryActive,
  demoUpdateEntry,
  jdDemoActive,
} from "@/lib/demo/jd-demo";

const PATH = "/operations/job-description";
/** Every page that shows these rows: the area's own page AND the Masters section. */
function revalidateJd() {
  revalidatePath(PATH);
  revalidatePath("/operations/masters", "layout");
}

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

/* Nullable as well as optional: the New JD form sends `null` for an empty link
   slot, and a blank slot is the ordinary case — rejecting it made every JD
   without all three links unsaveable. */
const optUrl = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).nullable().optional())
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
  /* The Custom dialog's output. The rule is PARSED here, not merely shape-
     checked: an RRULE the generator cannot read is a job description that never
     comes due, which is the same silent months-later failure as a dateless
     "once" — and the account holder would have no way to tell from the form. */
  z.object({
    kind: z.literal("rrule"),
    rule: z
      .string()
      .max(200)
      .refine((r) => parseRRule(r) !== null, "That custom recurrence could not be read."),
    anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
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
    revalidateJd();
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

    revalidateJd();
    return { ok: true, id: row!.id };
  } catch {
    // The uniqueness rule is an expression index, so a duplicate surfaces here.
    return fail("That position already exists.");
  }
}

/* ── The JD Bank ──────────────────────────────────────────────────────────── */

/* WHO, PER DESTINATION — one list per box on the form. A person may appear in
   more than one and becomes a single assignment row with several flags. See
   lib/jd/assignment-targets.ts for why it is one row and not three. */
const TargetPeopleInput = z.object({
  dcc: z.array(idText).default([]),
  wms: z.array(idText).default([]),
  event: z.array(idText).default([]),
});

/* SOP FILES already uploaded from the form's three boxes (2026-09-18) —
   recorded in the same transaction as the JD, so a JD is never saved with half
   its files. The refs are re-vetted in buildJdAttachmentRows: they came back
   through the client. Only createJdEntry reads this. */
const AttachmentsInput = z
  .array(
    z.object({
      kind: z.enum(["video", "guidelines", "template"]),
      path: z.string().min(1).max(400),
      fileName: z.string().min(1).max(300),
      size: z.number().int().positive(),
    }),
  )
  .max(30);

/* WHICH EVENTS (2026-09-18) — the Event Checklist box lists event checklists,
   not people. Each chosen one gets this JD as a row (ops_checklist_items.
   jd_entry_id); see syncEventRows. */
const EventRunIdsInput = z.array(idText).max(100);

/**
 * The fields, WITHOUT defaults. Zod 4 applies a `.default()` even inside
 * `.partial()`, so an update schema derived from a defaulted one fills every
 * omitted field back in — which made a one-field save from the drawer also
 * write pushDcc/pushWms/pushEvent = false and an empty roster, switching off
 * every destination and unassigning everybody. Create adds the defaults on top
 * of this; update takes it as it is (tests/unit/jd-update-entry.test.ts).
 */
const EntryShape = {
  /* EXACTLY ONE OWNER — a position (the Master JD) or a person (their personal
     JD, migration 0233). createJdEntry / bulkCreateJdEntries check it, and a
     CHECK in the database backs them. */
  positionId: idText.optional(),
  ownerEmployeeId: idText.optional(),
  /** Needed only for a personal task — a position's task takes its function. */
  functionKey: functionKey.optional(),
  task: z.string().trim().min(1, "Describe the task.").max(2000),
  /** Shown as SUBJECT — picked from the WMS Tasks roster (Admin Panel → Subjects). */
  category: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(120).nullable().optional())
    .transform((s) => (s ? s : null)),
  /** From the WMS Tasks client roster (Admin Panel → Clients). Migration 0237. */
  client: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(200).nullable().optional())
    .transform((s) => (s ? s : null)),
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
  pushDcc: z.boolean(),
  pushWms: z.boolean(),
  pushEvent: z.boolean(),
  targetPeople: TargetPeopleInput,
  attachments: AttachmentsInput,
  eventRunIds: EventRunIdsInput,
};

const EntryFields = z.object({
  ...EntryShape,
  pushDcc: z.boolean().default(false),
  pushWms: z.boolean().default(false),
  pushEvent: z.boolean().default(false),
  targetPeople: TargetPeopleInput.default({ dcc: [], wms: [], event: [] }),
  attachments: AttachmentsInput.default([]),
  eventRunIds: EventRunIdsInput.default([]),
});

export async function createJdEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EntryFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid job description.");
  const v = parsed.data;

  if (Boolean(v.positionId) === Boolean(v.ownerEmployeeId)) {
    return fail("Pick a position for a Master JD, or a person for a personal task — one of the two.");
  }

  if (jdDemoActive()) {
    if (!v.positionId) return fail("Personal tasks need the JD tables — apply migration 0233.");
    if (v.attachments.length > 0) return fail("Attached files need the JD tables — apply migration 0222.");
    const id = demoCreateEntry({ ...v, positionId: v.positionId });
    if (!id) return fail("That position no longer exists.");
    revalidateJd();
    return { ok: true, id };
  }

  try {
    const owner = await resolveEntryOwner(v);
    if (!owner.ok) return owner;
    // The JD's id does not exist yet; each row gets it inside the transaction.
    const files = buildJdAttachmentRows(v.attachments, me.id, "");
    if (!files.ok) return files;

    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(jdEntries)
        .values({
          positionId: v.positionId ?? null,
          ownerEmployeeId: v.ownerEmployeeId ?? null,
          // A position's function is denormalised from the position — never
          // taken from the form, so the two cannot drift apart. A personal task
          // carries the function picked for it.
          functionKey: owner.functionKey,
          task: v.task,
          category: v.category,
          client: v.client,
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

      if (files.rows.length > 0) {
        await tx.insert(jdAttachments).values(files.rows.map((f) => ({ ...f, jdId: row!.id })));
      }

      if (v.pushEvent && v.eventRunIds.length > 0) {
        await syncEventRows(
          tx,
          row!.id,
          v.eventRunIds,
          { task: v.task, category: v.category, client: v.client },
          me.id,
        );
      }

      return row!.id;
    });

    revalidateJd();
    if (v.pushEvent && v.eventRunIds.length > 0) revalidatePath("/operations/checklist");
    return { ok: true, id };
  } catch {
    return fail("Could not save the job description. Nothing was written.");
  }
}

const UpdateEntry = z.object(EntryShape).partial().extend({ id: idText });

export async function updateJdEntry(input: unknown): Promise<ActionResult> {
  const me = await requireHrStaff();

  const parsed = UpdateEntry.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");
  const { id, targetPeople, ...rest } = parsed.data;

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  for (const k of [
    "task",
    "category",
    "client",
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
    revalidateJd();
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

      /* EVENTS. Re-synced when the chosen events or the Event switch changed;
         the JD's rows follow its text when the task, subject or client changed. */
      const eventsTouched = rest.eventRunIds !== undefined || rest.pushEvent !== undefined;
      const textTouched = rest.task !== undefined || rest.category !== undefined || rest.client !== undefined;
      if (eventsTouched || textTouched) {
        const [cur] = await tx
          .select({
            task: jdEntries.task,
            category: jdEntries.category,
            client: jdEntries.client,
            pushEvent: jdEntries.pushEvent,
          })
          .from(jdEntries)
          .where(eq(jdEntries.id, id))
          .limit(1);
        if (cur && eventsTouched) {
          const wanted = !cur.pushEvent
            ? []
            : (rest.eventRunIds ??
              (
                await tx
                  .select({ runId: opsChecklistItems.runId })
                  .from(opsChecklistItems)
                  .where(and(eq(opsChecklistItems.jdEntryId, id), eq(opsChecklistItems.isActive, true), isNotNull(opsChecklistItems.runId)))
              ).map((r) => r.runId!));
          await syncEventRows(tx, id, wanted, cur, me.id);
        }
        if (cur && textTouched) {
          await tx
            .update(opsChecklistItems)
            .set({
              title: cur.task,
              category: cur.category,
              client: cur.client,
              updatedById: me.id,
              updatedAt: new Date(),
            })
            .where(and(eq(opsChecklistItems.jdEntryId, id), isNotNull(opsChecklistItems.runId)));
        }
      }
    });

    revalidateJd();
    revalidatePath("/operations/checklist");
    return { ok: true };
  } catch {
    return fail("Could not save that change.");
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Make this JD a row in exactly the chosen EVENT CHECKLISTS (2026-09-18).
 *
 * The Event Checklist box on the form lists events, not people: choosing one
 * puts the task into that event's checklist as a row pointing back at the JD
 * (`ops_checklist_items.jd_entry_id`), where the event's own Doer / Status /
 * date columns take over. So:
 *
 *   · an event newly chosen      → a row is added (on the event day, offset 0)
 *   · an event chosen again      → its old row comes back, ticks and all
 *   · an event no longer chosen  → its row is taken off (is_active = false),
 *                                   never deleted — its ticks are the record
 *
 * Only LIVE event checklists are touched: the ids come from the client, and a
 * completed or cancelled event's rows are history this must not rewrite.
 */
async function syncEventRows(
  tx: Tx,
  jdId: string,
  wanted: readonly string[],
  jd: { task: string; category: string | null; client: string | null },
  actorId: string,
): Promise<void> {
  const ids = [...new Set(wanted)];
  const existing = await tx
    .select({ id: opsChecklistItems.id, runId: opsChecklistItems.runId, isActive: opsChecklistItems.isActive })
    .from(opsChecklistItems)
    .where(and(eq(opsChecklistItems.jdEntryId, jdId), isNotNull(opsChecklistItems.runId)));

  const candidateRuns = [...new Set([...ids, ...existing.map((e) => e.runId!)])];
  const live = new Set(
    candidateRuns.length === 0
      ? []
      : (
          await tx
            .select({ id: opsChecklistRuns.id })
            .from(opsChecklistRuns)
            .where(
              and(
                inArray(opsChecklistRuns.id, candidateRuns),
                eq(opsChecklistRuns.isEvent, true),
                eq(opsChecklistRuns.status, "active"),
              ),
            )
        ).map((r) => r.id),
  );
  const keep = new Set(ids.filter((r) => live.has(r)));
  const stamp = { updatedById: actorId, updatedAt: new Date() };

  const off = existing.filter((e) => e.isActive && live.has(e.runId!) && !keep.has(e.runId!)).map((e) => e.id);
  if (off.length > 0) {
    await tx.update(opsChecklistItems).set({ isActive: false, ...stamp }).where(inArray(opsChecklistItems.id, off));
  }
  const back = existing.filter((e) => !e.isActive && keep.has(e.runId!)).map((e) => e.id);
  if (back.length > 0) {
    await tx.update(opsChecklistItems).set({ isActive: true, ...stamp }).where(inArray(opsChecklistItems.id, back));
  }
  const had = new Set(existing.map((e) => e.runId));
  const add = [...keep].filter((r) => !had.has(r));
  if (add.length > 0) {
    await tx.insert(opsChecklistItems).values(
      add.map((runId) => ({
        runId,
        title: jd.task,
        category: jd.category,
        client: jd.client,
        offsetDays: 0,
        jdEntryId: jdId,
        sortOrder: 900,
        // Whoever put the JD into the event asked for the row.
        initiatorId: actorId,
        createdById: actorId,
        updatedById: actorId,
      })),
    );
  }
}

/* ── Owners, seats and bulk upload (2026-09-15) ───────────────────────────── */

/** A task's owner, checked: the position exists, or the person does and a function was picked. */
async function resolveEntryOwner(v: {
  positionId?: string;
  ownerEmployeeId?: string;
  functionKey?: string;
}): Promise<{ ok: true; functionKey: string } | { ok: false; error: string }> {
  if (v.positionId) {
    const pos = await db
      .select({ functionKey: jdPositions.functionKey })
      .from(jdPositions)
      .where(eq(jdPositions.id, v.positionId))
      .limit(1);
    return pos[0] ? { ok: true, functionKey: pos[0].functionKey } : fail("That position no longer exists.");
  }
  if (!v.functionKey || !isOfferedFunction(v.functionKey)) return fail("Pick the function this personal task belongs to.");
  const person = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, v.ownerEmployeeId!))
    .limit(1);
  return person[0] ? { ok: true, functionKey: v.functionKey } : fail("That person no longer exists.");
}

/**
 * Place a person in a seat — or take them out of theirs (positionId null).
 *
 * One live seat per person (a partial unique index): the current one is
 * retired, never deleted, so the record of where they sat survives the move.
 */
export async function setJdPositionHolder(input: unknown): Promise<ActionResult> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ employeeId: idText, positionId: idText.nullable() }).safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  if (jdDemoActive()) return fail("Placing people in seats needs the JD tables.");
  const { employeeId, positionId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(jdPositionHolders)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(jdPositionHolders.employeeId, employeeId), eq(jdPositionHolders.isActive, true)));
      if (positionId) {
        await tx.insert(jdPositionHolders).values({ positionId, employeeId, createdById: me.id });
      }
    });
  } catch {
    return fail("Could not change the seat.");
  }
  revalidateJd();
  return { ok: true };
}

/**
 * BULK UPLOAD — every task from the Excel sheet in one go (lib/jd/bulk.ts reads
 * and checks the sheet on screen first). All-or-nothing: one transaction, so a
 * failure part-way leaves the Bank exactly as it was rather than half-imported.
 */
export async function bulkCreateJdEntries(input: unknown): Promise<ActionResult<{ created: number }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ rows: z.array(EntryFields).min(1).max(JD_BULK_MAX) }).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const row = typeof issue?.path[1] === "number" ? `Row ${issue.path[1] + 1}: ` : "";
    return fail(`${row}${issue?.message ?? "Invalid rows."}`);
  }
  if (jdDemoActive()) return fail("Bulk upload needs the JD tables.");
  const rows = parsed.data.rows;

  for (const [i, v] of rows.entries()) {
    if (Boolean(v.positionId) === Boolean(v.ownerEmployeeId)) {
      return fail(`Row ${i + 1}: fill a position or a person — one of the two.`);
    }
  }

  try {
    const created = await db.transaction(async (tx) => {
      const positionIds = [...new Set(rows.map((r) => r.positionId).filter((x): x is string => Boolean(x)))];
      const positionFn = new Map(
        positionIds.length
          ? (
              await tx
                .select({ id: jdPositions.id, functionKey: jdPositions.functionKey })
                .from(jdPositions)
                .where(inArray(jdPositions.id, positionIds))
            ).map((p) => [p.id, p.functionKey] as const)
          : [],
      );

      let n = 0;
      for (const [i, v] of rows.entries()) {
        const fn = v.positionId ? positionFn.get(v.positionId) : v.functionKey;
        if (!fn) throw new Error(`Row ${i + 1}: ${v.positionId ? "that position no longer exists" : "pick a function"}.`);
        const [row] = await tx
          .insert(jdEntries)
          .values({
            positionId: v.positionId ?? null,
            ownerEmployeeId: v.ownerEmployeeId ?? null,
            functionKey: fn,
            task: v.task,
            category: v.category,
            client: v.client,
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
        const assignments = toAssignmentRows(v.targetPeople, { dcc: v.pushDcc, wms: v.pushWms, event: v.pushEvent });
        if (assignments.length > 0) {
          await tx.insert(jdAssignments).values(
            assignments.map((a) => ({
              jdId: row!.id,
              employeeId: a.employeeId,
              source: "manual",
              forDcc: a.forDcc,
              forWms: a.forWms,
              forEvent: a.forEvent,
              assignedById: me.id,
            })),
          );
        }
        n++;
      }
      return n;
    });
    revalidateJd();
    return { ok: true, created };
  } catch (err) {
    const msg = err instanceof Error && /^Row \d+:/.test(err.message) ? err.message : "Could not save the upload. Nothing was written.";
    return fail(msg);
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
    revalidateJd();
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
    revalidateJd();
    return { ok: true };
  } catch {
    return fail("Could not change that job description.");
  }
}

/* ── Doer Notes (2026-09-18) ──────────────────────────────────────────────── */

const DoerNotes = z.object({
  jdId: idText,
  employeeId: idText,
  notes: optText,
});

/**
 * What the PERSON doing a JD writes against it — the Doer Notes column of their
 * JD. Per person (jd_doer_notes, migration 0237): a seat's JD is shared by
 * everyone in the seat, and one holder's notes are not another's.
 *
 * Written by the person themself, or by HR, who keep the JDs.
 */
export async function setJdDoerNotes(input: unknown): Promise<ActionResult> {
  const me = await requireWorkspace("operations");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DoerNotes.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid note.");
  const v = parsed.data;

  if (v.employeeId !== me.id && !(await canActAsHrStaff(me))) {
    return fail("Only the person doing this job, or HR, can write its Doer Notes.");
  }
  if (jdDemoActive()) return fail("Doer Notes need the JD tables — apply migration 0237.");

  try {
    await db
      .insert(jdDoerNotes)
      .values({ jdId: v.jdId, employeeId: v.employeeId, notes: v.notes, updatedById: me.id })
      .onConflictDoUpdate({
        target: [jdDoerNotes.jdId, jdDoerNotes.employeeId],
        set: { notes: v.notes, updatedById: me.id, updatedAt: new Date() },
      });
    revalidateJd();
    return { ok: true };
  } catch {
    return fail("Could not save the note. If this keeps happening, migration 0237 may not have been run.");
  }
}
