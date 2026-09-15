import Link from "next/link";
import { ListChecks } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { ChecklistGrid } from "@/components/operations/checklist/checklist-grid";
import {
  ImportFromJdButton,
  NewChecklistPanel,
  SaveAsMasterButton,
} from "@/components/operations/checklist/checklist-header";
import { formatDMY } from "@/lib/operations/checklist-dates";
import {
  getChecklistRun,
  isMissingChecklistTable,
  listChecklistEvents,
  listChecklistPeople,
  listChecklistRuns,
  listChecklistTemplates,
  listRunItems,
} from "@/lib/queries/operations-checklist";

export const dynamic = "force-dynamic";

const ACCENT_DEEP = "#A80400";

/**
 * OPERATIONS → Event Checklist.
 *
 * ── WHY THE OPEN CHECKLIST LIVES IN THE URL ──────────────────────────────
 * `?run=` is a searchParam, not client state, because the rows and their ticks
 * are READ ON THE SERVER — holding the selection in React would mean shipping
 * every checklist's rows to the browser so it could pick one. It also makes a
 * particular checklist linkable, which is what you want when you are asking
 * somebody about theirs.
 */
export default async function OperationsChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const me = await requireWorkspace("operations");
  const sp = await searchParams;
  const canEdit = me.isAdmin || isSuperAdmin(me.email);

  /* THE MIGRATION MAY NOT HAVE RUN YET. This repo applies migrations by hand in
     Supabase, so there is a real window where this page is deployed and its
     tables do not exist — or exist in the pre-offset shape. Without this the
     window looks like a 500 with a stack trace; with it, it says what to do. */
  let runs, events, templates, people;
  try {
    [runs, events, templates, people] = await Promise.all([
      listChecklistRuns(),
      listChecklistEvents(),
      listChecklistTemplates(),
      listChecklistPeople(),
    ]);
  } catch (e) {
    if (!isMissingChecklistTable(e)) throw e;
    return <ChecklistSetupNeeded />;
  }

  const openRun = sp.run ? await getChecklistRun(sp.run) : null;
  const items = openRun ? await listRunItems(openRun.id) : [];

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: "#FEE2E2", color: ACCENT_DEEP }}
        >
          <ListChecks className="h-5 w-5" />
        </span>
        <div className="mr-auto">
          <h1 className="text-[22px] font-black tracking-tight text-slate-900">
            Event Checklist
          </h1>
          <p className="text-[13px] text-slate-500">
            Dates driven by an offset from the event — change the date, the whole plan moves.
          </p>
        </div>
        {openRun && canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <SaveAsMasterButton run={openRun} />
            <ImportFromJdButton available={false} />
          </div>
        )}
      </header>

      {openRun ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/operations/checklist"
              className="text-[13px] font-semibold text-slate-500 hover:text-slate-800"
            >
              ← All checklists
            </Link>
            <h2 className="text-[17px] font-bold text-slate-900">{openRun.title}</h2>
          </div>
          <ChecklistGrid run={openRun} items={items} people={people} canEdit={canEdit} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {canEdit && <NewChecklistPanel events={events} templates={templates} />}

          <section>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-slate-500">
              Checklists
            </h2>
            {runs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
                <p className="text-[14px] font-semibold text-slate-700">
                  No checklists yet
                </p>
                <p className="mt-1 text-[13px] text-slate-500">
                  {canEdit
                    ? "Create one above — pick an event and it inherits its date."
                    : "An admin creates these."}
                </p>
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/operations/checklist?run=${r.id}`}
                      className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <p className="text-[14px] font-bold text-slate-900">{r.title}</p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        {r.isEvent ? (
                          <>
                            {r.eventTitle ?? "Unlinked event"} ·{" "}
                            <span className="tabular-nums">{formatDMY(r.eventDate)}</span>
                          </>
                        ) : (
                          "Standing checklist"
                        )}
                      </p>
                      {r.calendarDate && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">
                          Event moved to {formatDMY(r.calendarDate)}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}

/** Shown when 0221 has not been applied — actionable, not a stack trace. */
function ChecklistSetupNeeded() {
  return (
    <PageShell>
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white px-8 py-12 text-center">
        <span
          className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: "#FEE2E2", color: ACCENT_DEEP }}
        >
          <ListChecks className="h-7 w-7" />
        </span>
        <h1 className="text-[20px] font-bold text-slate-900">
          The checklist needs its database tables
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
          Migration 0221 has not been applied yet. Open Supabase → SQL Editor and run{" "}
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
