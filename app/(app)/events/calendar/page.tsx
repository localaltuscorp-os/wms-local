import {
  addDays,
  addWeeks,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { DashboardHeader } from "@/components/layout/header";
import { requireEventsAccess } from "@/lib/monthly-events/access";
import { getCalendarBundle } from "@/lib/queries/monthly-events-calendar";
import { CalendarWorkspace } from "@/components/events/calendar-workspace";
import { isCalendarView } from "@/components/events/model";

export const dynamic = "force-dynamic";

/** Compute the inclusive visible date window for a view + focus date so the
 *  server-fetched bundle matches the client's TanStack Query range key. */
function computeRange(view: string, focus: Date): { from: string; to: string } {
  if (view === "week") {
    const ws = startOfWeek(focus, { weekStartsOn: 1 });
    return { from: format(ws, "yyyy-MM-dd"), to: format(addDays(ws, 6), "yyyy-MM-dd") };
  }
  const first = startOfWeek(startOfMonth(focus), { weekStartsOn: 1 });
  const lastDay = endOfMonth(focus);
  let ws = first;
  let last = first;
  while (ws <= lastDay) {
    last = ws;
    ws = addWeeks(ws, 1);
  }
  return { from: format(first, "yyyy-MM-dd"), to: format(addDays(last, 6), "yyyy-MM-dd") };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  // Re-assert access IN THE PAGE (layout gate alone is unreliable on prod).
  await requireEventsAccess();

  const sp = await searchParams;
  const today = new Date();
  const todayIso = format(today, "yyyy-MM-dd");
  const view = isCalendarView(sp.view ?? null) ? sp.view! : "month";
  const parsed = sp.date ? parseISO(sp.date) : today;
  const focus = isNaN(parsed.getTime()) ? today : parsed;

  const range = computeRange(view, focus);
  const bundle = await getCalendarBundle(range.from, range.to);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-6 max-md:px-3 pt-6 pb-16">
        <CalendarWorkspace initial={bundle} initialRange={range} todayIso={todayIso} />
      </main>
    </>
  );
}
