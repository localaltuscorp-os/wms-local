import { PlanPage } from "../plan-page";
import { RegisterPage } from "../register-page";

export const dynamic = "force-dynamic";

/**
 * Project Plan — Results.
 *
 * The same two views as Milestones (see that file): the REGISTER by default —
 * every result with its project, its milestone, its dates, its own completion
 * and its actions rollup — and the hierarchy board at `?view=tree`.
 *
 * One component draws both registers, because Milestones and Results differ
 * only in which ancestors they show and what their rollup column counts.
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
  if (sp.view === "kanban") return <PlanPage level="results" view="kanban" searchParams={sp} />;
  if (sp.view === "tree") return <PlanPage level="results" searchParams={sp} />;
  return <RegisterPage level="results" searchParams={sp} />;
}
