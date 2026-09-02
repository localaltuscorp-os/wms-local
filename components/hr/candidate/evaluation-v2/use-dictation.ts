"use client";

import * as React from "react";
import { fireToast } from "@/lib/toast";

/* Minimal Web Speech API surface — the DOM lib doesn't ship these types.
 * Mirrors components/hr/candidate/intake-section-step.tsx. */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface Dictation {
  /** Web Speech API is available in this browser. */
  supported: boolean;
  /** Live capture is running. */
  recording: boolean;
  /** Interim (not-yet-final) words for a live preview. */
  interim: string;
  /** Start capture if idle, stop if running. */
  toggle: () => void;
  /** Force-stop capture. */
  stop: () => void;
}

/**
 * A small reusable speech-to-text hook. Recognised speech is appended to the
 * current value (space-separated) via `onChange`; interim words preview live.
 * When the Web Speech API is unavailable the field stays typeable and
 * `supported` is false so the caller can hide the mic. Permission / network
 * errors surface as toasts — mirrors the intake wizard's dictation handling.
 */
export function useDictation({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): Dictation {
  const [recording, setRecording] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);

  // Latest value in a ref so the recognition callback always appends to fresh text.
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // Support is resolved once, lazily — no extra render, safe under SSR.
  const [supported] = React.useState(() => getSpeechRecognitionCtor() != null);

  const stop = React.useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recRef.current = null;
    setRecording(false);
    setInterim("");
  }, []);

  const start = React.useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      fireToast({ message: "Dictation isn't supported in this browser — use Chrome or Edge.", type: "error" });
      return;
    }
    // The Web Speech API only runs on a SECURE origin. localhost counts; a LAN IP
    // (http://192.168.x.x) does NOT — the browser silently refuses the mic.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      fireToast({
        message:
          "Open the app at http://localhost:3000 to dictate — the microphone is blocked on the network IP (insecure page).",
        type: "error",
      });
      return;
    }
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      fireToast({ message: "Couldn't start dictation.", type: "error" });
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    // Pin to Indian English — the browser default (often en-US) mis-hears Indian
    // names/accents; en-IN is markedly more accurate for this team (Sir).
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText.trim()) {
        const base = valueRef.current;
        const sep = base && !/\s$/.test(base) ? " " : "";
        const next = `${base}${sep}${finalText.trim()}`;
        valueRef.current = next;
        onChangeRef.current(next);
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      const code = e?.error ?? "";
      if (code !== "no-speech" && code !== "aborted") {
        fireToast({
          message:
            code === "not-allowed" || code === "service-not-allowed"
              ? "Microphone is blocked. Click the mic/lock icon in the address bar → allow the microphone for this site → try again."
              : code === "audio-capture"
                ? "No microphone detected. Enable a mic and try again."
                : code === "network"
                  ? "Dictation needs an internet connection (it uses the browser's online speech service)."
                  : "Dictation couldn't run. Please try again.",
          type: "error",
        });
      }
      stop();
    };
    rec.onend = () => {
      setRecording(false);
      setInterim("");
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      fireToast({ message: "Couldn't access the microphone.", type: "error" });
      recRef.current = null;
    }
  }, [stop]);

  const toggle = React.useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  // Stop any live recognition when the consumer unmounts.
  React.useEffect(
    () => () => {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
    },
    [],
  );

  return { supported, recording, interim, toggle, stop };
}
