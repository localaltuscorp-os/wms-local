import { ADMIN_GROUPS, ADMIN_TOP_LEVEL, type AdminNavGroup, type AdminNavItem } from "./admin-nav-config";

/**
 * The Admin Panel for someone who is NOT an admin but may change the Subject
 * and Client lists (`task_rosters.manage` — Jeevan today). They see and reach
 * those two screens and nothing else; app/(admin)/admin/layout.tsx enforces the
 * paths, this only trims the menu to match.
 */
export const ROSTER_ONLY_PATHS: readonly string[] = ["/admin/subjects", "/admin/clients"];

export function isRosterOnlyPath(pathname: string): boolean {
  return ROSTER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function adminNavFor(rosterOnly: boolean): {
  topLevel: readonly AdminNavItem[];
  groups: readonly AdminNavGroup[];
} {
  if (!rosterOnly) return { topLevel: ADMIN_TOP_LEVEL, groups: ADMIN_GROUPS };
  return {
    topLevel: [],
    groups: ADMIN_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => ROSTER_ONLY_PATHS.includes(i.href)) })).filter(
      (g) => g.items.length > 0,
    ),
  };
}
