"use client";

import { HR_CONSOLE_MODULES } from "@/lib/hr/console-nav";
import { HrModuleGhost } from "./hr-module-ghost";
import { HrTitleBar } from "./hr-title-bar";

/**
 * The blank pane a lifecycle module shows at /hr/<stage>.
 *
 * Exists only to bridge server -> client: HrModuleGhost takes an
 * HrConsoleModule, and that object carries `Icon` (a component), which cannot
 * cross the server/client boundary as a prop. So the server route passes the
 * stage SLUG - a plain string - and the lookup happens here, on the client,
 * against the same HR_CONSOLE_MODULES the rail and step list read.
 *
 * An unknown slug can't reach this (the route calls notFound first); the null
 * fallback is for the type, and HrModuleGhost renders its generic welcome pane
 * if it ever did.
 */
export function HrStageGhost({ stage }: { stage: string }) {
  const module = HR_CONSOLE_MODULES.find((m) => m.id === stage) ?? null;
  return (
    <>
      {/* Names the module in the global top bar, the same as every other HR
          surface. Without it a module's own landing page was the one screen in
          the room whose title bar sat empty. It takes no `title` prop - the
          rail's name for the route IS the module name. */}
      <HrTitleBar />
      <HrModuleGhost module={module} />
    </>
  );
}
