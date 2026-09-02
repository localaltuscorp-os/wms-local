import { NextResponse } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  calendarEvents,
  eventBatchSchedules,
  eventBatchTypes,
  eventCategories,
  type Employee,
} from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { eventsAccessForEmployee } from "@/lib/monthly-events/access";
import { reconcileBatchEvents } from "@/lib/monthly-events/reconcile";
import { EVENT_STATUSES } from "@/db/enums";
import { DAY_START_MIN, DAY_END_MIN, SLOT_MIN } from "@/lib/monthly-events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Admin-only gate (batch schedules are an admin surface). */
async function requireAdmin(
  me: Employee,
): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const access = await eventsAccessForEmployee(me);
  if (!access || !access.isAdmin) {
    return {
      ok: false,
      res: NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS }),
    };
  }
  return { ok: true };
}

const bad = (error: string) =>
  NextResponse.json({ error }, { status: 400, headers: MOBILE_CORS });
const fail500 = (err: unknown) =>
  NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 500, headers: MOBILE_CORS },
  );

/**
 * GET /api/mobile/events/batches — every batch schedule (with its resolved
 * batch-type + category names and the count of calendar blocks it generated),
 * plus the active batch-type and category options for the editor. Same rows the
 * web batch workspace renders. Admin-only.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const g = await requireAdmin(me);
  if (!g.ok) return g.res;

  try {
    const [batchTypes, categories, scheduleRows, blockCounts] = await Promise.all([
      db
        .select({
          id: eventBatchTypes.id,
          name: eventBatchTypes.name,
          defaultCategoryId: eventBatchTypes.defaultCategoryId,
        })
        .from(eventBatchTypes)
        .where(eq(eventBatchTypes.isActive, true))
        .orderBy(asc(eventBatchTypes.sortOrder), asc(eventBatchTypes.name)),
      db
        .select({ id: eventCategories.id, name: eventCategories.name, color: eventCategories.color })
        .from(eventCategories)
        .where(eq(eventCategories.isActive, true))
        .orderBy(asc(eventCategories.sortOrder), asc(eventCategories.name)),
      db
        .select({
          id: eventBatchSchedules.id,
          batchTypeId: eventBatchSchedules.batchTypeId,
          batchTypeName: eventBatchTypes.name,
          name: eventBatchSchedules.name,
          startDate: eventBatchSchedules.startDate,
          endDate: eventBatchSchedules.endDate,
          startMin: eventBatchSchedules.startMin,
          endMin: eventBatchSchedules.endMin,
          daysOfWeek: eventBatchSchedules.daysOfWeek,
          categoryId: eventBatchSchedules.categoryId,
          categoryName: eventCategories.name,
          categoryColor: eventCategories.color,
          status: eventBatchSchedules.status,
          location: eventBatchSchedules.location,
          notes: eventBatchSchedules.notes,
          isActive: eventBatchSchedules.isActive,
        })
        .from(eventBatchSchedules)
        .leftJoin(eventBatchTypes, eq(eventBatchSchedules.batchTypeId, eventBatchTypes.id))
        .leftJoin(eventCategories, eq(eventBatchSchedules.categoryId, eventCategories.id))
        .orderBy(desc(eventBatchSchedules.isActive), desc(eventBatchSchedules.startDate)),
      db
        .select({ sourceRefId: calendarEvents.sourceRefId, count: sql<number>`count(*)::int` })
        .from(calendarEvents)
        .where(eq(calendarEvents.source, "batch"))
        .groupBy(calendarEvents.sourceRefId),
    ]);

    const countByRef = new Map<string, number>(
      blockCounts
        .filter((c): c is { sourceRefId: string; count: number } => !!c.sourceRefId)
        .map((c) => [c.sourceRefId, c.count]),
    );

    return NextResponse.json(
      {
        schedules: scheduleRows.map((r) => ({ ...r, blockCount: countByRef.get(r.id) ?? 0 })),
        batchTypes,
        categories,
      },
      { headers: MOBILE_CORS },
    );
  } catch (err) {
    return fail500(err);
  }
}

// ── validation (mirrors batches/actions.ts) ──────────────────────────────────
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).nullable().optional())
  .transform((s) => (s ? s : null));
const slotMin = z
  .number()
  .int()
  .min(DAY_START_MIN, "Time is before the grid starts.")
  .max(DAY_END_MIN, "Time is after the grid ends.")
  .refine((n) => n % SLOT_MIN === 0, "Times must land on a 30-minute slot.");
const BaseFields = z
  .object({
    batchTypeId: z.string().uuid("Pick a batch type."),
    name: optText,
    startDate: isoDate,
    endDate: isoDate,
    startMin: slotMin.nullable().optional().default(null),
    endMin: slotMin.nullable().optional().default(null),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .optional()
      .default([])
      .transform((a) => Array.from(new Set(a)).sort((x, y) => x - y)),
    categoryId: z.string().uuid().nullable().optional().default(null),
    status: z.enum(EVENT_STATUSES).default("confirmed"),
    location: optText,
    notes: optText,
  })
  .refine((d) => d.endDate >= d.startDate, { message: "End date can't be before the start date.", path: ["endDate"] })
  .refine((d) => (d.startMin == null) === (d.endMin == null), {
    message: "Set both a start and end time, or leave both blank (all-day).",
    path: ["endMin"],
  })
  .refine((d) => d.startMin == null || d.endMin == null || d.endMin > d.startMin, {
    message: "End time must be after the start time.",
    path: ["endMin"],
  });
const UpdateSchema = z.object({ id: z.string().uuid() }).and(BaseFields);

/**
 * POST /api/mobile/events/batches — admin CRUD, one branch per web server action
 * (same zod shapes / writes, each followed by `reconcileBatchEvents` so the
 * auto-generated calendar blocks stay in sync):
 *   createSchedule | updateSchedule | setScheduleActive | deleteSchedule
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const g = await requireAdmin(me);
  if (!g.ok) return g.res;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let body: { action?: string } & Record<string, unknown>;
  try {
    body = (await req.json()) as { action?: string } & Record<string, unknown>;
  } catch {
    return bad("invalid-json");
  }
  const action = body.action;

  try {
    switch (action) {
      case "createSchedule": {
        const p = BaseFields.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const d = p.data;
        const [row] = await db
          .insert(eventBatchSchedules)
          .values({
            batchTypeId: d.batchTypeId,
            name: d.name,
            startDate: d.startDate,
            endDate: d.endDate,
            startMin: d.startMin,
            endMin: d.endMin,
            daysOfWeek: d.daysOfWeek,
            categoryId: d.categoryId,
            status: d.status,
            location: d.location,
            notes: d.notes,
            createdById: me.id,
            updatedById: me.id,
          })
          .returning({ id: eventBatchSchedules.id });
        const id = row!.id;
        await reconcileBatchEvents(id);
        return NextResponse.json({ ok: true, id }, { headers: MOBILE_CORS });
      }
      case "updateSchedule": {
        const p = UpdateSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const { id, ...d } = p.data;
        await db
          .update(eventBatchSchedules)
          .set({
            batchTypeId: d.batchTypeId,
            name: d.name,
            startDate: d.startDate,
            endDate: d.endDate,
            startMin: d.startMin,
            endMin: d.endMin,
            daysOfWeek: d.daysOfWeek,
            categoryId: d.categoryId,
            status: d.status,
            location: d.location,
            notes: d.notes,
            updatedById: me.id,
            updatedAt: new Date(),
          })
          .where(eq(eventBatchSchedules.id, id));
        await reconcileBatchEvents(id);
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "setScheduleActive": {
        const p = z.object({ id: z.string().uuid(), isActive: z.boolean() }).safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(eventBatchSchedules)
          .set({ isActive: p.data.isActive, updatedById: me.id, updatedAt: new Date() })
          .where(eq(eventBatchSchedules.id, p.data.id));
        await reconcileBatchEvents(p.data.id);
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "deleteSchedule": {
        const p = z.object({ id: z.string().uuid() }).safeParse(body);
        if (!p.success) return bad("Invalid id.");
        await db.delete(eventBatchSchedules).where(eq(eventBatchSchedules.id, p.data.id));
        await reconcileBatchEvents(p.data.id);
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return fail500(err);
  }
}
