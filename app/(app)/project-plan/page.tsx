import { PlanPage } from "./plan-page";
import { RegisterPage } from "./register-page";

export const dynamic = "force-dynamic";

/**
 * Project Plan — Projects.
 *
 * TWO VIEWS OF THE SAME ROWS, the same arrangement every other level uses:
 *
 *   default      the REGISTER — every project on its own line with its status,
 *                dates, duration, its own completion and its milestone rollup.
 *   ?view=tree   the HIERARCHY board, which is where structure is rearranged.
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
  if (sp.view === "kanban") return <PlanPage level="projects" view="kanban" searchParams={sp} />;
  if (sp.view === "tree") return <PlanPage level="projects" searchParams={sp} />;
  return <RegisterPage level="projects" searchParams={sp} />;
}
