"use client";

import * as React from "react";
import { Search } from "lucide-react";

/**
 * CollapsibleSearch — a local-search box that rests as just its magnifier and
 * opens to the full field on click.
 *
 * WHY A WRAPPER AND NOT A REPLACEMENT COMPONENT. There are 40 of these boxes
 * across the module and no two are styled quite alike: different widths, border
 * tokens, font sizes, some with a clear "×", some with a keyboard hint. Swapping
 * all of them for one shared input would have been a rewrite of 40 toolbars in
 * the same commit as a behaviour change, and any layout that came out wrong
 * would be indistinguishable from the new behaviour misbehaving. So this wraps
 * the existing markup and changes only WHEN it is on screen.
 *
 * THE OPEN STATE RENDERS `display: contents`, which is the whole trick: the
 * wrapper generates no box of its own, so the child sits in the parent's flex
 * row exactly as it did before — same `flex-1`, same gap, same width. An open
 * search is pixel-identical to what shipped before this component existed.
 *
 * ── IT CANNOT COLLAPSE WHILE IT IS FILTERING ───────────────────────────────
 * A collapsed box that still holds "deccan" would be a filter with no visible
 * cause: rows missing from the table and nothing on screen saying why. So
 * closing is refused whenever the input has text — clear it and it closes on
 * the next blur. This is the one rule that makes the pattern safe rather than a
 * trap, and it is why the component reads the input's value instead of taking
 * the query as a prop (40 call sites, 40 differently-named state variables).
 */
export function CollapsibleSearch({
  children,
  /** Names what gets searched, e.g. "tasks", "people". */
  scope = "this page",
  /** Extra classes for the COLLAPSED button only. */
  className = "",
}: {
  children: React.ReactNode;
  scope?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const label = `Local search — ${scope}`;

  // Focus the field the click was asking for. Without this the box opens and
  // the caret is still wherever it was, so every open costs a second click.
  React.useEffect(() => {
    if (open) box.current?.querySelector("input")?.focus();
  }, [open]);

  /** Close ONLY when empty — see the header note about hidden filters. */
  const closeIfEmpty = React.useCallback(() => {
    const input = box.current?.querySelector("input");
    if (!input || input.value.trim() === "") setOpen(false);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={false}
        title={label}
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-subtle transition-colors hover:border-altus-red hover:text-altus-red ${className}`}
      >
        <Search size={16} strokeWidth={2.4} />
      </button>
    );
  }

  return (
    <div
      ref={box}
      style={{ display: "contents" }}
      // Capture-phase is deliberate: `contents` boxes still receive bubbled
      // events, but a child that stops propagation (several of these toolbars
      // do, to keep a row click from firing) would otherwise swallow the blur
      // and leave the box stuck open.
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeIfEmpty();
      }}
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") closeIfEmpty();
      }}
    >
      {children}
    </div>
  );
}
