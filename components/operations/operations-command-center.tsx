"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  ListChecks,
  PauseCircle,
  Sparkles,
  Users2,
} from "lucide-react";
import * as React from "react";

type Snapshot = {
  handholding: { people: number; calls: number; onHold: number };
  jobDescriptions: { active: number; positions: number; vacantPositions: number; unassigned: number };
  calendar: { scheduled: number; allDay: number };
  checklists: { active: number; eventBased: number; completed: number };
};

type Focus = "all" | "attention" | "ready";

const focusLabels: { id: Focus; label: string }[] = [
  { id: "all", label: "Overview" },
  { id: "attention", label: "Needs attention" },
  { id: "ready", label: "Ready to work" },
];

export function OperationsCommandCenter({ today, snapshot }: { today: string; snapshot: Snapshot }) {
  const [focus, setFocus] = React.useState<Focus>("all");
  const alerts = [
    snapshot.jobDescriptions.vacantPositions > 0 && {
      title: `${snapshot.jobDescriptions.vacantPositions} vacant ${plural("position", snapshot.jobDescriptions.vacantPositions)}`,
      detail: "Review the Job Description Bank so work has a clear owner.",
      href: "/operations/job-description",
      Icon: ClipboardList,
    },
    snapshot.jobDescriptions.unassigned > 0 && {
      title: `${snapshot.jobDescriptions.unassigned} JD ${plural("item", snapshot.jobDescriptions.unassigned)} without an assignee`,
      detail: "Assign the work or confirm that it should escalate with the seat.",
      href: "/operations/job-description",
      Icon: Users2,
    },
    snapshot.handholding.onHold > 0 && {
      title: `${snapshot.handholding.onHold} people on hold`,
      detail: "Check whether their hand-holding plan should resume or close.",
      href: "/people-allocation",
      Icon: PauseCircle,
    },
  ].filter(Boolean) as { title: string; detail: string; href: string; Icon: typeof ClipboardList }[];

  const showAlerts = focus !== "ready";
  const showModules = focus !== "attention";

  return (
    <div className="mx-auto max-w-[1500px]">
      <section className="relative overflow-hidden rounded-[24px] border border-hairline bg-surface-card px-6 py-6 max-md:px-4">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[48%] bg-[radial-gradient(circle_at_80%_15%,rgba(225,6,0,.16),transparent_53%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-pill bg-altus-red/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-altus-red">
              <Sparkles size={13} /> Operations command center
            </span>
            <h1 className="mt-3 text-[30px] font-black tracking-tight text-ink-strong max-md:text-[25px]">Make the next move clear.</h1>
            <p className="mt-1.5 text-[14px] font-medium text-ink-subtle">
              A live view of staffing, recurring work, events and checklists for {formatDay(today)}.
            </p>
          </div>
          <div className="flex rounded-xl border border-hairline bg-white/75 p-1 shadow-sm">
            {focusLabels.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFocus(item.id)}
                className={`rounded-lg px-3 py-2 text-[12px] font-bold transition ${focus === item.id ? "bg-altus-red text-white shadow-sm" : "text-ink-subtle hover:bg-black/[.04] hover:text-ink-strong"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operations pulse">
        <PulseCard label="People supported" value={snapshot.handholding.people} note={`${snapshot.handholding.calls} planned calls`} Icon={Users2} tone="red" />
        <PulseCard label="Active job descriptions" value={snapshot.jobDescriptions.active} note={`${snapshot.jobDescriptions.positions} positions in the bank`} Icon={ClipboardList} tone="blue" />
        <PulseCard label="This week’s events" value={snapshot.calendar.scheduled} note={snapshot.calendar.allDay ? `${snapshot.calendar.allDay} all-day markers` : "Timed work and calendar markers"} Icon={CalendarDays} tone="amber" />
        <PulseCard label="Live checklists" value={snapshot.checklists.active} note={`${snapshot.checklists.eventBased} linked to events`} Icon={ListChecks} tone="green" />
      </section>

      {showAlerts && (
        <section className="mt-6" aria-label="Needs attention">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-altus-red">Attention queue</p>
              <h2 className="mt-1 text-[18px] font-black text-ink-strong">Keep ownership visible</h2>
            </div>
            <span className="rounded-pill bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-ink-subtle">{alerts.length} open</span>
          </div>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-900">
              <CheckCircle2 size={18} /> No ownership gaps need attention right now.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {alerts.map(({ title, detail, href, Icon }) => (
                <Link key={title} href={href as Route} className="group rounded-2xl border border-hairline bg-surface-card p-4 transition hover:-translate-y-0.5 hover:border-altus-red/40 hover:shadow-lg">
                  <span className="grid size-9 place-items-center rounded-xl bg-altus-red/10 text-altus-red"><Icon size={18} /></span>
                  <h3 className="mt-3 text-[14px] font-extrabold text-ink-strong">{title}</h3>
                  <p className="mt-1 text-[12px] font-medium leading-relaxed text-ink-subtle">{detail}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-altus-red">Review <ArrowRight size={14} className="transition group-hover:translate-x-0.5" /></span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {showModules && (
        <section className="mt-7" aria-label="Working dashboards">
          <div className="mb-3">
            <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-ink-soft">Working dashboards</p>
            <h2 className="mt-1 text-[18px] font-black text-ink-strong">Go straight to the work</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ModuleCard
              eyebrow="People & capacity"
              title="Hand-holding"
              summary="See who is supported, their weekly calls and capacity across every team."
              href="/people-allocation"
              Icon={Users2}
              colour="#B91C1C"
              metrics={[
                ["Live people", snapshot.handholding.people],
                ["Scheduled calls", snapshot.handholding.calls],
                ["On hold", snapshot.handholding.onHold],
              ]}
            />
            <ModuleCard
              eyebrow="Repeatable work"
              title="Job Description"
              summary="Keep ownership with positions, not people, and make unassigned work visible."
              href="/operations/job-description"
              Icon={ClipboardList}
              colour="#2563EB"
              metrics={[
                ["Active JDs", snapshot.jobDescriptions.active],
                ["Positions", snapshot.jobDescriptions.positions],
                ["Vacant seats", snapshot.jobDescriptions.vacantPositions],
              ]}
            />
            <ModuleCard
              eyebrow="Time & priorities"
              title="Monthly Events Master"
              summary="Plan day, week, month and year with one shared operational calendar."
              href="/events"
              Icon={CalendarDays}
              colour="#B45309"
              metrics={[
                ["This week", snapshot.calendar.scheduled],
                ["All-day", snapshot.calendar.allDay],
                ["Views", "Day–Year"],
              ]}
            />
            <ModuleCard
              eyebrow="Execution & follow-through"
              title="Checklist"
              summary="Track the work around every event and see reusable recurring checklists."
              href="/operations/checklist"
              Icon={ListChecks}
              colour="#15803D"
              metrics={[
                ["Live", snapshot.checklists.active],
                ["Event-based", snapshot.checklists.eventBased],
                ["Completed", snapshot.checklists.completed],
              ]}
            />
          </div>
        </section>
      )}

      <section className="mt-7 rounded-2xl border border-hairline bg-surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-ink-soft"><LayoutDashboard size={18} /></span>
            <div><h2 className="text-[14px] font-extrabold text-ink-strong">More operations workspaces</h2><p className="text-[12px] font-medium text-ink-subtle">Client engagement, guidelines, training, reporting and masters stay one click away.</p></div>
          </div>
          <Link href="/operations/masters" className="inline-flex items-center gap-1 rounded-lg border border-hairline px-3 py-2 text-[12px] font-bold text-ink-strong transition hover:border-altus-red/40 hover:text-altus-red">Open masters <ChevronRight size={15} /></Link>
        </div>
      </section>
    </div>
  );
}

function PulseCard({ label, value, note, Icon, tone }: { label: string; value: number; note: string; Icon: typeof Users2; tone: "red" | "blue" | "amber" | "green" }) {
  const tones = {
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return <div className="rounded-2xl border border-hairline bg-surface-card p-4"><span className={`grid size-9 place-items-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span><p className="mt-3 text-[11px] font-bold uppercase tracking-[.1em] text-ink-subtle">{label}</p><p className="mt-1 text-[27px] font-black leading-none tracking-tight text-ink-strong">{value}</p><p className="mt-2 text-[12px] font-medium text-ink-subtle">{note}</p></div>;
}

function ModuleCard({ eyebrow, title, summary, href, Icon, colour, metrics }: { eyebrow: string; title: string; summary: string; href: string; Icon: typeof Users2; colour: string; metrics: [string, string | number][] }) {
  return <Link href={href as Route} className="group relative overflow-hidden rounded-[22px] border border-hairline bg-surface-card p-5 transition hover:-translate-y-0.5 hover:shadow-xl" style={{ boxShadow: "0 16px 35px -30px rgba(15,23,42,.6)" }}><div className="absolute inset-x-0 top-0 h-1" style={{ background: colour }} /><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl" style={{ color: colour, background: `${colour}14` }}><Icon size={20} /></span><span className="inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: colour }}>Open <ChevronRight size={15} className="transition group-hover:translate-x-0.5" /></span></div><p className="mt-4 text-[10.5px] font-extrabold uppercase tracking-[.12em]" style={{ color: colour }}>{eyebrow}</p><h3 className="mt-1 text-[19px] font-black text-ink-strong">{title}</h3><p className="mt-1.5 max-w-lg text-[12.5px] font-medium leading-relaxed text-ink-subtle">{summary}</p><div className="mt-5 grid grid-cols-3 divide-x divide-hairline rounded-xl border border-hairline bg-slate-50/70 py-3">{metrics.map(([label, value]) => <div key={label} className="min-w-0 px-3"><p className="truncate text-[10px] font-bold uppercase tracking-wide text-ink-subtle">{label}</p><p className="mt-1 truncate text-[18px] font-black leading-none text-ink-strong">{value}</p></div>)}</div></Link>;
}

function plural(word: string, count: number) { return count === 1 ? word : `${word}s`; }
function formatDay(day: string) { return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00`)); }
