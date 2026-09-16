import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { loadDccScope } from "@/lib/dcc/access";
import { buildSp1Grid, mondayOf, shiftDays, sp1WorkingDays } from "@/lib/dcc/sp1";
import { loadSp1Logs, loadSp1People } from "@/lib/queries/dcc-sp1";
import { localDateString } from "@/lib/format";
import { Sp1Grid } from "@/components/dcc/sp1/sp1-grid";

export const dynamic = "force-dynamic";

/** How many weeks of six working days the grid shows at once. */
const WEEKS = 2;

/**
 * EMPLOYEES → DCC → SP1 REPORT (DCC-SPEC §8).
 *
 * WHOSE NUMBERS: the same DCC scope every other screen in the module uses —
 * yourself, plus your downline if you have one, plus everybody for a
 * super-admin. `?person=` narrows to one of them; `?week=` moves the window.
 */
export default async function DccSp1Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; person?: string }>;
}) {
  const me = await requireUser();
  const [scope, sp] = await Promise.all([loadDccScope(me), searchParams]);

  const visible = [...scope.visibleIds];
  const people = await loadSp1People(visible);

  // An unknown id falls back to everyone rather than showing an empty grid with
  // no explanation of why it is empty.
  const chosen = sp.person && scope.visibleIds.has(sp.person) ? sp.person : null;
  const ids = chosen ? [chosen] : visible;

  // IST — the timezone the whole module counts days in. A server in UTC must
  // never be the one deciding whose day it is.
  const today = localDateString("Asia/Kolkata");
  // The window ENDS on the current week, so the newest day is in the rightmost
  // block — the way the sheet is read. `?week=-1` steps back a week.
  const offset = Number.isFinite(Number(sp.week)) ? Math.trunc(Number(sp.week)) : 0;
  const anchor = shiftDays(mondayOf(today), (offset - (WEEKS - 1)) * 7);
  const dates = sp1WorkingDays(anchor, WEEKS);
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;

  const { rows, missing } = await loadSp1Logs({ employeeIds: ids, from, to });
  const columns = buildSp1Grid(dates, rows);

  const who = chosen
    ? (people.find((p) => p.id === chosen)?.name ?? "one person")
    : `everyone you can see (${people.length})`;

  const qs = (over: { week?: number; person?: string | null }) => {
    const p = new URLSearchParams();
    const w = over.week ?? offset;
    if (w !== 0) p.set("week", String(w));
    const person = over.person === undefined ? chosen : over.person;
    if (person) p.set("person", person);
    const s = p.toString();
    return (s ? `/dcc/sp1?${s}` : "/dcc/sp1") as Route;
  };

  return (
    <PageShell width="full">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">SP1 Report</h1>
          <p className="text-[13px] text-ink-muted">
            Call outcomes by day — {who}. Monday to Saturday, {from} to {to}.
          </p>
        </div>
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

      {missing && (
        <p
          className="mb-3 flex items-start gap-2 rounded-xl px-4 py-3 text-[13px]"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            The call log isn&apos;t set up in this database yet — migration{" "}
            <code className="font-mono">0235_dcc_call_logs.sql</code> has not been applied. The grid
            below shows its real shape with zeros.
          </span>
        </p>
      )}

      {people.length > 1 && (
        <nav aria-label="Whose calls" className="mb-3 flex flex-wrap gap-1.5">
          <FilterLink href={qs({ person: null })} active={!chosen}>
            Everyone ({people.length})
          </FilterLink>
          {people.map((p) => (
            <FilterLink key={p.id} href={qs({ person: p.id })} active={chosen === p.id}>
              {p.name}
            </FilterLink>
          ))}
        </nav>
      )}

      <Sp1Grid columns={columns} />

      <p className="mt-3 text-[11.5px] text-ink-subtle">
        Rows 1–11 count as <strong>Connected</strong> — somebody answered, whatever they then said.
        Rows 12–15 never reached a person. A ratio with no denominator prints an em-dash, never 0%,
        and the weekly column is recomputed from summed counts rather than by averaging the days.
        Sunday is not a column, exactly as in the sheet.
      </p>
    </PageShell>
  );
}

function FilterLink({
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
