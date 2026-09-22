import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, FlaskConical, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { canFillFor, loadDccScope } from "@/lib/dcc/access";
import { isDccDayOpen } from "@/lib/dcc/entry-lock";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { computeDccDashboard, historyStartFor } from "@/lib/dcc/dashboard";
import { buildDccDemo, isDemoPerson } from "@/lib/dcc/demo-data";
import { loadDccDashboardInput, loadDccRoster } from "@/lib/queries/dcc-dashboard";
import { loadSp1Logs } from "@/lib/queries/dcc-sp1";
import {
  emptyCounts,
  metricsOf,
  mondayOf,
  shiftDays,
  sp1WorkingDays,
  SP1_DISPOSITIONS,
  type Sp1Counts,
} from "@/lib/dcc/sp1";
import { localDateString } from "@/lib/format";
import { Sp1Sheet } from "@/components/dcc/sp1/sp1-sheet";
import {
  DccCallMix,
  DccHeatmap,
  DccKpiStrip,
  DccMostMissed,
  DccPerformers,
  DccSections,
  DccTrend,
} from "@/components/dcc/dashboard/dcc-sections";

export const dynamic = "force-dynamic";

/** How many Monday→Saturday blocks the sheet shows at once. */
const SPANS = [1, 2, 4] as const;
const DEFAULT_SPAN = 2;

/**
 * EMPLOYEES → DCC → DASHBOARD (DCC-SPEC §7, §8, §9).
 *
 * ── THE DASHBOARD *IS* JEEVAN'S SP1 SHEET, AND THE CALL LOG ────────────────
 * Account holder, 2026-09-17: "the dashboard of daily compliance will be like
 * SP1 google sheet", and "add the call log in the dcc dashboard only, don't put
 * it in the sidebar". So the sheet is not a card in a corner and not a separate
 * door — it is the first and largest thing on this page, and you TYPE INTO IT,
 * the way you type into the Google Sheet. The old `/dcc/sp1` and `/dcc/call-log`
 * screens and their rail entries are gone; both routes redirect here.
 *
 * The WMS-Dashboard treatment of the same window (DCC-SPEC §9, brief item 1)
 * lives UNDER the sheet. Both instructions were given and both are honoured —
 * the sheet answers "what did the calls do", the sections answer "who is
 * complying"; the sheet leads because that is the one read out on the call.
 *
 * ── `?demo=1` — SAMPLE DATA, IN MEMORY ONLY ────────────────────────────────
 * Every section of this page is empty until the module has been in use for
 * weeks, and an empty dashboard cannot be judged. `?demo=1` swaps BOTH reads
 * for a generated fortnight (lib/dcc/demo-data.ts) so the whole page can be seen
 * full. It writes nothing: this checkout points at the live database, so the
 * only safe place for invented people is memory, and closing the tab is the
 * entire cleanup. The sheet is read-only in that mode — there is no real person
 * behind an invented column to save against.
 *
 * ── WHO MAY TYPE, DECIDED HERE AND RE-DECIDED IN THE ACTION ────────────────
 * Three things must hold: ONE person is selected and you may fill for them, the
 * day has not closed at 11:59 pm IST, and the table exists. This page computes
 * all three and hands the sheet a list of open days; `saveCallLog` checks the
 * same three again, so the answer here is an affordance and never a permission.
 *
 * ── ONE WINDOW CONTROL, NOT TWO ────────────────────────────────────────────
 * The window is measured in WEEKS, not in loose days, because the sheet's shape
 * is Monday→Saturday plus a Weekly Total. Two controls — a day count for the
 * charts and a week offset for the sheet — would let the top and the bottom of
 * one page describe two different stretches of time.
 */
export default async function DccDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string; week?: string; person?: string; demo?: string }>;
}) {
  const me = await requireUser();
  const [scope, sp] = await Promise.all([loadDccScope(me), searchParams]);

  /* ── ON, OFF, OR DECIDE FOR ME ─────────────────────────────────────────
     `?demo=1` forces the sample, `?demo=0` forces the real data, and neither
     means AUTO: show the sample when there is nothing real to show. A dashboard
     of eight panels all reading "Nothing to show for this window yet" teaches
     nobody anything about the dashboard, and the person who most needs to see
     it full — somebody being shown the product — is exactly the person who will
     not think to hunt for a toggle. The moment one real compliance exists, the
     real data wins and the sample never appears again. */
  const forceDemo = sp.demo === "1" || sp.demo === "true";
  const forceReal = sp.demo === "0";

  const span = SPANS.includes(Number(sp.weeks) as (typeof SPANS)[number])
    ? Number(sp.weeks)
    : DEFAULT_SPAN;

  // IST — the timezone the whole module counts days in. A server in UTC must
  // never be the one deciding whose day it is.
  const today = localDateString("Asia/Kolkata");

  // The window ENDS on the current week, so the newest day sits in the rightmost
  // block, the way the sheet is read. `?week=-1` steps one week back; a POSITIVE
  // offset is clamped away rather than honoured, because a window in the future
  // is six empty columns and a compliance range nobody has lived through yet.
  const offset = Math.min(0, Number.isFinite(Number(sp.week)) ? Math.trunc(Number(sp.week)) : 0);
  const anchor = shiftDays(mondayOf(today), (offset - (span - 1)) * 7);
  const dates = sp1WorkingDays(anchor, span);
  const from = dates[0]!;
  const last = dates[dates.length - 1]!;
  // The charts stop at today; the sheet still shows the rest of the week as the
  // empty columns it genuinely is.
  const to = last > today ? today : last;

  /* ── WHERE THE NUMBERS COME FROM ───────────────────────────────────────
     Demo and real produce the SAME four shapes and both go through the same
     `computeDccDashboard` below. Branching here rather than inside each section
     is what stops the sample page from being a second implementation that can
     drift away from the one people actually use. */
  const buildSample = (onlyId: string | null) =>
    buildDccDemo({
      sheetDates: dates,
      historyFrom: historyStartFor(from, to),
      to,
      today,
      onlyId,
    });

  // The real read comes first unless the sample was asked for outright, because
  // whether it is EMPTY is what decides the mode.
  const realRoster = forceDemo ? [] : await loadDccRoster([...scope.visibleIds]);
  const realChosen = sp.person && scope.visibleIds.has(sp.person) ? sp.person : null;
  const realIds = realChosen ? [realChosen] : realRoster.map((r) => r.id);

  // The compliance side and the call side are independent reads; neither should
  // wait on the other, and neither may take the page down on its own.
  const [realInput, realLogs] = forceDemo
    ? [{ people: [], items: [], entries: [], reviews: [] }, { rows: [], missing: false }]
    : await Promise.all([
        loadDccDashboardInput(realIds, historyStartFor(from, to), to).catch(() => ({
          people: [],
          items: [],
          entries: [],
          reviews: [],
        })),
        loadSp1Logs({ employeeIds: realIds, from, to: last }).catch(() => ({
          rows: [],
          missing: true,
        })),
      ]);

  /** Nothing has ever been filled for anybody in scope: no duties, no calls. */
  const realEmpty = realInput.items.length === 0 && realLogs.rows.length === 0;
  const demo = forceDemo || (!forceReal && realEmpty);
  /** True when nobody asked for the sample — it is standing in for empty data. */
  const autoDemo = demo && !forceDemo;

  const sample = demo ? buildSample(forceDemo ? (sp.person ?? null) : null) : null;

  const roster = sample ? sample.roster : realRoster;
  const chosen = sample
    ? sp.person && isDemoPerson(sp.person)
      ? sp.person
      : null
    : realChosen;

  /* Demo and real produce the SAME four shapes and both go through the same
     `computeDccDashboard`. Branching here rather than inside each section is
     what stops the sample page from being a second implementation that can
     drift away from the one people actually use. */
  const [input, logs] = sample
    ? [sample, { rows: sample.callRows, missing: false }]
    : [realInput, realLogs];

  const result = computeDccDashboard({ ...input, from, to, today });

  /* WHOSE SHEET IS TYPEABLE. Only ever one person's: "Everyone" sums the roster
     into each cell, and a summed cell has no single owner to write back to.
     Never in demo mode — there is no real person behind an invented column. */
  const fillFor =
    !demo && chosen && canFillFor(scope, chosen) && !logs.missing ? chosen : null;
  const canEditPast = canEditPastDccEntries(me.email);
  const openDates = fillFor ? dates.filter((d) => isDccDayOpen(d, today, canEditPast)) : [];

  // The window's call outcomes, summed across everyone in scope — the same rows
  // the sheet spreads across days, collapsed into one total for the mix chart.
  const windowCounts: Sp1Counts = emptyCounts();
  for (const r of logs.rows) windowCounts[r.disposition] += r.count;
  const windowCalls = metricsOf(windowCounts);
  const windowTotal = SP1_DISPOSITIONS.reduce((n, d) => n + windowCounts[d], 0);

  const chosenName = chosen ? (roster.find((r) => r.id === chosen)?.name ?? "one person") : null;
  const who = chosenName ?? "everyone";
  const qs = (over: {
    weeks?: number;
    week?: number;
    person?: string | null;
    demo?: boolean;
  }) => {
    const p = new URLSearchParams();
    const w = over.weeks ?? span;
    if (w !== DEFAULT_SPAN) p.set("weeks", String(w));
    const off = over.week ?? offset;
    if (off !== 0) p.set("week", String(off));
    const person = over.person === undefined ? chosen : over.person;
    if (person) p.set("person", person);
    // Sample mode survives every other control, or one click on "2 weeks" would
    // drop you back into an empty real dashboard with no explanation.
    const wantDemo = over.demo ?? demo;
    if (wantDemo) p.set("demo", "1");
    // `?demo=0` has to be explicit: without it, an empty dashboard would simply
    // fall back to the sample again and the "Show real data" link would loop.
    else if (demo) p.set("demo", "0");
    const s = p.toString();
    return (s ? `/dcc/dashboard?${s}` : "/dcc/dashboard") as Route;
  };

  /* WHY THE SHEET IS READ-ONLY, IN ONE LINE, WITH THE WAY OUT IN IT. A grid
     that simply refuses to accept typing, with no explanation, is the state
     people file bugs about. */
  const readOnlyNote = demo ? (
    <>Sample data — invented people, invented calls. Nothing here can be saved.</>
  ) : logs.missing ? (
    <>Migration 0235 has not been applied — nothing can be saved until it is.</>
  ) : !chosen ? (
    <>
      Showing everyone&apos;s calls added together.{" "}
      <Link href={qs({ person: me.id })} className="font-semibold underline">
        Fill my calls
      </Link>{" "}
      to type into the sheet.
    </>
  ) : !canFillFor(scope, chosen) ? (
    <>You can read {chosenName}&apos;s calls, but only they can fill them.</>
  ) : (
    <>
      Every day in this window has closed. A day can be changed only until 11:59 pm on the day
      itself.
    </>
  );

  return (
    <PageShell width="full">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">
            Daily Compliance Dashboard
          </h1>
          <p className="text-[13px] text-ink-muted">
            Jeevan&apos;s SP1 sheet — {who}. Monday to Saturday, {from} to {last}.
          </p>
        </div>

        <nav aria-label="How many weeks" className="flex items-center gap-1.5">
          {SPANS.map((w) => (
            <Link
              key={w}
              href={qs({ weeks: w })}
              aria-current={span === w ? "true" : undefined}
              className={`inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
                span === w ? "text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              style={span === w ? { background: "var(--color-altus-red)" } : undefined}
            >
              {w} {w === 1 ? "week" : "weeks"}
            </Link>
          ))}
        </nav>

        <nav aria-label="Move the window" className="flex items-center gap-1.5">
          <Link
            href={qs({ week: offset - 1 })}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" /> Earlier
          </Link>
          <Link
            href={qs({ week: 0 })}
            aria-disabled={offset === 0}
            className={`inline-flex h-8 items-center rounded-lg border px-2.5 text-[12.5px] font-semibold ${
              offset === 0
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            This week
          </Link>
          <Link
            href={qs({ week: offset + 1 })}
            aria-disabled={offset >= 0}
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12.5px] font-semibold ${
              offset >= 0
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Later <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      {/* ── THE SAMPLE-DATA BAR ───────────────────────────────────────────
          Loud on purpose, and at the TOP. A dashboard full of invented numbers
          that does not say so is the single most expensive thing this feature
          could produce — somebody would act on Harsh Trivedi's 62%. */}
      {demo ? (
        <p
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
        >
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
          <span className="mr-auto">
            {autoDemo
              ? "Nothing has been filled in yet, so this is SAMPLE DATA — nine invented people, their compliances and their calls. It disappears the moment one real compliance exists, and none of it is saved anywhere."
              : "Sample data. These nine people, their compliances and every call below are invented, and none of it is saved anywhere."}
          </span>
          <Link
            href={qs({ demo: false, person: null })}
            className="shrink-0 rounded-lg bg-white/70 px-3 py-1.5 font-bold underline"
          >
            Show real data
          </Link>
        </p>
      ) : (
        <p className="mb-3 text-[12px] text-ink-subtle">
          Showing the real data in this database.{" "}
          <Link href={qs({ demo: true, person: null })} className="font-semibold underline">
            Preview with sample data
          </Link>{" "}
          to see the dashboard full.
        </p>
      )}

      {logs.missing && (
        <p
          className="mb-3 flex items-start gap-2 rounded-xl px-4 py-3 text-[13px]"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            The call log isn&apos;t set up in this database yet — migration{" "}
            <code className="font-mono">0235_dcc_call_logs.sql</code> has not been applied. The
            sheet below shows its real shape with zeros and cannot be filled.
          </span>
        </p>
      )}

      {roster.length > 1 && (
        <nav aria-label="Whose numbers" className="mb-3 flex flex-wrap gap-1.5">
          <Chip href={qs({ person: null })} active={!chosen}>
            Everyone ({roster.length})
          </Chip>
          {roster.map((r) => (
            <Chip key={r.id} href={qs({ person: r.id })} active={chosen === r.id}>
              {!demo && r.id === me.id ? "Me" : r.name}
            </Chip>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-3">
        {/* THE SHEET FIRST, at full width, and it is also where the day is
            filled. Everything below it is commentary on the same window. */}
        <Sp1Sheet
          dates={dates}
          rows={logs.rows}
          fillFor={fillFor}
          openDates={openDates}
          today={today}
          readOnlyNote={readOnlyNote}
        />

        <p className="text-[11.5px] text-ink-subtle">
          Rows 1–11 count as <strong>Connected</strong> — somebody answered, whatever they then
          said. Rows 12–15 never reached a person. A ratio with no denominator prints an em-dash,
          never 0%, and the weekly column is recomputed from summed counts rather than by averaging
          the days. Sunday is not a column, exactly as in the sheet.
        </p>

        <DccKpiStrip result={result} calls={windowCalls} />

        <DccTrend result={result} />
        <DccHeatmap result={result} />

        <DccPerformers result={result} />

        <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          <DccMostMissed result={result} />
          <DccSections result={result} />
        </div>

        <DccCallMix counts={windowCounts} total={windowTotal} />
      </div>

      <p className="mt-3 text-[11.5px] text-ink-subtle">
        The compliance sections below the sheet stop at {to} — the sheet still shows the rest of the
        week as the empty columns it is. Grey in the heatmap means nothing was due that day.
      </p>
    </PageShell>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: Route;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}
