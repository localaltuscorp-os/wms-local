"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import type { TaskRecurrence } from "@/db/enums";
import { RecurrenceControl } from "./recurrence-control";

export interface ScheduleValue {
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  recurrence: TaskRecurrence | null;
  /** RRULE detail, e.g. "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=10". */
  recurrenceRule: string | null;
}

interface Props {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
}

/** Split an ISO Date into the two strings the date + time inputs need. */
function isoToDateParts(d: Date | null): { date: string; time: string } {
  if (!d) return { date: "", time: "" };
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function partsToIso(date: string, time: string, allDay: boolean): Date | null {
  if (!date) return null;
  // All-day events default to noon so timezone wrap-arounds don't push the
  // date off-by-one (same trick the due-date input uses).
  const t = allDay ? "12:00" : time && time.length > 0 ? time : "09:00";
  const d = new Date(`${date}T${t}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDuration(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin === 0) return "0 min";
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 60 * 24) / 60);
  const mins = totalMin - days * 60 * 24 - hours * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(" ");
}

/**
 * Google-Calendar-style scheduling block: all-day toggle, start/end, and a
 * faithful recurrence picker (see RecurrenceControl). Self-contained — the
 * parent only supplies a ScheduleValue + onChange; no DB writes happen here.
 */
export function ScheduleSection({ value, onChange }: Props) {
  const startParts = isoToDateParts(value.startsAt);
  const endParts = isoToDateParts(value.endsAt);
  const duration = formatDuration(value.startsAt, value.endsAt);

  // Stable fallback anchor so the recurrence picker's labels + custom dialog
  // don't churn on every render when no start date is set yet.
  const fallbackAnchor = React.useRef(new Date());
  const anchor = value.startsAt ?? fallbackAnchor.current;

  function setAllDay(next: boolean) {
    onChange({ ...value, allDay: next });
  }
  function setStartDate(d: string) {
    onChange({ ...value, startsAt: partsToIso(d, startParts.time, value.allDay) });
  }
  function setStartTime(t: string) {
    onChange({ ...value, startsAt: partsToIso(startParts.date, t, value.allDay) });
  }
  function setEndDate(d: string) {
    onChange({ ...value, endsAt: partsToIso(d, endParts.time, value.allDay) });
  }
  function setEndTime(t: string) {
    onChange({ ...value, endsAt: partsToIso(endParts.date, t, value.allDay) });
  }

  return (
    <div
      className="rounded-section p-5"
      style={{ border: "1px solid var(--color-hairline)", background: "var(--color-surface-soft)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center gap-2.5 uppercase font-black tracking-[0.10em]"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 17,
            color: "rgb(var(--vp-cyan-deep))",
          }}
        >
          <Calendar size={22} strokeWidth={2.2} />
          Schedule
        </span>
        {duration && (
          <span className="tabular-nums font-black" style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>
            Duration · {duration}
          </span>
        )}
      </div>

      <label
        className="inline-flex items-center gap-2 cursor-pointer select-none mb-4"
        style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink-strong)" }}
      >
        <input
          type="checkbox"
          checked={value.allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4"
          style={{ accentColor: "rgb(168, 4, 0)" }}
        />
        All day
      </label>

      {/* Start row */}
      <div className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center mb-3 max-md:grid-cols-1 max-md:gap-2">
        <span
          className="uppercase font-bold tracking-[0.08em]"
          style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace", fontSize: 12, color: "var(--color-ink-muted)" }}
        >
          Start
        </span>
        <input type="date" value={startParts.date} onChange={(e) => setStartDate(e.target.value)} className="nt-input" />
        {!value.allDay && (
          <input type="time" value={startParts.time} onChange={(e) => setStartTime(e.target.value)} className="nt-input" />
        )}
      </div>

      {/* End row */}
      <div className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center mb-4 max-md:grid-cols-1 max-md:gap-2">
        <span
          className="uppercase font-bold tracking-[0.08em]"
          style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace", fontSize: 12, color: "var(--color-ink-muted)" }}
        >
          End
        </span>
        <input type="date" value={endParts.date} onChange={(e) => setEndDate(e.target.value)} className="nt-input" />
        {!value.allDay && (
          <input type="time" value={endParts.time} onChange={(e) => setEndTime(e.target.value)} className="nt-input" />
        )}
      </div>

      {/* Recurrence — Google-Calendar-faithful presets + Custom… dialog. */}
      <RecurrenceControl
        anchor={anchor}
        recurrence={value.recurrence}
        recurrenceRule={value.recurrenceRule}
        onChange={(r) => onChange({ ...value, ...r })}
      />

      <p className="mt-4 font-semibold" style={{ fontSize: 13, color: "var(--color-ink-muted)", lineHeight: 1.5 }}>
        Internal scheduling only — not yet synced to Google Calendar. Use the
        deadline (<strong>Due Date</strong>) above for the commitment; this block
        describes when the work happens and how it repeats.
      </p>
    </div>
  );
}
