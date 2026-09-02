import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { listUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { currentWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { WeeklyGoalsFillForm } from "@/components/weekly-goals/weekly-goals-fill-form";

export const dynamic = "force-dynamic";

/**
 * The mandatory weekly-goals fill screen (design §11).
 *
 * This is a PLAIN top-level route (not inside the `(app)` group), so it is not
 * subject to the `(app)` layout's fill-gate redirect — that's how a gated user
 * can actually reach it without an infinite loop. It does its own `requireUser`
 * for auth. (It deliberately avoids a `(…)` route group: the Vercel build for
 * this project did not register routes added inside a brand-new route group,
 * 404-ing the gate's redirect target; a plain route registers reliably.)
 *
 * Users with un-filled current-week goals are redirected here by the `(app)`
 * layout gate; they fill % Done (+ optional explanation) and submit once to
 * enter. If there's nothing left to fill we send them straight in.
 */
export default async function FillWeeklyGoalsPage() {
  const me = await requireUser();
  const goals = await listUnfilledWeekGoals(me.id);

  if (goals.length === 0) {
    redirect("/dashboard" as Route);
  }

  const weekStart = currentWeekStart();

  return (
    <WeeklyGoalsFillForm
      goals={goals}
      weekLabel={formatWeekLabel(weekStart)}
      greetingName={me.name.split(" ")[0] ?? me.name}
    />
  );
}
