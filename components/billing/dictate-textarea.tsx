"use client";

import * as React from "react";
import { Mic, Square } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { BILLING_PURPLE } from "@/lib/billing/ui";

/**
 * A textarea with a "Dictate with Voice" button in its bottom-right corner.
 *
 * Web Speech API, en-IN, continuous until stopped. Dictated words are APPENDED
 * to whatever is already typed — never replace it — so someone can type half a
 * note and speak the rest. Interim words show live; only the final phrase is
 * kept, so a mid-sentence correction by the recogniser does not stack up.
 */

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: (e: { error?: string }) => void;
  start: () => void;
  stop: () => void;
};

export function DictateTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const recRef = React.useRef<Rec | null>(null);
  // The text the current dictation appends to, kept in a ref so the recogniser's
  // callbacks (created once per session) always see the latest value.
  const baseRef = React.useRef(value);

  React.useEffect(() => () => recRef.current?.stop(), []);

  function toggle() {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      fireToast({ message: "Voice input isn't supported in this browser. Try Chrome or Edge.", type: "error" });
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = value;
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText += r[0]!.transcript;
        else interimText += r[0]!.transcript;
      }
      if (finalText.trim()) {
        const base = baseRef.current;
        const sep = base && !/\s$/.test(base) ? " " : "";
        const next = base + sep + finalText.trim();
        baseRef.current = next;
        onChange(next);
      }
      setInterim(interimText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recRef.current = null;
    };
    rec.onerror = (e) => {
      if (e?.error === "not-allowed") {
        fireToast({ message: "Microphone access was blocked. Allow it in the browser to dictate.", type: "error" });
      }
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="relative">
      <textarea
        rows={rows}
        value={listening && interim ? `${value}${value && !/\s$/.test(value) ? " " : ""}${interim}` : value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={listening}
        placeholder={placeholder}
        className={(className ?? "") + " pb-12"}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        aria-pressed={listening}
        className="absolute bottom-2.5 right-2.5 inline-flex h-8 items-center gap-1.5 rounded-chip bg-white px-3 text-[12.5px] font-bold transition"
        style={
          listening
            ? { background: BILLING_PURPLE, color: "#fff" }
            : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "#B91C1C" }
        }
      >
        {listening ? (
          <>
            <Square size={12} fill="currentColor" className="animate-pulse" /> Stop dictation
          </>
        ) : (
          <>
            <Mic size={14} strokeWidth={2.4} /> Dictate with Voice
          </>
        )}
      </button>
    </div>
  );
}
