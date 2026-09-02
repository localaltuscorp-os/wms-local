import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { calendarEvents, type Employee } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { eventsAccessForEmployee } from "@/lib/monthly-events/access";
import { getCalendarBundle } from "@/lib/queries/monthly-events-calendar";
import { DAY_START_MIN, DAY_END_MIN } from "@/lib/monthly-events/types";
import { EVENT_STATUSES } from "@/db/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

// ── Access ─────────────────────────────────────────────────────────────────
/** Resolve the Monthly-Events access for the bearer employee, or a 403 body.
 *  Mirrors the web `requireEventsAccess`/`requireEventsAdmin` gate exactly (same
 *  `eventsAccessForEmployee` helper) — viewers (Founder Office) may read; only
 *  admins may write. */
async function gate(
  me: Employee,
  needAdmin: boolean,
): Promise<{ ok: true; isAdmin: boolean } | { ok: false; res: NextResponse }> {
  const access = await eventsAccessForEmployee(me);
  if (!access) {
    return {
      ok: false,
      res: NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS }),
    };
  }
  if (needAdmin && !access.isAdmin) {
    return {
      ok: false,
      res: NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS }),
    };
  }
  return { ok: true, isAdmin: access.isAdmin };
}

// ── Shared field coercion (mirrors app/(app)/events/calendar/actions.ts) ──────
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use a valid date.");
const uuid = z.string().uuid();
const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(2000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));
const hex = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u, "Use a hex colour.")
  .nullable();
const statusEnum = z.enum(EVENT_STATUSES);
const slotMin = z.number().int().min(DAY_START_MIN).max(DAY_END_MIN);

const bad = (error: string) =>
  NextResponse.json({ error }, { status: 400, headers: MOBILE_CORS });
const fail500 = (err: unknown) =>
  NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 500, headers: MOBILE_CORS },
  );

/** First-of-month and last-of-month `YYYY-MM-DD` for a Date (UTC). */
function monthRange(now: Date): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}

/**
 * GET /api/mobile/events[?from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * The calendar workspace bundle for the inclusive `[from, to]` window (defaults
 * to the current calendar month) — the SAME data the web calendar renders via
 * `getCalendarBundle`: every event in range, the colour legend (categories) and
 * the obligations. Open to viewers (Founder Office) and admins alike; 403 for
 * anyone the web `requireEventsAccess` would redirect.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const g = await gate(me, false);
  if (!g.ok) return g.res;

  const url = new URL(req.url);
  const def = monthRange(new Date());
  const fromRaw = url.searchParams.get("from") ?? def.from;
  const toRaw = url.searchParams.get("to") ?? def.to;
  if (!isoDate.safeParse(fromRaw).success || !isoDate.safeParse(toRaw).success) {
    return bad("Invalid range.");
  }
  const [from, to] = fromRaw <= toRaw ? [fromRaw, toRaw] : [toRaw, fromRaw];

  try {
    const bundle = await getCalendarBundle(from, to);
    return NextResponse.json(
      { from, to, isAdmin: g.isAdmin, ...bundle },
      { headers: MOBILE_CORS },
    );
  } catch (err) {
    return fail500(err);
  }
}

// ── Write schemas (mirror the web calendar actions) ──────────────────────────
const CreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    categoryId: uuid.nullable().optional(),
    colorOverride: hex.optional(),
    eventDate: isoDate,
    startMin: slotMin.nullable().optional(),
    endMin: slotMin.nullable().optional(),
    allDay: z.boolean().optional(),
    status: statusEnum.optional(),
    location: optText,
    notes: optText,
    obligationId: uuid.nullable().optional(),
  })
  .refine(
    (d) => d.allDay || (d.startMin != null && d.endMin != null && d.endMin > d.startMin),
    { message: "End time must be after start time." },
  );
const UpdateSchema = CreateSchema.and(z.object({ id: uuid }));
const RenameSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, "Title is required.").max(200),
});
const MoveSchema = z
  .object({ id: uuid, eventDate: isoDate, startMin: slotMin.nullable(), endMin: slotMin.nullable() })
  .refine((d) => d.startMin == null || (d.endMin != null && d.endMin > d.startMin), {
    message: "Invalid slot.",
  });
const ResizeSchema = z
  .object({ id: uuid, startMin: slotMin, endMin: slotMin })
  .refine((d) => d.endMin > d.startMin, { message: "Invalid duration." });
const PasteItem = z.object({
  title: z.string().trim().min(1).max(200),
  categoryId: uuid.nullable().optional(),
  colorOverride: hex.optional(),
  status: statusEnum.optional(),
  location: optText,
  notes: optText,
  allDay: z.boolean().optional(),
  startMin: slotMin.nullable().optional(),
  endMin: slotMin.nullable().optional(),
  obligationId: uuid.nullable().optional(),
});
const PasteSchema = z.object({
  items: z.array(PasteItem).min(1).max(50),
  eventDate: isoDate,
  anchorMin: slotMin.optional(),
});

/**
 * POST /api/mobile/events — admin-only calendar mutations. Body carries a
 * discriminating `action` plus that action's fields; each branch mirrors the web
 * server action of the same name (same zod shape, same write, same defaults) so
 * the phone and the web calendar can never diverge:
 *   create | update | rename | move | resize | setStatus | setColour |
 *   setCategory | setLocation | tagObligation | unlock | delete | deleteMany |
 *   duplicate | paste
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const g = await gate(me, true);
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
      case "create": {
        const p = CreateSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const d = p.data;
        const [row] = await db
          .insert(calendarEvents)
          .values({
            title: d.title,
            categoryId: d.categoryId ?? null,
            colorOverride: d.colorOverride ?? null,
            eventDate: d.eventDate,
            startMin: d.allDay ? null : d.startMin ?? null,
            endMin: d.allDay ? null : d.endMin ?? null,
            allDay: d.allDay ?? false,
            status: d.status ?? "confirmed",
            location: d.location,
            notes: d.notes,
            source: "manual",
            obligationId: d.obligationId ?? null,
            createdById: me.id,
            updatedById: me.id,
          })
          .returning({ id: calendarEvents.id });
        return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
      }
      case "update": {
        const p = UpdateSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const d = p.data;
        await db
          .update(calendarEvents)
          .set({
            title: d.title,
            categoryId: d.categoryId ?? null,
            colorOverride: d.colorOverride ?? null,
            eventDate: d.eventDate,
            startMin: d.allDay ? null : d.startMin ?? null,
            endMin: d.allDay ? null : d.endMin ?? null,
            allDay: d.allDay ?? false,
            status: d.status ?? "confirmed",
            location: d.location,
            notes: d.notes,
            obligationId: d.obligationId ?? null,
            ...stamp,
          })
          .where(eq(calendarEvents.id, d.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "rename": {
        const p = RenameSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(calendarEvents)
          .set({ title: p.data.title, ...stamp })
          .where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "move": {
        const p = MoveSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const d = p.data;
        await db
          .update(calendarEvents)
          .set({ eventDate: d.eventDate, startMin: d.startMin, endMin: d.endMin, ...stamp })
          .where(eq(calendarEvents.id, d.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "resize": {
        const p = ResizeSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const d = p.data;
        await db
          .update(calendarEvents)
          .set({ startMin: d.startMin, endMin: d.endMin, ...stamp })
          .where(eq(calendarEvents.id, d.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "setStatus": {
        const p = z.object({ id: uuid, status: statusEnum }).safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(calendarEvents)
          .set({ status: p.data.status, ...stamp })
          .where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "setColour": {
        const p = z.object({ id: uuid, colorOverride: hex }).safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(calendarEvents)
          .set({ colorOverride: p.data.colorOverride, ...stamp })
          .where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "setCategory": {
        const p = z.object({ id: uuid, categoryId: uuid.nullable() }).safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(calendarEvents)
          .set({ categoryId: p.data.categoryId, ...stamp })
          .where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "setLocation": {
        const p = z.object({ id: uuid, location: optText }).safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(calendarEvents)
          .set({ location: p.data.location, ...stamp })
          .where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "tagObligation": {
        const p = z.object({ id: uuid, obligationId: uuid.nullable() }).safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(calendarEvents)
          .set({ obligationId: p.data.obligationId, ...stamp })
          .where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "unlock": {
        const p = z.object({ id: uuid }).safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        await db
          .update(calendarEvents)
          .set({ isLocked: false, ...stamp })
          .where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "delete": {
        const p = z.object({ id: uuid }).safeParse(body);
        if (!p.success) return bad("Invalid id.");
        await db.delete(calendarEvents).where(eq(calendarEvents.id, p.data.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "deleteMany": {
        const p = z.object({ ids: z.array(uuid).min(1).max(200) }).safeParse(body);
        if (!p.success) return bad("Invalid ids.");
        await db.delete(calendarEvents).where(inArray(calendarEvents.id, p.data.ids));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "duplicate": {
        const p = z.object({ id: uuid }).safeParse(body);
        if (!p.success) return bad("Invalid id.");
        const [src] = await db
          .select()
          .from(calendarEvents)
          .where(eq(calendarEvents.id, p.data.id))
          .limit(1);
        if (!src) return bad("Event not found.");
        const [row] = await db
          .insert(calendarEvents)
          .values({
            title: src.title,
            categoryId: src.categoryId,
            colorOverride: src.colorOverride,
            eventDate: src.eventDate,
            startMin: src.startMin,
            endMin: src.endMin,
            allDay: src.allDay,
            status: src.status,
            location: src.location,
            notes: src.notes,
            source: "manual",
            obligationId: src.obligationId,
            createdById: me.id,
            updatedById: me.id,
          })
          .returning({ id: calendarEvents.id });
        return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
      }
      case "paste": {
        const p = PasteSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const { items, eventDate, anchorMin } = p.data;
        const timedStarts = items
          .filter((i) => !i.allDay && i.startMin != null)
          .map((i) => i.startMin!) as number[];
        const earliest = timedStarts.length ? Math.min(...timedStarts) : DAY_START_MIN;
        const shift = anchorMin != null ? anchorMin - earliest : 0;
        const rows = items.map((i) => {
          let start = i.startMin != null ? i.startMin + shift : null;
          let end = i.endMin != null ? i.endMin + shift : null;
          if (start != null && end != null) {
            const dur = end - start;
            if (start < DAY_START_MIN) {
              start = DAY_START_MIN;
              end = Math.min(DAY_END_MIN, start + dur);
            }
            if (end > DAY_END_MIN) {
              end = DAY_END_MIN;
              start = Math.max(DAY_START_MIN, end - dur);
            }
          }
          return {
            title: i.title,
            categoryId: i.categoryId ?? null,
            colorOverride: i.colorOverride ?? null,
            eventDate,
            startMin: i.allDay ? null : start,
            endMin: i.allDay ? null : end,
            allDay: i.allDay ?? false,
            status: i.status ?? "confirmed",
            location: i.location ?? null,
            notes: i.notes ?? null,
            source: "manual" as const,
            obligationId: i.obligationId ?? null,
            createdById: me.id,
            updatedById: me.id,
          };
        });
        await db.insert(calendarEvents).values(rows);
        return NextResponse.json({ ok: true, count: rows.length }, { headers: MOBILE_CORS });
      }
      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return fail500(err);
  }
}
