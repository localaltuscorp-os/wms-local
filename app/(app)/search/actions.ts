"use server";

import { requireUser } from "@/lib/auth/current";
import { globalSearch, type GlobalSearchResult } from "@/lib/queries/global-search";

const EMPTY: GlobalSearchResult = {
  tasks: [], clients: [], projects: [], people: [], outstanding: [], documents: [], ambassadors: [],
};

/**
 * Truly-global header search (Tasks, Clients, Projects, People, Receivables,
 * Documents). Auth-gated; returns grouped, ranked, archived-below-active hits.
 */
export async function globalSearchAction(query: string): Promise<GlobalSearchResult> {
  await requireUser();
  if (typeof query !== "string" || query.trim().length < 2) return EMPTY;
  return globalSearch(query);
}
