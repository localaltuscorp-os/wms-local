import { NextResponse } from "next/server";
import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  eventCategories,
  eventBatchTypes,
  calendarEvents,
  eventBatchSchedules,
  obligations,
  type Employee,
} from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { eventsAccessForEmployee } from "@/lib/monthly-events/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Admin-only gate (masters is an admin surface — mirrors `requireEventsAdmin`). */
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
/** Postgres unique-violation → a friendly message (mirrors masters/actions.ts). */
const dbError = (err: unknown, dupMsg: string) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/duplicate key|unique constraint|already exists/i.test(msg)) return bad(dupMsg);
  return NextResponse.json({ error: msg }, { status: 500, headers: MOBILE_CORS });
};

/** Merge the per-category reference counts from all four referencing tables
 *  (verbatim from the web masters page). */
async function usageByCategory(): Promise<Map<string, number>> {
  const groups = await Promise.all([
    db
      .select({ id: calendarEvents.categoryId, n: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(isNotNull(calendarEvents.categoryId))
      .groupBy(calendarEvents.categoryId),
    db
      .select({ id: eventBatchSchedules.categoryId, n: sql<number>`count(*)::int` })
      .from(eventBatchSchedules)
      .where(isNotNull(eventBatchSchedules.categoryId))
      .groupBy(eventBatchSchedules.categoryId),
    db
      .select({ id: obligations.categoryId, n: sql<number>`count(*)::int` })
      .from(obligations)
      .where(isNotNull(obligations.categoryId))
      .groupBy(obligations.categoryId),
    db
      .select({ id: eventBatchTypes.defaultCategoryId, n: sql<number>`count(*)::int` })
      .from(eventBatchTypes)
      .where(isNotNull(eventBatchTypes.defaultCategoryId))
      .groupBy(eventBatchTypes.defaultCategoryId),
  ]);
  const map = new Map<string, number>();
  for (const rows of groups) {
    for (const r of rows) {
      if (!r.id) continue;
      map.set(r.id, (map.get(r.id) ?? 0) + Number(r.n));
    }
  }
  return map;
}

/**
 * GET /api/mobile/events/masters — the category colour legend (with in-use
 * counts) and the batch/section types, the same rows the web masters workbench
 * renders. Admin-only. Returns `{ categories, batchTypes }`.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const g = await requireAdmin(me);
  if (!g.ok) return g.res;

  const [categoryRows, batchTypeRows, usage] = await Promise.all([
    db.select().from(eventCategories).orderBy(eventCategories.sortOrder, eventCategories.name),
    db.select().from(eventBatchTypes).orderBy(eventBatchTypes.sortOrder, eventBatchTypes.name),
    usageByCategory(),
  ]);

  return NextResponse.json(
    {
      categories: categoryRows.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        usage: usage.get(c.id) ?? 0,
      })),
      batchTypes: batchTypeRows.map((b) => ({
        id: b.id,
        name: b.name,
        defaultCategoryId: b.defaultCategoryId,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
      })),
    },
    { headers: MOBILE_CORS },
  );
}

// ── validation (mirrors masters/actions.ts) ──────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;
const nameField = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().min(1, "A name is required.").max(80),
);
const colorField = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().regex(HEX, "Pick a colour or enter a valid hex (#RRGGBB)."),
);
const idField = z.string().uuid("Invalid id.");
const optCategoryId = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().uuid().nullable(),
);

const CreateCategorySchema = z.object({ name: nameField, color: colorField });
const UpdateCategorySchema = z.object({ id: idField, name: nameField, color: colorField });
const ReorderSchema = z.object({ ids: z.array(idField).min(1) });
const ArchiveSchema = z.object({
  id: idField,
  mode: z.enum(["none", "reassign", "clear"]).default("none"),
  reassignToId: optCategoryId.optional(),
});
const CreateBatchTypeSchema = z.object({ name: nameField, defaultCategoryId: optCategoryId });
const UpdateBatchTypeSchema = z.object({ id: idField, name: nameField, defaultCategoryId: optCategoryId });
const SetBatchTypeActiveSchema = z.object({ id: idField, isActive: z.boolean() });

/**
 * POST /api/mobile/events/masters — admin CRUD over the masters, one branch per
 * web server action (same zod shapes / writes):
 *   createCategory | updateCategory | reorderCategories | archiveCategory |
 *   restoreCategory | createBatchType | updateBatchType | setBatchTypeActive
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
  const stamp = { updatedById: me.id, updatedAt: new Date() };

  try {
    switch (action) {
      case "createCategory": {
        const p = CreateCategorySchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        try {
          const [{ next } = { next: 1 }] = (await db
            .select({ next: sql<number>`COALESCE(MAX(${eventCategories.sortOrder}), 0) + 1` })
            .from(eventCategories)) as Array<{ next: number }>;
          const [row] = await db
            .insert(eventCategories)
            .values({ name: p.data.name, color: p.data.color, sortOrder: next, createdById: me.id })
            .returning({ id: eventCategories.id });
          return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
        } catch (err) {
          return dbError(err, "A category with that name already exists.");
        }
      }
      case "updateCategory": {
        const p = UpdateCategorySchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        try {
          await db
            .update(eventCategories)
            .set({ name: p.data.name, color: p.data.color, ...stamp })
            .where(eq(eventCategories.id, p.data.id));
          return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
        } catch (err) {
          return dbError(err, "A category with that name already exists.");
        }
      }
      case "reorderCategories": {
        const p = ReorderSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await Promise.all(
          p.data.ids.map((id, i) =>
            db
              .update(eventCategories)
              .set({ sortOrder: (i + 1) * 10, ...stamp })
              .where(eq(eventCategories.id, id)),
          ),
        );
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "archiveCategory": {
        const p = ArchiveSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const { id, mode, reassignToId } = p.data;
        if (mode === "reassign") {
          if (!reassignToId) return bad("Choose a category to reassign to.");
          if (reassignToId === id) return bad("Choose a different category to reassign to.");
        }
        const target = mode === "reassign" ? reassignToId! : null;
        if (mode !== "none") {
          await Promise.all([
            db.update(calendarEvents).set({ categoryId: target, ...stamp }).where(eq(calendarEvents.categoryId, id)),
            db.update(eventBatchSchedules).set({ categoryId: target, ...stamp }).where(eq(eventBatchSchedules.categoryId, id)),
            db.update(obligations).set({ categoryId: target, ...stamp }).where(eq(obligations.categoryId, id)),
            db.update(eventBatchTypes).set({ defaultCategoryId: target, ...stamp }).where(eq(eventBatchTypes.defaultCategoryId, id)),
          ]);
        }
        await db
          .update(eventCategories)
          .set({ isActive: false, ...stamp })
          .where(eq(eventCategories.id, id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "restoreCategory": {
        const p = idField.safeParse(body.id);
        if (!p.success) return bad("Invalid id.");
        await db
          .update(eventCategories)
          .set({ isActive: true, ...stamp })
          .where(eq(eventCategories.id, p.data));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "createBatchType": {
        const p = CreateBatchTypeSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        try {
          const [{ next } = { next: 1 }] = (await db
            .select({ next: sql<number>`COALESCE(MAX(${eventBatchTypes.sortOrder}), 0) + 1` })
            .from(eventBatchTypes)) as Array<{ next: number }>;
          const [row] = await db
            .insert(eventBatchTypes)
            .values({
              name: p.data.name,
              defaultCategoryId: p.data.defaultCategoryId,
              sortOrder: next,
              createdById: me.id,
            })
            .returning({ id: eventBatchTypes.id });
          return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
        } catch (err) {
          return dbError(err, "A batch type with that name already exists.");
        }
      }
      case "updateBatchType": {
        const p = UpdateBatchTypeSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        try {
          await db
            .update(eventBatchTypes)
            .set({ name: p.data.name, defaultCategoryId: p.data.defaultCategoryId, ...stamp })
            .where(eq(eventBatchTypes.id, p.data.id));
          return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
        } catch (err) {
          return dbError(err, "A batch type with that name already exists.");
        }
      }
      case "setBatchTypeActive": {
        const p = SetBatchTypeActiveSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(eventBatchTypes)
          .set({ isActive: p.data.isActive, ...stamp })
          .where(eq(eventBatchTypes.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
