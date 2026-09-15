import "server-only";
import { demoJdSnapshot } from "@/lib/demo/jd-demo";
import {
  isMissingJdTable,
  listJdEntries,
  listJdHolders,
  listJdPeople,
  listPositions,
  listRanks,
} from "@/lib/queries/job-description";

/**
 * Everything the JD Bank renders — read by Operations → Job Description and by
 * the Masters section's General JD and Person-specific JD pages.
 *
 * Falls back to the seeded in-memory Bank when the JD tables are missing (a
 * migration applied by hand may not have run yet) — see lib/demo/store.ts.
 */
export async function loadJdBank() {
  try {
    const [entries, positions, ranks, people, holders] = await Promise.all([
      listJdEntries({ includeInactive: true }),
      listPositions(),
      listRanks(),
      listJdPeople(),
      // Who sits in each seat — without it every seat reads as vacant.
      listJdHolders(),
    ]);
    return { entries, positions, ranks, people, holders, demo: false };
  } catch (e) {
    if (!isMissingJdTable(e)) throw e;
    return { ...demoJdSnapshot(), demo: true };
  }
}
