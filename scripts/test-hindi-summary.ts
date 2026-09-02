/**
 * Manual test: Hindi voice note → Hinglish transcript/summary.
 *
 * 1. Synthesizes a real Hindi (Devanagari) sentence to speech via Gemini TTS.
 * 2. Wraps the returned 24kHz PCM as a WAV (same format the app sends).
 * 3. Runs it through the SAME prod function the /api/training/summarize-audio
 *    route uses (transcribeAndSummarize) and prints the result.
 *
 * Run:  pnpm tsx --env-file=.env.local scripts/test-hindi-summary.ts
 * Needs GEMINI_API_KEY in .env.local.
 */
import { transcribeAndSummarize } from "@/lib/ai/gemini";

const HINDI = "नमस्ते, मुझे यह सर्विस बहुत अच्छी लगी। कंसल्टेंट ने मेरी समस्या बहुत जल्दी हल कर दी और मैं बहुत खुश हूँ।";

function pcmToWavBase64(pcm: Buffer, rate = 24000): string {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits/sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

async function synthHindi(): Promise<{ base64: string; rate: number }> {
  const key = process.env.GEMINI_API_KEY!;
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Say this clearly in Hindi: ${HINDI}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`TTS failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData);
  const data: string = part?.inlineData?.data;
  const mime: string = part?.inlineData?.mimeType ?? "";
  if (!data) throw new Error("TTS returned no audio");
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
  return { base64: pcmToWavBase64(Buffer.from(data, "base64"), rate), rate };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("✗ No GEMINI_API_KEY in .env.local — add it and re-run.");
    process.exit(1);
  }
  console.log("Source Hindi (Devanagari):\n  " + HINDI + "\n");
  console.log("① Synthesizing Hindi speech via Gemini TTS…");
  const { base64, rate } = await synthHindi();
  console.log(`   ✓ got ${Math.round((base64.length * 0.75) / 1024)} KB WAV @ ${rate}Hz\n`);

  console.log("② Running it through the app's transcribeAndSummarize()…");
  const out = await transcribeAndSummarize(base64, "audio/wav");
  console.log("   ✓ done\n");

  console.log("──────── RESULT ────────");
  console.log("language : " + out.language);
  console.log("transcript:\n  " + out.transcript);
  console.log("summary:\n  " + out.summary);
  console.log("────────────────────────");

  const devanagari = /[ऀ-ॿ]/.test(out.transcript);
  console.log("\nChecks:");
  console.log("  • not Devanagari : " + (devanagari ? "✗ FAIL (still Devanagari)" : "✓ pass (romanized)"));
  console.log("  • non-empty      : " + (out.transcript.trim() ? "✓ pass" : "✗ FAIL"));
}

main().catch((e) => {
  console.error("\n✗ Test error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
