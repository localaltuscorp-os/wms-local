/**
 * Client-only: decode any browser-recorded/uploaded audio blob (webm/opus, mp3,
 * m4a, ogg, wav…) and re-encode it to a 16 kHz mono 16-bit PCM WAV.
 *
 * Why: MediaRecorder produces webm/opus, which Gemini does NOT accept inline.
 * Decoding via the Web Audio API and writing a WAV gives a format Gemini always
 * supports, and downsampling to 16 kHz mono keeps the upload tiny (~32 KB/s) so
 * a multi-minute note stays well under the request/inline limits.
 */

const TARGET_RATE = 16_000;

type AudioCtor = typeof AudioContext;

export async function blobToWavBase64(blob: Blob): Promise<{ base64: string; mimeType: "audio/wav" }> {
  const AC: AudioCtor =
    (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext!;
  if (!AC) throw new Error("Your browser can't process audio here.");

  const arrayBuf = await blob.arrayBuffer();
  const decodeCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    decodeCtx.close().catch(() => {});
  }

  // Mixdown to mono.
  const chans = decoded.numberOfChannels;
  const len = decoded.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < chans; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / chans;
  }

  // Resample to 16 kHz (linear interpolation — plenty for speech).
  const ratio = decoded.sampleRate / TARGET_RATE;
  const outLen = Math.max(1, Math.floor(len / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, len - 1);
    const frac = src - i0;
    out[i] = (mono[i0] ?? 0) * (1 - frac) + (mono[i1] ?? 0) * frac;
  }

  return { base64: encodeWav(out, TARGET_RATE), mimeType: "audio/wav" };
}

function encodeWav(samples: Float32Array, sampleRate: number): string {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  // Base64-encode in chunks to avoid call-stack limits on large buffers.
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
