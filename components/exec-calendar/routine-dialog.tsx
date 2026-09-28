"use client";

import * as React from "react";
import { Repeat, X } from "lucide-react";
import { ExecRoutineEditList } from "./routine-edit";
import { ExecRoutineDeleteList } from "./routine-delete";

/**
 * MANAGE ROUTINES — Edit | Delete.
 *
 * "Stamp a routine" used to be a third tab here; it moved into the event
 * editor's inline Repeat picker (2026-09-24, event-editor.tsx), reached from
 * "New block" itself instead of a separate dialog — Google Calendar doesn't
 * make you open a different screen to make an event repeat, so this doesn't
 * either. What's left here is managing routines that already exist: editing
 * one (title/category/time/range/repeat, same fields "New block" offers) or
 * removing one.
 */
export function ExecRoutineDialog({
  today,
  initialMode = "edit",
  onClose,
}: {
  today: string;
  /** Which half opens first; `?routine=delete` lands on the delete list. */
  initialMode?: "edit" | "delete";
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<"edit" | "delete">(initialMode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Manage routines">
      <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={onClose} />
      <div className="relative w-[520px] max-w-full overflow-hidden rounded-2xl bg-surface-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3" style={{ background: "var(--color-surface-soft)" }}>
          <div className="flex items-center gap-2">
            <Repeat size={15} style={{ color: "var(--color-ink-muted)" }} />
            <span className="text-[13px] font-bold text-ink-strong">Manage routines</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-muted hover:text-ink-strong">
            <X size={16} />
          </button>
        </header>

        <div className="flex gap-1 border-b border-hairline px-4 pt-3">
          {([["edit", "Edit a routine"], ["delete", "Delete a routine"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className="-mb-px whitespace-nowrap border-b-2 px-3 pb-2 text-[12.5px] font-bold transition"
              style={
                mode === k
                  ? { borderColor: "var(--color-altus-red)", color: "var(--color-altus-red-deep)" }
                  : { borderColor: "transparent", color: "var(--color-ink-muted)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="px-4 py-4">
          {mode === "edit" ? <ExecRoutineEditList today={today} /> : <ExecRoutineDeleteList today={today} />}
        </div>
      </div>
    </div>
  );
}
