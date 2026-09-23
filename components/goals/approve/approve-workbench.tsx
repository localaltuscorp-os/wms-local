"use client";

import * as React from "react";
import { CalendarClock, Users, ShieldCheck, Search, X, ChevronLeft, ChevronRight, CheckCircle2, CircleDashed, Maximize2, Minimize2 } from "lucide-react";
import { MemberApprovalCard } from "./member-approval-card";
import { type ApproveMember, allApproved } from "./types";

// Re-export the DTOs so the server page imports its prop types from one place.
export type { ApproveMember, ApproveGoal } from "./types";

// Goals identity — amber-gold (this room never uses brand red).
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

/**
 * The Monday manager-approval surface. Renders a live summary (how many of the
 * manager's downline are fully signed off — last week + this week) and one card
 * per member. When the manager has no direct reports, an empty state explains
 * there's nothing to approve. Off-Monday the surface stays usable as a preview;
 * a note clarifies the clock-in gate only fires on Mondays.
 */
export function ApproveWorkbench({
  members,
  weekStart,
  lastWeekStart,
  weekLabel,
  lastWeekLabel,
  isMonday,
}: {
  members: ApproveMember[];
  weekStart: string;
  lastWeekStart: string;
  weekLabel: string;
  lastWeekLabel: string;
  isMonday: boolean;
}) {
  const total = members.length;
  const fullyApproved = members.filter(
    (m) =>
      (m.lastWeek.length === 0 || allApproved(m.lastWeek)) &&
      (m.thisWeek.length === 0 || allApproved(m.thisWeek)),
  ).length;
  const pct = total === 0 ? 100 : Math.round((fullyApproved / total) * 100);
  const done = total > 0 && fullyApproved === total;
  const needsReview = total - fullyApproved;
  const lastWeekPending = members.filter((member) => member.lastWeek.length > 0 && !allApproved(member.lastWeek)).length;
  const thisWeekPending = members.filter((member) => member.thisWeek.length > 0 && !allApproved(member.thisWeek)).length;
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<"all" | "approved" | "review" | "lastPending" | "thisPending">("all");
  const [weekFilter, setWeekFilter] = React.useState<"all" | "last" | "this">("all");
  const [pageSize, setPageSize] = React.useState(20);
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ key: "member" | "last" | "this" | "status"; dir: "asc" | "desc" }>({ key: "member", dir: "asc" });
  const filteredMembers = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return members.filter((member) => {
      const complete =
        (member.lastWeek.length === 0 || allApproved(member.lastWeek)) &&
        (member.thisWeek.length === 0 || allApproved(member.thisWeek));
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "approved" && complete) ||
        (statusFilter === "review" && !complete) ||
        (statusFilter === "lastPending" && member.lastWeek.length > 0 && !allApproved(member.lastWeek)) ||
        (statusFilter === "thisPending" && member.thisWeek.length > 0 && !allApproved(member.thisWeek));
      const weekMatch =
        weekFilter === "all" ||
        (weekFilter === "last" ? member.lastWeek.length > 0 : member.thisWeek.length > 0);
      return statusMatch && weekMatch && (!query || member.name.toLocaleLowerCase().includes(query));
    });
  }, [members, search, statusFilter, weekFilter]);
  const sortedMembers = React.useMemo(() => [...filteredMembers].sort((a, b) => {
    const complete = (member: ApproveMember) =>
      (member.lastWeek.length === 0 || allApproved(member.lastWeek)) &&
      (member.thisWeek.length === 0 || allApproved(member.thisWeek));
    const value = (member: ApproveMember) =>
      sort.key === "member" ? member.name : sort.key === "last" ? member.lastWeek.length : sort.key === "this" ? member.thisWeek.length : Number(complete(member));
    const result = typeof value(a) === "string" ? String(value(a)).localeCompare(String(value(b))) : Number(value(a)) - Number(value(b));
    return sort.dir === "asc" ? result : -result;
  }), [filteredMembers, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedMembers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstRow = filteredMembers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, sortedMembers.length);
  const pagedMembers = sortedMembers.slice(firstRow - 1, lastRow);
  React.useEffect(() => setPage(1), [search, statusFilter, weekFilter, pageSize]);
  const [fullscreen, setFullscreen] = React.useState(false);
  const lastWeekGoals = members.reduce((totalGoals, member) => totalGoals + member.lastWeek.length, 0);
  const thisWeekGoals = members.reduce((totalGoals, member) => totalGoals + member.thisWeek.length, 0);

  if (total === 0) {
    return (
      <div className="wg-rise rounded-section border border-hairline-strong bg-surface-soft/40 p-10 text-center">
        <span
          className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl"
          style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}
        >
          <Users size={24} />
        </span>
        <p className="text-[16px] font-bold text-ink-strong">No direct reports to approve</p>
        <p className="mx-auto mt-1 max-w-md text-[14px] text-ink-muted">
          This surface lists the people who report to you. You have none right now, so the Monday
          approval gate never blocks you.
        </p>
      </div>
    );
  }

  return (
    <div className={fullscreen ? "fixed inset-0 z-[100] overflow-auto bg-surface-base p-5" : "space-y-5"}>
      <div className={fullscreen ? "mx-auto max-w-[1800px] space-y-5" : "space-y-5"}>
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="shrink-0 text-[28px] font-black leading-none text-ink-strong" style={{ fontFamily: DISPLAY }}>
          Approve your team's week
        </h2>
        <div className="ml-3 flex overflow-x-auto rounded-lg border border-hairline-strong bg-surface-soft p-1 sm:ml-5">
          <button type="button" onClick={() => setWeekFilter((filter) => filter === "last" ? "all" : "last")} aria-pressed={weekFilter === "last"} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold ${weekFilter === "last" ? "bg-surface-card text-ink-strong shadow-sm" : "text-ink-soft"}`}>
            Last week <span className="rounded-pill bg-surface-soft px-1.5 py-0.5 text-[10px] tabular-nums text-ink-soft">{lastWeekGoals}</span>
          </button>
          <button type="button" onClick={() => setWeekFilter((filter) => filter === "this" ? "all" : "this")} aria-pressed={weekFilter === "this"} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold ${weekFilter === "this" ? "bg-surface-card text-ink-strong shadow-sm" : "text-ink-soft"}`}>
            This week <span className="rounded-pill bg-surface-card px-1.5 py-0.5 text-[10px] tabular-nums text-ink-soft">{thisWeekGoals}</span>
          </button>
        </div>
      </header>
      {/* Same compact status language used by Goals → Review. */}
      <div className="flex flex-wrap items-center gap-2" aria-label="Team approval summary">
        {[
          { label: "Team members", value: total, tone: "#1d4ed8" },
          { label: "Fully approved", value: fullyApproved, tone: "#16a34a" },
          { label: "Need review", value: needsReview, tone: "#dc2626" },
          { label: "Last week pending", value: lastWeekPending, tone: "#d97706" },
          { label: "This week pending", value: thisWeekPending, tone: "#7c3aed" },
        ].map((metric) => {
          const filter = metric.label === "Fully approved" ? "approved" : metric.label === "Need review" ? "review" : metric.label === "Last week pending" ? "lastPending" : metric.label === "This week pending" ? "thisPending" : "all";
          const active = statusFilter === filter;
          return (
          <button key={metric.label} type="button" onClick={() => setStatusFilter(active ? "all" : filter)} aria-pressed={active} className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface-card px-3 text-[13px] transition-colors hover:bg-surface-soft" style={active ? { borderColor: metric.tone, boxShadow: `0 0 0 2px color-mix(in srgb, ${metric.tone} 18%, transparent)` } : undefined}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.tone }} aria-hidden />
            <strong className="tabular-nums text-ink-strong">{metric.value}</strong>
            <span className="font-semibold text-ink-soft">{metric.label}</span>
          </button>
          );
        })}
        <button type="button" onClick={() => setFullscreen((value) => !value)} aria-pressed={fullscreen} className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft">
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      {false && <div
        className="wg-rise relative isolate overflow-hidden rounded-xl border border-hairline bg-surface-card p-4"
        style={
          {
            "--kpi-tone": ACCENT,
            "--kpi-tone-deep": ACCENT_DEEP,
          } as React.CSSProperties
        }
      >
        <div aria-hidden className="kpi-aurora-primary" style={{ "--kpi-index": 0 } as React.CSSProperties} />
        <div aria-hidden className="kpi-aurora-secondary" />
        <div className="relative z-10 flex flex-wrap items-center gap-4">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
            style={{
              background: done
                ? "linear-gradient(135deg, var(--color-green), var(--color-green-deep))"
                : `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
              color: "white",
              boxShadow: done
                ? "0 8px 20px -8px rgba(21,128,61,0.5)"
                : `0 8px 20px -8px ${ACCENT}88`,
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div className="mr-auto">
            <p className="text-ink-strong tabular-nums" style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 21 }}>
              {fullyApproved}{" "}
              <span className="text-ink-soft" style={{ fontWeight: 700, fontSize: 16 }}>
                of {total}
              </span>{" "}
              signed off
            </p>
            <p className="text-[13px] font-semibold text-ink-muted">
              {done ? "Your team is fully approved — you're clear to clock in." : "Approve each person's last week + this week."}
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-strong/8">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  background: done
                    ? "linear-gradient(90deg, var(--color-green), var(--color-green-deep))"
                    : `linear-gradient(90deg, #E10600, ${ACCENT})`,
                }}
              />
            </div>
          </div>
        </div>

        {!isMonday && (
          <p className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-pill bg-surface-soft px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted">
            <CalendarClock size={14} style={{ color: ACCENT }} /> Preview — the clock-in approval gate is live on Mondays (IST).
          </p>
        )}
      </div>}

      <div className="space-y-3">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-hairline bg-surface-card p-1 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          {searchOpen ? (
            <div className="relative min-w-[260px] flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team members" aria-label="Search team members" className="h-9 w-full rounded-lg border border-transparent bg-surface-soft pl-9 pr-8 text-[13px] font-medium text-ink-strong outline-none focus:border-altus-red" />
              <button type="button" onClick={() => { setSearch(""); setSearchOpen(false); }} aria-label="Close search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink-strong"><X size={14} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search team members" title="Search" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-surface-soft hover:text-ink-strong"><Search size={20} /></button>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2 text-[13px] font-semibold text-ink-muted">
            <span className="rounded-lg border border-hairline bg-surface-card px-3 py-2">Last: <strong className="text-ink-strong">{lastWeekLabel}</strong></span>
            <span className="rounded-lg border border-hairline bg-surface-card px-3 py-2">This: <strong className="text-ink-strong">{weekLabel}</strong></span>
            <span className="whitespace-nowrap">Showing {firstRow}–{lastRow} of {filteredMembers.length}</span>
            <label className="inline-flex h-9 items-center rounded-lg border border-hairline bg-surface-card px-2">
              <span className="sr-only">Rows per page</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Rows per page" className="bg-transparent font-bold text-ink-strong outline-none">
                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
              </select>
            </label>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-surface-card disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="whitespace-nowrap text-ink-strong">{currentPage}/{pageCount}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-surface-card disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
            <thead className="border-b border-hairline bg-surface-soft text-[11px] font-black uppercase tracking-[0.07em] text-ink-soft">
              <tr>
                {([ ["member", "Team member"], ["last", "Last week"], ["this", "This week"], ["status", "Overall status"] ] as const).map(([key, label]) => <th key={key} className="px-4 py-3"><button type="button" onClick={() => setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" })} className="inline-flex items-center gap-1 hover:text-ink-strong">{label}<span aria-hidden>{sort.key === key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span></button></th>)}
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedMembers.map((member) => {
                const lastApproved = allApproved(member.lastWeek);
                const thisApproved = allApproved(member.thisWeek);
                const complete = lastApproved && thisApproved;
                const status = complete ? "Fully approved" : "Needs review";
                return (
                  <React.Fragment key={member.id}>
                  <tr className="border-b border-hairline hover:bg-surface-soft/60">
                    <td className="px-4 py-3.5 font-bold text-ink-strong">{member.name}<span className="mt-0.5 block text-[11px] font-semibold text-ink-muted">{member.lastWeek.length + member.thisWeek.length} goals across two weeks</span></td>
                    <td className="px-4 py-3.5"><span className="font-bold text-ink-strong">{member.lastWeek.length} goals</span><span className="mt-0.5 block text-[11px] font-semibold text-ink-muted">{member.lastWeek.filter((goal) => goal.approved).length} approved</span></td>
                    <td className="px-4 py-3.5"><span className="font-bold text-ink-strong">{member.thisWeek.length} goals</span><span className="mt-0.5 block text-[11px] font-semibold text-ink-muted">{member.thisWeek.filter((goal) => goal.approved).length} approved</span></td>
                    <td className="px-4 py-3.5"><span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-[0.04em]" style={{ background: complete ? "color-mix(in srgb, var(--color-green) 14%, transparent)" : "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: complete ? "var(--color-green-deep)" : "var(--color-altus-red-deep)" }}>{complete ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}{status}</span></td>
                    <td className="px-4 py-3.5 text-right"><button type="button" onClick={() => setSelectedMemberId((id) => id === member.id ? null : member.id)} className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface-card px-3 py-1.5 text-[12px] font-bold text-ink-soft hover:bg-surface-soft hover:text-ink-strong">{selectedMemberId === member.id ? "Close" : "Review goals"}<ChevronRight size={14} className={selectedMemberId === member.id ? "rotate-90" : ""} /></button></td>
                  </tr>
                  {selectedMemberId === member.id && (
                    <tr className="border-b border-hairline bg-surface-soft/50">
                      <td colSpan={5} className="p-4">
                        <MemberApprovalCard member={member} weekStart={weekStart} lastWeekStart={lastWeekStart} weekLabel={weekLabel} lastWeekLabel={lastWeekLabel} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredMembers.length === 0 && <p className="px-5 py-10 text-center text-[13px] font-semibold text-ink-muted">No team members match “{search}”.</p>}
        </section>
      </div>

      </div>
    </div>
  );
}
