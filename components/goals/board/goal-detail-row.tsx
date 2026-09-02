"use client";

/**
 * GoalDetailRow — the expandable full-width row under a goal in the inline table.
 * Holds Notes (goals.notes) + Attachments (the 0142 documents-gallery via
 * detail-actions), so neither needs its own column (the table stays no-wider).
 * Attachments load lazily on first expand.
 */

import * as React from "react";
import { FileText, Mic, Square, X } from "lucide-react";
import { useDictation } from "@/components/ui/use-dictation";
import { cn } from "@/lib/utils";
import { UserCog } from "lucide-react";
import { AssignmentLine } from "@/components/goals/board/assignment-chip";
import { GoalAttachmentsPanel } from "@/components/goals/shared/goal-attachments-panel";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import type { AssignmentInfo } from "@/components/goals/cascade/util";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

export function GoalDetailRow({
  goalId,
  notes: initialNotes,
  canWrite,
  colSpan,
  nodeKind = "cascade",
  assignment,
  showAttachmentView = true,
  onSaveNotes,
  onClose,
}: {
  goalId: string;
  notes: string | null;
  canWrite: boolean;
  colSpan: number;
  /** Which engine this goal lives in — cascade `goals` (default) or weekly_goals. */
  nodeKind?: "cascade" | "weekly";
  /** Assignment Type summary — renders the "Self-created / Assigned by…" line. */
  assignment?: AssignmentInfo;
  /** Show the attachment gallery's per-file "View" button — off on the main
   *  table (first screen), on by default (the standalone detail screen). */
  showAttachmentView?: boolean;
  /** Persist notes through the parent's optimistic editField. */
  onSaveNotes: (notes: string | null) => void;
  /** Collapse the row + return focus to the "Notes & Files" toggle (Esc from the
   *  textarea). Wired by the grid so Notes has a complete keyboard round-trip. */
  onClose?: () => void;
}) {
  const [notes, setNotes] = React.useState(initialNotes ?? "");
  // Live voice-typing (Web Speech API): finalised phrases are appended to the
  // notes as you speak, interim words preview live in the field. No upload, no
  // silence hallucination (the old record→Whisper pass sometimes wrote "Thank
  // you." on empty audio). Persists each committed phrase immediately.
  const dictation = useDictation({
    value: notes,
    onChange: (v) => {
      setNotes(v);
      onSaveNotes(v.trim() || null);
    },
  });
  const notesRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-focus the notes textarea when the row expands (caret ready — the whole
  // point of opening it), so the keyboard user lands straight in the field.
  React.useEffect(() => {
    if (!canWrite) return;
    const t = requestAnimationFrame(() => notesRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [canWrite]);

  function commitNotes() {
    const v = notes.trim();
    if ((initialNotes ?? "").trim() === v) return;
    onSaveNotes(v || null);
  }

  // Drop a dictated transcript in at the caret (or append to the end), tidy the
  // spacing, persist immediately, and put the caret after the inserted text so
  // the user can keep typing or dictate another line.
  function insertDictation(text: string) {
    const el = notesRef.current;
    const prev = notes;
    let next: string;
    let caret: number;
    if (el && typeof el.selectionStart === "number" && document.activeElement === el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      const sep = before && !/\s$/.test(before) ? " " : "";
      next = before + sep + text + after;
      caret = (before + sep + text).length;
    } else {
      const sep = prev && !/\s$/.test(prev) ? " " : "";
      next = prev + sep + text;
      caret = next.length;
    }
    setNotes(next);
    onSaveNotes(next.trim() || null);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        try { el.setSelectionRange(caret, caret); } catch { /* noop */ }
      }
    });
  }

  return (
    <tr>
      <td
        colSpan={colSpan}
        className="relative px-6 py-4"
        style={{
          background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-soft))",
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        {/* ── Close — collapse this row without touching notes/attachments. ── */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className={cn(
              "absolute right-3 top-3 grid size-6 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_12%,transparent)] hover:text-altus-red",
              FOCUS_RING,
            )}
          >
            <X size={14} strokeWidth={2.6} />
          </button>
        )}

        {/* ── Assignment ── a quiet line: Self-created / Assigned by … */}
        {assignment && (
          <div className="mb-4 flex items-center gap-1.5">
            <UserCog size={13} className="text-altus-red" />
            <span className="text-[11px] font-black uppercase tracking-[0.07em] text-ink-soft">
              Assignment
            </span>
            <span className="mx-1 text-ink-subtle">·</span>
            <AssignmentLine info={assignment} />
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {/* ── Notes ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.07em] text-ink-soft">
                <FileText size={13} className="text-altus-red" /> Notes
              </p>
              {canWrite &&
                (dictation.supported ? (
                  <button
                    type="button"
                    onClick={dictation.toggle}
                    aria-pressed={dictation.recording}
                    aria-label={dictation.recording ? "Stop dictation" : "Dictate notes by voice"}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-bold transition-colors",
                      FOCUS_RING,
                      dictation.recording
                        ? "border-altus-red text-white"
                        : "border-hairline-strong bg-white text-ink-soft hover:border-altus-red hover:text-altus-red",
                    )}
                    style={dictation.recording ? { background: "var(--color-altus-red)" } : undefined}
                  >
                    {dictation.recording ? (
                      <>
                        <span className="size-2 rounded-full bg-white animate-pulse" />
                        Listening… <Square size={12} strokeWidth={2.8} />
                      </>
                    ) : (
                      <>
                        <Mic size={13} strokeWidth={2.4} /> Dictate
                      </>
                    )}
                  </button>
                ) : (
                  // Firefox / unsupported: fall back to record→transcribe (Whisper).
                  <VoiceNoteButton onText={insertDictation} label="Dictate" className="!px-2.5 !py-1 !text-[12px]" />
                ))}
            </div>
            <textarea
              ref={notesRef}
              value={
                dictation.recording && dictation.interim
                  ? notes + (notes && !/\s$/.test(notes) ? " " : "") + dictation.interim
                  : notes
              }
              disabled={!canWrite}
              readOnly={dictation.recording}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitNotes();
                  (e.target as HTMLTextAreaElement).blur();
                } else if (e.key === "Escape") {
                  // Esc: save, leave the field, collapse the row and return focus to
                  // the "Notes & Files" toggle so the grid round-trip is complete.
                  e.preventDefault();
                  if (dictation.recording) dictation.stop();
                  commitNotes();
                  (e.target as HTMLTextAreaElement).blur();
                  onClose?.();
                }
              }}
              placeholder="Add context, blockers, links, next steps… (⌘/Ctrl + Enter to save · Esc to close)"
              rows={4}
              className={cn(
                "w-full resize-y rounded-lg border bg-white px-3 py-2 text-[13.5px] leading-relaxed text-ink-strong focus:border-altus-red disabled:opacity-60",
                dictation.recording && "border-altus-red",
                FOCUS_RING,
              )}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
            {dictation.recording && (
              <p className="mt-1 text-[11.5px] font-semibold text-altus-red">
                Speak now — your words appear as you talk. Click <span className="font-black">Listening…</span> to stop.
              </p>
            )}
          </div>

          <GoalAttachmentsPanel goalId={goalId} canWrite={canWrite} nodeKind={nodeKind} showView={showAttachmentView} />
        </div>
      </td>
    </tr>
  );
}
