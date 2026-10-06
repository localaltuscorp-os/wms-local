"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MODULE_THEME } from "@/lib/module-theme";
import { workspaceForPath } from "@/lib/workspaces";

/**
 * The persistent top-bar title format for every workspace: module first,
 * followed by the route's active section. Keeping this in one component makes
 * route-derived and page-provided titles follow the same convention.
 */
export function ModuleSectionTitle({ section }: { section: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const workspace = workspaceForPath(pathname);
  const moduleName = workspace ? MODULE_THEME[workspace].label : null;
  const repeatsModule = typeof section === "string" && section === moduleName;

  return (
    <h1 className="topbar-heading min-w-0 truncate">
      {moduleName && <span className="text-altus-red">{moduleName}</span>}
      {moduleName && section && !repeatsModule && <span className="mx-2 text-ink-faint">·</span>}
      {!repeatsModule && <span className="text-ink-strong">{section}</span>}
    </h1>
  );
}
