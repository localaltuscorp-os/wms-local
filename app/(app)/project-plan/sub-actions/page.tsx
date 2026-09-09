import { PlanPage } from "../plan-page";
import { RegisterPage } from "../register-page";

export const dynamic = "force-dynamic";

/**
 * Project Plan — Sub-Actions.
 *
 * The same two views as Actions (see that file): the REGISTER by default —
 * every sub-action with its project, milestone, result and action, its dates
 * and its linked WMS task — and the hierarchy board at `?view=tree`.
 *
 * This is the deepest level the sidebar lists. Its rollup column counts
 * sub-sub-actions, which most plans never create; the column then reads
 * "No sub-sub-actions yet" rather than a misleading 0/0 ratio.
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
  if (sp.view === "kanban") return <PlanPage level="sub-actions" view="kanban" searchParams={sp} />;
  if (sp.view === "tree") return <PlanPage level="sub-actions" searchParams={sp} />;
  return <RegisterPage level="sub-actions" searchParams={sp} />;
}
