import { ADMIN_GROUPS, ADMIN_TOP_LEVEL, type AdminNavGroup, type AdminNavItem } from "./admin-nav-config";
import { Briefcase, Network, Tag } from "lucide-react";
import type { Route } from "next";

/**
 * The Admin Panel for someone who is NOT an admin but may change the Subject
 * and Client lists (`task_rosters.manage` — Jeevan today). They see and reach
 * those two screens and nothing else; app/(admin)/admin/layout.tsx enforces the
 * paths, this only trims the menu to match.
 */
export const ROSTER_ONLY_PATHS: readonly string[] = ["/admin/subjects", "/admin/clients"];

const HIERARCHY_ONLY_NAV: readonly AdminNavGroup[] = [
  {
    label: "People",
    Icon: Briefcase,
    items: [{ href: "/admin/hierarchy" as Route, label: "Reporting Hierarchy", Icon: Network }],
  },
];

const ROSTER_ONLY_NAV: readonly AdminNavGroup[] = [
  {
    label: "Masters",
    Icon: Briefcase,
    items: [
      { href: "/admin/clients" as Route, label: "Clients", Icon: Briefcase },
      { href: "/admin/subjects" as Route, label: "Subjects", Icon: Tag },
    ],
  },
];

export function isRosterOnlyPath(pathname: string): boolean {
  return ROSTER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function adminNavFor(rosterOnly: boolean, hierarchyOnly = false): {
  topLevel: readonly AdminNavItem[];
  groups: readonly AdminNavGroup[];
} {
  if (hierarchyOnly) return { topLevel: [], groups: HIERARCHY_ONLY_NAV };
  if (!rosterOnly) return { topLevel: ADMIN_TOP_LEVEL, groups: ADMIN_GROUPS };
  return {
    topLevel: [],
    groups: ROSTER_ONLY_NAV,
  };
}
