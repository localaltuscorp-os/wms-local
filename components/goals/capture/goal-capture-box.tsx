"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X, Undo2, Check, Mic, Square } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { captureGoals, undoCaptureBatch, transcribeCapture } from "@/app/(app)/goals/capture/actions";
import type { GoalPeriod } from "@/lib/goals/types";

/**
 * Goal Capture — type/paste a plain-language brain-dump; AI structures it into
 * goals on this board (auto-commit). A batch banner then offers Undo all / Keep.
 * Keyboard-first: ⌘/Ctrl+Enter captures, Esc clears.
 */
export function GoalCaptureBox(props: {
  employeeId: string;
  level: GoalPeriod;
  periodKey: string;
  levelLabel: string;
  voiceEnabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [batch, setBatch] = React.useState<{ id: string; count: number } | null>(null);
  const [undoing, setUndoing] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  React.useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  React.useEffect(() => () => { try { recorderRef.current?.stop(); } catch {} }, []);

  async function startRecording() {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "capture.webm");
          const res = await transcribeCapture(fd);
          if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
          setOpen(true);
          setText((prev) => (prev.trim() ? prev.trim() + " " : "") + res.text);
          setTimeout(() => ref.current?.focus(), 0);
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      fireToast({ message: "Couldn't access the mic — check browser permissions.", type: "error" });
    }
  }
  function stopRecording() {
    try { recorderRef.current?.stop(); } catch {}
    setRecording(false);
  }

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const res = await captureGoals({
        employeeId: props.employeeId,
        level: props.level,
        periodKey: props.periodKey,
        text: value,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setText("");
      setOpen(false);
      setBatch({ id: res.batchId, count: res.created });
      fireToast({ message: `Added ${res.created} goal${res.created === 1 ? "" : "s"} via AI`, type: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!batch || undoing) return;
    setUndoing(true);
    try {
      const res = await undoCaptureBatch({ batchId: batch.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setBatch(null);
      fireToast({ message: "Removed the AI batch", type: "success" });
      router.refresh();
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Undo banner — appears after a capture until Keep/Undo. */}
      {batch && (
        <div
          className="wg-fade-in flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: "var(--color-hairline-strong)", background: "color-mix(in oklab, var(--color-altus-red) 7%, var(--color-surface-card))" }}
        >
          <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
            <Sparkles size={15} className="text-altus-red" strokeWidth={2.4} />
            Just added <strong>{batch.count}</strong> goal{batch.count === 1 ? "" : "s"} via AI
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={undo}
              disabled={undoing}
              className="inline-flex items-center gap-1 rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-60"
            >
              {undoing ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} strokeWidth={2.4} />} Undo all
            </button>
            <button
              type="button"
              onClick={() => setBatch(null)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              <Check size={13} strokeWidth={2.6} /> Keep
            </button>
          </div>
        </div>
      )}

      {/* Trigger + composer */}
      {!open ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group inline-flex h-9 items-center gap-2 rounded-pill border px-3.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
            style={{ borderColor: "var(--color-hairline)" }}
          >
            <Sparkles size={15} strokeWidth={2.4} className="text-altus-red" />
            Capture goals with AI
            <span className="hidden text-[11px] font-semibold text-ink-subtle sm:inline">— type it in plain words</span>
          </button>
        </div>
      ) : (
        <div
          className="wg-fade-in rounded-2xl border p-3"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-ink-soft">
              <Sparkles size={14} className="text-altus-red" strokeWidth={2.4} />
              Capture {props.levelLabel} goals
            </span>
            <button type="button" onClick={() => { setOpen(false); setText(""); }} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-md text-ink-subtle hover:text-ink-strong">
              <X size={15} />
            </button>
          </div>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(); }
              else if (e.key === "Escape") { e.preventDefault(); setText(""); setOpen(false); }
            }}
            rows={4}
            placeholder={"e.g. Close 12 enterprise deals this year, onboard 4 pilot clients, ship pricing v2, keep churn under 5%"}
            className="w-full resize-y rounded-xl border bg-white px-3 py-2.5 text-[14px] leading-relaxed text-ink-strong focus:border-altus-red focus:outline-none"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {props.voiceEnabled && (
                <button
                  type="button"
                  onClick={() => (recording ? stopRecording() : void startRecording())}
                  disabled={transcribing}
                  aria-label={recording ? "Stop recording" : "Record your goals"}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-bold transition-colors disabled:opacity-60"
                  style={{
                    borderColor: recording ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
                    color: recording ? "var(--color-altus-red)" : "var(--color-ink-soft)",
                    background: recording ? "color-mix(in oklab, var(--color-altus-red) 8%, transparent)" : "transparent",
                  }}
                >
                  {transcribing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : recording ? (
                    <Square size={12} className="animate-pulse fill-current" />
                  ) : (
                    <Mic size={13} strokeWidth={2.4} />
                  )}
                  {transcribing ? "Transcribing…" : recording ? "Stop" : "Speak"}
                </button>
              )}
              <span className="hidden text-[11.5px] font-semibold text-ink-subtle sm:inline">⌘/Ctrl + Enter · Esc to cancel</span>
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} strokeWidth={2.5} />}
              {busy ? "Structuring…" : "Capture"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
