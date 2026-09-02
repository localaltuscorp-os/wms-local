/**
 * View-models passed from the (server) masters page to the client workbench.
 * Kept local to this slice — the DB row types live in
 * `lib/monthly-events/types.ts` (foundation-owned); these carry only what the
 * UI needs plus the derived `usage` count.
 */
export interface CategoryVM {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  /** How many calendar events / batch schedules / obligations / batch-type
   *  defaults reference this category (drives the reassign-or-clear prompt). */
  usage: number;
}

export interface BatchTypeVM {
  id: string;
  name: string;
  defaultCategoryId: string | null;
  sortOrder: number;
  isActive: boolean;
}
