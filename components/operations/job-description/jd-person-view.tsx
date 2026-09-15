"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Plus, Search, UserRound, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { describeRecurrence } from "@/lib/jd/recurrence";
import { allAssignedIds } from "@/lib/jd/assignment-targets";
import { FUNCTION_LABELS, type BusinessFunction } from "@/lib/org/functions";
import type { JdEntryRow, JdPositionRow } from "@/lib/queries/job-description";
import { setJdPositionHolder } from "@/app/(app)/operations/job-description/actions";
import { JdBulkUpload } from "@/components/operations/job-description/jd-bulk-upload";
import type { SeatHolder } from "@/components/operations/job-description/jd-detail";

/**
 * JD FOR A SPECIFIC PERSON (account holder, 2026-09-15).
 *
 * People on the left — searchable, with how many tasks each carries — and the
 * chosen person's whole Job Description on the right:
 *   · FROM THEIR POSITION — the General JD of the seat they sit in (set here)
 *   · ASSIGNED BY NAME   — General JDs from other seats given to them by name
 *   · PERSONAL           — tasks written for them alone, which belong to no seat
 * Personal tasks are added one at a time or from Excel, for this person only.
 */

const ACCENT = "#B91C1C";

type PeopleFilter = "all" | "personal" | "noseat";
const FILTERS: { id: PeopleFilter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "personal", label: "Has personal JD" },
  { id: "noseat", label: "No seat" },
];

function bump(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function JdPersonView({
  entries,
  positions,
  holders,
  people,
  onOpen,
  renderForm,
  initialPersonId = null,
}: {
  entries: JdEntryRow[];
  positions: JdPositionRow[];
  holders: SeatHolder[];
  people: { id: string; name: string }[];
  onOpen: (entryId: string) => void;
  /** The New JD form in personal mode — rendered by the Bank, which owns it. */
  renderForm: (person: { id: string; name: string }, onDone: () => void) => React.ReactNode;
  /** Open on this person (e.g. from `?person=`). */
  initialPersonId?: string | null;
}) {
  const router = useRouter();
  const [personId, setPersonId] = React.useState(() =>
    initialPersonId && people.some((p) => p.id === initialPersonId) ? initialPersonId : (people[0]?.id ?? ""),
  );
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<PeopleFilter>("all");
  const [adding, setAdding] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const positionTitle = React.useMemo(() => new Map(positions.map((p) => [p.id, p.title])), [positions]);
  const seatOf = React.useMemo(() => new Map(holders.map((h) => [h.employeeId, h.positionId])), [holders]);

  /* Task counts for every person in one pass over the register, so the list
     does not re-scan every entry for every name. */
  const countsFor = React.useMemo(() => {
    const byPosition = new Map<string, number>();
    const personal = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const e of entries) {
      if (!e.isActive) continue;
      if (e.ownerEmployeeId) {
        bump(personal, e.ownerEmployeeId);
        continue;
      }
      if (e.positionId) bump(byPosition, e.positionId);
      for (const id of new Set(allAssignedIds(e.targetPeople))) {
        if (seatOf.get(id) !== e.positionId) bump(byName, id);
      }
    }
    return (id: string) => {
      const seat = seatOf.get(id);
      const s = seat ? (byPosition.get(seat) ?? 0) : 0;
      const p = personal.get(id) ?? 0;
      const n = byName.get(id) ?? 0;
      return { seat: s, personal: p, byName: n, total: s + p + n };
    };
  }, [entries, seatOf]);

  const q = query.trim().toLowerCase();
  const list = people.filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (filter === "all" || (filter === "personal" ? countsFor(p.id).personal > 0 : !seatOf.has(p.id))),
  );

  function pick(id: string) {
    setPersonId(id);
    setAdding(false);
    // Keep the open person in the address bar, so it can be shared or reloaded.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("person", id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* the address bar is a convenience */
    }
  }

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
    <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${people.length} people`}
            aria-label="Search people"
            className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-[13px]"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                filter === f.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ul className="flex max-h-[62vh] flex-col gap-0.5 overflow-y-auto">
          {list.map((p) => {
            const c = countsFor(p.id);
            const pSeat = seatOf.get(p.id);
            const active = p.id === personId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    active ? "bg-red-50 ring-1 ring-red-200" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                    {initials(p.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-slate-800">{p.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {pSeat ? (positionTitle.get(pSeat) ?? "—") : "No seat"}
                    </span>
                  </span>
                  {c.total > 0 && (
                    <span
                      className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600"
                      title={`${c.seat} from seat · ${c.byName} by name · ${c.personal} personal`}
                    >
                      {c.total}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="px-2 py-4 text-[12.5px] text-slate-500">No one matches.</li>}
        </ul>
      </aside>

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
                onClick={() => setAdding((a) => !a)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-white"
                style={{ background: ACCENT }}
              >
                {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {adding ? "Close" : "Add personal task"}
              </button>
            </div>
          </div>

          {adding && renderForm(person, () => setAdding(false))}

          <Section
            title={seat ? `From their position — ${seat.title}` : "From their position"}
            empty={seat ? "This position has no active JDs yet." : `${person.name} isn't placed in a position. Pick their seat above to bring in its General JD.`}
            rows={fromSeat}
            onOpen={onOpen}
          />
          <Section title="Assigned to them by name" empty="Nothing from other positions is assigned to them by name." rows={byName} onOpen={onOpen} />
          <Section
            title={`Personal JD — ${person.name}`}
            empty="No personal tasks yet. Add one, or bulk upload from Excel."
            rows={personal}
            onOpen={onOpen}
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

function Section({
  title,
  empty,
  rows,
  onOpen,
  personal = false,
}: {
  title: string;
  empty: string;
  rows: JdEntryRow[];
  onOpen: (entryId: string) => void;
  personal?: boolean;
}) {
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
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2">Serial</th>
                <th className="px-4 py-2">Task</th>
                <th className="px-4 py-2">Function</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Frequency</th>
                <th className="px-4 py-2 text-right">Time</th>
                <th className="px-4 py-2">Add to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => onOpen(e.id)} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50/60 ${e.isActive ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-400">{e.serialNo}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{e.task}</td>
                  <td className="px-4 py-2 text-slate-600">{FUNCTION_LABELS[e.functionKey as BusinessFunction] ?? e.functionKey}</td>
                  <td className="px-4 py-2 text-slate-600">{e.category ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{describeRecurrence(e.recurrence)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{e.estimatedMinutes}m</td>
                  <td className="px-4 py-2 text-slate-600">{[e.pushDcc && "DCC", e.pushWms && "WMS", e.pushEvent && "Event"].filter(Boolean).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
