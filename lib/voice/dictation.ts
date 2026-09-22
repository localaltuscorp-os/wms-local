"use client";

import * as React from "react";

/**
 * Speech-to-text for the bulk-paste boxes, over the browser's own
 * SpeechRecognition.
 *
 * No service, no key, no audio leaving the device beyond whatever the browser
 * itself does — this is the same engine the address bar's mic uses. That also
 * bounds it: Chrome and Edge implement it, Firefox does not, and Safari only
 * partly. `supported` is what the UI reads to decide whether to offer a mic at
 * all, rather than showing a button that does nothing.
 *
 * Dictation here is not free-form transcription. It is "say a value, say
 * next, say the following value" — so the hook separates spoken VALUES from
 * spoken COMMANDS and hands them back through different callbacks.
 */

/* The Web Speech API is not in TypeScript's DOM lib — it is a vendor-prefixed
   draft. These are the parts this hook actually touches, nothing more. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** No-op subscription: support cannot change while the page is open. */
const subscribeNever = () => () => {};

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type DictationCommand = "next" | "add";

/**
 * What counts as a command rather than a value.
 *
 * Matched only against a WHOLE utterance, never against words inside one.
 * "Add" and "next" are ordinary English and appear in real option names —
 * "Add-on Services", "Next Day Delivery" — so treating them as commands
 * wherever they occur would make those values impossible to dictate. A
 * speech pause ends an utterance, which is exactly the gap a person leaves
 * before saying a command anyway.
 */
const COMMANDS: Record<string, DictationCommand> = {
  next: "next",
  "next line": "next",
  "new line": "next",
  newline: "next",
  add: "add",
  "add all": "add",
  save: "add",
};

/** Trailing full stops and commas are the recogniser's, not the speaker's. */
function normalise(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface UseDictation {
  /** False when the browser has no SpeechRecognition — hide the mic entirely. */
  supported: boolean;
  listening: boolean;
  /** Set when the browser refused: no microphone, permission denied, offline. */
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useDictation({
  onValue,
  onCommand,
  lang = "en-IN",
}: {
  /** A spoken value, already trimmed. Never a command word. */
  onValue: (text: string) => void;
  onCommand: (command: DictationCommand) => void;
  lang?: string;
}): UseDictation {
  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);

  /**
   * Whether this browser has SpeechRecognition at all.
   *
   * Read during render, so it cannot simply call `recognitionCtor()` — the
   * server has no `window`, and returning a different answer than the first
   * client paint is a hydration mismatch. `useSyncExternalStore` is the API
   * for exactly this: a server snapshot of `false`, the real answer on the
   * client, and no effect writing state on mount to get there.
   *
   * The subscribe function is a no-op because a browser does not grow the API
   * mid-session.
   */
  const supported = React.useSyncExternalStore(
    subscribeNever,
    () => recognitionCtor() !== null,
    () => false,
  );

  // The callbacks change on every render; the recogniser is created once.
  // Reading them through a ref keeps the newest without tearing the session
  // down and starting a new one mid-sentence.
  const handlers = React.useRef({ onValue, onCommand });
  React.useEffect(() => {
    handlers.current = { onValue, onCommand };
  });

  const stop = React.useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  const start = React.useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;

    const rec = new Ctor();
    rec.continuous = true;
    // Interim results are deliberately OFF. A value is only appended once the
    // recogniser has committed to it — streaming partials into the box would
    // write "purchase", then "purchase man", then rewrite the lot.
    rec.interimResults = false;
    rec.lang = lang;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result?.isFinal) continue;
        const phrase = normalise(result[0]?.transcript ?? "");
        if (!phrase) continue;

        const command = COMMANDS[phrase];
        if (command) {
          handlers.current.onCommand(command);
        } else {
          handlers.current.onValue(result[0]!.transcript.trim());
        }
      }
    };

    rec.onerror = (e) => {
      const code = e?.error ?? "unknown";
      // "no-speech" and "aborted" are ordinary — a pause, or the user pressing
      // stop. Reporting those as failures would make the control feel broken
      // every time someone thought for a moment.
      if (code === "no-speech" || code === "aborted") return;
      setError(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone permission is blocked. Allow it in the browser's site settings."
          : "Dictation stopped. Try again in a moment.",
      );
      stop();
    };

    // Chrome ends a continuous session on its own after a silence. Restart so
    // "say a value, think, say the next" does not silently stop listening.
    rec.onend = () => {
      if (recRef.current !== rec) return;
      try {
        rec.start();
      } catch {
        setListening(false);
        recRef.current = null;
      }
    };

    try {
      rec.start();
      recRef.current = rec;
      setError(null);
      setListening(true);
    } catch {
      setError("Couldn't start the microphone.");
    }
  }, [lang, stop]);

  const toggle = React.useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  // Leaving the page with the microphone open would keep the tab's recording
  // indicator lit.
  React.useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, error, start, stop, toggle };
}
