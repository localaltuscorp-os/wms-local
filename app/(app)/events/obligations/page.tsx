import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents, obligations, obligationCompletions } from "@/db/schema";
import { DashboardHeader } from "@/components/layout/header";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { listCategories } from "@/lib/queries/monthly-events";
import { ObligationsClient } from "@/components/events/obligations/obligations-client";
import type {
  ObligationRowVM,
  ObligationCell,
  FyMonthCol,
  ObligationsKpi,
} from "@/components/events/obligations/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** FY start year for a calendar (year, month): Apr–Mar financial year. */
function fyStartYearFor(year: number, month: number): number {
  return month >= 4 ? year : year - 1;
}

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

export default async function ObligationsPage({ searchParams }: PageProps) {
  // Obligations dashboard is an admin-only surface (design §1/§8).
  await requireEventsAdmin();
  const sp = await searchParams;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curFy = fyStartYearFor(curYear, curMonth);

  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  const [obligationRows, categories, completions, taggedEvents] = await Promise.all([
    db
      .select()
      .from(obligations)
      .where(eq(obligations.isActive, true))
      .orderBy(asc(obligations.name)),
    listCategories(),
    db
      .select()
      .from(obligationCompletions)
      .where(eq(obligationCompletions.fyStartYear, fyStartYear)),
    // Auto-count source: every calendar event tagged to an obligation whose date
    // falls inside this financial year. Small result set — no hot-path concern.
    db
      .select({
        obligationId: calendarEvents.obligationId,
        eventDate: calendarEvents.eventDate,
      })
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

  // ── Auto-counts: obligationId → periodMonth → count ────────────────────────
  const autoCounts = new Map<string, number>();
  for (const ev of taggedEvents) {
    if (!ev.obligationId) continue;
    const month = Number(ev.eventDate.slice(5, 7));
    const key = `${ev.obligationId}:${month}`;
    autoCounts.set(key, (autoCounts.get(key) ?? 0) + 1);
  }

  // ── Manual overrides: obligationId → periodMonth → {count, note} ────────────
  const manualByKey = new Map<string, { count: number; note: string | null }>();
  for (const c of completions) {
    manualByKey.set(`${c.obligationId}:${c.periodMonth}`, {
      count: c.completedCount,
      note: c.note,
    });
  }

  const cols = fyMonthCols(fyStartYear);
  const columns: FyMonthCol[] = cols.map((c) => {
    const isFuture = c.calYear > curYear || (c.calYear === curYear && c.month > curMonth);
    const isCurrent = c.calYear === curYear && c.month === curMonth;
    return { month: c.month, calYear: c.calYear, label: c.label, isFuture, isCurrent };
  });

  const rows: ObligationRowVM[] = obligationRows.map((o) => {
    const cells: Record<number, ObligationCell> = {};
    for (const c of cols) {
      const key = `${o.id}:${c.month}`;
      const auto = autoCounts.get(key) ?? 0;
      const manual = manualByKey.get(key) ?? null;
      const manualCount = manual?.count ?? null;
      const effective = Math.max(auto, manualCount ?? 0);
      cells[c.month] = {
        auto,
        manual: manualCount,
        effective,
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

  // ── KPI: "X of Y compulsory obligations on track this month" ────────────────
  const currentInFy = curFy === fyStartYear;
  let kpi: ObligationsKpi | null = null;
  if (currentInFy) {
    const compulsory = rows.filter((r) => r.isCompulsory);
    const onTrack = compulsory.filter((r) => {
      const cell = r.cells[curMonth];
      return cell !== undefined && cell.effective >= r.targetCount;
    }).length;
    const MLFull = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    kpi = {
      onTrack,
      total: compulsory.length,
      monthLabel: `${MLFull[curMonth]} ${curYear}`,
      periodMonth: curMonth,
    };
  }

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, color: c.color }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <ObligationsClient
          fyStartYear={fyStartYear}
          fyLabel={fyLabel(fyStartYear)}
          prevHref={`/events/obligations?fy=${fyStartYear - 1}`}
          nextHref={`/events/obligations?fy=${fyStartYear + 1}`}
          columns={columns}
          rows={rows}
          kpi={kpi}
          categoryOptions={categoryOptions}
        />
      </main>
    </>
  );
}
