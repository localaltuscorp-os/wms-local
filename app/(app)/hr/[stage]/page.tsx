import { notFound } from "next/navigation";
import { requireHrStaff } from "@/lib/hr/access";
import { getHrStage } from "@/lib/hr/lifecycle";
import { HrStageGhost } from "@/components/hr/console/hr-stage-ghost";

export const dynamic = "force-dynamic";

/**
 * A lifecycle stage's front door - and deliberately EMPTY.
 *
 * This used to be a sub-hub: a card grid repeating every step in the stage.
 * That made sense before the HR console, when the grid was the only way to
 * reach a step. It isn't any more - the rail (column 1) and the step list
 * (column 2) are the navigation, so a grid here just restated column 2 as
 * clickable cards and put a second, competing set of controls on screen.
 *
 * So picking a module now does what picking a module should: it opens that
 * module's steps beside you and leaves this column blank until you choose one.
 * Same pane HrConsoleHome shows at /hr and HrConsoleShell shows while you
 * preview another module - one component (HrModuleGhost), so the three states
 * cannot drift apart.
 *
 * The route still exists because the rail links here: /hr/<stage> is what the
 * URL must say once you've clicked a module, and losing that was the bug where
 * the address bar and the screen disagreed.
 */
export default async function HrStagePage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  await requireHrStaff();
  const { stage } = await params;
  if (!getHrStage(stage)) notFound();

  return <HrStageGhost stage={stage} />;
}
