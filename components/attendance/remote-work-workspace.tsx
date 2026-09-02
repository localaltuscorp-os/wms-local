"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, MapPin, Mic, Pencil, Repeat, Trash2, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  RECURRENCE_MODE_LABELS,
  REMOTE_REASON_BUCKETS,
  REMOTE_REASON_BUCKET_LABELS,
  REMOTE_WORK_MODE_LABELS,
  type RecurrenceMode,
  type RemoteReasonBucket,
  type RemoteWorkMode,
  type RemoteWorkStatus,
} from "@/db/enums";
import type { RemoteWorkPageData } from "@/app/(app)/attendance/remote-work/actions";
import {
  amendRemoteWorkRequest,
  decideRemoteWorkRequest,
  removeRemoteWorkRequest,
  submitRemoteWorkRequest,
} from "@/app/(app)/attendance/remote-work/actions";
import type { RemoteWorkRow } from "@/lib/attendance/remote-work";
import { ALL_DAY_END, ALL_DAY_START } from "@/lib/attendance/remote-work-constants";
import { weekdayLabels, weekdayOf } from "@/lib/attendance/recurrence";
import { useDictation } from "@/components/ui/use-dictation";

const MODES: RemoteWorkMode[] = ["wfh", "client_site", "field"];
const WEEKDAYS = [
  { d: 1, label: "M" },
  { d: 2, label: "T" },
  { d: 3, label: "W" },
  { d: 4, label: "T" },
  { d: 5, label: "F" },
  { d: 6, label: "S" },
  { d: 0, label: "S" },
];

/**
 * What the Repeat dropdown offers. "Monthly" and everything behind "Custom…"
 * are SUBMITTED as recurrence "custom" plus a pattern — the 0209 CHECK on
 * `remote_work_requests.recurrence` admits only the original five values, and
 * the column is display-only anyway: the expanded one-row-per-date is the truth
 * approval and the punch trigger read.
 */
type RepeatChoice = RecurrenceMode | "monthly";
const REPEAT_CHOICES: { value: RepeatChoice; label: string }[] = [
  { value: "none", label: RECURRENCE_MODE_LABELS.none },
  { value: "daily", label: RECURRENCE_MODE_LABELS.daily },
  { value: "weekdays", label: RECURRENCE_MODE_LABELS.weekdays },
  { value: "weekly", label: RECURRENCE_MODE_LABELS.weekly },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: RECURRENCE_MODE_LABELS.custom },
];

const ORDINALS: { value: 1 | 2 | 3 | 4 | -1; label: string }[] = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: -1, label: "Last" },
];

/** Monday-first, the same order as the chip row. Values match getUTCDay(). */
const ORDINAL_WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

/** "1st", "2nd", … "31st". */
function nth(n: number): string {
  const v = n % 100;
  const suffix =
    v >= 11 && v <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Requested → Pending → Approved / Rejected, rendered as one chip. */
const STATUS_CHIP: Record<RemoteWorkStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FEF3C7", fg: "#92400E", label: "Pending" },
  approved: { bg: "#DCFCE7", fg: "#166534", label: "Approved" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejected" },
};

const INPUT =
  "rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px] disabled:opacity-50";

function StatusChip({ status }: { status: RemoteWorkStatus }) {
  const c = STATUS_CHIP[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold"
      style={{ background: c.bg, color: c.fg }}
    >
      {status === "pending" && <Clock size={11} strokeWidth={2.6} />}
      {c.label}
    </span>
  );
}

/** "10:30" from the "HH:MM:SS" Postgres hands back for a `time` column. */
function clock(t: string): string {
  return t.slice(0, 5);
}
function hours(r: Pick<RemoteWorkRow, "allDay" | "startTime" | "endTime">): string {
  return r.allDay
    ? `All day · ${clock(r.startTime)} – ${clock(r.endTime)}`
    : `${clock(r.startTime)} – ${clock(r.endTime)}`;
}

export function RemoteWorkWorkspace({ data }: { data: RemoteWorkPageData }) {
  return (
    <div className="mt-5 flex flex-col gap-6">
      {data.canApprove && data.pending.length > 0 && (
        <ApprovalQueue rows={data.pending} clientLocations={data.clientLocations} />
      )}
      <RequestForm clientLocations={data.clientLocations} />
      <MyRequests
        rows={data.mine}
        canManage={data.canApprove}
        clientLocations={data.clientLocations}
      />
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-surface-card rounded-[20px] p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <div className="mb-4">
        <h2 className="text-ink-strong text-[16px] font-bold">{title}</h2>
        {subtitle && <p className="text-ink-muted mt-0.5 text-[13px]">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-ink-muted text-[12.5px] font-bold">
        {label}
        {hint && <span className="text-ink-subtle ml-1.5 font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * The request form.
 *
 * ── EVERYTHING IS ON THE FACE OF IT ────────────────────────────────────────
 * Hours and the repeat pattern sit in the form itself, not behind an "advanced"
 * disclosure. A person filling this in is describing a day away from the office;
 * "when" and "how often" are the two things an approver reads first, and hiding
 * them behind a toggle means most requests would arrive with the defaults nobody
 * chose. Only the CUSTOM pattern controls appear on demand, because they only
 * exist once "Custom…" is picked.
 *
 * ── ALL DAY IS A CHECKBOX, NOT A THIRD MODE — AND STARTS UNTICKED ──────────
 * The times are the primary statement (they start enabled at the standard day);
 * ticking All day DISABLES them rather than clearing them, so unticking gets
 * the typed hours back. The server forces 10:30–19:30 for an all-day request
 * regardless of what the disabled inputs still hold, so the two can never
 * disagree.
 *
 * ── REPEAT IS A CALENDAR RULE ──────────────────────────────────────────────
 * Daily / weekly / monthly with Google-Calendar-style custom patterns (every N
 * days/weeks/months, any weekday set, "the 15th" or "the last Friday"), ending
 * on a date, after N occurrences, or never — where "never" honestly means "as
 * far as one submission may reach" (the horizon in lib/attendance/recurrence).
 * Whatever the pattern, what is SUBMITTED is still one request per date — the
 * expansion happens server-side, and approval stays per-day.
 */
function RequestForm({ clientLocations }: { clientLocations: RemoteWorkPageData["clientLocations"] }) {
  const router = useRouter();
  const [workDate, setWorkDate] = React.useState("");
  const [workMode, setWorkMode] = React.useState<RemoteWorkMode>("wfh");
  const [clientLocationId, setClientLocationId] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [startTime, setStartTime] = React.useState(ALL_DAY_START);
  const [endTime, setEndTime] = React.useState(ALL_DAY_END);
  const [reasonBucket, setReasonBucket] = React.useState<RemoteReasonBucket | "">("");
  const [reason, setReason] = React.useState("");
  const [repeat, setRepeat] = React.useState<RepeatChoice>("none");
  const [intervalStr, setIntervalStr] = React.useState("1");
  const [unit, setUnit] = React.useState<"day" | "week" | "month">("week");
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [monthlyKind, setMonthlyKind] = React.useState<"day" | "weekday">("day");
  const [monthDayStr, setMonthDayStr] = React.useState("1");
  const [ordinalStr, setOrdinalStr] = React.useState("1");
  const [ordWeekdayStr, setOrdWeekdayStr] = React.useState("1");
  const [endMode, setEndMode] = React.useState<"until" | "count" | "never">("until");
  const [repeatUntil, setRepeatUntil] = React.useState("");
  const [countStr, setCountStr] = React.useState("5");
  const [busy, setBusy] = React.useState(false);

  // Voice typing for the notes — the same Web Speech hook the rest of the app
  // dictates with. Unsupported browser ⇒ no mic is rendered and the input is
  // exactly the plain text field it always was.
  const dictation = useDictation({
    value: reason,
    onChange: (v) => setReason(v.slice(0, 1000)),
  });

  // Client Site needs a site; the server enforces this too (0205 CHECK), but
  // saying so before the round-trip is kinder than a rejection.
  const needsClient = workMode === "client_site";
  const noSites = needsClient && clientLocations.length === 0;
  const repeats = repeat !== "none";
  const isCustom = repeat === "custom";
  const customWeekly = isCustom && unit === "week";
  const customMonthly = isCustom && unit === "month";
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? Number(workDate.slice(8, 10)) : null;

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  /** Picking Custom seeds the chips and the month-day from the start date, the
   *  way a calendar pre-fills its custom dialog — an empty rule reads as broken. */
  function pickRepeat(v: RepeatChoice) {
    setRepeat(v);
    if (v === "custom" && workDate) {
      if (weekdays.length === 0) setWeekdays([weekdayOf(workDate)]);
      if (startDay != null) setMonthDayStr(String(startDay));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const interval = Math.min(99, Math.max(1, Math.floor(Number(intervalStr) || 1)));
      const monthDay = Math.min(31, Math.max(1, Math.floor(Number(monthDayStr) || 1)));
      const count = Math.min(60, Math.max(1, Math.floor(Number(countStr) || 1)));
      const ordinal = Number(ordinalStr) as 1 | 2 | 3 | 4 | -1;

      // "Monthly" in the dropdown = the Google default: same day of the month as
      // the start date. The full both-styles control lives behind "Custom…".
      const monthly =
        repeat === "monthly"
          ? { kind: "day" as const, day: startDay ?? 1 }
          : customMonthly
            ? monthlyKind === "day"
              ? { kind: "day" as const, day: monthDay }
              : { kind: "weekday" as const, ordinal, weekday: Number(ordWeekdayStr) }
            : undefined;

      const res = await submitRemoteWorkRequest({
        workDate,
        workMode,
        clientLocationId: needsClient ? clientLocationId || null : null,
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        reason: reason || null,
        reasonBucket: reasonBucket || null,
        recurrence: repeat === "monthly" ? "custom" : repeat,
        repeatUntil: repeats && endMode === "until" ? repeatUntil || null : null,
        weekdays: customWeekly ? weekdays : undefined,
        interval: isCustom ? interval : undefined,
        unit: repeat === "monthly" ? "month" : isCustom ? unit : undefined,
        monthly,
        end: repeats ? endMode : undefined,
        count: repeats && endMode === "count" ? count : undefined,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // A repeat can partly land: days already decided are skipped, not failed.
      // Saying which ones is the difference between "it worked" and "it worked
      // for the days you can still have".
      const n = res.ids.length;
      const skipped = res.skipped.length;
      fireToast({
        message:
          skipped > 0
            ? `${n} day${n === 1 ? "" : "s"} requested — ${skipped} skipped (${res.skipped
                .map((sk) => sk.date)
                .join(", ")} already decided).`
            : `${n} day${n === 1 ? "" : "s"} requested — Rutvisha, Manan or Om will review.`,
      });
      dictation.stop();
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Request a day away from the office"
      subtitle="Approved before it counts — applying is not approval."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        {/* ── Row 1: date · type · (site) · all day ─────────────────────── */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <Field label={repeats ? "Starts on" : "Date"} className="w-[170px] max-[560px]:w-full">
            <input
              type="date"
              required
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className={INPUT}
            />
          </Field>

          <Field label="Remote Work Type" className="w-[180px] max-[560px]:w-full">
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value as RemoteWorkMode)}
              className={INPUT}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {REMOTE_WORK_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>

          {needsClient && (
            <Field label="Client site" className="min-w-[200px] flex-1 max-[560px]:w-full">
              <select
                required
                value={clientLocationId}
                onChange={(e) => setClientLocationId(e.target.value)}
                disabled={noSites}
                className={INPUT}
              >
                <option value="">Pick a site…</option>
                {clientLocations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <label className="text-ink-strong inline-flex items-center gap-2 pb-2.5 text-[13.5px] font-bold">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-4 accent-[var(--color-altus-red)]"
            />
            All day
            <span className="text-ink-subtle font-normal">
              ({ALL_DAY_START} – {ALL_DAY_END})
            </span>
          </label>
        </div>

        {noSites && (
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--color-altus-red)" }}>
            No client sites saved yet — ask Manan, Rutvisha or Ruchita to add one in Admin · Client
            Locations.
          </p>
        )}

        {/* ── Row 2: hours · repeat · ends ──────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <Field label="From" className="w-[110px]">
            <input
              type="time"
              value={allDay ? ALL_DAY_START : startTime}
              disabled={allDay}
              required={!allDay}
              onChange={(e) => setStartTime(e.target.value)}
              className={`${INPUT} tabular-nums`}
            />
          </Field>
          <Field label="To" className="w-[110px]">
            <input
              type="time"
              value={allDay ? ALL_DAY_END : endTime}
              disabled={allDay}
              required={!allDay}
              onChange={(e) => setEndTime(e.target.value)}
              className={`${INPUT} tabular-nums`}
            />
          </Field>

          <Field label="Repeat" className="w-[200px] max-[560px]:w-full">
            <select
              value={repeat}
              onChange={(e) => pickRepeat(e.target.value as RepeatChoice)}
              className={INPUT}
            >
              {REPEAT_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          {repeats && (
            <>
              <Field label="Ends" className="w-[150px]">
                <select
                  value={endMode}
                  onChange={(e) => setEndMode(e.target.value as "until" | "count" | "never")}
                  className={INPUT}
                >
                  <option value="until">On a date</option>
                  <option value="count">After…</option>
                  <option value="never">Never</option>
                </select>
              </Field>
              {endMode === "until" && (
                <Field label="Until" className="w-[170px]">
                  <input
                    type="date"
                    required
                    min={workDate || undefined}
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    className={INPUT}
                  />
                </Field>
              )}
              {endMode === "count" && (
                <Field label="Occurrences" className="w-[110px]">
                  <input
                    type="number"
                    required
                    min={1}
                    max={60}
                    value={countStr}
                    onChange={(e) => setCountStr(e.target.value)}
                    className={`${INPUT} tabular-nums`}
                  />
                </Field>
              )}
            </>
          )}
        </div>

        {/* ── The custom rule, only when "Custom…" is picked ────────────── */}
        {isCustom && (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2.5"
            style={{
              background: "var(--color-surface-soft)",
              border: "1px solid var(--color-hairline)",
            }}
          >
            <span className="text-ink-muted text-[12.5px] font-bold">Repeat every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={intervalStr}
              onChange={(e) => setIntervalStr(e.target.value)}
              className={`${INPUT} w-[64px] tabular-nums`}
              aria-label="Repeat interval"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "day" | "week" | "month")}
              className={`${INPUT} w-[110px]`}
              aria-label="Repeat unit"
            >
              <option value="day">{Number(intervalStr) === 1 ? "Day" : "Days"}</option>
              <option value="week">{Number(intervalStr) === 1 ? "Week" : "Weeks"}</option>
              <option value="month">{Number(intervalStr) === 1 ? "Month" : "Months"}</option>
            </select>

            {customWeekly && (
              <>
                <span className="text-ink-muted text-[12.5px] font-bold">on</span>
                {WEEKDAYS.map(({ d, label }) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleWeekday(d)}
                      aria-pressed={on}
                      className="size-8 rounded-full text-[12.5px] font-bold transition-colors"
                      style={
                        on
                          ? { background: "var(--color-altus-red)", color: "#fff" }
                          : {
                              border: "1px solid var(--color-hairline-strong, #CBD5E1)",
                              color: "var(--color-ink-muted)",
                              background: "var(--color-surface-card, #fff)",
                            }
                      }
                    >
                      {label}
                    </button>
                  );
                })}
                {weekdays.length > 0 && (
                  <span className="text-ink-subtle text-[12.5px]">{weekdayLabels(weekdays)}</span>
                )}
              </>
            )}

            {customMonthly && (
              <>
                <span className="text-ink-muted text-[12.5px] font-bold">on</span>
                <select
                  value={monthlyKind}
                  onChange={(e) => setMonthlyKind(e.target.value as "day" | "weekday")}
                  className={`${INPUT} w-[130px]`}
                  aria-label="Monthly repeat style"
                >
                  <option value="day">a date</option>
                  <option value="weekday">a weekday</option>
                </select>
                {monthlyKind === "day" ? (
                  <>
                    <span className="text-ink-muted text-[12.5px]">the</span>
                    <select
                      value={monthDayStr}
                      onChange={(e) => setMonthDayStr(e.target.value)}
                      className={`${INPUT} w-[90px] tabular-nums`}
                      aria-label="Day of the month"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {nth(d)}
                        </option>
                      ))}
                    </select>
                    <span className="text-ink-subtle text-[12.5px]">
                      of every month{Number(monthDayStr) > 28 ? " (months without it are skipped)" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-ink-muted text-[12.5px]">the</span>
                    <select
                      value={ordinalStr}
                      onChange={(e) => setOrdinalStr(e.target.value)}
                      className={`${INPUT} w-[110px]`}
                      aria-label="Which week of the month"
                    >
                      {ORDINALS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ordWeekdayStr}
                      onChange={(e) => setOrdWeekdayStr(e.target.value)}
                      className={`${INPUT} w-[130px]`}
                      aria-label="Which weekday"
                    >
                      {ORDINAL_WEEKDAYS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-ink-subtle text-[12.5px]">of every month</span>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {repeats && (
          <p className="text-ink-subtle text-[12.5px]">
            {repeat === "monthly" && startDay != null
              ? `On the ${nth(startDay)} of every month. `
              : ""}
            Each date becomes its own request, so they can be approved — or refused — one day at a
            time.
            {endMode === "never" ? " “Never” books as far ahead as one request may reach." : ""}
          </p>
        )}

        {/* ── Row 3: reason · notes ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
          <Field label="Reason">
            <select
              value={reasonBucket}
              onChange={(e) => setReasonBucket(e.target.value as RemoteReasonBucket | "")}
              className={INPUT}
            >
              <option value="">Not specified</option>
              {REMOTE_REASON_BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {REMOTE_REASON_BUCKET_LABELS[b]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" hint="optional">
            <div className="relative">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                placeholder="Anything the approver should know"
                className={`${INPUT} w-full ${dictation.supported ? "pr-10" : ""}`}
              />
              {dictation.supported && (
                <button
                  type="button"
                  onClick={dictation.toggle}
                  aria-pressed={dictation.recording}
                  aria-label={dictation.recording ? "Stop dictation" : "Dictate the notes"}
                  title={dictation.recording ? "Stop dictation" : "Dictate"}
                  className={`absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md transition-colors ${
                    dictation.recording
                      ? "animate-pulse text-white"
                      : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
                  }`}
                  style={dictation.recording ? { background: "var(--color-altus-red)" } : undefined}
                >
                  <Mic size={14} strokeWidth={2.3} aria-hidden />
                </button>
              )}
            </div>
          </Field>
        </div>

        {/* ── Row 4 ─────────────────────────────────────────────────────── */}
        <div>
          <button
            type="submit"
            disabled={busy || noSites}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Send request
          </button>
        </div>
      </form>
    </Card>
  );
}

/** The one-line summary of a request, shared by the queue and the history. */
function RequestSummary({ row, showName }: { row: RemoteWorkRow; showName: boolean }) {
  return (
    <span className="text-ink-strong min-w-0 flex-1 text-[13.5px] font-semibold">
      {showName ? row.employeeName : <span className="tabular-nums">{row.workDate}</span>}
      <span className="text-ink-muted font-normal">
        {" · "}
        {REMOTE_WORK_MODE_LABELS[row.workMode]}
        {showName ? ` · ${row.workDate}` : ""}
        {" · "}
        {hours(row)}
      </span>
      {row.clientName && (
        <span className="text-ink-muted inline-flex items-center gap-1 font-normal">
          {" · "}
          <MapPin size={12} /> {row.clientName}
        </span>
      )}
      {row.recurrence !== "none" && (
        <span className="text-ink-subtle inline-flex items-center gap-1 font-normal">
          {" · "}
          <Repeat size={11} strokeWidth={2.6} />
          {RECURRENCE_MODE_LABELS[row.recurrence]}
        </span>
      )}
      {(row.reasonBucket || row.reason) && (
        <span className="text-ink-subtle block text-[12.5px] font-normal">
          {row.reasonBucket ? REMOTE_REASON_BUCKET_LABELS[row.reasonBucket] : null}
          {row.reasonBucket && row.reason ? " — " : null}
          {row.reason}
        </span>
      )}
    </span>
  );
}

function ApprovalQueue({
  rows,
  clientLocations,
}: {
  rows: RemoteWorkRow[];
  clientLocations: RemoteWorkPageData["clientLocations"];
}) {
  return (
    <Card
      title={`Pending approval (${rows.length})`}
      subtitle="Only you and Manan/Rutvisha see this."
    >
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <QueueRow key={r.id} row={r} clientLocations={clientLocations} />
        ))}
      </ul>
    </Card>
  );
}

function QueueRow({
  row,
  clientLocations,
}: {
  row: RemoteWorkRow;
  clientLocations: RemoteWorkPageData["clientLocations"];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | "approved" | "rejected">(null);
  const [editing, setEditing] = React.useState(false);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    try {
      const res = await decideRemoteWorkRequest({ requestId: row.id, decision });
      if (!res.ok) {
        // Includes "already approved" when two approvers open the queue at once
        // — the second is told what happened rather than overwriting the first.
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${row.employeeName}'s request ${decision}.` });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <li>
        <AmendForm
          row={row}
          clientLocations={clientLocations}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: "var(--color-surface-soft)" }}
    >
      <RequestSummary row={row} showName />
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide("approved")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
        >
          {busy === "approved" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} strokeWidth={3} />
          )}
          Approve
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide("rejected")}
          className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold disabled:opacity-50"
        >
          {busy === "rejected" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <X size={13} strokeWidth={3} />
          )}
          Reject
        </button>
        <ManageActions row={row} onEdit={() => setEditing(true)} />
      </span>
    </li>
  );
}

/**
 * Amend and Remove — the approver's controls (0209).
 *
 * Shown wherever an approver sees a request, including one that is already
 * decided: correcting yesterday's approved hours is exactly the case this
 * exists for. The server re-checks the same predicate, so hiding these is
 * presentation and never the control.
 */
function ManageActions({ row, onEdit }: { row: RemoteWorkRow; onEdit: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function remove(wholeSeries: boolean) {
    const what = wholeSeries
      ? `every day of this repeat for ${row.employeeName}`
      : `${row.employeeName}'s request for ${row.workDate}`;
    if (!window.confirm(`Remove ${what}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await removeRemoteWorkRequest({ requestId: row.id, wholeSeries });
      if (!res.ok) {
        // Most often: the day has already been punched in that mode, so the
        // approval cannot be withdrawn without orphaning the attendance.
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Removed ${res.removed} day${res.removed === 1 ? "" : "s"}.` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-bold"
      >
        <Pencil size={13} strokeWidth={2.6} /> Edit
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => remove(false)}
        className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-bold disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.6} />}
        Remove
      </button>
      {row.seriesId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => remove(true)}
          className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-bold disabled:opacity-50"
        >
          <Repeat size={13} strokeWidth={2.6} /> Remove series
        </button>
      )}
    </>
  );
}

/**
 * The in-place edit.
 *
 * NO DATE FIELD, deliberately — moving a request to another day is a different
 * request, and it would have to reckon with whatever already sits on the target
 * date under the (employee, date) unique index. The lib refuses it for the same
 * reason; this form simply does not offer it.
 */
function AmendForm({
  row,
  clientLocations,
  onDone,
}: {
  row: RemoteWorkRow;
  clientLocations: RemoteWorkPageData["clientLocations"];
  onDone: () => void;
}) {
  const router = useRouter();
  const [workMode, setWorkMode] = React.useState<RemoteWorkMode>(row.workMode);
  const [clientLocationId, setClientLocationId] = React.useState(
    clientLocations.find((c) => c.name === row.clientName)?.id ?? "",
  );
  const [allDay, setAllDay] = React.useState(row.allDay);
  const [startTime, setStartTime] = React.useState(clock(row.startTime));
  const [endTime, setEndTime] = React.useState(clock(row.endTime));
  const [reasonBucket, setReasonBucket] = React.useState<RemoteReasonBucket | "">(
    row.reasonBucket ?? "",
  );
  const [reason, setReason] = React.useState(row.reason ?? "");
  const [busy, setBusy] = React.useState(false);

  const needsClient = workMode === "client_site";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await amendRemoteWorkRequest({
        requestId: row.id,
        workMode,
        clientLocationId: needsClient ? clientLocationId || null : null,
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        reason: reason || null,
        reasonBucket: reasonBucket || null,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${row.workDate} updated.` });
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl px-4 py-3"
      style={{ background: "var(--color-surface-soft)" }}
    >
      <p className="text-ink-strong text-[13px] font-bold">
        Editing {row.employeeName} · <span className="tabular-nums">{row.workDate}</span>
        <span className="text-ink-subtle font-normal"> — the date can&rsquo;t be changed here</span>
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Remote Work Type" className="min-w-[170px]">
          <select
            value={workMode}
            onChange={(e) => setWorkMode(e.target.value as RemoteWorkMode)}
            className={INPUT}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {REMOTE_WORK_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>

        {needsClient && (
          <Field label="Client site" className="min-w-[180px]">
            <select
              required
              value={clientLocationId}
              onChange={(e) => setClientLocationId(e.target.value)}
              className={INPUT}
            >
              <option value="">Pick a site…</option>
              {clientLocations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <label className="text-ink-strong inline-flex items-center gap-2 pb-2.5 text-[13.5px] font-bold">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="size-4 accent-[var(--color-altus-red)]"
          />
          All day
        </label>

        <Field label="From" className="w-[125px]">
          <input
            type="time"
            value={allDay ? ALL_DAY_START : startTime}
            disabled={allDay}
            onChange={(e) => setStartTime(e.target.value)}
            className={`${INPUT} tabular-nums`}
          />
        </Field>
        <Field label="To" className="w-[125px]">
          <input
            type="time"
            value={allDay ? ALL_DAY_END : endTime}
            disabled={allDay}
            onChange={(e) => setEndTime(e.target.value)}
            className={`${INPUT} tabular-nums`}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Reason" className="min-w-[190px]">
          <select
            value={reasonBucket}
            onChange={(e) => setReasonBucket(e.target.value as RemoteReasonBucket | "")}
            className={INPUT}
          >
            <option value="">Not specified</option>
            {REMOTE_REASON_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {REMOTE_REASON_BUCKET_LABELS[b]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" className="min-w-[220px] flex-1">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            className={INPUT}
          />
        </Field>

        <div className="flex items-center gap-2 pb-0.5">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
          <button
            type="button"
            onClick={onDone}
            className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-bold"
          >
            <X size={13} strokeWidth={2.6} /> Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function MyRequests({
  rows,
  canManage,
  clientLocations,
}: {
  rows: RemoteWorkRow[];
  canManage: boolean;
  clientLocations: RemoteWorkPageData["clientLocations"];
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <Card title="Your requests">
        <p className="text-ink-subtle text-[13.5px]">Nothing requested yet.</p>
      </Card>
    );
  }
  return (
    <Card title="Your requests">
      <ul className="flex flex-col gap-2">
        {rows.map((r) =>
          editingId === r.id ? (
            <li key={r.id}>
              <AmendForm
                row={r}
                clientLocations={clientLocations}
                onDone={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <RequestSummary row={r} showName={false} />
              {r.decisionNote && (
                <span className="text-ink-subtle w-full text-[12.5px]">
                  &ldquo;{r.decisionNote}&rdquo;
                </span>
              )}
              {r.decidedByName && (
                <span className="text-ink-subtle text-[12px]">by {r.decidedByName}</span>
              )}
              <StatusChip status={r.status} />
              {canManage && <ManageActions row={r} onEdit={() => setEditingId(r.id)} />}
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}
