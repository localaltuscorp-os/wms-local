"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import {
  addAdHocHoliday,
  editAdHocHoliday,
  removeAdHocHoliday,
  type AdHocHolidayRow,
} from "./actions";
import { fireToast } from "@/lib/toast";

/**
 * Declare / correct / withdraw an ad-hoc holiday.
 *
 * Rendered ONLY for Ruchita and Rutvisha (the page decides), but that is
 * presentation: every action re-checks the same allow-list server-side, so
 * hiding the panel is a courtesy and not the control.
 *
 * The copy states the consequence plainly - this marks the day a holiday on
 * everyone's attendance - because the person clicking it is giving the whole
 * company a day off and should not have to infer that from a form.
 *
 * ── EDIT IS INLINE, ON THE ROW ─────────────────────────────────────────────
 * A holiday is one date and one name; a dialog for that is more chrome than
 * content, and the list is where you notice the typo. Editing swaps the row for
 * the same three fields the add form uses, so there is one mental model for
 * both. Only one row edits at a time — two open editors on a calendar where
 * dates must stay unique is a collision waiting to be saved twice.
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
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("add");
    const res = await addAdHocHoliday({ holidayDate: date, label, note });
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({
      message: `${label} added - it now shows as a holiday on everyone's attendance.`,
      type: "success",
    });
    setDate("");
    setLabel("");
    setNote("");
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
        <label className="hol-filter hol-adhoc-name">
          <span className="hol-filter-label">
            Note <span className="hol-adhoc-opt">optional</span>
          </span>
          <input
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why the day was declared"
            className="hol-select"
            aria-label="Ad-hoc holiday note (optional)"
          />
        </label>
        <button type="submit" disabled={busy === "add"} className="hol-adhoc-add">
          {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
          Add holiday
        </button>
      </form>

      {rows.length > 0 && (
        <ul className="hol-adhoc-list" role="list">
          {rows.map((r) =>
            editingId === r.id ? (
              <EditRow
                key={r.id}
                row={r}
                year={year}
                busy={busy === r.id}
                onCancel={() => setEditingId(null)}
                onSave={async (next) => {
                  if (busy) return;
                  setBusy(r.id);
                  const res = await editAdHocHoliday({ id: r.id, ...next });
                  setBusy(null);
                  if (!res.ok) return fireToast({ message: res.error, type: "error" });
                  fireToast({ message: `${next.label} updated.`, type: "success" });
                  setEditingId(null);
                  router.refresh();
                }}
              />
            ) : (
              <li key={r.id} className="hol-adhoc-row">
                <span className="hol-adhoc-date">{r.holidayDate}</span>
                <span className="hol-adhoc-label">
                  {r.label}
                  {r.note && <span className="hol-adhoc-note">{r.note}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(r.id)}
                  disabled={busy !== null}
                  aria-label={`Edit ${r.label}`}
                  className="hol-adhoc-del"
                >
                  <Pencil size={13} />
                </button>
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
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * One row, in edit mode.
 *
 * Its own component so the fields can be `useState`-initialised from the row
 * rather than synced to it in an effect — the state belongs to the identity of
 * the row being edited, and the parent only ever renders one at a time.
 */
function EditRow({
  row,
  year,
  busy,
  onSave,
  onCancel,
}: {
  row: AdHocHolidayRow;
  year: number;
  busy: boolean;
  onSave: (next: { holidayDate: string; label: string; note: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = React.useState(row.holidayDate);
  const [label, setLabel] = React.useState(row.label);
  const [note, setNote] = React.useState(row.note ?? "");

  return (
    <li className="hol-adhoc-row hol-adhoc-row-edit">
      <input
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        min={`${year}-01-01`}
        max={`${year}-12-31`}
        className="hol-select hol-adhoc-edit-date"
        aria-label={`Date for ${row.label}`}
      />
      <input
        type="text"
        required
        maxLength={120}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="hol-select"
        aria-label={`Name for ${row.label}`}
      />
      <input
        type="text"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="hol-select"
        aria-label={`Note for ${row.label}`}
      />
      <button
        type="button"
        onClick={() => void onSave({ holidayDate: date, label, note })}
        disabled={busy}
        aria-label={`Save ${row.label}`}
        className="hol-adhoc-del"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        aria-label="Cancel editing"
        className="hol-adhoc-del"
      >
        <X size={13} />
      </button>
    </li>
  );
}
