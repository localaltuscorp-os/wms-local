"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteExecEvent, deleteExecRoutine } from "@/app/(app)/events/actions";
import { fireToast } from "@/lib/toast";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";

/**
 * RIGHT-CLICK TO DELETE (2026-09-26, corrected same day) — replaces the
 * "Manage routines" toolbar button's delete half with a per-block menu,
 * Google Calendar's own pattern: right-click ANY block — plain or
 * routine-stamped — opens a small "Delete" menu first. Only clicking Delete
 * on a routine-stamped block then asks "This event / This and following /
 * All events". (First cut skipped straight to that dialog on a routine
 * block's right-click; wrong per Google's own behaviour, corrected here.)
 *
 * "Edit a routine" (the list-based picker) had no equivalent redesign asked
 * for, so it's untouched in routine-edit.tsx/routine-dialog.tsx — just no
 * longer reachable from this toolbar. It's still reachable by URL
 * (`?routine=edit`) if that screen gets wired back in later.
 *
 * One hook, shared by every grid that draws event blocks (Day/Week, Weekly
 * Grid, Monthly Grid), so the three don't grow three slightly different
 * right-click behaviours.
 */
export function useEventContextMenu() {
  const router = useRouter();
  const [menu, setMenu] = React.useState<{ event: ExecEventRow; x: number; y: number } | null>(null);
  const [routineDelete, setRoutineDelete] = React.useState<ExecEventRow | null>(null);

  const openMenu = React.useCallback((ev: React.MouseEvent, event: ExecEventRow) => {
    ev.preventDefault();
    ev.stopPropagation();
    setMenu({ event, x: ev.clientX, y: ev.clientY });
  }, []);

  const node = (
    <>
      {menu && (
        <EventContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDelete={async () => {
            const ev = menu.event;
            setMenu(null);
            if (ev.routineId) {
              setRoutineDelete(ev);
              return;
            }
            const res = await deleteExecEvent(ev.id);
            if (!res.ok) fireToast({ message: res.error, type: "error" });
            else router.refresh();
          }}
        />
      )}
      {routineDelete && (
        <RoutineDeleteDialog
          event={routineDelete}
          onClose={() => setRoutineDelete(null)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  );

  return { openMenu, node };
}

function EventContextMenu({
  x,
  y,
  onClose,
  onDelete,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
}) {
  // A ref-containment check on pointerDOWN, in the CAPTURE phase — the
  // standard "click outside" pattern, and a deliberate replacement for an
  // earlier version that deferred a window "click" listener by one
  // animation frame to dodge the triggering right-click's own synthetic
  // click. That version left the menu stuck open after clicking elsewhere
  // (reported 2026-09-26): the effect (and so the listener) only runs AFTER
  // React commits the state update that opened the menu, which is already
  // strictly after the pointerdown that triggered the right-click — so
  // there was never a same-tick race to dodge, and the rAF defer just added
  // a window where a fast click could land before the listener existed.
  // Capturing pointerdown (fires before click, and before any other
  // handler's stopPropagation on the way down) makes this reliable instead.
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("contextmenu", onPointerDown, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("contextmenu", onPointerDown, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamped so a block near the right/bottom edge doesn't open off-screen.
  const left = Math.min(x, window.innerWidth - 160);
  const top = Math.min(y, window.innerHeight - 60);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[300] min-w-[140px] overflow-hidden rounded-lg border border-hairline-strong bg-surface-card py-1 shadow-2xl"
      style={{ left, top }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-semibold text-ink-strong transition hover:bg-surface-soft"
      >
        <Trash2 size={14} /> Delete
      </button>
    </div>,
    document.body,
  );
}

function RoutineDeleteDialog({
  event,
  onClose,
  onDone,
}: {
  event: ExecEventRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [choice, setChoice] = React.useState<"this" | "following" | "all">("this");
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res =
        choice === "this"
          ? await deleteExecEvent(event.id)
          : await deleteExecRoutine(event.routineId!, choice === "following" ? "upcoming" : "all", event.day);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const OPTIONS = [
    ["this", "This event"],
    ["following", "This and following events"],
    ["all", "All events"],
  ] as const;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Delete recurring event">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-[360px] max-w-full rounded-2xl bg-surface-card p-5 shadow-2xl">
        <h3 className="mb-3.5 text-[15px] font-black text-ink-strong">Delete recurring event</h3>
        <div className="space-y-2.5">
          {OPTIONS.map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-ink-strong">
              <input
                type="radio"
                name="delete-scope"
                checked={choice === k}
                onChange={() => setChoice(k)}
                className="h-4 w-4 accent-[var(--color-altus-red)]"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-hairline-strong px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="rounded-lg px-4 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--color-altus-red)" }}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
