"use client";

import * as React from "react";
import { Mic, Square, Loader2, Check, NotebookPen } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setDisciplineNote } from "@/app/(app)/salary/analytics/actions";

/**
 * Admin notes / reasons for one employee's attendance discipline in a month
 * (saved, never affects pay). Type or DICTATE (voice-to-text). Saves on blur /
 * the Save button; the dictate button appends recognised speech.
 */
const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

export function DisciplineNote({
  employeeId,
  month,
  initial,
  name,
}: {
  employeeId: string;
  month: string;
  initial: string;
  name: string;
}) {
  const [note, setNote] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<unknown>(null);
  const voiceSupported = React.useMemo(
    () => typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition),
    [],
  );
  React.useEffect(() => {
    setNote(initial);
    setSaved(initial);
  }, [initial, employeeId, month]);

  function toggleVoice() {
    if (listening) {
      (recRef.current as { stop?: () => void } | null)?.stop?.();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR() as {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
    };
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0]!.transcript).join(" ").trim();
      if (text) setNote((prev) => (prev ? `${prev} ${text}` : text).slice(0, 2000));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  async function save() {
    if (note === saved) return;
    setBusy(true);
    const res = await setDisciplineNote({ employeeId, month, note });
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setSaved(note);
    fireToast({ message: "Note saved.", type: "success" });
  }

  const dirty = note !== saved;

  return (
    <section
      className="wg-rise admin-panel px-6 py-5 max-md:px-4"
      style={{ animationDelay: "160ms" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-grid size-7 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          <NotebookPen size={15} strokeWidth={2.4} />
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-ink-subtle">Notes &amp; reasons</span>
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            title={listening ? "Stop recording" : "Dictate your note"}
            className="ml-auto inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold transition"
            style={
              listening
                ? { background: RED, color: "#fff", boxShadow: `0 0 0 4px color-mix(in srgb, ${RED} 20%, transparent)` }
                : { background: `color-mix(in srgb, ${RED} 10%, transparent)`, color: RED_DEEP }
            }
          >
            {listening ? <Square size={12} strokeWidth={2.6} className="animate-pulse" /> : <Mic size={13} strokeWidth={2.4} />}
            {listening ? "Recording…" : "Dictate"}
          </button>
        )}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        maxLength={2000}
        rows={3}
        placeholder={`Notes / reasons about ${name}'s attendance this month — type or tap Dictate. (Read-only page · never changes pay.)`}
        className="w-full resize-y rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium text-ink-strong bg-white outline-none transition-colors focus:border-[color:var(--color-altus-red)]"
        style={{ border: "2px solid var(--color-hairline-strong)", boxShadow: "inset 0 1px 3px rgba(15,23,42,0.05)" }}
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />} Save Note
        </button>
        <span className="text-[12px] font-medium text-ink-subtle">
          {busy ? "Saving…" : dirty ? "Unsaved changes" : saved ? "Saved" : "Nothing saved yet"}
        </span>
      </div>
    </section>
  );
}
