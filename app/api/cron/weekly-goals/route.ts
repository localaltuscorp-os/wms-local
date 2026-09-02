import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { notifications } from "@/db/schema";
import { listGoalsForWeek, type WeeklyGoalRow } from "@/lib/queries/weekly-goals";
import {
  sendWeeklyGoalsMondayEmail,
  sendWeeklyGoalsFillReminderEmail,
  sendWeeklyGoalsIncompleteEmail,
} from "@/lib/email/resend";
import {
  currentWeekStart,
  prevWeekStart,
  formatWeekLabel,
} from "@/lib/weekly-goals/week";

/**
 * Weekly Goals notification cron.
 *
 * One route, four jobs, selected by `?job=` (set per-entry in vercel.json) or
 * inferred from the IST clock as a fallback:
 *
 *   • monday      — Mon 10:00 IST — each member's priorities for the new week
 *                   (or a nudge to set some when empty).
 *   • fill        — Sat 18:00 IST — reminder to fill in % done (members with
 *                   ≥1 goal this week).
 *   • incomplete  — Sun 09:45 IST (this week) + Mon 09:45 IST (last week) —
 *                   escalation to anyone whose goals are still unmarked (0%).
 *
 * Vercel sets `Authorization: Bearer <CRON_SECRET>` automatically. Node
 * runtime because postgres-js needs Node APIs.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Job = "monday" | "fill" | "incomplete";

const TZ = "Asia/Kolkata";

function istParts(now: Date): { dow: number; hour: number } {
  // en-US weekday + 24h hour in IST.
  const dowName = now.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(
    now.toLocaleString("en-US", { hour: "2-digit", hour12: false, timeZone: TZ }).replace(/\D/g, ""),
  );
  return { dow: dowMap[dowName] ?? 0, hour };
}

function inferJob(now: Date): Job | null {
  const { dow, hour } = istParts(now);
  if (dow === 1 && hour === 10) return "monday";
  if (dow === 6 && hour >= 17) return "fill";
  if ((dow === 0 || dow === 1) && hour === 9) return "incomplete";
  return null;
}

const SEND_TIMEOUT_MS = 5_000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    timer.unref?.();
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function groupByEmployee(rows: WeeklyGoalRow[]): Map<string, WeeklyGoalRow[]> {
  const map = new Map<string, WeeklyGoalRow[]>();
  for (const r of rows) {
    if (!map.has(r.employeeId)) map.set(r.employeeId, []);
    map.get(r.employeeId)!.push(r);
  }
  return map;
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const url = new URL(request.url);
  const job = (url.searchParams.get("job") as Job | null) ?? inferJob(now);
  if (!job) {
    return NextResponse.json({ ok: true, skipped: "no_matching_job" });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // Which week the job reasons about. Monday/fill = the live week; the Monday
  // 09:45 escalation looks back at the week that just ended.
  const liveWeek = currentWeekStart(now);
  const { dow } = istParts(now);
  const weekStart = job === "incomplete" && dow === 1 ? prevWeekStart(liveWeek) : liveWeek;
  const weekLabel = formatWeekLabel(weekStart);

  const [activeEmployees, weekRows] = await Promise.all([
    db
      .select({ id: employees.id, email: employees.email, name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true)),
    listGoalsForWeek(weekStart),
  ]);
  const byEmployee = groupByEmployee(weekRows);

  let sent = 0;
  let skipped = 0;

  for (const emp of activeEmployees) {
    const goals = byEmployee.get(emp.id) ?? [];

    if (job === "monday") {
      // Everyone gets the Monday briefing — even with zero goals (a nudge).
      try {
        await withTimeout(
          sendWeeklyGoalsMondayEmail({
            recipient: { email: emp.email, name: emp.name },
            weekLabel,
            goals: goals.map((g) => ({
              client: g.client,
              subject: g.subject,
              priority: g.priority,
              targetDone: g.targetDone,
            })),
            siteUrl,
          }),
          SEND_TIMEOUT_MS,
          "weeklyGoalsMonday",
        );
        sent++;
      } catch (err) {
        console.error(`[cron/weekly-goals] monday send failed for ${emp.email}`, err);
      }
      await insertNotification(emp.id, "weekly_goals_assigned",
        goals.length > 0
          ? `Your ${goals.length} priorities for the week`
          : "Set your priorities for the week",
        weekLabel);
      continue;
    }

    if (job === "fill") {
      if (goals.length === 0) { skipped++; continue; }
      try {
        await withTimeout(
          sendWeeklyGoalsFillReminderEmail({
            recipient: { email: emp.email, name: emp.name },
            weekLabel,
            pendingCount: goals.length,
            siteUrl,
          }),
          SEND_TIMEOUT_MS,
          "weeklyGoalsFill",
        );
        sent++;
      } catch (err) {
        console.error(`[cron/weekly-goals] fill send failed for ${emp.email}`, err);
      }
      await insertNotification(emp.id, "weekly_goals_fill_reminder",
        "Update your % done before the week closes", weekLabel);
      continue;
    }

    // job === "incomplete"
    const unmarked = goals.filter((g) => g.pctDone === 0).length;
    if (unmarked === 0) { skipped++; continue; }
    try {
      await withTimeout(
        sendWeeklyGoalsIncompleteEmail({
          recipient: { email: emp.email, name: emp.name },
          weekLabel,
          unmarkedCount: unmarked,
          siteUrl,
        }),
        SEND_TIMEOUT_MS,
        "weeklyGoalsIncomplete",
      );
      sent++;
    } catch (err) {
      console.error(`[cron/weekly-goals] incomplete send failed for ${emp.email}`, err);
    }
    await insertNotification(emp.id, "weekly_goals_incomplete",
      `${unmarked} weekly ${unmarked === 1 ? "goal" : "goals"} still unmarked`, weekLabel);
  }

  return NextResponse.json({ ok: true, job, weekStart, processed: activeEmployees.length, sent, skipped });
}

async function insertNotification(
  userId: string,
  kind: "weekly_goals_assigned" | "weekly_goals_fill_reminder" | "weekly_goals_incomplete",
  title: string,
  body: string,
): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId,
      kind,
      title,
      body,
      taskId: null,
      eventId: null,
      actorId: null,
    });
  } catch (err) {
    console.error(`[cron/weekly-goals] notification insert failed for ${userId}`, err);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
