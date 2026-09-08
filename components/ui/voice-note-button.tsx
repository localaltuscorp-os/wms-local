"use client";

import * as React from "react";
import { Mic, Square, Loader2, X, AlertCircle } from "lucide-react";
import { fireToast } from "@/lib/toast";

/**
 * Professional voice-note recorder → AI transcript, used by every "Notes" mic in
 * the app (tasks, accounts, …).
 *
 * Records from the mic and uploads the RAW clip (webm/opus, or mp4 on Safari) as
 * multipart form-data to /api/ai/transcribe, which transcribes it with Whisper
 * (Groq/OpenAI-compatible). No client-side re-encoding — the recording is sent
 * as captured, which is faster and far more robust than the old WAV pipeline.
 * English stays English; Hindi → Hinglish.
 *
 * States: idle (Mic) → recording (live level meter + timer + Stop / discard) →
 * transcribing (spinner). Degrades gracefully if the browser can't record or the
 * mic is blocked, and never throws into the host form.
 */
export function VoiceNoteButton({
  onText,
  prefer = "transcript",
  className,
  label = "Voice Note",
}: {
  onText: (text: string) => void;
  /** Kept for API compatibility; the endpoint now returns one faithful transcript. */
  prefer?: "transcript" | "summary";
  className?: string;
  label?: string;
}) {
  const [phase, setPhase] = React.useState<"idle" | "recording" | "busy">("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [level, setLevel] = React.useState(0); // 0..1 live mic loudness

  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const discardRef = React.useRef(false);

  /**
   * Recording support, read HYDRATION-SAFELY.
   *
   * Computing this during render returned false on the server (no `window`) and
   * true in the browser, so the server sent a disabled <span> and the client
   * rendered a <button> — a hydration mismatch that threw and took the whole
   * page to the error boundary. It stayed hidden while this only ever mounted
   * inside a modal, after a click; the Admin Panel renders it at page load.
   *
   * useSyncExternalStore is the API for exactly this: the server snapshot and
   * the first client render agree, then React swaps in the real capability.
   */
  const supported = React.useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined",
    () => false,
  );

  const cleanup = React.useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  React.useEffect(() => cleanup, [cleanup]);

  function pickMimeType(): string {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return ""; // let the browser choose its default
  }

  async function upload(blob: Blob, mime: string) {
    setPhase("busy");
    try {
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `voice-note.${ext}`);
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const json = await res.json().catch(() => ({ ok: false, error: "Couldn't read the server response." }));
      if (!json.ok) {
        fireToast({ message: json.error || "Couldn't transcribe the recording.", type: "error" });
        return;
      }
      const text = (json.transcript?.trim() || json.summary?.trim() || "");
      if (!text) {
        fireToast({ message: "Nothing clear could be transcribed - try again.", type: "error" });
        return;
      }
      onText(text);
      fireToast({ message: "Voice note added.", type: "success" });
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Couldn't process the audio.", type: "error" });
    } finally {
      setPhase("idle");
    }
  }

  function startMeter(stream: MediaStream) {
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length); // 0..~0.5 for speech
        setLevel(Math.min(1, rms * 2.6));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* meter is decorative — ignore failures */
    }
  }

  async function start() {
    if (!supported) {
      fireToast({ message: "This browser can't record audio. Try Chrome, Edge, or Safari.", type: "error" });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const msg =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is blocked. Allow it in your browser's site settings, then try again."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "Couldn't access the microphone.";
      fireToast({ message: msg, type: "error" });
      return;
    }

    streamRef.current = stream;
    discardRef.current = false;
    const mime = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      rec = new MediaRecorder(stream);
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      const usedMime = rec.mimeType || mime || "audio/webm";
      cleanup();
      const blob = new Blob(chunksRef.current, { type: usedMime });
      chunksRef.current = [];
      if (discardRef.current) { setPhase("idle"); return; }
      if (blob.size < 1200) {
        fireToast({ message: "That was too short to hear - hold and speak a moment longer.", type: "error" });
        setPhase("idle");
        return;
      }
      await upload(blob, usedMime);
    };

    rec.start();
    recRef.current = rec;
    setPhase("recording");
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    startMeter(stream);
  }

  function stop() {
    discardRef.current = false;
    recRef.current?.stop();
  }
  function discard() {
    discardRef.current = true;
    recRef.current?.stop();
    fireToast({ message: "Recording discarded.", type: "info" });
  }

  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-bold transition-colors disabled:opacity-60 " +
    (className ?? "");

  if (!supported) {
    return (
      <span
        className={base + " cursor-not-allowed border-hairline text-ink-subtle"}
        title="Voice notes need a browser that can record audio (Chrome, Edge, or Safari)."
      >
        <AlertCircle size={14} strokeWidth={2.2} /> Voice Unavailable
      </span>
    );
  }

  if (phase === "busy") {
    return (
      <span
        className={base}
        role="status"
        aria-live="polite"
        style={{
          borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)",
          color: "var(--color-altus-red-deep, #b91c1c)",
          background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
        }}
      >
        <Loader2 size={14} className="animate-spin" /> Transcribing…
      </span>
    );
  }

  if (phase === "recording") {
    return (
      <span className="inline-flex items-center gap-1.5" role="status" aria-live="polite">
        <button
          type="button"
          onClick={stop}
          aria-label="Stop recording and transcribe"
          className={base + " text-white"}
          style={{ background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" }}
        >
          {/* live level meter — 4 bars driven by mic loudness */}
          <span aria-hidden className="flex items-center gap-[2px]">
            {[0, 1, 2, 3].map((i) => {
              const peak = [0.55, 1, 0.75, 0.9][i]!;
              const h = 5 + Math.round(Math.min(1, level * peak) * 11);
              return (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-white"
                  style={{ height: h, transition: "height 90ms linear", opacity: 0.9 }}
                />
              );
            })}
          </span>
          <span className="tabular-nums">
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
          </span>
          <Square size={13} strokeWidth={2.6} /> Stop
        </button>
        <button
          type="button"
          onClick={discard}
          aria-label="Discard recording"
          title="Discard"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-subtle transition-colors hover:border-altus-red hover:text-altus-red"
        >
          <X size={15} strokeWidth={2.4} />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label={label}
      className={base + " border-hairline-strong bg-white text-ink-soft hover:border-[color:var(--color-altus-red)] hover:text-altus-red"}
    >
      <Mic size={14} strokeWidth={2.4} /> {label}
    </button>
  );
}
