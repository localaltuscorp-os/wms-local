import "server-only";

/**
 * Goal Capture — voice → text. Provider-agnostic OpenAI-compatible
 * `/audio/transcriptions` (Whisper) call. Env-configured, so it works with
 * OpenAI Whisper OR a FREE Groq Whisper key (set WHISPER_BASE_URL to Groq) OR a
 * local faster-whisper server — config change, not a code change.
 *
 *   WHISPER_API_KEY   — required to enable voice.
 *   WHISPER_BASE_URL  — default OpenAI. Free option: https://api.groq.com/openai/v1
 *   WHISPER_MODEL     — default "whisper-1". Groq: "whisper-large-v3-turbo".
 */
const BASE_URL = process.env.WHISPER_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.WHISPER_MODEL || "whisper-1";

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: string };

export async function transcribe(audio: Blob, filename = "audio.webm"): Promise<TranscribeResult> {
  const key = process.env.WHISPER_API_KEY;
  if (!key) return { ok: false, error: "Voice capture isn't configured." };

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", MODEL);
  form.append("response_format", "json");
  // Nudge the model toward the app's domain vocabulary.
  form.append("prompt", "Business goals: revenue, deals, clients, churn, pricing, hiring, KPIs.");

  try {
    const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Transcription failed (${res.status}). ${body.slice(0, 100)}` };
    }
    const data = (await res.json()) as { text?: string };
    const text = (data.text ?? "").trim();
    if (!text) return { ok: false, error: "Couldn't make out any speech — try again." };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: `Couldn't reach transcription: ${(err as Error).message ?? "network error"}` };
  }
}
