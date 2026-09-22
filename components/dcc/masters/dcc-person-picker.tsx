"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";

/**
 * WHOSE DCC AM I LOOKING AT — a dropdown beside the heading (DCC-SPEC §4).
 *
 * Deliberately NOT a left rail of names. A rail costs a whole column on every
 * screen width to answer a question you ask once per visit, and on a phone it
 * either disappears or eats the page. This is the same call that was made for
 * Person-specific JD, and the two screens should feel the same.
 *
 * ── KEYBOARD ───────────────────────────────────────────────────────────────
 * Opens on click or Enter, filters as you type, ↑/↓ move, Enter picks, Escape
 * closes and returns focus to the button. The list is a real `listbox` with
 * `option` children so a screen reader announces the count and the selection.
 */

export interface PickerPerson {
  id: string;
  name: string;
  designation: string | null;
  /** How many compliances they carry — the number people actually scan for. */
  count: number;
}

export function DccPersonPicker({
  people,
  selectedId,
}: {
  people: PickerPerson[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const boxRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = people.find((p) => p.id === selectedId) ?? null;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || (p.designation ?? "").toLowerCase().includes(q),
    );
  }, [people, query]);

  /* The highlighted row is DERIVED against the filtered list rather than
     corrected in an effect after it changes: an effect here would render once
     with an index pointing past the end of the new list. */
  const activeIdx = matches.length === 0 ? -1 : Math.min(active, matches.length - 1);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(id: string) {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("person", id);
    next.set("tab", "person");
    router.push(`/dcc/masters?${next.toString()}`);
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = matches[activeIdx];
      if (p) pick(p.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setActive(0);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="inline-flex h-9 min-w-[220px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.name : "Pick a person"}
        </span>
        {selected && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-500">
            {selected.count}
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search people or positions"
              aria-label="Search people"
              aria-controls="dcc-person-list"
              className="h-6 w-full border-0 p-0 text-[13px] outline-none placeholder:text-slate-400"
            />
          </div>

          {/* A real scroll container, so a roster of 200 does not push the page
              height around and the list keeps its own scrollbar. */}
          <ul
            id="dcc-person-list"
            role="listbox"
            aria-label="People"
            className="max-h-[320px] overflow-y-auto py-1"
          >
            {matches.length === 0 && (
              <li className="px-3 py-3 text-[12.5px] text-slate-500">Nobody matches “{query}”.</li>
            )}
            {matches.map((p, i) => {
              const on = p.id === selectedId;
              return (
                <li key={p.id} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(p.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${
                      i === activeIdx ? "bg-slate-100" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800">{p.name}</span>
                      {p.designation && (
                        <span className="block truncate text-[11px] text-slate-500">
                          {p.designation}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      {p.count}
                    </span>
                    {on && <Check className="h-3.5 w-3.5 shrink-0 text-slate-700" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
