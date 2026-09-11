"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X, Maximize2, Minimize2 } from "lucide-react";

/**
 * Right-side drawer holding the full task record.
 *
 * Mounts ONLY when a row is clicked — there is no persistent reading pane, so
 * the table keeps the full width of the page (and with it the toolbar, group-by,
 * search, pagination and every column header) until the user asks for a record.
 *
 * `children` is the SERVER-rendered detail subtree for `?task=`, passed down
 * from the page. Closing just drops the param, which unmounts it — the open
 * record therefore survives reload and works with the Back button.
 */
export function TaskDetailDrawer({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Fullscreen is STICKY across opens on purpose. It behaves like a maximized
  // window: someone who blew one task up to read it almost always wants the
  // next one the same way, and snapping back to the width ceiling on every
  // open would make them re-click it each time. The button is right there.
  const [full, setFull] = React.useState(false);

  // Whatever had focus when the drawer opened — the table row, in practice.
  // Restored on close so Esc hands the keyboard back to the list instead of
  // dropping it on <body>, where the next Tab would restart from the top of
  // the page.
  const restoreFocusTo = React.useRef<HTMLElement | null>(null);

  const close = React.useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("task");
    const qs = next.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as never, {
      scroll: false,
    });
  }, [router, pathname, searchParams]);

  // Esc closes, and the page behind must not scroll while the drawer is up.
  React.useEffect(() => {
    if (!open) return;
    // Captured on OPEN, not on close: by the time the drawer is closing, focus
    // has long since moved inside it.
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // `isConnected` guards the case where the row was removed while the
      // drawer was open (a filter change, a realtime refresh) — focusing a
      // detached node silently sends focus to <body> anyway, so skip it.
      const el = restoreFocusTo.current;
      if (el?.isConnected) el.focus();
      restoreFocusTo.current = null;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Task detail">
      {/* Scrim — click anywhere off the panel to dismiss. */}
      <button
        type="button"
        aria-label="Close task detail"
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40 backdrop-blur-xs"
      />

      {/* A workspace canvas, not a side panel: full width up to a breakpoint
          ceiling that steps 4xl → 7xl, so the record gets the whole screen on a
          phone and a readable measure on a 27" monitor instead of a 60vw slab
          that grew unbounded with the display. Maximize drops the ceiling. */}
      <aside
        className={`relative flex h-screen w-full flex-col overflow-hidden bg-slate-50 shadow-2xl ${
          full ? "" : "sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl"
        }`}
        style={{ animation: "drawerIn 180ms ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200/80 bg-slate-50 px-4 py-2.5">
          <span className="text-[13px] font-black text-ink-strong">Task detail</span>
          <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle max-md:hidden">
            Esc to close
          </span>
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            aria-label={full ? "Exit full screen" : "Full screen"}
            aria-pressed={full}
            title={full ? "Exit full screen" : "Full screen"}
            className="rounded p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 max-lg:hidden"
          >
            {full ? <Minimize2 size={15} strokeWidth={2.4} /> : <Maximize2 size={15} strokeWidth={2.4} />}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        {/* The ONE scroll region in the drawer: the shell is `overflow-hidden`
            and `h-screen`, so the page behind never gains a second scrollbar
            and the header stays put. The padding lives here rather than in the
            detail subtree, which renders unpadded on /tasks/[id] where the
            page's own <main> supplies the margins — without it the hero band
            and every card ran flush into the drawer's left and right edges. */}
        <div className="slim-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6 max-md:p-4">{children}</div>
      </aside>
    </div>
  );
}
