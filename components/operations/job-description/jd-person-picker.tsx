"use client";

import * as React from "react";
import { Check, ChevronDown, Search, UserRound } from "lucide-react";
import { initialsOf, type PersonIndex } from "@/lib/jd/person-index";

/**
 * WHOSE JD AM I LOOKING AT — the person picker, beside the page heading.
 *
 * This was a 280px column down the left of the page until 2026-09-16. The
 * account holder asked for it as a dropdown instead: the list is twenty-odd
 * names that you touch once and then ignore, and it was taking a fifth of the
 * screen away from the JD itself, permanently.
 *
 * ── IT IS A COMBOBOX, NOT A <select> ─────────────────────────────────────────
 * A native select cannot carry the search box, the three filters, or the seat
 * and task-count under each name — and those are what make a list of twenty-odd
 * people usable. So it is built by hand, which means the keyboard has to be
 * built by hand too:
 *   ↑ ↓        move the highlight, scrolling it into view
 *   Enter      choose the highlighted person
 *   Escape     close and hand focus back to the button
 *   Tab / click-away  close
 * The trigger carries `aria-expanded` / `aria-controls`, the list is a
 * `listbox`, and each row an `option` with `aria-selected` — so it reads to a
 * screen reader as the select it replaces.
 *
 * Search focus is placed on open, because the whole point of opening it is
 * usually to type a name.
 */

export type PeopleFilter = "all" | "personal" | "noseat";

const FILTERS: { id: PeopleFilter; label: string; hint: string }[] = [
  { id: "all", label: "Everyone", hint: "Every employee" },
  { id: "personal", label: "Has personal JD", hint: "People with tasks written for them alone" },
  { id: "noseat", label: "No seat", hint: "People not placed in a position" },
];

export function JdPersonPicker({
  people,
  personId,
  onChange,
  index,
  positionTitle,
}: {
  people: { id: string; name: string }[];
  personId: string;
  onChange: (id: string) => void;
  index: PersonIndex;
  /** Position id → its title, for the line under each name. */
  positionTitle: Map<string, string>;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<PeopleFilter>("all");
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = people.find((p) => p.id === personId) ?? null;

  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (filter === "personal") return index.countsFor(p.id).personal > 0;
      if (filter === "noseat") return !index.seatOf.has(p.id);
      return true;
    });
  }, [people, query, filter, index]);

  /* Keep the highlight on a row that still exists. Typing narrows the list
     under it, and an index left pointing past the end makes Enter do nothing.
     DERIVED, not corrected by an effect: an effect would render one frame with
     the stale index, which is the frame Enter can land in. */
  const activeIdx = list.length === 0 ? -1 : Math.min(active, list.length - 1);

  // Close on a click outside, and on Escape from anywhere inside.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /* Focus the search box on open. Moving focus is a real DOM side effect, so it
     belongs in an effect — the highlight does not, and is seeded by `openNow`
     instead. The timeout waits for the popover to exist to receive focus. */
  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Keep the highlighted row visible while arrowing through a scrolled list.
  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  /** Open, with the highlight already on whoever is being shown. */
  function openNow() {
    const at = list.findIndex((p) => p.id === personId);
    setActive(at >= 0 ? at : 0);
    setOpen(true);
  }

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      const from = activeIdx < 0 ? 0 : activeIdx;
      setActive(e.key === "ArrowDown" ? (from + 1) % list.length : (from - 1 + list.length) % list.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const p = activeIdx >= 0 ? list[activeIdx] : undefined;
      if (p) choose(p.id);
    }
  }

  const counts = selected ? index.countsFor(selected.id) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openNow())}
        onKeyDown={(e) => {
          // Arrowing from the closed trigger opens it, as a select does.
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openNow();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="jd-person-listbox"
        aria-label={selected ? `Showing ${selected.name}. Change person` : "Choose a person"}
        className="inline-flex min-w-[260px] max-w-full items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
          {selected ? initialsOf(selected.name) : <UserRound className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Showing</span>
          <span className="block truncate text-[14px] font-bold text-slate-900">
            {selected ? selected.name : "Choose a person"}
          </span>
        </span>
        {counts && counts.total > 0 && (
          <span
            className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600"
            title={`${counts.seat} from seat · ${counts.byName} by name · ${counts.personal} personal`}
          >
            {counts.total}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          onKeyDown={onKeyDown}
          className="absolute right-0 z-50 mt-1.5 w-[330px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${people.length} people`}
                aria-label="Search people"
                aria-controls="jd-person-listbox"
                className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  title={f.hint}
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
          </div>

          {/* The scroller. max-h in rem rather than vh so the popover cannot
              grow taller than the screen on a laptop and lose its own footer. */}
          <ul
            ref={listRef}
            id="jd-person-listbox"
            role="listbox"
            aria-label="People"
            className="max-h-[22rem] overflow-y-auto overscroll-contain p-1.5"
          >
            {list.map((p, i) => {
              const c = index.countsFor(p.id);
              const seatId = index.seatOf.get(p.id);
              const isSelected = p.id === personId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(p.id)}
                    onPointerMove={() => setActive(i)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                      i === activeIdx ? "bg-slate-100" : ""
                    } ${isSelected ? "ring-1 ring-red-200" : ""}`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                      {initialsOf(p.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{p.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {seatId ? (positionTitle.get(seatId) ?? "—") : "No seat"}
                      </span>
                    </span>
                    {c.total > 0 && (
                      <span
                        className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600"
                        title={`${c.seat} from seat · ${c.byName} by name · ${c.personal} personal`}
                      >
                        {c.total}
                      </span>
                    )}
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-red-600" />}
                  </button>
                </li>
              );
            })}
            {list.length === 0 && (
              <li className="px-2 py-6 text-center text-[12.5px] text-slate-500">No one matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Keep the open person in the address bar, so the view can be shared or
 * reloaded. A convenience, never a source of truth — it is written with
 * `replaceState` so it adds nothing to the back button.
 */
export function rememberPersonInUrl(id: string): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("person", id);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* the address bar is a convenience */
  }
}
