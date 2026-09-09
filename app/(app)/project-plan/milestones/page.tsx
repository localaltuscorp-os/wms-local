import { PlanPage } from "../plan-page";
import { RegisterPage } from "../register-page";

export const dynamic = "force-dynamic";

/**
 * Project Plan — Milestones.
 *
 * TWO VIEWS OF THE SAME ROWS, and the URL picks which:
 *
 *   default      the REGISTER — every milestone in the plan on its own line,
 *                carrying the project it belongs to, its dates, its own
 *                completion and its results rollup. This is what the Milestones
 *                brief asks for.
 *   ?view=tree   the HIERARCHY board, scoped to this level — the previous
 *                behaviour of this route, kept because "which milestones sit
 *                under this project?" is still a real question and the tree is
 *                the shape that answers it.
 *
 * Both read `listPlanTree()`; neither owns a copy of anything.
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
  if (sp.view === "kanban") return <PlanPage level="milestones" view="kanban" searchParams={sp} />;
  if (sp.view === "tree") return <PlanPage level="milestones" searchParams={sp} />;
  return <RegisterPage level="milestones" searchParams={sp} />;
}
