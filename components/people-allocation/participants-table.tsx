"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, Check, ChevronDown, Trash2, AlertTriangle } from "lucide-react";
import {
  HH_DAYS,
  HH_PARTICIPANT_CALLS,
  HH_PARTICIPANT_MODULES,
  HH_ALL_PERSON_NAMES,
  hhParticipantModuleLabel,
} from "@/db/enums";
import { DateField } from "@/components/ui/date-field";
import {
  setParticipantDay,
  setParticipantProduct,
  setParticipantCall,
  setParticipantDuration,
  setParticipantName,
  deleteParticipant,
} from "@/app/(app)/people-allocation/actions";
import type { Participant } from "@/lib/queries/people-allocation";

/**
 * ALL PARTICIPANTS — every participant in the module, PS and BSS included.
 *
 * Columns read Module · Participant Name · Call · Duration · Day. Module comes
 * FIRST because it is what the list is scanned by. The engagement's dates stay
 * on the row and still drive the Period filter, but are not columns here.
 *
 * Sorting is a small "Sort ↑↓" menu, on Module and Participant Name only — the
 * two columns anyone scans by. A sort on Day or on a date would be a control
 * nobody asked for, and each one costs a reader something to ignore.
 *
 * Deleting appears only once something is ticked, is limited to Manan and
 * Ruchita, and asks before it acts. The button is hidden for everyone else and
 * the server refuses regardless — the hidden button is the courtesy, the server
 * check is the rule.
 */

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const RED = "var(--color-altus-red)";

const DELETE_CONFIRM =
  "Are you sure you want to delete the selected participant(s)? This action cannot be undone.";
const PERMISSION_NOTICE =
  "Only Manan and Ruchita can delete participants. Admin and Ruchita can edit; HR can add and view.";

/** Sorting is offered on these two columns and no others. */
type SortKey = "name" | "section";
type Direction = "asc" | "desc";

/**
 * Minutes ⇄ HH:MM. Stored as a quantity, shown as a clock — so 90 reads 01:30,
 * and both "1:30" and "01:30" mean the same thing on the way back in.
 */
const toHhMm = (m: number | null | undefined) =>
  m === null || m === undefined ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Types the colon FOR you, filling from the RIGHT — which is how a duration is
 * typed: the minutes are the last thing entered. 114 is one hour fourteen
 * (1:14), not eleven hours four; 1215 is 12:15.
 *
 * Left-to-right masking read "114" as 11:4 — the wrong number, and an
 * impossible one. Digits only, four at most: the field is a clock, not a sum.
 */
function maskHhMm(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(-4);
  if (!digits) return "";
  if (digits.length <= 2) return `0:${digits.padStart(2, "0")}`;
  return `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}`;
}

/** null = cleared; undefined = not a duration, so the caller can say so. */
function parseHhMm(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  // A bare "130" or "0130" — the colon was skipped, the meaning is not in doubt.
  const digits = /^(\d{3,4})$/.exec(text);
  if (digits) {
    const d = digits[1]!.padStart(4, "0");
    const mins = Number(d.slice(2));
    if (mins > 59) return undefined;
    return Number(d.slice(0, 2)) * 60 + mins;
  }
  return undefined;
}

const cellInput =
  "w-full rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1.5 text-[13px] tabular-nums text-ink-strong outline-none transition placeholder:text-ink-subtle focus:border-transparent focus:ring-2 focus:ring-[#E10600]/40";

const cellSelect =
  "w-full appearance-none rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1.5 pr-7 text-[13px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#E10600]/40";

const filterSelect =
  "appearance-none rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1.5 pr-7 text-[13px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#E10600]/40";

/** A native select that keeps the app's chevron rather than the OS one. */
function Chevroned({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative block ${className}`}>
      {children}
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
    </span>
  );
}

/**
 * Duration — typed, not picked. Held locally while being edited so a half-typed
 * "1:" is never sent, and committed on blur or Enter.
 */
function DurationCell({
  value,
  label,
  disabled,
  onCommit,
  onInvalid,
}: {
  value: number | null;
  label: string;
  disabled: boolean;
  onCommit: (minutes: number | null) => void;
  onInvalid: () => void;
}) {
  const [draft, setDraft] = React.useState(toHhMm(value));
  const [seen, setSeen] = React.useState(value);
  // Adopt a value changed elsewhere (a save landing) without fighting typing.
  if (seen !== value) {
    setSeen(value);
    setDraft(toHhMm(value));
  }

  function commit() {
    const parsed = parseHhMm(draft);
    if (parsed === undefined) {
      setDraft(toHhMm(value));
      onInvalid();
      return;
    }
    if (parsed === value) return;
    onCommit(parsed);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={cellInput}
      value={draft}
      disabled={disabled}
      placeholder="HH:MM"
      aria-label={label}
      onChange={(e) => setDraft(maskHhMm(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** The "Sort ↑↓" control and its menu. */
function SortControl({
  label,
  active,
  direction,
  onPick,
}: {
  label: string;
  active: boolean;
  direction: Direction;
  onPick: (d: Direction) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Sort ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-bold transition-colors hover:bg-black/5"
        style={{ color: active ? ACCENT_DEEP : "var(--color-ink-subtle)" }}
      >
        Sort <ArrowDownUp size={12} strokeWidth={2.6} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-[176px] overflow-hidden rounded-xl bg-surface-card py-1"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 18px 40px -20px rgba(15,23,42,0.35)" }}
        >
          <p className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            Sort direction
          </p>
          {(
            [
              { dir: "asc" as Direction, label: "A to Z" },
              { dir: "desc" as Direction, label: "Z to A" },
            ]
          ).map((o) => {
            const on = active && direction === o.dir;
            return (
              <button
                key={o.dir}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onPick(o.dir);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold text-ink-strong transition-colors hover:bg-black/5"
              >
                {o.label}
                {on && <Check size={14} strokeWidth={3} style={{ color: ACCENT }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ParticipantsTable({
  participants,
  canEdit,
  canDelete,
}: {
  participants: Participant[];
  /** Admin and Ruchita may change a row in place; HR reads it. */
  canEdit: boolean;
  /** Admin and Ruchita only — everyone else never sees a live Delete button. */
  canDelete: boolean;
}) {
  const [sort, setSort] = React.useState<{ key: SortKey; direction: Direction }>({
    key: "name",
    direction: "asc",
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  /** The rows a confirmed delete would remove. Empty = no dialog on screen. */
  const [confirming, setConfirming] = React.useState<Participant[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Filters: module, day, and a period over the engagement's own dates.
  const [moduleFilter, setModuleFilter] = React.useState("");
  const [dayFilter, setDayFilter] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const filtered = React.useMemo(
    () =>
      participants.filter((p) => {
        if (moduleFilter && (p.section ?? "") !== moduleFilter) return false;
        if (dayFilter && (p.day ?? "") !== dayFilter) return false;
        // Period overlaps the row's window: a row counts if it had not ended
        // before the period began, and had begun before the period ended.
        if (from && p.endDate && p.endDate < from) return false;
        if (to && p.startDate && p.startDate > to) return false;
        return true;
      }),
    [participants, moduleFilter, dayFilter, from, to],
  );

  const rows = React.useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "section") {
        // Unset modules sort last either way — "None" is not a value to rank.
        if (!a.section || !b.section) return (a.section ? 0 : 1) - (b.section ? 0 : 1);
        return hhParticipantModuleLabel(a.section).localeCompare(hhParticipantModuleLabel(b.section)) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    });
  }, [filtered, sort]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const filtersActive = Boolean(moduleFilter || dayFilter || from || to);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickSort(key: SortKey, direction: Direction) {
    setSort({ key, direction });
  }

  function clearFilters() {
    setModuleFilter("");
    setDayFilter("");
    setFrom("");
    setTo("");
  }

  function changeModule(row: Participant, section: string) {
    setError(null);
    startTransition(async () => {
      const res = await setParticipantProduct(row.id, section);
      if (!res.ok) setError(res.error);
    });
  }

  function changeName(row: Participant, name: string) {
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await setParticipantName(row.id, name);
      if (!res.ok) setError(res.error);
    });
  }

  function changeCall(row: Participant, callType: string) {
    setError(null);
    startTransition(async () => {
      const res = await setParticipantCall(row.id, callType);
      if (!res.ok) setError(res.error);
    });
  }

  function changeDuration(row: Participant, minutes: number | null) {
    setError(null);
    startTransition(async () => {
      const res = await setParticipantDuration(row.id, minutes);
      if (!res.ok) setError(res.error);
    });
  }

  function changeDay(row: Participant, day: string) {
    setError(null);
    startTransition(async () => {
      const res = await setParticipantDay(row.id, day);
      if (!res.ok) setError(res.error);
    });
  }

  function confirmDelete() {
    const targets = confirming;
    if (targets.length === 0) return;
    setError(null);
    startTransition(async () => {
      // One call per row: the action deletes one participant, and a failure
      // part-way leaves the rows it did remove removed rather than pretending.
      const failures: string[] = [];
      const done: string[] = [];
      for (const row of targets) {
        const res = await deleteParticipant(row.id);
        if (res.ok) done.push(row.id);
        else failures.push(res.error);
      }
      setSelected((s) => {
        const next = new Set(s);
        done.forEach((id) => next.delete(id));
        return next;
      });
      setConfirming([]);
      if (failures.length) setError(failures[0]!);
    });
  }

  const th = "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle";

  return (
    <section
      className="rounded-[22px] bg-surface-card p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label="All Participants"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-extrabold text-ink-strong">All Participants</h2>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <span
              className="rounded-pill px-3 py-1 text-[12.5px] font-bold"
              style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT_DEEP }}
            >
              {selected.size} selected
            </span>
          )}
          {/* Delete appears only once something is ticked, and only for those
              allowed to use it. Nothing to act on, nothing on screen. */}
          {selected.size > 0 &&
            (canDelete ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(selectedRows)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-black/5 disabled:opacity-40"
                style={{ color: RED, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${RED} 35%, transparent)` }}
              >
                <Trash2 size={14} /> Delete
              </button>
            ) : (
              /* Shown DISABLED rather than hidden: with nothing here, ticking a
                 row looked broken. Greyed out, it says the control exists and
                 is not yours. The server refuses regardless. */
              <span
                title={PERMISSION_NOTICE}
                aria-disabled
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold opacity-40"
                style={{ color: RED, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${RED} 35%, transparent)` }}
              >
                <Trash2 size={14} /> Delete
              </span>
            ))}
        </div>
      </div>

      {/* Module · Day · Period. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chevroned>
          <select
            className={`${filterSelect} w-[150px]`}
            value={moduleFilter}
            aria-label="Filter by module"
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="">All modules</option>
            {HH_PARTICIPANT_MODULES.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </Chevroned>
        <Chevroned>
          <select
            className={`${filterSelect} w-[150px]`}
            value={dayFilter}
            aria-label="Filter by day"
            onChange={(e) => setDayFilter(e.target.value)}
          >
            <option value="">All days</option>
            {HH_DAYS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.full}
              </option>
            ))}
          </select>
        </Chevroned>
        <span className="text-[12.5px] font-bold text-ink-subtle">Period</span>
        <DateField
          className={`${filterSelect} w-[150px]`}
          value={from}
          placeholder="Start date"
          aria-label="Period start date"
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-[12.5px] font-semibold text-ink-subtle">to</span>
        <DateField
          className={`${filterSelect} w-[150px]`}
          value={to}
          placeholder="End date"
          aria-label="Period end date"
          onChange={(e) => setTo(e.target.value)}
        />
        {filtersActive && (
          <>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:bg-black/5"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
            >
              Clear filters
            </button>
            <span className="text-[12.5px] font-semibold text-ink-subtle">
              {rows.length} of {participants.length}
            </span>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-[12.5px] font-semibold" style={{ color: RED }}>
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr style={{ background: "color-mix(in srgb, var(--color-ink-strong) 3%, transparent)" }}>
              <th className={`${th} w-[52px]`}>
                <input
                  type="checkbox"
                  aria-label="Select all participants"
                  className="h-4 w-4 accent-[#E10600]"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className={`${th} w-[80px]`}>Sr. No.</th>
              <th className={`${th} w-[180px]`}>
                <span className="inline-flex items-center gap-1.5">
                  Module
                  <SortControl
                    label="Module"
                    active={sort.key === "section"}
                    direction={sort.direction}
                    onPick={(d) => pickSort("section", d)}
                  />
                </span>
              </th>
              <th className={`${th} w-[240px]`}>
                <span className="inline-flex items-center gap-1.5">
                  Participant Name
                  <SortControl
                    label="Participant Name"
                    active={sort.key === "name"}
                    direction={sort.direction}
                    onPick={(d) => pickSort("name", d)}
                  />
                </span>
              </th>
              <th className={`${th} w-[170px]`}>Call</th>
              <th className={`${th} w-[110px]`}>Duration</th>
              <th className={`${th} w-[160px]`}>Day</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-hairline">
                <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-ink-subtle">
                  {participants.length === 0 ? "No participants yet." : "No participants match these filters."}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const ticked = selected.has(r.id);
                return (
                  <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-black/[0.02]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        className="h-4 w-4 accent-[#E10600]"
                        checked={ticked}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-subtle">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Chevroned className="w-[146px]">
                        <select
                          className={cellSelect}
                          value={r.section ?? ""}
                          aria-label={`Module for ${r.name}`}
                          disabled={pending || !canEdit}
                          onChange={(e) => changeModule(r, e.target.value)}
                        >
                          <option value="">None</option>
                          {HH_PARTICIPANT_MODULES.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </Chevroned>
                    </td>
                    <td className="px-4 py-3">
                      <Chevroned className="w-full">
                        <select
                          className={cellSelect}
                          value={r.name}
                          aria-label={`Participant name for row ${i + 1}`}
                          disabled={pending || !canEdit}
                          onChange={(e) => changeName(r, e.target.value)}
                        >
                          {HH_ALL_PERSON_NAMES.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                          {/* A name entered before these rosters existed stays
                              selectable, so opening the list cannot rewrite it. */}
                          {!HH_ALL_PERSON_NAMES.includes(r.name) && <option value={r.name}>{r.name}</option>}
                        </select>
                      </Chevroned>
                    </td>
                    <td className="px-4 py-3">
                      <Chevroned className="w-[146px]">
                        <select
                          className={cellSelect}
                          value={r.callType ?? ""}
                          aria-label={`Call for ${r.name}`}
                          disabled={pending || !canEdit}
                          onChange={(e) => changeCall(r, e.target.value)}
                        >
                          <option value="">None</option>
                          {HH_PARTICIPANT_CALLS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </Chevroned>
                    </td>
                    <td className="px-4 py-3">
                      <DurationCell
                        value={r.durationMin}
                        label={`Call duration for ${r.name}`}
                        disabled={pending || !canEdit}
                        onCommit={(m) => changeDuration(r, m)}
                        onInvalid={() => setError("Enter the duration as HH:MM — 114 becomes 1:14, and minutes stop at 59.")}
                      />
                    </td>
                    {/* The day name, never a day number, and changeable in place. */}
                    <td className="px-4 py-3">
                      <Chevroned className="w-[136px]">
                        <select
                          className={cellSelect}
                          value={r.day ?? ""}
                          aria-label={`Day for ${r.name}`}
                          disabled={pending || !canEdit}
                          onChange={(e) => changeDay(r, e.target.value)}
                        >
                          <option value="">None</option>
                          {HH_DAYS.map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.full}
                            </option>
                          ))}
                        </select>
                      </Chevroned>
                    </td>
                    <td className="px-4 py-3">
                      {/* Nothing here until the row is ticked — the brief keeps
                          Delete behind a selection. */}
                      {ticked && canDelete ? (
                        <button
                          type="button"
                          aria-label={`Delete ${r.name}`}
                          disabled={pending}
                          onClick={() => setConfirming([r])}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-black/5 disabled:opacity-40"
                          style={{
                            color: RED,
                            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${RED} 35%, transparent)`,
                          }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      ) : ticked ? (
                        <span
                          title={PERMISSION_NOTICE}
                          aria-disabled
                          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold opacity-40"
                          style={{
                            color: RED,
                            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${RED} 35%, transparent)`,
                          }}
                        >
                          <Trash2 size={13} /> Delete
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-ink-subtle">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12.5px] font-semibold text-ink-subtle">{PERMISSION_NOTICE}</p>

      {confirming.length > 0 && (
        <ConfirmDelete
          rows={confirming}
          pending={pending}
          onCancel={() => setConfirming([])}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}

/** Nothing is deleted until "Yes, Delete" is pressed. */
function ConfirmDelete({
  rows,
  pending,
  onCancel,
  onConfirm,
}: {
  rows: Participant[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-6"
      style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm delete"
        className="wg-rise w-full max-w-[460px] rounded-[22px] bg-surface-card p-6"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 30px 70px -30px rgba(15,23,42,0.45)" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: `color-mix(in srgb, ${RED} 10%, transparent)`, color: RED }}
          >
            <AlertTriangle size={19} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-extrabold text-ink-strong">
              Delete {rows.length === 1 ? "participant" : `${rows.length} participants`}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-ink-soft">{DELETE_CONFIRM}</p>
            {/* Naming them is the last chance to notice the wrong tick. */}
            <p className="mt-1.5 text-[13px] font-bold text-ink-strong">
              {rows.map((r) => r.name).join(", ")}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="wg-btn rounded-xl px-6 py-2.5 text-[13.5px] font-bold"
            style={{
              background: "var(--color-surface-card)",
              color: "var(--color-ink-strong)",
              boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="wg-btn rounded-xl px-6 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
            style={{ background: RED }}
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
