"use client";

import * as React from "react";
import { Search } from "lucide-react";

/**
 * CollapsibleSearch — a local-search box that rests as just its magnifier,
 * opens to the full field on click, and closes again on a click anywhere else.
 *
 * THE COLLAPSED BUTTON IS THE GLOBAL SEARCH BUTTON: same 36px square, same
 * radius, same borderless slate hover as the ⌘K trigger in the top bar. The two
 * are deliberately identical in rest state — one is in the top bar, one is in
 * the page's own header, and POSITION is what tells them apart (see the note in
 * app-top-bar.tsx). Giving the local one a border would make it read as a third
 * kind of search.
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
 * ── THE DOT IS NOT DECORATION ──────────────────────────────────────────────
 * Closing is unconditional: click anywhere off the box and it collapses, even
 * mid-query. That is what was asked for, and it leaves one hazard worth naming
 * — the query lives in the PAGE's state, not in here, so collapsing does not
 * clear it. The table stays filtered with the field that caused it off screen,
 * which is rows silently missing and nothing explaining why.
 *
 * So a collapsed box that is still filtering carries a red dot and says so in
 * its tooltip. It costs one element and turns an invisible filter into a
 * visible one; without it this pattern is a bug report waiting to happen.
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
  // Whether the field still held text when it closed. Read off the DOM at
  // collapse time rather than taken as a prop: 40 call sites, 40 differently
  // named query variables, and none of them need to know this component exists.
  const [filtering, setFiltering] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  const label = `Local search — ${scope}`;

  const collapse = React.useCallback(() => {
    const input = box.current?.querySelector("input");
    setFiltering(!!input && input.value.trim() !== "");
    setOpen(false);
  }, []);

  // Focus the field the click was asking for. Without this the box opens and
  // the caret is still wherever it was, so every open costs a second click.
  React.useEffect(() => {
    if (open) box.current?.querySelector("input")?.focus();
  }, [open]);

  // Click anywhere off the box closes it. `mousedown` rather than `click` so it
  // fires before the page's own handlers move focus around, and it still works
  // for a press that ends outside the window.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!box.current?.contains(e.target as Node | null)) collapse();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") collapse();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, collapse]);

  if (!open) {
    const title = filtering
      ? `${label} — a filter is still applied. Click to see or clear it.`
      : label;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        aria-expanded={false}
        title={title}
        className={`relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 ${className}`}
      >
        <Search className="size-5" strokeWidth={2.2} />
        {filtering && (
          <span
            aria-hidden
            className="absolute right-1 top-1 size-2 rounded-full ring-2 ring-white"
            style={{ background: "var(--color-altus-red, #E10600)" }}
          />
        )}
      </button>
    );
  }

  return (
    <div ref={box} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
