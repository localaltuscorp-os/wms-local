"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import {
  JD_TARGETS,
  JD_TARGET_LABELS,
  type JdTarget,
  type TargetPeople,
} from "@/lib/jd/assignment-targets";
import type { JdEventOption } from "@/lib/queries/job-description";

/** One tickable line in a box: a person, or (Event Checklist) an event. */
interface BoxOption {
  id: string;
  label: string;
  /** Second, quieter text — the event's date. */
  sub?: string | null;
}

/** What a box calls the things it lists. */
interface BoxWords {
  search: string;
  noMatch: (q: string) => string;
  /** Footer when nothing is ticked. */
  none: string;
  /** "…and choose who does it." / "…and choose the events." */
  offHint: string;
  held: (n: number) => string;
  /** The list itself is empty. */
  emptyList: string;
}

const PEOPLE_WORDS: BoxWords = {
  search: "Search people…",
  noMatch: (q) => `Nobody matches “${q}”.`,
  /* Not "none": an empty roster is a legitimate answer meaning the seat's
     holder does it, and calling that "none" reads as an omission. */
  none: "By position",
  offHint: "choose who does it",
  held: (n) => `${n} ${n === 1 ? "person is" : "people are"} still selected here and will be saved if you tick it back on.`,
  emptyList: "No active employees.",
};

/* THE EVENT CHECKLIST LISTS EVENTS, NOT PEOPLE (account holder, 2026-09-18).
   Ticking an event puts this job into that event's checklist as a row, where
   the event's own Doer column says who does it there. */
const EVENT_WORDS: BoxWords = {
  search: "Search events…",
  noMatch: (q) => `No event matches “${q}”.`,
  none: "No event chosen",
  offHint: "choose the events",
  held: (n) => `${n} ${n === 1 ? "event is" : "events are"} still selected here and will be saved if you tick it back on.`,
  emptyList: "No upcoming event checklists. Create one in Operations → Event Checklist.",
};

const fmtEventDate = (ymd: string | null) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const ACCENT = "#B91C1C";

/**
 * WHERE THIS JOB GOES, AND WHO DOES IT THERE — three boxes, side by side.
 *
 * ── WHY THE PEOPLE LIVE INSIDE THE DESTINATION BOX ───────────────────────
 * The form used to ask two separate questions: tick the destinations, then pick
 * "Assigned Person(s)" from one list underneath. That shape cannot express the
 * ordinary case — the tea round goes to the DCC for the office boy and to the
 * WMS for whoever is covering reception — so the single list was really "these
 * people, for all of it", and anybody needing otherwise made two job
 * descriptions saying the same thing.
 *
 * Each box now owns its own roster. A person can appear in two of them; they
 * are stored as ONE assignment with two flags, so nobody receives the same task
 * twice (see lib/jd/assignment-targets.ts).
 *
 * ── A BOX THAT IS SWITCHED OFF KEEPS ITS NAMES AND SAVES NONE ────────────
 * Un-ticking a destination greys its roster rather than clearing it: people
 * un-tick to check something and tick straight back, and losing a list of six
 * names to that is a bad trade. What is SAVED is only what is switched on — an
 * assignment to a destination this job does not go to is a row that does
 * nothing until somebody ticks the box months later and is surprised by who
 * receives the work.
 *
 * ── LAYOUT ───────────────────────────────────────────────────────────────
 * `row` is the three-across form layout and stacks to one column on a phone.
 * `stack` is for the detail drawer, which is 560px wide — three columns there
 * would be three unusable columns.
 */
export function ModuleAssignBoxes({
  people,
  enabled,
  onToggleTarget,
  selected,
  onChangeTarget,
  events = [],
  selectedEvents = [],
  onChangeEvents,
  layout = "row",
  readOnly = false,
}: {
  people: { id: string; name: string }[];
  /** Which destinations this JD pushes to. */
  enabled: Record<JdTarget, boolean>;
  onToggleTarget: (target: JdTarget, on: boolean) => void;
  /** Employee ids chosen per destination (DCC and WMS; the Event box lists events). */
  selected: TargetPeople;
  onChangeTarget: (target: JdTarget, ids: string[]) => void;
  /** The live event checklists — the Event Checklist box's options. */
  events?: JdEventOption[];
  /** Event checklist (run) ids chosen. */
  selectedEvents?: string[];
  onChangeEvents?: (ids: string[]) => void;
  layout?: "row" | "stack";
  readOnly?: boolean;
}) {
  const peopleOptions = React.useMemo<BoxOption[]>(
    () => people.map((p) => ({ id: p.id, label: p.name })),
    [people],
  );
  const eventOptions = React.useMemo<BoxOption[]>(
    () => events.map((e) => ({ id: e.id, label: e.title, sub: fmtEventDate(e.eventDate) })),
    [events],
  );
  return (
    <div
      className={
        layout === "row"
          ? "grid gap-4 md:grid-cols-3"
          : "flex flex-col gap-3"
      }
    >
      {JD_TARGETS.map((target) =>
        target === "event" ? (
          <AssignBox
            key={target}
            target={target}
            options={eventOptions}
            words={EVENT_WORDS}
            on={enabled.event}
            onToggle={(v) => onToggleTarget("event", v)}
            selected={selectedEvents}
            onChange={(ids) => onChangeEvents?.(ids)}
            compact={layout === "stack"}
            readOnly={readOnly}
          />
        ) : (
          <AssignBox
            key={target}
            target={target}
            options={peopleOptions}
            words={PEOPLE_WORDS}
            on={enabled[target]}
            onToggle={(v) => onToggleTarget(target, v)}
            selected={selected[target]}
            onChange={(ids) => onChangeTarget(target, ids)}
            compact={layout === "stack"}
            readOnly={readOnly}
          />
        ),
      )}
    </div>
  );
}

function AssignBox({
  target,
  options,
  words,
  on,
  onToggle,
  selected,
  onChange,
  compact,
  readOnly,
}: {
  target: JdTarget;
  options: BoxOption[];
  words: BoxWords;
  on: boolean;
  onToggle: (on: boolean) => void;
  selected: string[];
  onChange: (ids: string[]) => void;
  compact: boolean;
  readOnly: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const label = JD_TARGET_LABELS[target];
  const toggleId = `jd-target-${target}`;
  const searchId = `jd-search-${target}`;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const chosen = new Set(selected);
  // Only what is still on offer counts — an event since completed drops out.
  const chosenCount = options.filter((o) => chosen.has(o.id)).length;

  function toggleOption(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // List order, not click order: a list that reshuffles as you tick it is a
    // list you lose your place in.
    onChange(options.filter((o) => next.has(o.id)).map((o) => o.id));
  }

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-colors ${
        on ? "border-slate-300" : "border-slate-200"
      }`}
      style={on ? { borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}22` } : undefined}
    >
      {/* ── The destination toggle ─────────────────────────────────────────
          The whole strip is the label, so the hit area is the width of the box
          rather than a 16px square. */}
      <label
        htmlFor={toggleId}
        className={`flex cursor-pointer items-start gap-2.5 border-b px-3.5 py-3 ${
          on ? "border-slate-200 bg-[#FEF2F2]" : "border-slate-200 bg-slate-50"
        } ${readOnly ? "cursor-default" : ""}`}
      >
        <input
          id={toggleId}
          type="checkbox"
          checked={on}
          disabled={readOnly}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#B91C1C] disabled:cursor-default"
        />
        <span
          className={`text-[13px] font-bold leading-snug ${
            on ? "text-slate-900" : "text-slate-500"
          }`}
        >
          {label}
        </span>
      </label>

      {/* ── Its roster ─────────────────────────────────────────────────────── */}
      {on ? (
        <>
          <div className="relative border-b border-slate-100 px-3 py-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id={searchId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={words.search}
              aria-label={`${words.search.replace("…", "")} for ${label}`}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-7 text-[12.5px] text-slate-800 placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div
            className={`table-scroll overflow-y-auto ${compact ? "max-h-[168px]" : "max-h-[228px]"}`}
          >
            {matches.length === 0 ? (
              <p className="px-3.5 py-4 text-center text-[12.5px] text-slate-400">
                {query ? words.noMatch(query) : words.emptyList}
              </p>
            ) : (
              <ul className="flex flex-col py-1">
                {matches.map((o) => {
                  const isOn = chosen.has(o.id);
                  return (
                    <li key={o.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-1.5 text-[12.5px] hover:bg-slate-50 ${
                          isOn ? "font-semibold text-slate-900" : "text-slate-600"
                        } ${readOnly ? "cursor-default" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          disabled={readOnly}
                          onChange={() => toggleOption(o.id)}
                          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[#B91C1C] disabled:cursor-default"
                        />
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {o.sub && <span className="shrink-0 text-[11px] font-normal text-slate-400">{o.sub}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="mt-auto flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3.5 py-2 text-[11.5px]">
            <span className={chosenCount > 0 ? "font-semibold text-slate-700" : "text-slate-400"}>
              {chosenCount > 0 ? `${chosenCount} selected` : words.none}
            </span>
            {chosenCount > 0 && !readOnly && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-semibold text-slate-500 hover:text-slate-800"
              >
                Clear
              </button>
            )}
          </footer>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-center px-3.5 py-6">
          <p className="text-[12.5px] leading-relaxed text-slate-400">
            Tick the box to send this job to {JD_TARGET_LABELS[target]} and {words.offHint}.
          </p>
          {chosenCount > 0 && (
            /* The choices are still held — say so, or somebody re-ticks expecting
               an empty list and finds six they forgot about. */
            <p className="mt-2 text-[11.5px] font-semibold text-amber-700">{words.held(chosenCount)}</p>
          )}
        </div>
      )}
    </section>
  );
}
