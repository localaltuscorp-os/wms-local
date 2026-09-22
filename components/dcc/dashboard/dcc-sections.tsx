import {
  compliancePct,
  filledOf,
  filledPct,
  rateTone,
  type DccDashboardResult,
  type PersonStats,
  type Tally,
} from "@/lib/dcc/dashboard";
import {
  SP1_DISPOSITIONS,
  SP1_LABEL,
  SP1_TONE,
  SP1_TONE_STYLE,
  pct,
  type Sp1Counts,
  type Sp1Metrics,
} from "@/lib/dcc/sp1";

/**
 * THE DASHBOARD'S SECTIONS (DCC-SPEC §9).
 *
 * Server components, all of them: every figure is computed before render and
 * nothing here is interactive, so none of it needs to reach the browser. The
 * filters are links, which is also why the whole page can stay on the server.
 *
 * ── ONE RULE THROUGHOUT ────────────────────────────────────────────────────
 * A rate with no denominator renders an em-dash, never 0%. A person with no
 * compliances due in the window has not failed; showing them at 0% would put
 * them at the bottom of the leaderboard for doing nothing wrong.
 */

const DASH = "—";

const TONE_COLOR: Record<ReturnType<typeof rateTone>, string> = {
  green: "var(--color-green)",
  amber: "var(--color-amber)",
  red: "var(--color-altus-red)",
  none: "var(--color-ink-subtle)",
};

function ratePct(v: number | null): string {
  return v === null ? DASH : `${Math.round(v)}%`;
}

/* ── KPI strip ────────────────────────────────────────────────────────────── */

export function DccKpiStrip({
  result,
  calls,
}: {
  result: DccDashboardResult;
  calls: Sp1Metrics;
}) {
  const compliance = compliancePct(result.totals);
  const prev = compliancePct(result.prevTotals);
  const filled = filledPct(result.totals);

  const cards: { label: string; value: string; sub?: string; tone?: string }[] = [
    {
      label: "Compliance",
      value: ratePct(compliance),
      sub:
        compliance !== null && prev !== null
          ? `${compliance - prev >= 0 ? "+" : ""}${Math.round(compliance - prev)} pts vs previous`
          : "No previous window",
      tone: TONE_COLOR[rateTone(compliance)],
    },
    {
      label: "Filled",
      value: ratePct(filled),
      sub: `${filledOf(result.totals)} of ${result.totals.due} due`,
    },
    {
      label: "Total calls",
      value: String(calls.totalCalls),
      sub: `${calls.connected} connected · ${calls.couldNotConnect} not`,
    },
    {
      label: "Connected ratio",
      value: pct(calls.connectedRatio),
      sub: `Registered ${pct(calls.registeredToConnected)} of connected`,
    },
  ];

  return (
    <dl className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            {c.label}
          </dt>
          <dd
            className="mt-0.5 text-[26px] font-black leading-none tabular-nums"
            style={{ color: c.tone ?? "var(--color-ink-strong)" }}
          >
            {c.value}
          </dd>
          {c.sub && <p className="mt-1 text-[11.5px] text-ink-subtle">{c.sub}</p>}
        </div>
      ))}
    </dl>
  );
}

/* ── Compliance heatmap ───────────────────────────────────────────────────── */

function bucketColor(t: Tally): string {
  if (t.due === 0) return "#F1F5F9"; // nothing was due — not a failure
  const p = compliancePct(t) ?? 0;
  if (p >= 95) return "#1E8E3E";
  if (p >= 80) return "#5BB974";
  if (p >= 60) return "#FBBC04";
  if (p >= 40) return "#F29900";
  return "#D93025";
}

export function DccHeatmap({ result }: { result: DccDashboardResult }) {
  if (result.people.length === 0) return <Empty title="Compliance heatmap" />;
  return (
    <Panel
      title="Compliance heatmap"
      blurb="Person by day. Grey means nothing was due, not that it was missed."
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Person
              </th>
              {result.buckets.map((b) => (
                <th
                  key={b.key}
                  scope="col"
                  className="px-1 py-1.5 text-center text-[10px] font-semibold text-slate-400"
                >
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.people.map((p) => (
              <tr key={p.person.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[160px] truncate bg-white px-3 py-1 text-left text-[12.5px] font-semibold text-ink"
                >
                  {p.person.name}
                </th>
                {p.buckets.map((t, i) => (
                  <td key={result.buckets[i]?.key ?? i} className="px-0.5 py-0.5">
                    <span
                      title={`${result.buckets[i]?.label ?? ""} — ${t.done} of ${t.due} done`}
                      className="block h-5 w-full min-w-[14px] rounded-[3px]"
                      style={{ background: bucketColor(t) }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ── Leaderboards ─────────────────────────────────────────────────────────── */

function PersonRow({ p, rank }: { p: PersonStats; rank: number }) {
  const c = compliancePct(p.tally);
  return (
    <li className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-b-0">
      <span className="w-5 shrink-0 text-right text-[11.5px] font-bold tabular-nums text-slate-400">
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-strong">
        {p.person.name}
      </span>
      {p.streak > 0 && (
        <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">
          {p.streak}d streak
        </span>
      )}
      <span
        className="w-12 shrink-0 text-right text-[13px] font-black tabular-nums"
        style={{ color: TONE_COLOR[rateTone(c)] }}
      >
        {ratePct(c)}
      </span>
    </li>
  );
}

export function DccPerformers({ result }: { result: DccDashboardResult }) {
  /* Ranked over EVERYONE first, so the number beside a name is a position in the
     org and not a position in a filtered list of three. */
  const ranked = result.people
    .filter((p) => p.tally.due > 0)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  if (ranked.length === 0) return <Empty title="Performers" />;

  const top = ranked.slice(0, 5);
  const bottom = ranked.slice(-5).reverse().filter((p) => !top.includes(p));

  return (
    <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
      <Panel title="Top performers" blurb="80% compliance, 20% streak.">
        <ul>
          {top.map((p, i) => (
            <PersonRow key={p.person.id} p={p} rank={i + 1} />
          ))}
        </ul>
      </Panel>
      <Panel title="Needs attention" blurb="Lowest first — where a conversation is owed.">
        {bottom.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-ink-muted">Everybody is in the top group.</p>
        ) : (
          <ul>
            {bottom.map((p) => (
              <PersonRow key={p.person.id} p={p} rank={ranked.indexOf(p) + 1} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ── Most-missed compliances ──────────────────────────────────────────────── */

export function DccMostMissed({ result }: { result: DccDashboardResult }) {
  const missed = result.items
    .filter((i) => i.missRate !== null && i.tally.due > 0)
    .sort((a, b) => (b.missRate ?? 0) - (a.missRate ?? 0))
    .slice(0, 8);
  if (missed.length === 0) return <Empty title="Most-missed compliances" />;

  return (
    <Panel
      title="Most-missed compliances"
      blurb="Which duties the org drops — not which people drop them."
    >
      <ul>
        {missed.map((m) => (
          <li
            key={m.item.id}
            className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink-strong">
                {m.item.title}
              </span>
              <span className="block truncate text-[11.5px] text-ink-subtle">{m.ownerName}</span>
            </span>
            <span className="w-14 shrink-0 text-right text-[13px] font-black tabular-nums text-red-600">
              {ratePct(m.missRate === null ? null : m.missRate)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── Section breakdown ────────────────────────────────────────────────────── */

export function DccSections({ result }: { result: DccDashboardResult }) {
  if (result.sections.length === 0) return <Empty title="By section" />;
  return (
    <Panel title="By section" blurb="A whole area failing looks different from one person failing.">
      <ul>
        {result.sections.map((s) => {
          const c = s.compliance;
          return (
            <li
              key={s.section}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-strong">
                {s.section}
              </span>
              <span className="shrink-0 text-[11.5px] text-ink-subtle">
                {s.kpis} across {s.people}
              </span>
              <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${c ?? 0}%`,
                    background: TONE_COLOR[rateTone(c)],
                  }}
                />
              </span>
              <span className="w-12 shrink-0 text-right text-[13px] font-black tabular-nums text-ink">
                {ratePct(c)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Call-outcome mix ─────────────────────────────────────────────────────── */

export function DccCallMix({ counts, total }: { counts: Sp1Counts; total: number }) {
  if (total === 0) return <Empty title="Call-outcome mix" />;
  const rows = SP1_DISPOSITIONS.map((d) => ({ d, n: counts[d] }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);

  return (
    <Panel title="Call-outcome mix" blurb={`Where ${total} calls landed over the window.`}>
      <ul className="px-4 py-2">
        {rows.map(({ d, n }) => {
          const tone = SP1_TONE_STYLE[SP1_TONE[d]];
          return (
            <li key={d} className="flex items-center gap-3 py-1">
              <span className="w-44 shrink-0 truncate text-[12.5px] font-semibold text-ink">
                {SP1_LABEL[d]}
              </span>
              <span className="h-3 flex-1 overflow-hidden rounded-sm bg-slate-100">
                <span
                  className="block h-full"
                  style={{
                    width: `${(n / total) * 100}%`,
                    background: tone.bg === "#FFFFFF" ? "#CBD5E1" : tone.bg,
                  }}
                />
              </span>
              <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-ink-muted">
                {n} · {Math.round((n / total) * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Daily trend ──────────────────────────────────────────────────────────── */

export function DccTrend({ result }: { result: DccDashboardResult }) {
  const days = result.daily.filter((d) => d.tally.due > 0);
  if (days.length === 0) return <Empty title="Daily trend" />;
  return (
    <Panel title="Daily trend" blurb="Compliance per day across the window.">
      <div className="flex items-end gap-0.5 px-4 py-3" style={{ height: 96 }}>
        {days.map((d) => {
          const c = compliancePct(d.tally) ?? 0;
          return (
            <span
              key={d.date}
              title={`${d.date} — ${d.tally.done} of ${d.tally.due} done`}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${Math.max(3, c)}%`,
                background: TONE_COLOR[rateTone(c)],
                minWidth: 3,
              }}
            />
          );
        })}
      </div>
    </Panel>
  );
}

/* ── Chrome ───────────────────────────────────────────────────────────────── */

function Panel({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-[13px] font-bold text-ink-strong">{title}</h2>
        {blurb && <p className="mt-0.5 text-[11.5px] text-ink-subtle">{blurb}</p>}
      </header>
      {children}
    </section>
  );
}

/**
 * An empty section still RENDERS, with its title and a reason. A section that
 * disappears when it has no data makes the page a different shape every day and
 * leaves the reader wondering whether it broke or there is genuinely nothing.
 */
function Empty({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-[13px] font-bold text-ink-strong">{title}</h2>
      </header>
      <p className="px-4 py-5 text-[12.5px] text-ink-muted">
        Nothing to show for this window yet.
      </p>
    </section>
  );
}
