import { Briefcase } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DemoBanner } from "@/components/layout/demo-banner";
import { JdBank } from "@/components/operations/job-description/jd-bank";
import { loadJdBank } from "@/lib/operations/jd-bank-data";

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
  const me = await requireWorkspace("operations");

  /* THE MIGRATION MAY NOT HAVE RUN YET. This repo applies migrations by hand in
     Supabase, so there is a real window where this page is deployed and its
     tables do not exist. Without this the window looks like a 500 with a stack
     trace; with it, it says what to do. */
  const { entries, positions, ranks, people, holders, events, rosters, demo } = await loadJdBank(me);

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
        events={events}
        rosters={rosters}
      />
    </PageShell>
  );
}
