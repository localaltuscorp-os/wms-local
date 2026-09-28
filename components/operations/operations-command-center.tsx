"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Search,
  ShieldCheck,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle, CollapsibleBody, DASHBOARD_CARD } from "@/components/dashboard/section-chrome";
import { DashboardSectionNav } from "@/components/dashboard/section-nav";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import { WidgetBoundary } from "@/components/dashboard/widget-boundary";
import type { SectionReport } from "@/lib/reports/section-report";

type Snapshot = {
  handholding: {
    people: number;
    calls: number;
    onHold: number;
    upcomingCalls: { id: string; name: string; day: string; callType: string; durationMin: number }[];
  };
  jobDescriptions: { active: number; positions: number; vacantPositions: number; unassigned: number; available: boolean };
  calendar: { scheduled: number; allDay: number; events: { id: string; title: string; day: string; allDay: boolean; startMin: number | null }[] };
  checklists: { active: number; eventBased: number; completed: number; recent: { id: string; title: string; date: string | null; status: "active" | "completed" | "cancelled"; isEvent: boolean }[] };
};

const NAV = [
  { id: "operations-overview", label: "Overview" },
  { id: "operations-handholding", label: "Hand-holding" },
  { id: "operations-events", label: "Monthly Events" },
  { id: "operations-checklists", label: "Checklist" },
  { id: "operations-jd", label: "Job Description" },
];

const CARD_SHADOW = "0 1px 2px rgba(15,23,42,.04), 0 18px 34px -28px rgba(15,23,42,.42)";

export function OperationsCommandCenter({ today, snapshot }: { today: string; snapshot: Snapshot }) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const includes = React.useCallback((value: string) => !needle || value.toLowerCase().includes(needle), [needle]);
  const attention = snapshot.handholding.onHold + snapshot.jobDescriptions.vacantPositions + snapshot.jobDescriptions.unassigned;
  const completedTotal = snapshot.checklists.active + snapshot.checklists.completed;
  const checklistRate = completedTotal ? Math.round((snapshot.checklists.completed / completedTotal) * 100) : 0;
  const report = React.useCallback((): SectionReport => ({
    title: "Operations Overview",
    subtitle: "Live operational dashboard",
    meta: [{ label: "Working day", value: formatDay(today) }],
    columns: [{ label: "Area" }, { label: "Live signal", align: "right" }],
    rows: [
      ["People in hand-holding", String(snapshot.handholding.people)],
      ["Scheduled events", String(snapshot.calendar.scheduled)],
      ["Live checklists", String(snapshot.checklists.active)],
      ["Active job descriptions", String(snapshot.jobDescriptions.active)],
    ],
  }), [snapshot, today]);

  return (
    <div className="mx-auto flex max-w-[1540px] flex-col gap-7 pb-5 max-md:gap-5">
      <header className="overflow-hidden rounded-2xl border border-red-100 bg-white" style={{ boxShadow: CARD_SHADOW }}>
        <div className="relative px-5 py-6 md:px-7 md:py-7">
          <div className="absolute inset-x-0 top-0 h-1 bg-altus-red" />
          <div className="absolute right-0 top-0 h-full w-[36%] bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.09),transparent_70%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[.15em] text-altus-red"><Activity size={13} /> Operations command centre</div>
              <h1 className="mt-2 text-[29px] font-black tracking-tight text-slate-950 max-md:text-2xl">Operations Dashboard</h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">One live view of support, scheduled operations, checklist execution, and role coverage.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"><CalendarDays size={14} className="text-altus-red" /> {formatDay(today)}</div>
            </div>
            <CollapsibleSearch scope="operations dashboard" className="size-9 shrink-0">
              <label className="relative block"><span className="sr-only">Find an Operations section</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a section…" className="h-10 w-60 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-altus-red focus:ring-2 focus:ring-altus-red/15 max-sm:w-48" /></label>
            </CollapsibleSearch>
          </div>
        </div>
      </header>

      <div data-dashboard-stickybar className="sticky sticky-below-topbar z-40 -mx-1 border-y border-slate-200 bg-white/95 backdrop-blur-md max-md:top-14"><DashboardSectionNav sections={NAV} /></div>

      {includes("overview command centre operational health") && <DashboardSection id="operations-overview" title="Operational Health" subtitle="A single executive read of today’s active operations." Icon={ShieldCheck} tone="#e10600" tint="#fff1f1" report={report}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="People supported" value={snapshot.handholding.people} detail={`${snapshot.handholding.calls} calls planned`} tone="#e10600" tint="#fff1f1" Icon={Users2} />
          <MetricCard label="Scheduled events" value={snapshot.calendar.scheduled} detail={snapshot.calendar.allDay ? `${snapshot.calendar.allDay} all-day markers` : "Timed schedule in view"} tone="#b45309" tint="#fffbeb" Icon={CalendarDays} />
          <MetricCard label="Live checklists" value={snapshot.checklists.active} detail={`${snapshot.checklists.completed} completed records`} tone="#15803d" tint="#ecfdf5" Icon={ClipboardCheck} />
          <MetricCard label="Role coverage" value={snapshot.jobDescriptions.active} detail={snapshot.jobDescriptions.available ? `${snapshot.jobDescriptions.positions} positions mapped` : "Source temporarily unavailable"} tone="#2563eb" tint="#eff6ff" Icon={ClipboardList} />
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(290px,.55fr)]">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-slate-950">Operations health board</p><p className="mt-1 text-xs font-medium text-slate-500">Each lane is independent, so attention is visible without mixing unrelated work.</p></div><span className="text-xs font-bold text-slate-600">{attention ? `${attention} items need ownership` : "No ownership gaps"}</span></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <HealthLane label="Hand-holding readiness" value={snapshot.handholding.people} total={Math.max(snapshot.handholding.people + snapshot.handholding.onHold, 1)} note={`${snapshot.handholding.onHold} on hold`} color="#e10600" />
              <HealthLane label="Checklist completion" value={checklistRate} total={100} note={`${checklistRate}% completed`} color="#15803d" />
              <HealthLane label="Event schedule" value={snapshot.calendar.scheduled} total={Math.max(snapshot.calendar.scheduled + 4, 6)} note={`${snapshot.calendar.allDay} all-day`} color="#b45309" />
              <HealthLane label="JD position coverage" value={Math.max(0, snapshot.jobDescriptions.positions - snapshot.jobDescriptions.vacantPositions)} total={Math.max(snapshot.jobDescriptions.positions, 1)} note={`${snapshot.jobDescriptions.vacantPositions} vacant`} color="#2563eb" />
            </div>
          </div>
          <div className={`border border-red-100 bg-red-50/60 p-5 ${DASHBOARD_CARD}`}>
            <div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-xl bg-red-100 text-altus-red"><AlertTriangle size={18} /></span><span className="text-3xl font-black tabular-nums text-altus-red">{attention}</span></div>
            <p className="mt-4 text-sm font-bold text-slate-950">Needs ownership</p><p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">Held support plans, vacant positions, and unassigned job descriptions are grouped here for a direct next action.</p>
            <a href="#operations-jd" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-altus-red hover:underline">Review coverage <ArrowRight size={13} /></a>
          </div>
        </div>
      </DashboardSection>}

      {includes("handholding hand holding support people calls") && <DashboardSection id="operations-handholding" title="Hand-holding" subtitle="Support plans and planned conversations, kept separate from the other Operations workstreams." Icon={Users2} tone="#e10600" tint="#fff1f1" href="/people-allocation" linkLabel="Open Hand-holding" report={() => summaryReport("Hand-holding", "Live support cadence", today, [["People supported", snapshot.handholding.people], ["Calls scheduled", snapshot.handholding.calls], ["Plans on hold", snapshot.handholding.onHold]])}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(460px,1.1fr)]">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-5 md:p-6"><p className="text-sm font-bold text-slate-950">Support cadence</p><p className="mt-1 text-xs font-medium text-slate-500">A visual workload path from live participants to their planned follow-up.</p><div className="mt-7 space-y-5"><CadenceRow label="People in active support" value={snapshot.handholding.people} max={Math.max(snapshot.handholding.people, snapshot.handholding.calls, snapshot.handholding.onHold, 1)} color="#e10600" /><CadenceRow label="Follow-up calls planned" value={snapshot.handholding.calls} max={Math.max(snapshot.handholding.people, snapshot.handholding.calls, snapshot.handholding.onHold, 1)} color="#f97316" /><CadenceRow label="Support plans on hold" value={snapshot.handholding.onHold} max={Math.max(snapshot.handholding.people, snapshot.handholding.calls, snapshot.handholding.onHold, 1)} color="#64748b" /></div></div>
          <DataTable headers={["Upcoming support call", "Day", "Type", "Duration"]}>{snapshot.handholding.upcomingCalls.length ? snapshot.handholding.upcomingCalls.map((call) => <tr key={call.id}><BodyCell strong>{call.name}</BodyCell><BodyCell>{formatShortDay(call.day)}</BodyCell><BodyCell>{call.callType || "Planned call"}</BodyCell><BodyCell align="right">{call.durationMin} min</BodyCell></tr>) : <EmptyRow cols={4} message="No upcoming hand-holding calls are scheduled." />}</DataTable>
        </div>
      </DashboardSection>}

      {includes("monthly events master calendar schedule") && <DashboardSection id="operations-events" title="Monthly Events Master" subtitle="The next seven days shown as a real calendar lane, not a generic total." Icon={CalendarDays} tone="#b45309" tint="#fffbeb" href="/events" linkLabel="Open Events" report={() => ({ title: "Monthly Events Master", subtitle: "Scheduled Operations events", meta: [{ label: "Window", value: `${formatShortDay(today)} onward` }], columns: [{ label: "Event" }, { label: "Day" }, { label: "Timing", align: "right" }], rows: snapshot.calendar.events.map((event) => [event.title, formatShortDay(event.day), event.allDay ? "All day" : formatTime(event.startMin)]) })}>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 md:p-5"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-slate-950">Seven-day event runway</p><p className="mt-1 text-xs font-medium text-slate-500">Scheduled work is anchored to its actual date for quick planning.</p></div><span className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900">{snapshot.calendar.scheduled} scheduled</span></div><EventRunway today={today} events={snapshot.calendar.events} /></div>
      </DashboardSection>}

      {includes("checklist execution completion active") && <DashboardSection id="operations-checklists" title="Checklist" subtitle="Execution status, event-linked work, and completed operational records." Icon={ClipboardCheck} tone="#15803d" tint="#ecfdf5" href="/operations/checklist" linkLabel="Open Checklist" report={() => summaryReport("Operations Checklist", "Current checklist execution", today, [["Live", snapshot.checklists.active], ["Event-linked", snapshot.checklists.eventBased], ["Completed", snapshot.checklists.completed]])}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(480px,1.15fr)]"><div className="rounded-xl border border-slate-100 bg-slate-50/80 p-5 md:p-6"><p className="text-sm font-bold text-slate-950">Execution split</p><p className="mt-1 text-xs font-medium text-slate-500">These states are deliberately separate: event-based work is not confused with completion.</p><div className="mt-6"><ExecutionBar label="Live execution" value={snapshot.checklists.active} color="#15803d" /><ExecutionBar label="Event-linked" value={snapshot.checklists.eventBased} color="#0f766e" /><ExecutionBar label="Completed record" value={snapshot.checklists.completed} color="#64748b" /></div></div><DataTable headers={["Checklist", "Type", "Target date", "Status"]}>{snapshot.checklists.recent.length ? snapshot.checklists.recent.map((run) => <tr key={run.id}><BodyCell strong>{run.title}</BodyCell><BodyCell>{run.isEvent ? "Event checklist" : "Recurring checklist"}</BodyCell><BodyCell>{run.date ? formatShortDay(run.date) : "—"}</BodyCell><BodyCell align="right"><StatusBadge status={run.status} /></BodyCell></tr>) : <EmptyRow cols={4} message="No checklists have been created yet." />}</DataTable></div>
      </DashboardSection>}

      {includes("job description jd role coverage vacancy") && <DashboardSection id="operations-jd" title="Job Description" subtitle="Role coverage, vacancies, and ownership gaps from the Job Description Bank." Icon={ClipboardList} tone="#2563eb" tint="#eff6ff" href="/operations/job-description" linkLabel="Open JD Bank" report={() => summaryReport("Job Description Coverage", "Active roles and ownership gaps", today, [["Active JDs", snapshot.jobDescriptions.active], ["Positions", snapshot.jobDescriptions.positions], ["Vacant positions", snapshot.jobDescriptions.vacantPositions], ["Unassigned JDs", snapshot.jobDescriptions.unassigned]])}>
        {snapshot.jobDescriptions.available ? <JdCoverage snapshot={snapshot.jobDescriptions} /> : <UnavailableJd />}
      </DashboardSection>}

      {needle && !NAV.some((section) => includes(section.label)) && <div className={`${DASHBOARD_CARD} p-9 text-center`}><Search className="mx-auto size-5 text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-800">No Operations section matches “{query}”.</p><button type="button" onClick={() => setQuery("")} className="mt-2 text-xs font-bold text-altus-red hover:underline">Clear search</button></div>}
    </div>
  );
}

function DashboardSection({ id, title, subtitle, Icon, tone, tint, report, href, linkLabel, children }: { id: string; title: string; subtitle: string; Icon: LucideIcon; tone: string; tint: string; report: () => SectionReport; href?: string; linkLabel?: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = React.useState(true);
  return <section id={id} className="scroll-mt-32"><DashboardSectionHeader className="mb-3" inset="px-1" icon={<span className="grid size-9 place-items-center rounded-xl" style={{ background: tint, color: tone }}><Icon size={18} strokeWidth={2.4} /></span>} title={title} subtitle={subtitle} actions={<><SectionDispatch report={report} />{href && <Link data-sec="link" href={href as Route} title={linkLabel} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 max-sm:px-2"><span className="max-sm:hidden">{linkLabel}</span><ArrowRight size={14} /></Link>}<CollapseToggle expanded={expanded} onToggle={() => setExpanded((value) => !value)} label={title} tone={tone} /></>} /><CollapsibleBody expanded={expanded}><WidgetBoundary label={`the ${title} dashboard section`}><div className={`${DASHBOARD_CARD} p-4 md:p-6`} style={{ boxShadow: CARD_SHADOW }}>{children}</div></WidgetBoundary></CollapsibleBody></section>;
}

function MetricCard({ label, value, detail, tone, tint, Icon }: { label: string; value: number; detail: string; tone: string; tint: string; Icon: LucideIcon }) { return <div className="rounded-xl border p-4" style={{ background: tint, borderColor: `${tone}55` }}><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[.12em]" style={{ color: tone }}>{label}</p><span className="grid size-8 place-items-center rounded-lg bg-white/75" style={{ color: tone }}><Icon size={17} /></span></div><p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p></div>; }
function HealthLane({ label, value, total, note, color }: { label: string; value: number; total: number; note: string; color: string }) { const percent = Math.min(100, Math.round((value / Math.max(total, 1)) * 100)); return <div><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-800">{label}</p><span className="text-xs font-black" style={{ color }}>{percent}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(value ? 8 : 0, percent)}%`, background: color }} /></div><p className="mt-1.5 text-[11px] font-medium text-slate-500">{note}</p></div>; }
function CadenceRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) { const width = Math.round((value / Math.max(max, 1)) * 100); return <div><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-700">{label}</p><p className="text-xl font-black text-slate-950">{value}</p></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full" style={{ width: `${Math.max(value ? 9 : 0, width)}%`, background: color }} /></div></div>; }
function ExecutionBar({ label, value, color }: { label: string; value: number; color: string }) { return <div className="border-b border-slate-200 py-4 first:pt-0 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-800">{label}</p><p className="text-2xl font-black" style={{ color }}>{value}</p></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(value ? 10 : 0, value * 18))}%`, background: color }} /></div></div>; }
function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white"><table className="w-full min-w-[560px] text-left"><thead className="border-b border-slate-100 bg-slate-50"><tr>{headers.map((header, index) => <th key={header} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-[.1em] text-slate-500 ${index === headers.length - 1 ? "text-right" : ""}`}>{header}</th>)}</tr></thead><tbody className="[&_tr]:border-b [&_tr:last-child]:border-0 [&_tr]:border-slate-100 [&_tr]:transition-colors hover:[&_tr]:bg-slate-50/70">{children}</tbody></table></div>; }
function BodyCell({ children, strong, align = "left" }: { children: React.ReactNode; strong?: boolean; align?: "left" | "right" }) { return <td className={`px-4 py-3 text-xs ${align === "right" ? "text-right" : "text-left"} ${strong ? "font-bold text-slate-900" : "font-medium text-slate-600"}`}>{children}</td>; }
function EmptyRow({ cols, message }: { cols: number; message: string }) { return <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm font-medium text-slate-500">{message}</td></tr>; }
function EventRunway({ today, events }: { today: string; events: Snapshot["calendar"]["events"] }) { const days = Array.from({ length: 7 }, (_, index) => addDays(today, index)); return <div className="grid overflow-x-auto rounded-xl border border-slate-100 bg-white md:grid-cols-7">{days.map((day, index) => { const entries = events.filter((event) => event.day === day); return <div key={day} className={`min-h-[188px] min-w-[145px] p-3 ${index ? "border-l border-slate-100" : ""}`}><p className="text-[10px] font-bold uppercase tracking-[.11em] text-slate-500">{weekday(day)}</p><div className="mt-1 flex items-center justify-between"><p className="text-lg font-black text-slate-900">{new Date(`${day}T12:00:00`).getDate()}</p>{day === today && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-altus-red">Today</span>}</div><div className="mt-3 space-y-2">{entries.length ? entries.map((event) => <div key={event.id} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2"><p className="line-clamp-2 text-[11px] font-bold leading-snug text-amber-950">{event.title}</p><p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-800"><Clock3 size={10} /> {event.allDay ? "All day" : formatTime(event.startMin)}</p></div>) : <p className="pt-6 text-[11px] font-medium text-slate-400">No scheduled work</p>}</div></div>; })}</div>; }
function JdCoverage({ snapshot }: { snapshot: Snapshot["jobDescriptions"] }) { const filled = Math.max(0, snapshot.positions - snapshot.vacantPositions); const rate = snapshot.positions ? Math.round((filled / snapshot.positions) * 100) : 0; return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(145px,.3fr))]"><div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-slate-950">Position fill coverage</p><p className="mt-1 text-xs font-medium text-slate-500">Filled seats across the current Job Description Bank.</p></div><p className="text-3xl font-black text-blue-800">{rate}%</p></div><div className="mt-5 h-5 overflow-hidden rounded-md bg-white p-1"><div className="h-full rounded-sm bg-blue-600" style={{ width: `${rate}%` }} /></div><p className="mt-3 text-xs font-bold text-slate-600">{filled} filled of {snapshot.positions} positions</p></div><JdStat label="Vacant positions" value={snapshot.vacantPositions} tone="#b91c1c" /><JdStat label="Unassigned JDs" value={snapshot.unassigned} tone="#c2410c" /><JdStat label="Active JDs" value={snapshot.active} tone="#2563eb" /></div>; }
function JdStat({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-black" style={{ color: tone }}>{value}</p></div>; }
function UnavailableJd() { return <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center"><ClipboardList className="size-6 text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-800">Job Description Bank is temporarily unavailable.</p><p className="mt-1 text-xs font-medium text-slate-500">The rest of the Operations dashboard remains available. Refresh to retry this source.</p></div>; }
function StatusBadge({ status }: { status: Snapshot["checklists"]["recent"][number]["status"] }) { const color = status === "completed" ? "bg-emerald-100 text-emerald-800" : status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-800"; return <span className={`inline-flex rounded-pill px-2 py-1 text-[10px] font-bold capitalize ${color}`}>{status}</span>; }
function summaryReport(title: string, subtitle: string, today: string, rows: [string, number][]): SectionReport { return { title, subtitle, meta: [{ label: "Today", value: formatDay(today) }], columns: [{ label: "Measure" }, { label: "Count", align: "right" }], rows: rows.map(([label, value]) => [label, String(value)]) }; }
function formatDay(day: string) { return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00`)); }
function formatShortDay(day: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00`)); }
function weekday(day: string) { return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(`${day}T12:00:00`)); }
function formatTime(minutes: number | null) { if (minutes == null) return "Time not set"; const hour = Math.floor(minutes / 60); const minute = minutes % 60; return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); }
function addDays(day: string, amount: number) { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); }
