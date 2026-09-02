import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { transcribeAndSummarize, GeminiNotConfiguredError } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BASE64 = 24 * 1024 * 1024; // ~18MB decoded — under Gemini's 20MB inline cap
const ALLOWED = new Set(["audio/wav", "audio/mp3", "audio/mpeg", "audio/ogg", "audio/aac", "audio/flac", "audio/x-wav"]);

/**
 * POST /api/training/summarize-audio
 * Body: { audioBase64: string, mimeType: string }  (client converts to 16kHz mono WAV first)
 * → { ok, language, transcript, summary }
 */
export async function POST(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: { audioBase64?: unknown; mimeType?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const audioBase64 = typeof payload.audioBase64 === "string" ? payload.audioBase64 : "";
  const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "";
  if (!audioBase64) return NextResponse.json({ ok: false, error: "No audio provided." }, { status: 400 });
  if (!ALLOWED.has(mimeType)) return NextResponse.json({ ok: false, error: "Unsupported audio format." }, { status: 415 });
  if (audioBase64.length > MAX_BASE64) {
    return NextResponse.json({ ok: false, error: "Recording too long to summarize (keep it under ~5 minutes)." }, { status: 413 });
  }

  try {
    const result = await transcribeAndSummarize(audioBase64, mimeType);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Summary failed." }, { status: 502 });
  }
}
