"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, MapPin, Video } from "lucide-react";
import type { SessionListRow } from "@/lib/queries/training-calendar";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const TZ = "Asia/Kolkata";

export type GridView = "month" | "week" | "day";

/** IST calendar date of an ISO instant, as `YYYY-MM-DD`. */
function istYmd(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** IST clock time of an ISO instant, e.g. "10:40 am". */
function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `ymd`. */
function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return addDays(ymd, -((d.getUTCDay() + 6) % 7));
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Chip({ s }: { s: SessionListRow }) {
  const cancelled = s.status === "cancelled";
  return (
    <Link
      href={`/training/calendar/${s.id}` as Route}
      className="block truncate rounded-md px-1.5 py-1 text-[11.5px] font-bold transition-colors hover:brightness-95"
      style={{
        background: cancelled ? "var(--color-surface-track)" : `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
        color: cancelled ? "var(--color-ink-subtle)" : ACCENT_DEEP,
        textDecoration: cancelled ? "line-through" : "none",
      }}
      title={`${s.topic} — ${istTime(s.scheduledAt)}`}
    >
      {istTime(s.scheduledAt)} {s.topic}
    </Link>
  );
}

function Nav({
  view,
  anchor,
  setAnchor,
}: {
  view: GridView;
  anchor: string;
  setAnchor: (ymd: string) => void;
}) {
  const step = view === "month" ? 30 : view === "week" ? 7 : 1;
  const heading =
    view === "month"
      ? `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`
      : view === "week"
        ? `Week of ${weekStart(anchor)}`
        : new Date(`${anchor}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[16px] font-bold text-ink-strong">{heading}</h2>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setAnchor(addDays(anchor, -step))} className="rounded-lg border border-hairline-strong bg-white p-2 text-ink-soft hover:border-ink-subtle" aria-label="Previous">
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => setAnchor(new Date().toISOString().slice(0, 10))} className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-soft hover:border-ink-subtle">
          Today
        </button>
        <button type="button" onClick={() => setAnchor(addDays(anchor, step))} className="rounded-lg border border-hairline-strong bg-white p-2 text-ink-soft hover:border-ink-subtle" aria-label="Next">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] font-semibold text-ink-subtle">
      <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: ACCENT }} /> Scheduled</span>
      <span className="inline-flex items-center gap-1.5"><MapPin size={13} /> In person</span>
      <span className="inline-flex items-center gap-1.5"><Video size={13} /> Online</span>
    </div>
  );
}

export function CalendarGrid({ view, sessions }: { view: GridView; sessions: SessionListRow[] }) {
  const [anchor, setAnchor] = React.useState(() => new Date().toISOString().slice(0, 10));

  const byDay = React.useMemo(() => {
    const m = new Map<string, SessionListRow[]>();
    for (const s of sessions) {
      const key = istYmd(s.scheduledAt);
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
    return m;
  }, [sessions]);

  return (
    <div>
      <Nav view={view} anchor={anchor} setAnchor={setAnchor} />

      {view === "month" && <MonthGrid anchor={anchor} byDay={byDay} />}
      {view === "week" && <WeekGrid anchor={anchor} byDay={byDay} />}
      {view === "day" && <DayGrid anchor={anchor} byDay={byDay} />}

      <Legend />
    </div>
  );
}

function MonthGrid({ anchor, byDay }: { anchor: string; byDay: Map<string, SessionListRow[]> }) {
  const first = `${anchor.slice(0, 7)}-01`;
  const start = weekStart(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = new Date().toISOString().slice(0, 10);
  const month = anchor.slice(0, 7);

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <div className="grid grid-cols-7 border-b border-hairline bg-surface-soft">
        {DAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((ymd) => {
          const inMonth = ymd.slice(0, 7) === month;
          const items = byDay.get(ymd) ?? [];
          const isToday = ymd === today;
          return (
            <div
              key={ymd}
              className="min-h-[104px] border-b border-r border-hairline p-1.5"
              style={{ background: inMonth ? "#fff" : "var(--color-surface-soft)", opacity: inMonth ? 1 : 0.6 }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold"
                  style={isToday ? { background: ACCENT, color: "#fff" } : { color: "var(--color-ink-subtle)" }}
                >
                  {Number(ymd.slice(8, 10))}
                </span>
                {items.length > 2 && <span className="text-[10px] font-bold text-ink-subtle">+{items.length - 2}</span>}
              </div>
              <div className="grid gap-0.5">
                {items.slice(0, 2).map((s) => <Chip key={s.id} s={s} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ anchor, byDay }: { anchor: string; byDay: Map<string, SessionListRow[]> }) {
  const start = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-7 gap-2 max-lg:grid-cols-1">
      {days.map((ymd, i) => {
        const items = byDay.get(ymd) ?? [];
        const isToday = ymd === today;
        return (
          <div key={ymd} className="rounded-2xl border border-hairline bg-surface-card p-3" style={isToday ? { borderColor: ACCENT } : undefined}>
            <div className="mb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{DAY_LABELS[i]}</p>
              <p className="text-[15px] font-black" style={{ color: isToday ? ACCENT_DEEP : "var(--color-ink-strong)" }}>{Number(ymd.slice(8, 10))}</p>
            </div>
            <div className="grid gap-1">
              {items.map((s) => <Chip key={s.id} s={s} />)}
              {items.length === 0 && <p className="text-[12px] font-semibold text-ink-subtle">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayGrid({ anchor, byDay }: { anchor: string; byDay: Map<string, SessionListRow[]> }) {
  const items = byDay.get(anchor) ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-card p-10 text-center">
        <p className="text-[14.5px] font-semibold text-ink-subtle">No trainings on this day.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {items.map((s) => (
        <Link
          key={s.id}
          href={`/training/calendar/${s.id}` as Route}
          className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface-card p-4 hover:border-ink-subtle"
        >
          <span className="w-24 shrink-0 text-[14px] font-black tabular-nums" style={{ color: ACCENT_DEEP }}>{istTime(s.scheduledAt)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-ink-strong">{s.topic}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] font-semibold text-ink-subtle">
              {s.subject && <span>{s.subject}</span>}
              <span>{s.trainerName ?? "No trainer"}</span>
              <span>{s.durationMin} min</span>
              <span className="inline-flex items-center gap-1">
                {s.mode === "online" ? <Video size={12} /> : <MapPin size={12} />}
                {s.mode === "online" ? "Online" : "In person"}
              </span>
              <span>{s.attendedCount}/{s.attendeeCount} attended</span>
            </p>
          </div>
          <span className="shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase" style={{ background: "var(--color-surface-track)", color: "var(--color-ink-soft)" }}>
            {s.status}
          </span>
        </Link>
      ))}
    </div>
  );
}
