import { Briefcase } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { JdBank } from "@/components/hr/job-description/jd-bank";
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
 * HR → Job Description.
 *
 * The JD Bank: every recurring task the firm performs, each owned by a POSITION
 * rather than by a person. People come and go; the work stays, and a vacant seat
 * escalates its tasks up the ladder instead of losing them.
 */
export default async function JobDescriptionPage() {
  await requireHrStaff();

  /* THE MIGRATION MAY NOT HAVE RUN YET. This repo applies migrations by hand in
     Supabase, so there is a real window where this page is deployed and its
     tables do not exist. Without this the window looks like a 500 with a stack
     trace; with it, it says what to do. */
  let entries, positions, ranks, people;
  try {
    [entries, positions, ranks, people] = await Promise.all([
      listJdEntries({ includeInactive: true }),
      listPositions(),
      listRanks(),
      listJdPeople(),
    ]);
  } catch (e) {
    if (!isMissingJdTable(e)) throw e;
    return <JdSetupNeeded />;
  }

  return (
    <PageShell>
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

      <JdBank entries={entries} positions={positions} ranks={ranks} people={people} />
    </PageShell>
  );
}

/** Shown when 0222 has not been applied — actionable, not a stack trace. */
function JdSetupNeeded() {
  return (
    <PageShell>
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white px-8 py-12 text-center">
        <span
          className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: "#FEE2E2", color: ACCENT }}
        >
          <Briefcase className="h-7 w-7" />
        </span>
        <h1 className="text-[20px] font-bold text-slate-900">
          Job Description needs its database tables
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
          Migration 0222 has not been applied yet. Open Supabase → SQL Editor and run{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px]">
            db/RUN-IN-SUPABASE-0221-0222.sql
          </code>{" "}
          from the repo. Select nothing before pressing Run — a partial selection reports
          success having done nothing. This page works as soon as it completes.
        </p>
      </div>
    </PageShell>
  );
}
