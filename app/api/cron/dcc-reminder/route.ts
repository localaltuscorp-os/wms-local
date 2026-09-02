import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, dccKpiItems, dccEntries, notifications } from "@/db/schema";
import { scheduledDueOn, isoDate } from "@/lib/dcc/util";

/**
 * Employees DCC end-of-day reminder. Runs ~19:30 IST (14:00 UTC). For every
 * active employee who has KPIs due today but hasn't filled them all, drops an
 * in-app "fill your KPIs" notification linking to /dcc. In-app only (no email),
 * so it's load-neutral and bypasses the notification matrix. Vercel sets
 * `Authorization: Bearer <CRON_SECRET>` automatically.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const today = isoDate(ist);

  // Active KPI items (id, owner, weekdays) + today's entries.
  const items = await db
    .select({ id: dccKpiItems.id, owner: dccKpiItems.ownerEmployeeId, weekdays: dccKpiItems.weekdays })
    .from(dccKpiItems)
    .innerJoin(employees, eq(employees.id, dccKpiItems.ownerEmployeeId))
    .where(and(eq(dccKpiItems.archived, false), eq(employees.isActive, true)));

  const todayEntries = await db
    .select({ itemId: dccEntries.itemId, status: dccEntries.status, value: dccEntries.valueNumber, note: dccEntries.note })
    .from(dccEntries)
    .where(eq(dccEntries.entryDate, today));
  const filled = new Set(todayEntries.filter((e) => e.status || e.value || e.note).map((e) => e.itemId));

  // Per owner: count due-today vs filled-today.
  const due = new Map<string, { total: number; done: number }>();
  for (const it of items) {
    if (!scheduledDueOn(it, ist)) continue;
    const rec = due.get(it.owner) ?? { total: 0, done: 0 };
    rec.total++;
    if (filled.has(it.id)) rec.done++;
    due.set(it.owner, rec);
  }

  let sent = 0;
  for (const [owner, rec] of due) {
    if (rec.total === 0 || rec.done >= rec.total) continue;
    const left = rec.total - rec.done;
    try {
      await db.insert(notifications).values({
        userId: owner,
        kind: "dcc_fill_reminder",
        title: "Fill today's DCC",
        body: `You have ${left} KPI${left === 1 ? "" : "s"} still to fill for today. Tap to complete your Daily Compliance.`,
        taskId: null, eventId: null, actorId: null,
      });
      sent++;
    } catch (err) {
      console.error(`[cron/dcc-reminder] insert failed for ${owner}`, err);
    }
  }

  return NextResponse.json({ ok: true, date: today, people: due.size, reminded: sent });
}

export async function GET(request: Request): Promise<NextResponse> { return run(request); }
export async function POST(request: Request): Promise<NextResponse> { return run(request); }
