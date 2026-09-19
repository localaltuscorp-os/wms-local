import "server-only";
import type { Employee } from "@/db/schema";
import { demoJdSnapshot } from "@/lib/demo/jd-demo";
import { canAddTaskRoster } from "@/lib/auth/roster-permission";
import { canActAsHrStaff } from "@/lib/hr/access";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import {
  isMissingJdTable,
  listJdDoerNotes,
  listJdEntries,
  listJdEventLinks,
  listJdEventOptions,
  listJdHolders,
  listJdPeople,
  listPositions,
  listRanks,
} from "@/lib/queries/job-description";

/**
 * Everything the JD Bank renders — read by Operations → Job Description and by
 * the Masters section's Master JD and Person-specific JD pages.
 *
 * Falls back to the seeded in-memory Bank when the JD tables are missing (a
 * migration applied by hand may not have run yet) — see lib/demo/store.ts.
 */
export async function loadJdBank(me?: Employee) {
  /* The Client and Subject pickers offer the WMS Tasks rosters (Admin Panel →
     Clients / Subjects), so a JD is filed in the words a task is. Who is looking
     decides who may add to those lists (the Admin Panel's own rule) and whose
     Doer Notes they may write (their own, or anyone's for HR). */
  const [clients, subjects, viewerIsHr] = await Promise.all([
    listActiveClientNames().catch(() => [] as string[]),
    listActiveSubjectNames().catch(() => [] as string[]),
    me ? canActAsHrStaff(me).catch(() => false) : Promise.resolve(false),
  ]);
  const rosters = {
    clients,
    subjects,
    canAdd: me ? canAddTaskRoster(me) : false,
    viewerId: me?.id ?? null,
    viewerIsHr,
  };
  try {
    const [entries, positions, ranks, people, holders] = await Promise.all([
      listJdEntries({ includeInactive: true }),
      listPositions(),
      listRanks(),
      listJdPeople(),
      // Who sits in each seat — without it every seat reads as vacant.
      listJdHolders(),
    ]);
    /* The Event Checklist box's options, and which events each JD is already
       in. Separate and soft: the checklist tables come from their own
       migration, and a database without them must still show the Bank. */
    const [events, eventLinks] = await Promise.all([listJdEventOptions(), listJdEventLinks()]).catch(
      (e): [Awaited<ReturnType<typeof listJdEventOptions>>, Map<string, string[]>] => {
        if (isMissingJdTable(e)) return [[], new Map()];
        throw e;
      },
    );
    // Doer Notes arrive with migration 0237; before it, nobody has written any.
    const doerNotes = await listJdDoerNotes().catch((e) => {
      if (isMissingJdTable(e)) return new Map<string, Record<string, string>>();
      throw e;
    });
    return {
      entries: entries.map((e) => ({
        ...e,
        eventRunIds: eventLinks.get(e.id) ?? [],
        doerNotes: doerNotes.get(e.id) ?? {},
      })),
      rosters,
      positions,
      ranks,
      people,
      holders,
      events,
      demo: false,
    };
  } catch (e) {
    if (!isMissingJdTable(e)) throw e;
    return { ...demoJdSnapshot(), events: [], rosters, demo: true };
  }
}
