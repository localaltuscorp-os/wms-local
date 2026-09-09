import { PlanPage } from "../plan-page";
import { RegisterPage } from "../register-page";

export const dynamic = "force-dynamic";

/**
 * Project Plan — Actions.
 *
 * TWO VIEWS OF THE SAME ROWS, and the URL picks which — the same arrangement
 * every other level uses:
 *
 *   default      the REGISTER — every action in the plan on its own line,
 *                carrying the project, milestone and result it belongs to, its
 *                dates, its sub-actions rollup and its linked WMS task.
 *   ?view=tree   the HIERARCHY board scoped to this level.
 *
 * `searchParams` is threaded into BOTH because an action IS a WMS task: the
 * register's Open button and the board's WMS chip each set `?task=`, which
 * either page renders as the real task drawer.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // `?view=kanban` keeps the LEVEL SWITCHER honest: switching level from the
  // kanban used to land on this level's register, because only "tree" was
  // recognised here and everything else fell through to the default. The board
  // owns the List / Kanban toggle either way; this is the linkable form of it.
  if (sp.view === "kanban") return <PlanPage level="actions" view="kanban" searchParams={sp} />;
  if (sp.view === "tree") return <PlanPage level="actions" searchParams={sp} />;
  return <RegisterPage level="actions" searchParams={sp} />;
}
