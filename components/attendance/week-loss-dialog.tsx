"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, IndianRupee, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { acknowledgeWeekLoss } from "@/app/(app)/attendance/actions";
import {
  ACK_COUNTDOWN_SECONDS,
  daysLabel,
  hoursLabel,
  rupees,
  shortDate,
  weekLabel,
  type WeekLoss,
} from "@/lib/attendance/week-loss";

/**
 * THE MONDAY REPORT — what last week cost you, shown before you can clock in.
 *
 * On the first punch of a new week this sits over the attendance page and will
 * not go away until it is dismissed. Dismissing writes an acknowledgement row,
 * which is what unlocks the check-in (the gate itself is server-side, in
 * app/(app)/attendance/actions.ts — this dialog is the way to satisfy it, not
 * the thing enforcing it).
 *
 * ── THE "SKIPPABLE AD" BEAT ────────────────────────────────────────────────
 * Cancel is disabled for a few seconds and counts down, exactly like an ad you
 * must sit through. That is the point: a button that is live on the first frame
 * gets reflex-clicked, and then nobody has read anything.
 *
 * A CLEAN WEEK SKIPS THE WAIT. Friction should be proportional to the problem —
 * making someone who lost nothing sit through a countdown teaches them the
 * dialog is noise, and the next time it is not noise they will not read it
 * either.
 *
 * NOT DISMISSIBLE BY ESCAPE OR BACKDROP, and it has no close "X". Cancel is the
 * only way out, because Cancel is the thing that gets recorded.
 */
export function WeekLossDialog({ loss }: { loss: WeekLoss }) {
  const router = useRouter();
  const [left, setLeft] = React.useState(loss.clean ? 0 : ACK_COUNTDOWN_SECONDS);
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  // The dialog owns the screen while it is up — a page that still scrolls
  // behind a blocking overlay reads as dismissible when it is not.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Swallow Escape. Left alone the browser does nothing here anyway (this is not
  // a native <dialog>), but a key that LOOKS like it should close a modal and
  // silently does not is worth being deliberate about.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function dismiss() {
    if (left > 0 || saving) return;
    setSaving(true);
    acknowledgeWeekLoss({ daysLost: loss.daysLost, moneyLost: loss.moneyLost })
      .then((res) => {
        if (!res.ok) {
          setSaving(false);
          fireToast({ message: res.error, type: "error" });
          return;
        }
        // Hide immediately, then refresh so the server re-renders without it and
        // the punch gate sees the acknowledgement.
        setDone(true);
        router.refresh();
      })
      .catch(() => {
        setSaving(false);
        fireToast({ message: "Could not record that. Please try again.", type: "error" });
      });
  }

  if (done) return null;

  const tone = loss.clean
    ? { fg: "var(--color-green-deep)", bg: "var(--color-green-bg)", edge: "var(--color-green-edge)" }
    : { fg: "var(--color-altus-red-deep)", bg: "var(--color-altus-red-wash)", edge: "var(--color-altus-red-edge)" };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="week-loss-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-3xl border border-hairline bg-surface-card shadow-[0_32px_80px_rgba(15,23,42,0.35)]">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 max-md:px-4 max-md:pt-5">
          <div className="flex items-center gap-2">
            {loss.clean ? (
              <CheckCircle2 size={16} style={{ color: tone.fg }} />
            ) : (
              <AlertTriangle size={16} style={{ color: tone.fg }} />
            )}
            <span
              className="text-[11px] font-black uppercase tracking-[0.09em]"
              style={{ color: tone.fg }}
            >
              Last week
            </span>
            <span className="ml-auto text-[11.5px] font-semibold text-ink-muted">
              {weekLabel(loss.weekStart, loss.weekEnd)}
            </span>
          </div>
          <h2
            id="week-loss-title"
            className="mt-2 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(19px, 2.2vw, 23px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
            }}
          >
            {loss.clean ? "Nothing lost last week" : "This is what last week cost you"}
          </h2>
        </div>

        {/* ── The two headline numbers ───────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-4 max-md:px-4 max-sm:grid-cols-1">
          <Headline
            label="Attendance lost"
            icon={<Clock3 size={13} />}
            value={loss.clean ? "None" : daysLabel(loss.daysLost)}
            sub={
              loss.expectedDays > 0
                ? `${loss.earnedDays} of ${loss.expectedDays} days earned`
                : "No working days"
            }
            tone={tone}
          />
          <Headline
            label="Money lost"
            icon={<IndianRupee size={13} />}
            value={
              loss.payUnaffected
                ? "—"
                : !loss.priced
                  ? "Not priced"
                  : loss.moneyLost > 0
                    ? rupees(loss.moneyLost)
                    : "None"
            }
            sub={
              loss.payUnaffected
                ? "Your pay is a fixed fee — attendance does not change it"
                : !loss.priced
                  ? "No pay rate on file yet"
                  : loss.basis === "hourly"
                    ? "Hours short of your weekly target"
                    : "At your per-day rate"
            }
            tone={tone}
          />
        </div>

        {/* ── How the gap happened ───────────────────────────────────── */}
        <div className="px-6 pt-4 max-md:px-4">
          <div className="rounded-2xl border border-hairline p-3">
            <div className="mb-2 text-[10.5px] font-black uppercase tracking-[0.07em] text-ink-muted">
              How it happened
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 max-sm:grid-cols-1">
              <Row
                k="Hours worked"
                v={`${hoursLabel(loss.workedMinutes)} of ${hoursLabel(loss.targetMinutes)}`}
              />
              <Row k="Short by" v={loss.shortMinutes > 0 ? hoursLabel(loss.shortMinutes) : "—"} />
              <Row k="Late arrivals" v={loss.lateCount > 0 ? String(loss.lateCount) : "—"} />
              <Row k="Left early" v={loss.leftEarlyCount > 0 ? String(loss.leftEarlyCount) : "—"} />
              <Row k="Absent" v={loss.absentDays > 0 ? daysLabel(loss.absentDays) : "—"} />
              <Row
                k="Unpaid leave"
                v={loss.unpaidLeaveDays > 0 ? daysLabel(loss.unpaidLeaveDays) : "—"}
              />
            </dl>
            {/* The one thing people get wrong about this report, said plainly
                rather than left to be inferred from the numbers. */}
            {loss.lateCount > 0 ? (
              <p className="mt-2.5 border-t border-hairline pt-2 text-[11px] font-medium leading-relaxed text-ink-subtle">
                Late marks are not charged separately — a late start already shows
                up as fewer worked hours above.
              </p>
            ) : null}
          </div>
        </div>

        {/* ── Day by day ─────────────────────────────────────────────── */}
        {loss.days.length > 0 ? (
          <div className="px-6 pt-3 max-md:px-4">
            <div className="flex flex-wrap gap-1.5">
              {loss.days.map((d) => (
                <DayChip key={d.logDate} ymd={d.logDate} code={d.code} minutes={d.workedMinutes} />
              ))}
            </div>
          </div>
        ) : null}

        {/* ── Cancel ─────────────────────────────────────────────────── */}
        <div className="mt-5 flex items-center gap-3 border-t border-hairline px-6 py-4 max-md:px-4">
          <p className="min-w-0 flex-1 text-[11.5px] font-medium leading-relaxed text-ink-subtle">
            {loss.clean
              ? "Keep it up. Close this to clock in."
              : "Close this to clock in. We record that you have read it."}
          </p>
          <button
            type="button"
            onClick={dismiss}
            disabled={left > 0 || saving}
            aria-live="polite"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-chip px-6 text-[13.5px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            {left > 0 ? `Cancel in ${left}` : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */

function Headline({
  label,
  icon,
  value,
  sub,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  tone: { fg: string; bg: string; edge: string };
}) {
  return (
    <div
      className="rounded-2xl border p-3.5"
      style={{ borderColor: tone.edge, background: tone.bg }}
    >
      <div
        className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.07em]"
        style={{ color: tone.fg }}
      >
        {icon}
        {label}
      </div>
      <div
        className="mt-1.5 leading-none text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          letterSpacing: "-0.03em",
          fontSize: "clamp(22px, 3vw, 30px)",
        }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-semibold leading-snug text-ink-muted">{sub}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11.5px] font-medium text-ink-muted">{k}</dt>
      <dd className="text-[12.5px] font-bold tabular-nums text-ink-strong">{v}</dd>
    </div>
  );
}

/** One day of the week — its code and what was actually worked on it. */
function DayChip({ ymd, code, minutes }: { ymd: string; code: string; minutes: number }) {
  // A weekly off or a holiday expects no hours, so showing "0h" against it would
  // read as a failure. Those chips carry their code alone.
  const expectsHours = code === "P" || code === "H/D" || code === "A";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-2 py-1 text-[10.5px] font-semibold text-ink-soft">
      <span className="text-ink-muted">{shortDate(ymd)}</span>
      <span className="font-black text-ink-strong">{code}</span>
      {expectsHours ? (
        <span className="tabular-nums text-ink-subtle">{hoursLabel(minutes)}</span>
      ) : null}
    </span>
  );
}
