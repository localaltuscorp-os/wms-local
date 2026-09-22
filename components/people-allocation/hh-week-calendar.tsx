"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, EyeOff, Link2Off, Loader2, PhoneCall, X } from "lucide-react";
import { hhCallTypeLabel } from "@/db/enums";
import { formatHoursMinutes } from "@/lib/format";
import { addDaysYmd, type SlotOutcome } from "@/lib/dcc/dashboard";
import { OUTCOME_LABEL, type ReportRow } from "@/lib/dcc/daily-report";
import { callOccurrences, mondayOf, weekDates, type CallOccurrence } from "@/lib/hh/calendar";
import type { HhCalendarWeek, HhDccDay } from "@/lib/queries/hh-calendar";
import type { HhCall, HhEntry, HhPerson } from "@/lib/queries/people-allocation";
import { getHhCalendarWeek } from "@/app/(app)/people-allocation/calendar-actions";

/**
 * HAND-HOLDING · WEEK CALENDAR — every weekly call and every Daily Compliance
 * entry, day by day (account holder, 2026-09-15).
 *
 * With nobody selected it is the roster's week: one row per person, each day a
 * compact cell (calls · DCC score) that opens that person. With a person
 * selected it is their week in full: each day lists the calls and the DCC KPIs
 * with their status; a day opens to show everything.
 *
 * Calls come from the page (a weekly call repeats on its weekday inside the
 * entry's dates — lib/hh/calendar.ts). DCC is fetched per week from the server,
 * limited to the people this viewer may see in DCC.
 */

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const MARK: Record<SlotOutcome, string> = { done: "✅", notDone: "❌", na: "➖", pending: "⏳", noted: "📝", unfilled: "⬜" };

function tone(pct: number | null) {
  if (pct === null) return { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)" };
  if (pct >= 80) return { bg: "#DCFCE7", fg: "#15803D" };
  if (pct >= 60) return { bg: "#FEF3C7", fg: "#B45309" };
  return { bg: "#FEE2E2", fg: "#B91C1C" };
}

const dayName = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
const dayNum = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function HhWeekCalendar({
  people,
  selectedPersonId,
  entries,
  calls,
  initialWeek,
  today,
  onSelectPerson,
}: {
  /** The current tab's roster. */
  people: HhPerson[];
  selectedPersonId: string;
  entries: HhEntry[];
  calls: HhCall[];
  /** This week, loaded with the page. */
  initialWeek: HhCalendarWeek;
  /** Today in IST. */
  today: string;
  onSelectPerson: (id: string) => void;
}) {
  // Another week, once the arrows are used. The page's own week always wins
  // for the current week, so a refresh after a save shows fresh data.
  const [other, setOther] = React.useState<HhCalendarWeek | null>(null);
  const week = other && other.weekStart !== initialWeek.weekStart ? other : initialWeek;
  const [loading, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<{ person: HhPerson; date: string } | null>(null);

  const days = weekDates(week.weekStart);
  const hidden = React.useMemo(() => new Set(week.hiddenEmployeeIds), [week.hiddenEmployeeIds]);
  const selected = people.find((p) => p.id === selectedPersonId) ?? null;

  function go(target: string) {
    setError(null);
    start(async () => {
      const res = await getHhCalendarWeek({ weekStart: target });
      if (res.ok) setOther(res.week);
      else setError(res.error);
    });
  }

  const occurrencesFor = React.useCallback(
    (personId: string, date: string) => callOccurrences(entries.filter((e) => e.personId === personId), calls, date),
    [entries, calls],
  );
  const dccFor = (p: HhPerson, date: string): HhDccDay | null =>
    p.employeeId ? week.dcc[p.employeeId]?.[date] ?? null : null;

  // The roster view lists people with something to show this week.
  const rosterRows = people.filter(
    (p) => p.employeeId || days.some((d) => occurrencesFor(p.id, d).length > 0),
  );

  return (
    <section
      className="mb-5 rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label="Hand-holding calendar"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="inline-grid size-8 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT_DEEP }}>
          <CalendarDays size={16} strokeWidth={2.4} />
        </span>
        <h2 className="text-[15px] font-extrabold text-ink-strong">
          Calendar{selected ? ` · ${selected.name}` : ""}
        </h2>
        <span className="text-[12.5px] font-semibold text-ink-subtle">Weekly calls and Daily Compliance</span>

        <div className="ml-auto flex items-center gap-1">
          {loading && <Loader2 size={15} className="mr-1 animate-spin text-ink-subtle" />}
          <NavButton label="Previous week" onClick={() => go(addDaysYmd(week.weekStart, -7))}><ChevronLeft size={17} /></NavButton>
          <span className="min-w-[150px] text-center text-[13.5px] font-bold tabular-nums text-ink-strong">
            {dayNum(days[0]!)} – {dayNum(days[6]!)}
          </span>
          <NavButton label="Next week" onClick={() => go(addDaysYmd(week.weekStart, 7))}><ChevronRight size={17} /></NavButton>
          {week.weekStart !== mondayOf(today) && (
            <button type="button" onClick={() => setOther(null)} className="ml-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold hover:underline" style={{ color: ACCENT_DEEP }}>
              This week
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red)" }}>
          {error}
        </p>
      )}

      {selected ? (
        <PersonWeek
          person={selected}
          days={days}
          today={today}
          hidden={Boolean(selected.employeeId && hidden.has(selected.employeeId))}
          occurrencesFor={occurrencesFor}
          dccFor={dccFor}
          onOpenDay={(date) => setDetail({ person: selected, date })}
        />
      ) : rosterRows.length === 0 ? (
        <p className="rounded-xl px-4 py-8 text-center text-[13.5px] text-ink-subtle" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          Nobody on this roster has calls this week or is linked to an employee yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle" style={{ background: "color-mix(in srgb, var(--color-ink-strong) 3%, transparent)" }}>
                <th className="w-[180px] px-3 py-2.5">Person</th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-2.5" style={d === today ? { color: ACCENT_DEEP } : undefined}>
                    {dayName(d)} <span className="normal-case tracking-normal">{dayNum(d)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rosterRows.map((p) => (
                <tr key={p.id} className="border-t border-hairline">
                  <td className="px-3 py-2 align-top">
                    <button type="button" onClick={() => onSelectPerson(p.id)} className="text-left text-[13.5px] font-bold text-ink-strong hover:underline">
                      {p.name}
                    </button>
                    {!p.employeeId && <div className="text-[11px] font-semibold text-ink-subtle">Not linked</div>}
                  </td>
                  {days.map((d) => {
                    const occ = occurrencesFor(p.id, d);
                    const dcc = dccFor(p, d);
                    const isHidden = Boolean(p.employeeId && hidden.has(p.employeeId));
                    return (
                      <td key={d} className="px-1.5 py-1.5 align-top" style={d === today ? { background: `color-mix(in srgb, ${ACCENT} 4%, transparent)` } : undefined}>
                        <button
                          type="button"
                          onClick={() => (occ.length || dcc ? setDetail({ person: p, date: d }) : onSelectPerson(p.id))}
                          className="flex min-h-[44px] w-full flex-col items-start gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-black/[0.03]"
                        >
                          {occ.length > 0 && <CallsChip occ={occ} />}
                          {dcc ? <DccChip dcc={dcc} future={d > today} /> : isHidden ? null : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <DayDetail
          person={detail.person}
          date={detail.date}
          today={today}
          occ={occurrencesFor(detail.person.id, detail.date)}
          dcc={dccFor(detail.person, detail.date)}
          hidden={Boolean(detail.person.employeeId && hidden.has(detail.person.employeeId))}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}

function PersonWeek({
  person,
  days,
  today,
  hidden,
  occurrencesFor,
  dccFor,
  onOpenDay,
}: {
  person: HhPerson;
  days: string[];
  today: string;
  hidden: boolean;
  occurrencesFor: (personId: string, date: string) => CallOccurrence[];
  dccFor: (p: HhPerson, date: string) => HhDccDay | null;
  onOpenDay: (date: string) => void;
}) {
  return (
    <>
      {!person.employeeId && (
        <Notice icon={<Link2Off size={14} />}>
          {person.name} isn&apos;t linked to an employee, so their Daily Compliance can&apos;t show. Link them in the overview below.
        </Notice>
      )}
      {hidden && <Notice icon={<EyeOff size={14} />}>{person.name}&apos;s Daily Compliance isn&apos;t visible to you — it isn&apos;t in your DCC team.</Notice>}

      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {days.map((d) => {
            const occ = occurrencesFor(person.id, d);
            const dcc = dccFor(person, d);
            const isToday = d === today;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onOpenDay(d)}
                className="flex min-h-[220px] flex-col gap-2 rounded-xl p-2.5 text-left transition-colors hover:bg-black/[0.02]"
                style={{ boxShadow: isToday ? `inset 0 0 0 2px color-mix(in srgb, ${ACCENT} 55%, transparent)` : "inset 0 0 0 1px var(--color-hairline)" }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: isToday ? ACCENT_DEEP : "var(--color-ink-subtle)" }}>
                    {dayName(d)}
                  </span>
                  <span className="text-[12.5px] font-bold tabular-nums text-ink-strong">{dayNum(d)}</span>
                </div>

                {occ.map((o) => (
                  <span key={o.callId} className="rounded-lg px-2 py-1 text-[11.5px] font-semibold leading-snug" style={{ background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, color: ACCENT_DEEP }}>
                    <PhoneCall size={10} className="mr-1 inline" />
                    {hhCallTypeLabel(o.callType)} · {o.entryName} · {o.durationMin}m
                  </span>
                ))}

                {dcc && (
                  <div className="mt-auto flex flex-col gap-1">
                    <DccChip dcc={dcc} future={d > today} />
                    {d <= today &&
                      dcc.rows.slice(0, 4).map((r, i) => (
                        <span key={i} className="truncate text-[11.5px] font-medium text-ink-soft" title={`${r.title} — ${OUTCOME_LABEL[r.outcome]}`}>
                          {MARK[r.outcome]} {r.code ? `${r.code} ` : ""}{r.title}
                        </span>
                      ))}
                    {d <= today && dcc.rows.length > 4 && (
                      <span className="text-[11px] font-bold text-ink-subtle">+{dcc.rows.length - 4} more</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CallsChip({ occ }: { occ: CallOccurrence[] }) {
  const minutes = occ.reduce((s, o) => s + (o.durationMin ?? 0), 0);
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, color: ACCENT_DEEP }}>
      <PhoneCall size={10} /> {occ.length} · {formatHoursMinutes(minutes)}
    </span>
  );
}

function DccChip({ dcc, future }: { dcc: HhDccDay; future: boolean }) {
  if (future || dcc.due === 0) {
    const t = tone(null);
    return (
      <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: t.bg, color: t.fg }}>
        DCC · {dcc.due > 0 ? `${dcc.due} due` : `${dcc.rows.length} filled`}
      </span>
    );
  }
  const t = tone(dcc.compliance);
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: t.bg, color: t.fg }}>
      DCC · {dcc.done}/{dcc.due}
      {dcc.notFilled > 0 ? ` · ${dcc.notFilled} blank` : ""}
    </span>
  );
}

function DayDetail({
  person,
  date,
  today,
  occ,
  dcc,
  hidden,
  onClose,
}: {
  person: HhPerson;
  date: string;
  today: string;
  occ: CallOccurrence[];
  dcc: HhDccDay | null;
  hidden: boolean;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sections: Array<{ name: string; rows: ReportRow[] }> = [];
  for (const r of dcc?.rows ?? []) {
    const last = sections[sections.length - 1];
    if (last && last.name === r.section) last.rows.push(r);
    else sections.push({ name: r.section, rows: [r] });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-6 max-md:p-3"
      style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={`${person.name} · ${longDate(date)}`} className="wg-rise mt-[6vh] w-full max-w-[720px] rounded-[22px] bg-surface-card p-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 30px 70px -30px rgba(15,23,42,0.45)" }}>
        <div className="mb-4 flex items-start justify-between gap-2 border-b border-hairline pb-3">
          <div>
            <h2 className="text-[16px] font-extrabold text-ink-strong">{person.name}</h2>
            <p className="text-[13px] font-semibold text-ink-subtle">{longDate(date)}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-ink-subtle hover:bg-black/5"><X size={16} /></button>
        </div>

        <h3 className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-subtle">Weekly calls</h3>
        {occ.length === 0 ? (
          <p className="mb-4 text-[13.5px] text-ink-subtle">No calls this day.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1.5">
            {occ.map((o) => (
              <li key={o.callId} className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
                <PhoneCall size={13} style={{ color: ACCENT_DEEP }} /> {hhCallTypeLabel(o.callType)} · {o.entryName}
                <span className="ml-auto tabular-nums text-ink-subtle">{o.durationMin} mins</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-ink-subtle">Daily Compliance</h3>
          {dcc && <DccChip dcc={dcc} future={date > today} />}
        </div>
        {!person.employeeId ? (
          <p className="text-[13.5px] text-ink-subtle">Not linked to an employee.</p>
        ) : hidden ? (
          <p className="text-[13.5px] text-ink-subtle">Not visible to you — outside your DCC team.</p>
        ) : !dcc ? (
          <p className="text-[13.5px] text-ink-subtle">Nothing due or filled this day.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sections.map((s) => (
              <div key={s.name}>
                <p className="mb-1 text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">{s.name}</p>
                <ul className="flex flex-col gap-1">
                  {s.rows.map((r, i) => (
                    <li key={i} className="text-[13.5px] leading-snug text-ink-strong">
                      <span className="mr-1">{date > today ? "⬜" : MARK[r.outcome]}</span>
                      {r.code && <span className="mr-1 font-bold text-ink-muted">{r.code}</span>}
                      {r.title}
                      <span className="text-ink-subtle">
                        {date > today ? "" : ` — ${OUTCOME_LABEL[r.outcome]}`}
                        {r.value !== null ? ` · ${r.value}` : ""}
                        {r.note ? ` · “${r.note}”` : ""}
                        {r.due ? "" : " (not due)"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-black/5">
      {children}
    </button>
  );
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-ink-soft" style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      {icon} {children}
    </p>
  );
}
