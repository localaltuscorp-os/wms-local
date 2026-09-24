"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, UserRound, X } from "lucide-react";

/**
 * "VIEWING: <NAME>" — the compact employee switcher on the Incentive dashboard.
 *
 * ── IT NAVIGATES, IT DOES NOT FETCH ────────────────────────────────────────
 * Selecting somebody writes `?emp=<id>` and lets the SERVER re-render. That is
 * the whole reason the view cannot be forged: the id travels as a URL
 * parameter, the server narrows the already-resolved scope to it (see
 * `narrowToEmployee` in lib/incentive/analytics/viewer.ts) and refuses ids
 * outside it, and nothing about the answer is computed in the browser. A client
 * fetch would have to carry the id to the same server action anyway, with one
 * more place for the two to disagree.
 *
 * ── SELF IS THE ABSENCE OF THE PARAMETER ───────────────────────────────────
 * Choosing yourself REMOVES `emp` rather than setting it to your own id. That
 * keeps an ordinary dashboard's URL clean, and it means a link without the
 * parameter always means "whoever opened it" — which is what a shared link to
 * `/incentive` has always meant.
 *
 * Every other query parameter is preserved, so switching employee keeps the tab,
 * the period and the request you were looking at.
 *
 * ── DRAWN ONLY WHEN THERE IS SOMEBODY TO SWITCH TO ─────────────────────────
 * The page decides. An ordinary employee gets an empty `people` list and this
 * component renders nothing at all — the brief's "do not show the employee
 * selector" — and their title names them instead.
 */

export interface EmployeeViewerProps {
  /** Readonly because it arrives straight off the server's analytics payload. */
  people: readonly { id: string; name: string }[];
  /** "" when the viewer is looking at themselves. */
  selectedId: string;
  viewerId: string;
  /** The query parameter to write. Injected so the two sides cannot drift. */
  param: string;
}

export function EmployeeViewer({ people, selectedId, viewerId, param }: EmployeeViewerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Displayed name: the selected colleague, else the viewer's own row, else the
  // viewer's fallback label. `people` is ordered self-first by the server.
  const self = people.find((p) => p.id === viewerId) ?? null;
  const selected = selectedId ? (people.find((p) => p.id === selectedId) ?? null) : self;
  const viewingSelf = !selectedId || selectedId === viewerId;

  // Close on Escape, matching every other dismissible surface in the app, and
  // on a click outside so the popover cannot be left open over the page.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Focus the search box when the popover opens, so a keyboard user can type a
  // name immediately rather than tabbing into it.
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  function choose(id: string) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (id === viewerId) next.delete(param);
    else next.set(param, id);
    const qs = next.toString();
    setOpen(false);
    router.push((qs ? `${pathname}?${qs}` : pathname) as never);
  }

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? people.filter((p) => p.name.toLowerCase().includes(needle))
    : people;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose whose incentive dashboard to view"
        className="inline-flex max-w-[260px] items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-[#E10600]/40"
      >
        <UserRound size={14} strokeWidth={2.6} className="shrink-0 text-ink-subtle" aria-hidden />
        <span className="truncate">
          <span className="font-semibold text-ink-subtle">Viewing:</span>{" "}
          <span className="text-ink-strong">
            {selected?.name ?? (viewingSelf ? "You" : "—")}
          </span>
        </span>
        <ChevronDown size={14} strokeWidth={2.8} className="ml-auto shrink-0 text-ink-subtle" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="View another employee"
          className="absolute right-0 z-50 mt-1.5 w-[288px] overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.10)] bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.28)]"
        >
          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
            <Search size={13} strokeWidth={2.8} className="shrink-0 text-ink-subtle" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employees…"
              className="w-full bg-transparent text-[13px] font-semibold text-ink-strong outline-none placeholder:font-medium placeholder:text-ink-subtle"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="shrink-0 text-ink-subtle hover:text-ink-strong"
              >
                <X size={13} strokeWidth={2.8} />
              </button>
            )}
          </div>

          <div className="max-h-[264px] overflow-y-auto py-1">
            {matches.map((p) => {
              const isSelf = p.id === viewerId;
              const isActive = isSelf ? viewingSelf : selectedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => choose(p.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-[rgba(15,23,42,0.04)]"
                  style={isActive ? { background: "rgba(225,6,0,0.06)", color: "#A80400" } : undefined}
                >
                  <span className="truncate">{p.name}</span>
                  {isSelf && (
                    <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">
                      You
                    </span>
                  )}
                </button>
              );
            })}
            {matches.length === 0 && (
              <p className="px-3 py-3 text-[12.5px] font-semibold text-ink-subtle">
                No employee matches “{query}”.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
