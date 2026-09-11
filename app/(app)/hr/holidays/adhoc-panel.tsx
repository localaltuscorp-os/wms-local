"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { addAdHocHoliday, removeAdHocHoliday, type AdHocHolidayRow } from "./actions";
import { fireToast } from "@/lib/toast";

/**
 * Declare / withdraw an ad-hoc holiday.
 *
 * Rendered ONLY for Ruchita and Rutvisha (the page decides), but that is
 * presentation: every action re-checks the same allow-list server-side, so
 * hiding the panel is a courtesy and not the control.
 *
 * The copy states the consequence plainly - this marks the day a holiday on
 * everyone's attendance - because the person clicking it is giving the whole
 * company a day off and should not have to infer that from a form.
 */
export function AdHocHolidayPanel({
  year,
  rows,
}: {
  year: number;
  rows: AdHocHolidayRow[];
}) {
  const router = useRouter();
  const [date, setDate] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("add");
    const res = await addAdHocHoliday({ holidayDate: date, label });
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({
      message: `${label} added - it now shows as a holiday on everyone's attendance.`,
      type: "success",
    });
    setDate("");
    setLabel("");
    router.refresh();
  }

  async function remove(row: AdHocHolidayRow) {
    if (busy) return;
    if (!window.confirm(`Remove ${row.label} on ${row.holidayDate}? That day goes back to being a working day for everyone.`)) return;
    setBusy(row.id);
    const res = await removeAdHocHoliday({ id: row.id });
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: `${row.label} removed.`, type: "success" });
    router.refresh();
  }

  return (
    <section className="hol-adhoc no-print" aria-labelledby="hol-adhoc-title">
      <div className="hol-adhoc-head">
        <CalendarPlus size={16} strokeWidth={2.4} />
        <h2 id="hol-adhoc-title" className="hol-adhoc-title">Ad-hoc holiday</h2>
      </div>
      <p className="hol-adhoc-lead">
        A day off declared outside the published {year} calendar. Adding one marks that date a
        holiday on <strong>every employee&rsquo;s attendance</strong> for the month.
      </p>

      <form className="hol-adhoc-form" onSubmit={submit}>
        <label className="hol-filter">
          <span className="hol-filter-label">Date</span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={`${year}-01-01`}
            max={`${year}-12-31`}
            className="hol-select"
            aria-label="Ad-hoc holiday date"
          />
        </label>
        <label className="hol-filter hol-adhoc-name">
          <span className="hol-filter-label">Name</span>
          <input
            type="text"
            required
            maxLength={120}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Election Day"
            className="hol-select"
            aria-label="Ad-hoc holiday name"
          />
        </label>
        <button type="submit" disabled={busy === "add"} className="hol-adhoc-add">
          {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
          Add holiday
        </button>
      </form>

      {rows.length > 0 && (
        <ul className="hol-adhoc-list" role="list">
          {rows.map((r) => (
            <li key={r.id} className="hol-adhoc-row">
              <span className="hol-adhoc-date">{r.holidayDate}</span>
              <span className="hol-adhoc-label">{r.label}</span>
              <button
                type="button"
                onClick={() => remove(r)}
                disabled={busy === r.id}
                aria-label={`Remove ${r.label}`}
                className="hol-adhoc-del"
              >
                {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
