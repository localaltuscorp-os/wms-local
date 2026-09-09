import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { transcribe as whisperTranscribe } from "@/lib/goals/capture/transcribe";
import { transcribeAndSummarize, GeminiNotConfiguredError } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // ~25MB — Groq Whisper inline cap; ≈ many minutes of speech.

/** webm/opus is what MediaRecorder produces and Whisper accepts directly, so we
 *  no longer force a client-side WAV re-encode. We still accept the legacy
 *  base64-WAV JSON body (so any older caller keeps working) and every common
 *  container Whisper supports. */
const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
};

/** Stock phrases Whisper emits on silence/noise — if the ENTIRE transcript is
 *  just one of these, it's almost certainly a hallucination, not real speech. */
const HALLUCINATIONS = new Set([
  "thank you", "thank you.", "thanks", "thanks.", "thank you very much",
  "thanks for watching", "thanks for watching.", "thank you for watching",
  "thank you for watching.", "please subscribe", "subscribe", "you", "you.",
  "bye", "bye.", "bye bye", "so", "so.", "okay", "okay.", "ok", "the", ".",
  "..", "...", "[inaudible]", "[music]", "(music)", "♪",
]);
function isHallucination(text: string): boolean {
  const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
  return norm === "" || HALLUCINATIONS.has(norm);
}

/**
 * POST /api/ai/transcribe — module-agnostic voice-note transcription for every
 * "Notes" mic in the app (tasks, accounts, …).
 *
 * Accepts EITHER:
 *   • multipart/form-data with an `audio` file (preferred — raw recording, no
 *     re-encode), or
 *   • JSON `{ audioBase64, mimeType }` (legacy — base64 WAV).
 *
 * Transcribes with Whisper (Groq/OpenAI-compatible, env-configured) when
 * available — it's fast, accurate, and takes webm/opus as-is. Falls back to
 * Gemini only for the legacy base64 path when Whisper isn't configured.
 * → { ok, transcript, summary }. English stays English; Hindi → Hinglish.
 */
export async function POST(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  // Normalise the request into a single audio Blob (+ a base64 copy iff we were
  // given one, so the Gemini fallback can still run).
  let audio: Blob | null = null;
  let filename = "note.webm";
  let legacyBase64: string | null = null;
  let legacyMime = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio");
      if (!(file instanceof Blob)) {
        return NextResponse.json({ ok: false, error: "No audio provided." }, { status: 400 });
      }
      audio = file;
      const nm = file instanceof File ? file.name : "";
      filename = nm || `note.${EXT_BY_MIME[file.type] ?? "webm"}`;
    } else {
      const payload = (await req.json()) as { audioBase64?: unknown; mimeType?: unknown };
      const audioBase64 = typeof payload.audioBase64 === "string" ? payload.audioBase64 : "";
      const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "";
      if (!audioBase64) {
        return NextResponse.json({ ok: false, error: "No audio provided." }, { status: 400 });
      }
      legacyBase64 = audioBase64;
      legacyMime = mimeType || "audio/wav";
      const bytes = Buffer.from(audioBase64, "base64");
      audio = new Blob([bytes], { type: legacyMime });
      filename = `note.${EXT_BY_MIME[legacyMime] ?? "wav"}`;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ ok: false, error: "The recording was empty — try again." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Recording too long — keep it under ~5 minutes." },
      { status: 413 },
    );
  }

  // Primary: Whisper (configured + reliable, accepts webm/opus & wav).
  if (process.env.WHISPER_API_KEY) {
    const r = await whisperTranscribe(audio, filename);
    if (r.ok) {
      // Whisper hallucinates stock phrases ("Thank you.", "Thanks for watching")
      // on silent/near-silent audio. If the WHOLE transcript is just one of those,
      // treat it as no-speech rather than writing garbage into the user's note.
      if (isHallucination(r.text)) {
        return NextResponse.json(
          { ok: false, error: "No clear speech was detected — try again and speak a little louder." },
          { status: 422 },
        );
      }
      return NextResponse.json({ ok: true, language: "auto", transcript: r.text, summary: r.text });
    }
    // Whisper is configured but errored on THIS clip — surface it (don't silently
    // fall through to Gemini, which usually isn't set up either).
    return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  }

  // Fallback: Gemini, only meaningful for the legacy base64-WAV path (Gemini does
  // not accept webm inline).
  if (legacyBase64) {
    try {
      const result = await transcribeAndSummarize(legacyBase64, legacyMime);
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof GeminiNotConfiguredError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 503 });
      }
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "Transcription failed." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "Voice notes aren't set up yet. Ask an admin to add WHISPER_API_KEY." },
    { status: 503 },
  );
}
