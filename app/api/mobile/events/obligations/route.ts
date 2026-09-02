import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  calendarEvents,
  obligations,
  obligationCompletions,
  type Employee,
} from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { eventsAccessForEmployee } from "@/lib/monthly-events/access";
import { listCategories } from "@/lib/queries/monthly-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Admin-only gate (obligations dashboard is admin-only — design §1/§8). */
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

/** FY start year for a calendar (year, month): Apr–Mar financial year. */
const fyStartYearFor = (year: number, month: number): number =>
  month >= 4 ? year : year - 1;

/** The 12 columns of a financial year, in Apr→Mar order. */
function fyMonthCols(fyStartYear: number): Array<{ month: number; calYear: number; label: string }> {
  const order = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const ML = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return order.map((month) => ({
    month,
    calYear: month >= 4 ? fyStartYear : fyStartYear + 1,
    label: ML[month]!,
  }));
}
const fyLabel = (y: number) => `FY ${y % 100}-${(y + 1) % 100}`;

/**
 * GET /api/mobile/events/obligations[?fy=YYYY] — the obligations compliance grid
 * for a financial year (defaults to the current FY): every active obligation
 * with its per-month cells (auto-count from tagged calendar events, manual
 * override, and the effective max of the two), the 12 Apr→Mar columns, and the
 * "on-track this month" KPI. Same derivation as the web obligations dashboard.
 * Admin-only.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const g = await requireAdmin(me);
  if (!g.ok) return g.res;

  const url = new URL(req.url);
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curFy = fyStartYearFor(curYear, curMonth);
  const rawFy = parseInt(url.searchParams.get("fy") ?? "", 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  try {
    const [obligationRows, categories, completions, taggedEvents] = await Promise.all([
      db.select().from(obligations).where(eq(obligations.isActive, true)).orderBy(asc(obligations.name)),
      listCategories(),
      db
        .select()
        .from(obligationCompletions)
        .where(eq(obligationCompletions.fyStartYear, fyStartYear)),
      db
        .select({ obligationId: calendarEvents.obligationId, eventDate: calendarEvents.eventDate })
        .from(calendarEvents)
        .where(
          and(
            isNotNull(calendarEvents.obligationId),
            gte(calendarEvents.eventDate, fyStart),
            lte(calendarEvents.eventDate, fyEnd),
          ),
        ),
    ]);

    const catById = new Map(categories.map((c) => [c.id, c]));

    const autoCounts = new Map<string, number>();
    for (const ev of taggedEvents) {
      if (!ev.obligationId) continue;
      const month = Number(ev.eventDate.slice(5, 7));
      const key = `${ev.obligationId}:${month}`;
      autoCounts.set(key, (autoCounts.get(key) ?? 0) + 1);
    }

    const manualByKey = new Map<string, { count: number; note: string | null }>();
    for (const c of completions) {
      manualByKey.set(`${c.obligationId}:${c.periodMonth}`, { count: c.completedCount, note: c.note });
    }

    const cols = fyMonthCols(fyStartYear);
    const columns = cols.map((c) => {
      const isFuture = c.calYear > curYear || (c.calYear === curYear && c.month > curMonth);
      const isCurrent = c.calYear === curYear && c.month === curMonth;
      return { month: c.month, calYear: c.calYear, label: c.label, isFuture, isCurrent };
    });

    const rows = obligationRows.map((o) => {
      const cells: Record<number, { auto: number; manual: number | null; effective: number; note: string | null }> = {};
      for (const c of cols) {
        const key = `${o.id}:${c.month}`;
        const auto = autoCounts.get(key) ?? 0;
        const manual = manualByKey.get(key) ?? null;
        const manualCount = manual?.count ?? null;
        cells[c.month] = {
          auto,
          manual: manualCount,
          effective: Math.max(auto, manualCount ?? 0),
          note: manual?.note ?? null,
        };
      }
      const cat = o.categoryId ? catById.get(o.categoryId) : undefined;
      return {
        id: o.id,
        name: o.name,
        counterparty: o.counterparty,
        targetCount: o.targetCount,
        isCompulsory: o.isCompulsory,
        penaltyNote: o.penaltyNote,
        categoryId: o.categoryId,
        categoryName: cat?.name ?? null,
        categoryColor: cat?.color ?? null,
        cells,
      };
    });

    let kpi: { onTrack: number; total: number; monthLabel: string; periodMonth: number } | null = null;
    if (curFy === fyStartYear) {
      const compulsory = rows.filter((r) => r.isCompulsory);
      const onTrack = compulsory.filter((r) => {
        const cell = r.cells[curMonth];
        return cell !== undefined && cell.effective >= r.targetCount;
      }).length;
      const MLFull = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      kpi = { onTrack, total: compulsory.length, monthLabel: `${MLFull[curMonth]} ${curYear}`, periodMonth: curMonth };
    }

    return NextResponse.json(
      {
        fyStartYear,
        fyLabel: fyLabel(fyStartYear),
        columns,
        rows,
        kpi,
        categoryOptions: categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      },
      { headers: MOBILE_CORS },
    );
  } catch (err) {
    return fail500(err);
  }
}

// ── validation (mirrors obligations/actions.ts) ──────────────────────────────
const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).nullable().optional())
  .transform((s) => (s ? s : null));
const optUuid = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.string().uuid().nullable(),
);
const ObligationFields = z.object({
  name: z.string().trim().min(1, "A name is required.").max(300),
  counterparty: optText,
  targetCount: z.coerce.number().int().min(1, "Target must be at least 1.").max(999),
  isCompulsory: z.coerce.boolean(),
  penaltyNote: optText,
  categoryId: optUuid,
});
const UpdateObligationSchema = ObligationFields.extend({ id: z.string().uuid() });
const CompletionSchema = z.object({
  obligationId: z.string().uuid(),
  fyStartYear: z.coerce.number().int().min(2000).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
  completedCount: z.coerce.number().int().min(0).max(999),
  note: optText,
});

/**
 * POST /api/mobile/events/obligations — admin CRUD, one branch per web server
 * action (same zod shapes / writes):
 *   createObligation | updateObligation | deleteObligation | restoreObligation |
 *   setCompletion (the manual "bump" override)
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
  const idOk = (v: unknown): v is string => z.string().uuid().safeParse(v).success;

  try {
    switch (action) {
      case "createObligation": {
        const p = ObligationFields.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const [row] = await db
          .insert(obligations)
          .values({ ...p.data, cadence: "monthly", createdById: me.id })
          .returning({ id: obligations.id });
        return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
      }
      case "updateObligation": {
        const p = UpdateObligationSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const { id, ...d } = p.data;
        await db
          .update(obligations)
          .set({ ...d, updatedById: me.id, updatedAt: new Date() })
          .where(eq(obligations.id, id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "deleteObligation": {
        if (!idOk(body.id)) return bad("Invalid id.");
        await db
          .update(obligations)
          .set({ isActive: false, updatedById: me.id, updatedAt: new Date() })
          .where(eq(obligations.id, body.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "restoreObligation": {
        if (!idOk(body.id)) return bad("Invalid id.");
        await db
          .update(obligations)
          .set({ isActive: true, updatedById: me.id, updatedAt: new Date() })
          .where(eq(obligations.id, body.id));
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      case "setCompletion": {
        const p = CompletionSchema.safeParse(body);
        if (!p.success) return bad(p.error.issues[0]?.message ?? "Invalid input.");
        const { obligationId, fyStartYear, periodMonth, completedCount, note } = p.data;
        if (completedCount === 0 && note === null) {
          await db
            .delete(obligationCompletions)
            .where(
              and(
                eq(obligationCompletions.obligationId, obligationId),
                eq(obligationCompletions.fyStartYear, fyStartYear),
                eq(obligationCompletions.periodMonth, periodMonth),
              ),
            );
          return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
        }
        await db
          .insert(obligationCompletions)
          .values({ obligationId, fyStartYear, periodMonth, completedCount, note, createdById: me.id })
          .onConflictDoUpdate({
            target: [
              obligationCompletions.obligationId,
              obligationCompletions.fyStartYear,
              obligationCompletions.periodMonth,
            ],
            set: { completedCount, note, updatedById: me.id, updatedAt: new Date() },
          });
        return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
      }
      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return fail500(err);
  }
}
