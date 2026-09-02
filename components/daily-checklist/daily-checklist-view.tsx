import {
  getTodayItems,
  getOverdueItems,
  listPullableGoals,
  listOpenTasksForChecklist,
  listGoalsForPlanner,
} from "@/lib/queries/daily-checklist";
import { TZ } from "@/lib/weekly-goals/week";
import { formatDate, localDateString } from "@/lib/format";
import { DayLedger } from "./day-ledger";
import { DailyPlanGate } from "./daily-plan-gate";

/**
 * Server view for the Daily Checklist — fetches today's items, overdue carry-
 * overs, and pullable weekly goals, then renders the interactive ledger. Used
 * both by the /daily-checklist page (mode="page") and the compulsory login gate
 * rendered inline in the (app) layout (mode="gate").
 */
export async function DailyChecklistView({
  employeeId,
  greetingName,
  mode = "page",
}: {
  employeeId: string;
  greetingName?: string;
  mode?: "page" | "gate";
}) {
  // Fail-safe: the gate renders inside the (app) layout for every page, so a DB
  // hiccup here must never throw the layout for the whole company. On error we
  // render empty lists (the user can still add items) rather than crash.
  let items: Awaited<ReturnType<typeof getTodayItems>> = [];
  let overdue: Awaited<ReturnType<typeof getOverdueItems>> = [];
  let pullable: Awaited<ReturnType<typeof listPullableGoals>> = [];
  let openTasks: Awaited<ReturnType<typeof listOpenTasksForChecklist>> = [];
  let plannerGoals: Awaited<ReturnType<typeof listGoalsForPlanner>> = [];
  try {
    // Load directly. (A previous hard 12s timeout here turned a slow read into
    // EMPTY lists — which silently broke the gate: weekly goals stopped pulling
    // and the carry-forward button vanished. A slow read should just take a
    // moment and return the real data.) On a genuine error we keep the empty
    // (but still usable) defaults rather than throwing the inline gate.
    [items, overdue, pullable, openTasks, plannerGoals] = await Promise.all([
      getTodayItems(employeeId),
      getOverdueItems(employeeId),
      listPullableGoals(employeeId),
      listOpenTasksForChecklist(employeeId),
      listGoalsForPlanner(employeeId),
    ]);
  } catch {
    // keep the empty defaults
  }

  // Date labels computed server-side in IST → passed as strings (no client
  // toLocaleString → avoids the hydration-wipe gotcha).
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });
  const date = formatDate(localDateString(TZ, now));

  // The compulsory login gate gets the authored "Day Ledger" experience;
  // the in-app /daily-checklist page keeps the working DayLedger surface.
  if (mode === "gate") {
    return (
      <DailyPlanGate
        greetingName={greetingName}
        today={{ weekday, date }}
        items={items}
        overdue={overdue}
        pullable={pullable}
        openTasks={openTasks}
        plannerGoals={plannerGoals}
      />
    );
  }

  return (
    <DayLedger
      mode={mode}
      greetingName={greetingName}
      today={{ weekday, date }}
      items={items}
      overdue={overdue}
      pullable={pullable}
    />
  );
}
