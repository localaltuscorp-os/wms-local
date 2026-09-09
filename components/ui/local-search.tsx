"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

/**
 * LocalSearch — the ONE filter box for "narrow the thing on this page".
 *
 * The app had two kinds of magnifying glass and no way to tell them apart: the
 * global palette (⌘K, navigates away to another record) and a dozen per-page
 * filter inputs (never leave the page). Both were an unlabelled icon with a
 * placeholder like "Search…", so the only way to find out which one you had was
 * to type in it.
 *
 * So this one SAYS what it is. The placeholder is always "Local search — <what
 * it filters>", and the accessible name matches, which is the whole point of the
 * component existing rather than each page rolling its own input.
 *
 * Controlled: pages already own their query state and their own filtering, so
 * this deliberately does no filtering itself — swapping a page's bespoke input
 * for this one is a pure presentation change and cannot alter which rows match.
 */
export function LocalSearch({
  value,
  onChange,
  /** What this filters, e.g. "this table", "the cards below", "clients". */
  scope = "this table",
  className = "",
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  scope?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const label = `Local search — ${scope} only`;
  return (
    <div
      className={`flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-2.5 ${className}`}
    >
      <Search size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        autoFocus={autoFocus}
        className="w-full bg-transparent py-1.5 text-[13px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear the local search"
          className="shrink-0 rounded-full p-0.5 text-ink-subtle transition-colors hover:bg-black/[0.06] hover:text-ink-strong"
        >
          <X size={13} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}
