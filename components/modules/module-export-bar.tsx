"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { usePageChromeSlots } from "@/components/layout/page-chrome-slots";
import { workspaceForPath } from "@/lib/workspaces";
import { ModuleExportButton } from "./module-export-button";

/**
 * THE EXPORT BUTTON, IN EVERY MODULE — asked for on 21 Sep: "in each module an
 * export button which will export complete data of that module".
 *
 * ── WHY ONE COMPONENT IN THE LAYOUT, NOT FIFTEEN PAGE EDITS ────────────────
 * The rooms' front doors are not alike: HR renders a console, Billing is a
 * redirect, Attendance builds its own header. Editing fifteen unrelated pages
 * would put the button in fifteen slightly different places and collide with
 * whatever else is being changed in them. The top bar already has an `actions`
 * slot a page can portal into, so the button rides there — one place, every
 * room, every page inside it.
 *
 * `allowed` is decided on the SERVER (the layout passes the modules this person
 * may export). The route checks again on every download, because a button that
 * is merely not rendered is not a permission.
 */
export function ModuleExportBar({
  allowed,
  labels,
}: {
  allowed: string[];
  labels: Record<string, string>;
}) {
  const pathname = usePathname() ?? "/";
  const slots = usePageChromeSlots();
  const moduleId = workspaceForPath(pathname);

  if (!moduleId || !allowed.includes(moduleId)) return null;
  // No slot yet (the bar has not mounted, or this screen has no bar at all):
  // draw nothing, rather than dropping a second button somewhere on the page.
  const target = slots?.actions;
  if (!target) return null;

  return createPortal(
    <ModuleExportButton moduleId={moduleId} moduleLabel={labels[moduleId] ?? moduleId} />,
    target,
  );
}
