"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Plus, Repeat, UserRound, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { describeRecurrence } from "@/lib/jd/recurrence";
import { allAssignedIds } from "@/lib/jd/assignment-targets";
import type { PersonIndex } from "@/lib/jd/person-index";
import { formatDMY } from "@/lib/operations/checklist-dates";
import type { JdEntryRow, JdPositionRow } from "@/lib/queries/job-description";
import { setJdDoerNotes, setJdPositionHolder } from "@/app/(app)/operations/job-description/actions";
import { JdBulkUpload } from "@/components/operations/job-description/jd-bulk-upload";
import { nextDueDates, type SeatHolder } from "@/components/operations/job-description/jd-detail";
import { useJdRosters } from "@/components/operations/job-description/jd-rosters";
import { useAutoHeight } from "@/components/ui/use-auto-height";

/**
 * JD FOR A SPECIFIC PERSON (account holder, 2026-09-15).
 *
 * The chosen person's whole Job Description, in three sections:
 *   · FROM THEIR POSITION — the Master JD of the seat they sit in (set here)
 *   · ASSIGNED BY NAME   — Master JDs from other seats given to them by name
 *   · PERSONAL           — tasks written for them alone, which belong to no seat
 * Personal tasks are added one at a time or from Excel, for this person only.
 *
 * WHO is chosen is NOT decided here. The picker was a 280px column down the
 * left of this component until 2026-09-16; it is now a dropdown beside the page
 * heading (JdPersonPicker), which is above this component in the tree. So this
 * takes `personId` as a prop and reports changes upward — the seat dropdown
 * below still changes a person's seat, which is a different thing entirely.
 */

const ACCENT = "#B91C1C";

export function JdPersonView({
  entries,
  positions,
  holders,
  people,
  onOpen,
  renderForm,
  personId,
  index,
}: {
  entries: JdEntryRow[];
  positions: JdPositionRow[];
  holders: SeatHolder[];
  people: { id: string; name: string }[];
  onOpen: (entryId: string) => void;
  /** The New JD form in personal mode — rendered by the Bank, which owns it. */
  renderForm: (person: { id: string; name: string }, onDone: () => void) => React.ReactNode;
  /** Whose JD to show. Chosen by the picker beside the page heading. */
  personId: string;
  /** Seats and task counts, computed once above and shared with the picker. */
  index: PersonIndex;
}) {
  const router = useRouter();
  const [addingFor, setAddingFor] = React.useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const seatOf = index.seatOf;

  /* The add-a-task form belongs to ONE person. Storing whose it is, rather than
     a bare boolean reset by an effect, means moving the picker to somebody else
     closes it as a matter of arithmetic — no render where the form is still
     open and headed with the previous person's name. */
  const adding = addingFor === personId;

  const person = people.find((p) => p.id === personId) ?? null;
  const seatId = seatOf.get(personId) ?? "";
  const seat = positions.find((p) => p.id === seatId) ?? null;

  const fromSeat = entries.filter((e) => e.isActive && seatId !== "" && e.positionId === seatId);
  const byName = entries.filter(
    (e) => e.isActive && !e.ownerEmployeeId && e.positionId !== seatId && allAssignedIds(e.targetPeople).includes(personId),
  );
  const personal = entries.filter((e) => e.ownerEmployeeId === personId);
  const activeRows = [...fromSeat, ...byName, ...personal.filter((e) => e.isActive)];
  const minutes = activeRows.reduce((s, e) => s + e.estimatedMinutes, 0);

  async function changeSeat(positionId: string) {
    setBusy(true);
    try {
      const res = await setJdPositionHolder({ employeeId: personId, positionId: positionId || null });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: positionId ? "Seat updated." : "Removed from their seat.", type: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (people.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-[14px] text-slate-500">No employees to show.</p>;
  }

  return (
    /* One column. The people list used to be a 280px rail here; it is now the
       dropdown beside the page heading, so the JD gets the whole width. */
    <div className="min-w-0">
      {person ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="min-w-[180px]">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Job Description of</span>
              <span className="block text-[18px] font-bold text-slate-900">{person.name}</span>
            </div>
            <label className="min-w-[240px]">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Position (seat)</span>
              <span className="flex items-center gap-2">
                <select value={seatId} disabled={busy} onChange={(e) => void changeSeat(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]">
                  <option value="">No seat</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              </span>
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-[12.5px] font-semibold tabular-nums text-slate-700">
                {activeRows.length} task{activeRows.length === 1 ? "" : "s"} · {minutes} min
              </span>
              <button type="button" onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
                <FileSpreadsheet className="h-4 w-4" /> Bulk upload for {person.name.split(" ")[0]}
              </button>
              <button
                type="button"
                onClick={() => setAddingFor((cur) => (cur === personId ? null : personId))}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: ACCENT }}
              >
                {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {adding ? "Close" : "Add personal task"}
              </button>
            </div>
          </div>

          {adding && renderForm(person, () => setAddingFor(null))}

          <Section
            title={seat ? `From their position — ${seat.title}` : "From their position"}
            empty={seat ? "This position has no active JDs yet." : `${person.name} isn't placed in a position. Pick their seat above to bring in its Master JD.`}
            rows={fromSeat}
            onOpen={onOpen}
            personId={personId}
          />
          <Section
            title="Assigned to them by name"
            empty="Nothing from other positions is assigned to them by name."
            rows={byName}
            onOpen={onOpen}
            personId={personId}
          />
          <Section
            title={`Personal JD — ${person.name}`}
            empty="No personal tasks yet. Add one, or bulk upload from Excel."
            rows={personal}
            onOpen={onOpen}
            personId={personId}
            personal
          />

          <JdBulkUpload open={bulkOpen} onClose={() => setBulkOpen(false)} positions={positions} people={people} person={person} />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-[14px] text-slate-500">Pick a person on the left.</p>
      )}
    </div>
  );
}

/**
 * One section of a person's JD, in the column order the account holder set
 * (2026-09-18): S. No. · Client · Subject · Job Description · Target Date ·
 * Doer Notes.
 *
 * Target Date is the next day the job comes round, with its repeat underneath
 * in Google Calendar's words — the frequency itself belongs to the JD, which
 * the whole seat shares, so it is changed on the JD (click the row), not here.
 * Doer Notes are this person's own, written in place.
 */
function Section({
  title,
  empty,
  rows,
  onOpen,
  personId,
  personal = false,
}: {
  title: string;
  empty: string;
  rows: JdEntryRow[];
  onOpen: (entryId: string) => void;
  /** Whose JD this is — whose Doer Notes the last column holds. */
  personId: string;
  personal?: boolean;
}) {
  const rosters = useJdRosters();
  const canWriteNotes = rosters.viewerIsHr || rosters.viewerId === personId;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[13.5px] font-bold text-slate-900">
        {personal && <UserRound className="h-4 w-4" style={{ color: ACCENT }} />}
        {title}
        <span className="text-[12px] font-semibold text-slate-400">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-16 px-4 py-2 text-right">S. No.</th>
                <th className="w-44 px-4 py-2">Client</th>
                <th className="w-40 px-4 py-2">Subject</th>
                <th className="px-4 py-2">Job Description</th>
                <th className="w-52 px-4 py-2">Target Date</th>
                <th className="w-64 px-4 py-2">Doer Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => {
                const next = nextDueDates(e, 1, 400)[0] ?? null;
                return (
                  <tr
                    key={e.id}
                    onClick={() => onOpen(e.id)}
                    className={`cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50/60 ${e.isActive ? "" : "opacity-50"}`}
                  >
                    {/* The row's place; the permanent serial is on hover, as in the Bank. */}
                    <td className="px-4 py-2 text-right tabular-nums text-slate-400" title={`Serial ${e.serialNo}`}>
                      {i + 1}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{e.client ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2 text-slate-600">{e.category ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{e.task}</td>
                    <td className="px-4 py-2">
                      <span className={`block tabular-nums ${next ? "text-slate-700" : "text-slate-300"}`}>
                        {next ? formatDMY(next) : "—"}
                      </span>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-700">
                        <Repeat className="h-3 w-3" aria-hidden />
                        {describeRecurrence(e.recurrence)}
                      </span>
                    </td>
                    {/* Typing a note must not open the drawer. */}
                    <td className="px-4 py-2" onClick={(ev) => ev.stopPropagation()}>
                      <DoerNotesCell
                        jdId={e.id}
                        personId={personId}
                        value={e.doerNotes?.[personId] ?? null}
                        editable={canWriteNotes}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * This person's note against one JD. Saves on blur or Enter (Shift+Enter is a
 * new line); Escape abandons the edit; clearing it removes the note.
 */
function DoerNotesCell({
  jdId,
  personId,
  value,
  editable,
}: {
  jdId: string;
  personId: string;
  value: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const current = value ?? "";
  const [draft, setDraft] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  const [busy, setBusy] = React.useState(false);
  if (seen !== current) {
    setSeen(current);
    setDraft(current);
  }
  const ref = React.useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, draft);

  if (!editable) {
    return (
      <span className={`whitespace-pre-wrap ${value ? "text-slate-700" : "text-slate-300"}`}>{value || "—"}</span>
    );
  }

  async function commit() {
    const next = draft.trim();
    if (next === current.trim()) return;
    setBusy(true);
    try {
      const res = await setJdDoerNotes({ jdId, employeeId: personId, notes: next || null });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        setDraft(current);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-start gap-1.5">
      <textarea
        ref={ref}
        rows={1}
      style={{ overflow: "hidden" }}
        value={draft}
        maxLength={4000}
        disabled={busy}
        placeholder="Add a note"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(current);
            e.currentTarget.blur();
          }
        }}
        className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-300 hover:border-slate-200 focus:border-slate-300 focus:bg-white"
      />
      {busy && <Loader2 className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />}
    </span>
  );
}
