"use client";

import * as React from "react";
import { Flame, TrendingDown, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { PersonStats } from "@/lib/dcc/dashboard";
import type { ReportMeta, SectionReport } from "@/lib/reports/section-report";
import { DccSection, EmptyNote } from "./ui";
import { fmtPct, missedOf, shortDate, toneText } from "./format";

/** How many people each list shows. */
const LIST_SIZE = 5;

/**
 * TOP PERFORMERS and PEOPLE TO PULL UP — the DCC ranking, inside the scope.
 *
 * Scored the way /dcc/ranking scores (80% compliance, 20% streak capped at 30
 * days) so a name cannot rank first here and fifth there. Unlike that page this
 * ranks only the people the viewer may see, not the whole company.
 *
 * The two lists never share a person: on a team of six, "top five" and "bottom
 * five" would otherwise put the same four people on both.
 */
export function rankPeople(people: PersonStats[]): { top: PersonStats[]; bottom: PersonStats[] } {
  const scored = people
    .filter((p) => p.score != null)
    .sort((a, b) => b.score! - a.score! || (b.compliance ?? 0) - (a.compliance ?? 0) || b.streak - a.streak);
  const top = scored.slice(0, LIST_SIZE);
  const topIds = new Set(top.map((p) => p.person.id));
  const bottom = [...scored]
    .reverse()
    .filter((p) => !topIds.has(p.person.id))
    .slice(0, LIST_SIZE);
  return { top, bottom };
}

export function TopPerformersSection({
  people,
  meta,
  onOpen,
}: {
  people: PersonStats[];
  meta: ReportMeta[];
  onOpen: (p: PersonStats) => void;
}) {
  const { top } = React.useMemo(() => rankPeople(people), [people]);
  return (
    <DccSection
      icon={Trophy}
      title="Top Performers"
      subtitle="Ranked by score: 80% compliance and 20% streak, the same formula as DCC Ranking — but only across the people in this view."
      label="top performers"
      report={() => rankingReport("DCC Top Performers", top, meta)}
    >
      <PersonList people={top} onOpen={onOpen} empty="Nobody had KPIs due in this window." tone="top" />
    </DccSection>
  );
}

export function PeopleToPullUpSection({
  people,
  meta,
  onOpen,
}: {
  people: PersonStats[];
  meta: ReportMeta[];
  onOpen: (p: PersonStats) => void;
}) {
  const { bottom } = React.useMemo(() => rankPeople(people), [people]);
  return (
    <DccSection
      icon={TrendingDown}
      title="People To Pull Up"
      subtitle="The lowest scores in this view, excluding anyone already in Top Performers."
      label="people to pull up"
      report={() => rankingReport("DCC People To Pull Up", bottom, meta)}
    >
      <PersonList people={bottom} onOpen={onOpen} empty="Not enough people to rank below the top five." tone="bottom" />
    </DccSection>
  );
}

function rankingReport(title: string, list: PersonStats[], meta: ReportMeta[]): SectionReport {
  return {
    title,
    meta,
    columns: [
      { label: "Person", weight: 3 },
      { label: "Score", align: "right" },
      { label: "Compliance", align: "right" },
      { label: "Streak", align: "right" },
      { label: "Missed", align: "right", tone: "count" },
    ],
    rows: list.map((p) => [p.person.name, String(p.score ?? "—"), fmtPct(p.compliance), `${p.streak}d`, String(missedOf(p))]),
  };
}

function PersonList({
  people,
  onOpen,
  empty,
  tone,
}: {
  people: PersonStats[];
  onOpen: (p: PersonStats) => void;
  empty: string;
  tone: "top" | "bottom";
}) {
  if (people.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      {people.map((p, i) => (
        <li key={p.person.id}>
          <button
            type="button"
            onClick={() => onOpen(p)}
            className="group flex h-full w-full flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-5 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--color-altus-red)] hover:shadow-md"
          >
            <span className="relative">
              <Avatar name={p.person.name} avatarUrl={p.person.avatarUrl} size={56} />
              <span
                className={`absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full text-[11px] font-extrabold text-white shadow ${
                  tone === "top" ? (i === 0 ? "bg-amber-400" : "bg-slate-800") : "bg-rose-600"
                }`}
              >
                {i + 1}
              </span>
            </span>
            <span className="mt-2.5 line-clamp-1 text-[14px] font-bold text-slate-900">{p.person.name}</span>
            <span className={`mt-1 text-[26px] font-bold leading-none tabular-nums ${toneText(p.compliance)}`}>
              {fmtPct(p.compliance)}
            </span>
            <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">compliance</span>
            <span className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-2.5 text-[12px] font-semibold text-slate-600">
              <span className="tabular-nums">Score {p.score}</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Flame size={12} className="text-[var(--color-altus-red)]" />
                {p.streak}d
              </span>
            </span>
            {tone === "bottom" && (
              <span className="mt-1.5 w-full text-left text-[11.5px] font-semibold text-rose-700">
                {missedOf(p)} missed · last filled {p.lastFilled ? shortDate(p.lastFilled) : "never"}
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}
