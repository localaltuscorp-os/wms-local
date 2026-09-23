import { formatDate, localDateString } from "@/lib/format";

/**
 * Today, as the calendar day the rest of the app compares against. The same
 * mechanism as `todayIst()` (`en-CA` in Asia/Kolkata, which formats YYYY-MM-DD),
 * but taken from `lib/format` so the Employee Master does not have to import the
 * incentive module to find out what day it is.
 */
export function istToday(now: Date = new Date()): string {
  return localDateString("Asia/Kolkata", now);
}

/**
 * PROBATION END DATE — the date, and the state it implies.
 *
 * ── THE DATE IS NEVER REPLACED BY THE WORD ─────────────────────────────────
 * When probation is over, the tempting thing to render is "Completed". That
 * would destroy the record: the date is historical HR data, it is what an audit
 * asks for, and it is the only thing that says WHEN the probation ended. So the
 * date is always printed and the tag sits beside it. Never `Completed` alone.
 *
 * ── THE STATE IS DERIVED, NEVER STORED ─────────────────────────────────────
 * There is no "probation completed" column and there must not be one: two
 * sources for one fact is how a row ends up saying "On Probation" beside a date
 * that passed two years ago. `probationEnd >= today` is the whole rule, using the
 * same IST calendar day the rest of the app compares against
 * (`todayIst()`), and the comparison is a plain ISO string compare — which is
 * exact for YYYY-MM-DD and has no timezone arithmetic to get wrong.
 *
 * ── GREEN FOR COMPLETED ────────────────────────────────────────────────────
 * Blue and green both read as "done" in this app; green is the one its status
 * language already uses for a finished, good state (the incentive module's
 * approved/paid tone, the employee master's own active dot), while blue is
 * "Due" in the incentive workflow. So completed is green, and probation still
 * running is amber — the same amber the existing Probation tag uses.
 */

export function ProbationCell({
  probationEnd,
  today,
}: {
  /** `yyyy-mm-dd`, or null when HR has not recorded one. */
  probationEnd: string | null;
  /** Today in IST (`todayIst()`), passed in so the server and the client agree. */
  today: string;
}) {
  // NOT RECORDED. This is the state the required-date rule blocks on, so it says
  // so plainly and in the interface's warning colour — a blank cell would read
  // as "no probation", which is the opposite of "nobody has filled this in".
  if (!probationEnd) {
    return (
      <span
        className="inline-flex rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
        style={{ background: "var(--color-red-bg, #fee2e2)", color: "var(--color-red-deep, #b91c1c)" }}
      >
        Not set — required
      </span>
    );
  }

  const completed = probationEnd < today;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="text-[12.5px] text-ink-soft tabular-nums">{formatDate(probationEnd)}</span>
      <span
        className="inline-flex rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide"
        style={
          completed
            ? { background: "var(--color-green-bg, #d1fae5)", color: "var(--color-green-deep, #047857)" }
            : { background: "var(--color-amber-bg, #fef3e2)", color: "var(--color-amber-deep, #b45309)" }
        }
      >
        {completed ? "Completed" : "On Probation"}
      </span>
    </span>
  );
}
