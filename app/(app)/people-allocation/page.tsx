import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import {
  listHhPeople,
  listHhEntries,
  listHhCalls,
  listAmbassadors,
  listAmbassadorCalls,
  listAccessActivity,
} from "@/lib/queries/people-allocation";
import { canAddPerson, canEditPerson, canDeleteSectionEntry } from "@/lib/hh/access";
import { AllocationScreen } from "@/components/people-allocation/allocation-screen";
import { AllocationHero } from "./hero";
import { sweepExpiredEntries } from "./actions";
import { withRetry, withTimeoutOr } from "@/lib/db/with-timeout";

/** HAND-HOLDING — employees and interns, and the sections each carries. */
export const dynamic = "force-dynamic";

export default async function HandHoldingPage() {
  const me = await requireUser();

  // A batch that is over should not still be on the board. Sweeping before the
  // read means the page never paints a row it is about to delete.
  //
  // Housekeeping, so it fails OPEN: if the DB is slow the page must still paint,
  // and a skipped sweep corrects itself on the next load.
  await withTimeoutOr(sweepExpiredEntries().then(() => undefined), 6000, undefined, "hh.sweep");

  // Every read runs under a timeout with one retry. Against the Supabase
  // transaction pooler a warm instance can be handed a connection the pooler
  // already bounced; a query on that dead socket neither resolves nor throws, so
  // the page hangs on its skeleton indefinitely — the "stuck on Loading…" this
  // page kept showing. The retry builds a FRESH query promise, which checks out
  // a healthy connection. See lib/db/with-timeout.ts.
  // Not `as const`: withRetry takes a mutable number[], and a readonly tuple
  // is not assignable to it.
  const budget: { timeoutMs: number[]; attempts: number } = { timeoutMs: [6000, 12000], attempts: 2 };
  const [canAdd, people, entries, calls, ambassadors, ambassadorCalls, accessActivity] = await Promise.all([
    withRetry(() => canAddPerson(me), { ...budget, label: "hh.canAdd" }),
    withRetry(() => listHhPeople(), { ...budget, label: "hh.people" }),
    withRetry(() => listHhEntries(), { ...budget, label: "hh.entries" }),
    withRetry(() => listHhCalls(), { ...budget, label: "hh.calls" }),
    withRetry(() => listAmbassadors(), { ...budget, label: "hh.ambassadors" }),
    withRetry(() => listAmbassadorCalls(), { ...budget, label: "hh.ambassadorCalls" }),
    withRetry(() => listAccessActivity(), { ...budget, label: "hh.accessActivity" }),
  ]);

  // Ambassadors on hold count no more than participants on hold do, so the
  // dashboard is handed the live ones and their calls, and nothing else.
  const liveAmbassadors = ambassadors.filter((a) => !a.onHold);
  const liveAmbassadorIds = new Set(liveAmbassadors.map((a) => a.id));

  return (
    <PageShell width="wide">
      <AllocationHero title="Hand-holding" blurb="Select a name to open their sections." />
      <AllocationScreen
        people={people}
        entries={entries}
        calls={calls}
        ambassadorCount={liveAmbassadors.length}
        ambassadorCalls={ambassadorCalls.filter((c) => liveAmbassadorIds.has(c.entryId))}
        canAdd={canAdd}
        canEdit={canEditPerson(me)}
        canDeleteEntry={canDeleteSectionEntry(me)}
        accessActivity={accessActivity}
      />
    </PageShell>
  );
}
