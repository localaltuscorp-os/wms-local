"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowUpDown,
  CalendarCheck2,
  CalendarRange,
  CircleSlash,
  Clock,
  ListChecks,
  TriangleAlert,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { HBars, type HBarRow } from "@/components/charts/h-bars";
import { statusCardTokens, type StatusCardKey } from "@/lib/status-palette";
import { drillHref, type KpiDrill } from "@/lib/compliance/dashboard";
import type {
  ComplianceDashboardData,
  CompliancePersonRow,
} from "@/lib/compliance/dashboard";

/**
 * THE WCC / MCC DASHBOARD.
 *
 * ── WHY IT IS SHAPED LIKE THIS ─────────────────────────────────────────────
 * One line of KPI tiles that says how the window went, then sections that each
 * answer ONE question — what state is everything in, what keeps breaking, which
 * cadence people cannot keep, who is carrying the most compliance time, and who
 * is complying. A reader should be able to name the question a section answers
 * from its heading alone.
 *
 * Every section is single-series magnitude, and so every one of them is a
 * ranked horizontal bar: the labels are words of varying length ("Circulate the
 * board meeting minutes", "Mon to Sat"), which a vertical axis cannot hold
 * without rotating text, and ranking is the whole point of each list. No
 * legends, because one series is named by its heading; no pie charts, because
 * every one of these is a comparison of magnitudes rather than parts of a whole.
 *
 * Colour comes from the app's own palettes and nothing here invents one: the
 * tiles use `statusCardTokens` (the same soft containers as the WMS KPI strip
 * and the Done dashboard), and the status chart uses the reserved status
 * colours — which is their correct use, since those bars ARE statuses. Every
 * bar carries its label, so identity is never colour alone.
 */

type SortKey = keyof Pick<
  CompliancePersonRow,
  "ownerName" | "due" | "done" | "onTime" | "late" | "notFilled" | "carried" | "lapsed" | "ratePct"
>;

/**
 * Status → the app's reserved status colour.
 *
 * Deliberately NOT the categorical chart ramp: these bars are states, and the
 * one rule about status colour is that it means the state and is never reused
 * as "series 4". The values are the `--kpi-neon-*-deep` steps from globals.css,
 * which is the darkness that holds up as a fill.
 */
const STATUS_FILL: Record<string, string> = {
  unfilled: "#B91C1C", // red-700    — nobody has touched it
  done: "#059669", // emerald-600
  abandoned: "#881337", // rose-900  — given up, deliberately
  need_info: "#DC2626", // red-600
  need_help: "#DC2626",
  follow_up: "#B45309", // amber-700
  follow_up_1: "#B45309",
  follow_up_2: "#B45309",
  follow_up_3: "#B45309",
  initiated: "#B45309",
  on_hold: "#6B7280",
  not_started: "#4B5563", // gray-600
  dont_know: "#6B7280", // gray-500 — "Not Read"
};

/** Minutes as "3h 35m" / "45m" — an hour count is what a workload reads as. */
function hm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ComplianceDashboardView({
  data,
  windowLabel,
  scopePicker,
  who,
}: {
  data: ComplianceDashboardData;
  windowLabel: string;
  scopePicker?: React.ReactNode;
  /** Carried into every drill-through, so a link never widens the scope you set. */
  who?: string;
}) {
  // `router.push`, not `window.location` — a client-side navigation keeps the
  // rail and the shell mounted instead of reloading the whole app to move one
  // tab across.
  const router = useRouter();
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "ratePct",
    dir: "desc",
  });
  const [query, setQuery] = React.useState("");

  const people = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.people.filter((p) => p.ownerName.toLowerCase().includes(q))
      : data.people;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "ownerName") return a.ownerName.localeCompare(b.ownerName) * dir;
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
    });
  }, [data.people, query, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "ownerName" ? "asc" : "desc" },
    );
  }

  const k = data.combined;

  const statusBars: HBarRow[] = data.status.map((s) => ({
    label: s.label,
    value: s.count,
    color: STATUS_FILL[s.status] ?? "#6B7280",
  }));
  const missedBars: HBarRow[] = data.mostMissed.map((m) => ({
    label: m.title,
    value: m.missed,
    color: "#B91C1C",
  }));
  const freqBars: HBarRow[] = data.byFrequency.map((f) => ({
    label: f.schedule,
    value: f.ratePct,
    // Banded, not a ramp: the reader wants "fine / slipping / in trouble",
    // and a continuous scale makes 71% and 69% look identical.
    color: f.ratePct >= 90 ? "#059669" : f.ratePct >= 70 ? "#B45309" : "#B91C1C",
  }));
  const loadBars: HBarRow[] = data.minutesLoad.slice(0, 10).map((l) => ({
    label: l.ownerName,
    value: l.minutes,
    color: "#1d4ed8",
  }));

  /** Every tile's destination, scope preserved. Null = no honest destination. */
  const go = (drill: KpiDrill) => drillHref(drill, who);

  /** Bars need room per row, but a two-row chart should not reserve 320px. */
  const barsHeight = (n: number) => Math.max(140, Math.min(360, n * 34 + 40));

  return (
    <PageShell as="div" width="full" py={false} className="pb-20">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: "#FEE2E2", color: "#A80400" }}
        >
          <ListChecks className="h-5 w-5" />
        </span>
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">
            Compliance Dashboard
          </h1>
          <p className="text-[13px] text-ink-muted">
            {windowLabel} — every figure is the WCC and MCC rows themselves, counted.
          </p>
        </div>
        {scopePicker}
      </header>

      {/* ONE LINE. Six fixed columns from `lg` up, so the strip never wraps onto
          a second row and leaves one orphan tile sitting alone. Below that it
          steps 3 → 2 rather than shrinking the numbers into illegibility. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          cardKey="total"
          label="Total Due"
          href={go("all")}
          value={k.due.toLocaleString("en-IN")}
          sub={`${data.wcc.due.toLocaleString("en-IN")} weekly · ${data.mcc.due.toLocaleString("en-IN")} monthly`}
          icon={<ListChecks size={15} strokeWidth={2.4} />}
        />
        <Kpi
          cardKey="done"
          label="Done"
          href={go("done")}
          value={`${k.ratePct}%`}
          sub={`${k.done.toLocaleString("en-IN")} of ${k.due.toLocaleString("en-IN")}`}
          icon={<CalendarCheck2 size={15} strokeWidth={2.4} />}
        />
        <Kpi
          cardKey="notApproved"
          label="On Time"
          href={go(null)}
          value={`${k.onTimePct}%`}
          sub={`${k.onTime.toLocaleString("en-IN")} on time · ${k.late.toLocaleString("en-IN")} late`}
          icon={<Clock size={15} strokeWidth={2.4} />}
        />
        <Kpi
          cardKey="needInfo"
          label="Carried"
          href={go("carried")}
          value={k.carried.toLocaleString("en-IN")}
          sub="Past deadline, still open"
          icon={<CalendarRange size={15} strokeWidth={2.4} />}
        />
        <Kpi
          cardKey="pending"
          label="Not Filled"
          href={go("none")}
          value={k.notFilled.toLocaleString("en-IN")}
          sub={`${k.abandoned.toLocaleString("en-IN")} abandoned`}
          icon={<CircleSlash size={15} strokeWidth={2.4} />}
        />
        <Kpi
          cardKey="notStarted"
          label="Lapsed"
          href={go("lapsed")}
          value={k.lapsed.toLocaleString("en-IN")}
          sub={k.minutes > 0 ? `${hm(k.minutes)} of load` : "Time ran out"}
          icon={<TriangleAlert size={15} strokeWidth={2.4} />}
        />
      </div>

      {/* WCC vs MCC is a COMPARISON OF TWO THINGS, which is not a chart. Two
          stat rows say it in less space and with no scale to misread. */}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <Section title="Weekly vs Monthly" hint="The two checklists, side by side">
          <div className="grid grid-cols-2 gap-3">
            <KindPanel name="WCC — Weekly" kpis={data.wcc} href="/dcc/wcc" />
            <KindPanel name="MCC — Monthly" kpis={data.mcc} href="/dcc/mcc" />
          </div>
        </Section>

        <Section
          title="Where everything stands"
          hint="Every row in the window, by its Doer Status"
        >
          {statusBars.length === 0 ? (
            <Empty>Nothing was due in this window.</Empty>
          ) : (
            <HBars
              data={statusBars}
              height={barsHeight(statusBars.length)}
              onBarClick={(bar) => {
                // Back to the slice, so the link uses the status KEY rather
                // than its label — "Not Filled" is the chip `none`.
                const slice = data.status.find((x) => x.label === bar.label);
                if (!slice) return;
                const href = drillHref(
                  slice.status === "unfilled" ? "none" : (slice.status as KpiDrill),
                  who,
                );
                if (href) router.push(href as Route);
              }}
            />
          )}
        </Section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Section
          title="What keeps breaking"
          hint="Compliances missed most often, counted across everyone"
        >
          {missedBars.length === 0 ? (
            <Empty>Nothing was missed. Every compliance due was done.</Empty>
          ) : (
            <HBars
              data={missedBars}
              height={barsHeight(missedBars.length)}
              rightLabel={(r) => {
                const m = data.mostMissed.find((x) => x.title === r.label);
                return m ? `${m.missed} of ${m.due}` : String(r.value);
              }}
              onBarClick={(bar) => {
                // The board has no per-compliance filter, but it has a search
                // that matches on title — which is the same set of rows.
                const params = new URLSearchParams({ find: bar.label });
                if (who && who !== "me") params.set("who", who);
                router.push(`/dcc/wcc?${params.toString()}` as Route);
              }}
            />
          )}
        </Section>

        <Section
          title="Compliance rate by frequency"
          hint="Which cadence people keep up with — worst first"
        >
          {freqBars.length === 0 ? (
            <Empty>Nothing was due in this window.</Empty>
          ) : (
            <HBars
              data={freqBars}
              height={barsHeight(freqBars.length)}
              maxValue={100}
              rightLabel={(r) => {
                const f = data.byFrequency.find((x) => x.schedule === r.label);
                return f ? `${f.ratePct}% · ${f.done}/${f.due}` : `${r.value}%`;
              }}
            />
          )}
        </Section>
      </div>

      {data.minutesLoad.length > 0 && (
        <div className="mt-3">
          <Section
            title="Compliance time load"
            hint="Minutes of compliance carried per person — workload, not performance"
          >
            <HBars
              data={loadBars}
              height={barsHeight(loadBars.length)}
              rightLabel={(r) => hm(r.value)}
            />
          </Section>
        </div>
      )}

      <section className="mt-5" aria-label="Compliance by person">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black uppercase tracking-[0.08em] text-ink-strong">
              Compliance by person
            </h2>
            <p className="text-[12px] text-ink-muted">
              Both checklists together — click a name for their board.
            </p>
          </div>
          <div className="relative flex h-9 w-[240px] items-center rounded-lg border border-hairline bg-surface-card px-2.5 max-md:w-full">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Search name"
              aria-label="Filter by name"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-card">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-slate-50/60">
                <Th onClick={() => toggleSort("ownerName")} active={sort.key === "ownerName"} dir={sort.dir}>
                  Employee
                </Th>
                <Th onClick={() => toggleSort("due")} active={sort.key === "due"} dir={sort.dir} align="right">
                  Due
                </Th>
                <Th onClick={() => toggleSort("done")} active={sort.key === "done"} dir={sort.dir} align="right">
                  Done
                </Th>
                <Th onClick={() => toggleSort("onTime")} active={sort.key === "onTime"} dir={sort.dir} align="right">
                  On Time
                </Th>
                <Th onClick={() => toggleSort("late")} active={sort.key === "late"} dir={sort.dir} align="right">
                  Late
                </Th>
                <Th onClick={() => toggleSort("notFilled")} active={sort.key === "notFilled"} dir={sort.dir} align="right">
                  Not Filled
                </Th>
                <Th onClick={() => toggleSort("carried")} active={sort.key === "carried"} dir={sort.dir} align="right">
                  Carried
                </Th>
                <Th onClick={() => toggleSort("lapsed")} active={sort.key === "lapsed"} dir={sort.dir} align="right">
                  Lapsed
                </Th>
                <Th onClick={() => toggleSort("ratePct")} active={sort.key === "ratePct"} dir={sort.dir} align="right">
                  Rate
                </Th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-ink-muted">
                    {/* "Nobody matched" and "nothing was due" are different facts,
                        and saying "no data" for a typo teaches distrust. */}
                    {query.trim()
                      ? `No one matching “${query.trim()}”.`
                      : "Nothing was due in this window."}
                  </td>
                </tr>
              )}
              {people.map((p) => (
                <tr key={p.ownerId} className="border-b border-hairline last:border-0 hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-semibold text-ink-strong">
                    <Link
                      href={`/dcc/wcc?who=${encodeURIComponent(p.ownerId)}` as Route}
                      className="hover:underline"
                      title={`Open ${p.ownerName}'s checklist`}
                    >
                      {p.ownerName}
                    </Link>
                  </td>
                  <Td>{p.due}</Td>
                  <Td>{p.done}</Td>
                  <Td>{p.onTime}</Td>
                  <Td tone={p.late > 0 ? "warn" : undefined}>{p.late}</Td>
                  <Td tone={p.notFilled > 0 ? "warn" : undefined}>{p.notFilled}</Td>
                  <Td tone={p.carried > 0 ? "warn" : undefined}>{p.carried}</Td>
                  <Td tone={p.lapsed > 0 ? "bad" : undefined}>{p.lapsed}</Td>
                  <td className="px-4 py-2.5 text-right">
                    <RateBadge pct={p.ratePct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

/** One card of chrome, so every section below the strip sits the same way. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface-card p-4 shadow-sm">
      <h2 className="text-[13px] font-black uppercase tracking-[0.08em] text-ink-strong">
        {title}
      </h2>
      <p className="mb-3 text-[12px] text-ink-muted">{hint}</p>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-[13px] text-ink-muted">{children}</p>
  );
}

/** WCC or MCC in one small panel — rate, then what is behind it. */
function KindPanel({
  name,
  kpis,
  href,
}: {
  name: string;
  kpis: ComplianceDashboardData["wcc"];
  href: string;
}) {
  return (
    <Link
      href={href as Route}
      className="block rounded-lg border border-hairline bg-surface-soft p-3 transition-colors hover:bg-slate-50"
    >
      <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
        {name}
      </span>
      <span
        className="mt-1 block tabular-nums leading-none text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 24 }}
      >
        {kpis.ratePct}%
      </span>
      <span className="mt-1.5 block text-[11.5px] text-ink-muted">
        {kpis.done} of {kpis.due} done · {kpis.lapsed} lapsed
      </span>
    </Link>
  );
}

/**
 * The soft-container tile — compact enough that six sit on one line, and a
 * LINK when the figure has rows behind it.
 *
 * A tile with no honest destination stays a plain div rather than becoming a
 * link that goes somewhere near enough: "On Time" has no chip on the board, and
 * pointing it at `done` would show 450 rows after a click on a tile reading
 * 389. The hover affordance appears only where a click is real.
 */
function Kpi({
  label,
  value,
  sub,
  cardKey,
  icon,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  cardKey: StatusCardKey;
  icon: React.ReactNode;
  href: string | null;
}) {
  const t = statusCardTokens(cardKey);
  const body = (
    <>
      <span
        className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] ${t.label}`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`mt-1.5 block tabular-nums leading-none ${t.value}`}
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 26,
        }}
      >
        {value}
      </span>
      <span className={`mt-1.5 block truncate text-[11px] font-medium ${t.sub}`} title={sub}>
        {sub}
      </span>
    </>
  );
  const shell = `rounded-xl border p-3 shadow-sm ${t.shell}`;
  return href ? (
    <Link
      href={href as Route}
      className={`${shell} block transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2`}
      title={`Open the ${label.toLowerCase()} rows`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/**
 * The rate, banded.
 *
 * Three answers — fine, slipping, in trouble — because that is the question a
 * reader actually has. A continuous ramp makes 71% and 69% look the same while
 * 100% and 90% look different.
 */
function RateBadge({ pct }: { pct: number }) {
  const key: StatusCardKey = pct >= 90 ? "done" : pct >= 70 ? "needInfo" : "pending";
  const t = statusCardTokens(key);
  return (
    <span
      className={`inline-flex min-w-[52px] justify-center rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums ${t.badge}`}
    >
      {pct}%
    </span>
  );
}

function Td({ children, tone }: { children: React.ReactNode; tone?: "warn" | "bad" }) {
  const cls =
    tone === "bad" ? "text-rose-700 font-semibold" : tone === "warn" ? "text-amber-700" : "text-ink";
  return <td className={`px-4 py-2.5 text-right tabular-nums ${cls}`}>{children}</td>;
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-subtle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink-strong ${
          active ? "text-ink-strong" : ""
        }`}
      >
        {children}
        <ArrowUpDown className="size-3" aria-hidden />
      </button>
    </th>
  );
}
