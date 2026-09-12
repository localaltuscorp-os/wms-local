import { Briefcase } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { JdBank } from "@/components/operations/job-description/jd-bank";
import { demoJdSnapshot, type DemoHolder } from "@/lib/demo/jd-demo";
import {
  isMissingJdTable,
  listJdEntries,
  listJdPeople,
  listPositions,
  listRanks,
} from "@/lib/queries/job-description";

export const dynamic = "force-dynamic";

const ACCENT = "#B91C1C";

/**
 * OPERATIONS → Job Description.
 *
 * The JD Bank: every recurring task the firm performs, each owned by a POSITION
 * rather than by a person. People come and go; the work stays, and a vacant seat
 * escalates its tasks up the ladder instead of losing them.
 */
export default async function JobDescriptionPage() {
  /* READ IS THE ROOM'S, WRITING IS STILL HR'S. The Bank was HR-staff-only while
     it lived in the HR console; it now answers "who does this job?" for the room
     that runs the work, so the register is readable by anyone who can enter
     Operations. Every mutation in ./actions.ts still calls requireHrStaff(), so
     nobody gained the ability to change a job description. */
  await requireWorkspace("operations");

  /* THE MIGRATION MAY NOT HAVE RUN YET. This repo applies migrations by hand in
     Supabase, so there is a real window where this page is deployed and its
     tables do not exist. Without this the window looks like a 500 with a stack
     trace; with it, it says what to do. */
  let entries, positions, ranks, people;
  let holders: DemoHolder[] = [];
  let demo = false;
  try {
    [entries, positions, ranks, people] = await Promise.all([
      listJdEntries({ includeInactive: true }),
      listPositions(),
      listRanks(),
      listJdPeople(),
    ]);
  } catch (e) {
    if (!isMissingJdTable(e)) throw e;
    /* Fall back to a seeded in-memory Bank rather than a "run the migration"
       card. The card was accurate and unreviewable — see lib/demo/store.ts. */
    demo = true;
    ({ entries, positions, ranks, people, holders } = demoJdSnapshot());
  }

  return (
    <PageShell>
      {demo && <DemoBanner migration="0222" what="Job Description" />}
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: "#FEE2E2", color: ACCENT }}
        >
          <Briefcase className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-slate-900">
            Job Description
          </h1>
          <p className="text-[13px] text-slate-500">
            The JD Bank — every recurring task, owned by a position rather than a person.
          </p>
        </div>
      </header>

      <JdBank
        entries={entries}
        positions={positions}
        ranks={ranks}
        people={people}
        holders={holders}
      />
    </PageShell>
  );
}
