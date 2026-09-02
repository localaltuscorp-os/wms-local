"use client";

/**
 * Goals Canvas — SHARED DICTATION ATOMS.
 *
 * Web-Speech dictation hook + the round amber MicButton, extracted from
 * peek-panel.tsx (Phase 3) so the ParentContextPanel, GoalContainer and the
 * peek panel all share ONE copy. Amber identity — brand-red is FORBIDDEN in
 * components/goals/canvas/; the mic pulses `var(--module-accent)` (amber).
 */

import * as React from "react";
import { Mic } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { GOALS_ACCENT } from "@/components/goals/cascade/util";

export function useDictation() {
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<{ stop: () => void } | null>(null);
  const toggle = React.useCallback((onText: (t: string) => void) => {
    if (recRef.current) { recRef.current.stop(); return; }
    const SR =
      (window as unknown as { SpeechRecognition?: new () => never }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => never }).webkitSpeechRecognition;
    if (!SR) { fireToast({ message: "Voice input isn't supported in this browser.", type: "error" }); return; }
    const rec = new (SR as unknown as new () => {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void; onerror: () => void; start: () => void; stop: () => void;
    })();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (e) => {
      let s = "";
      for (let i = e.resultIndex; i < e.results.length; i++) s += e.results[i]![0]!.transcript;
      onText(s);
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = () => { setListening(false); recRef.current = null; };
    recRef.current = rec; setListening(true); rec.start();
  }, []);
  return { listening, toggle };
}

/** Round mic toggle — pulses AMBER while listening (brand-red is forbidden here). */
export function MicButton({ listening, onClick, size = 34 }: { listening: boolean; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-xl transition-colors ${listening ? "text-white" : "text-ink-soft hover:bg-surface-soft hover:text-ink-strong"}`}
      style={{ width: size, height: size, background: listening ? `var(--module-accent, ${GOALS_ACCENT})` : undefined }}
    >
      {listening && (
        <span aria-hidden className="absolute inset-0 animate-ping rounded-xl" style={{ background: `var(--module-accent, ${GOALS_ACCENT})`, opacity: 0.35 }} />
      )}
      <Mic size={Math.round(size * 0.45)} strokeWidth={2.4} className="relative" />
    </button>
  );
}
