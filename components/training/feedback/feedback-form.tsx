"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Loader2, Send, Mic, Square, Upload, X, Image as ImageIcon, AlertTriangle, Sparkles } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { blobToWavBase64 } from "@/lib/audio/to-wav";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { StarRating } from "./star-rating";
import { createFeedback, addFeedbackService, deleteFeedbackService } from "@/app/(app)/training/feedback/actions";
import { FEEDBACK_TYPES, FEEDBACK_TEMPLATES, fillTemplate, type FeedbackType } from "@/lib/training/feedback-templates";

const FIELD = "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-[color:var(--color-altus-red)]";
const LABEL = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Live recording waveform — 28 bars driven by the mic's frequency data. */
function WaveBars({ levels }: { levels: number[] }) {
  const bars = levels.length ? levels : Array.from({ length: 28 }, () => 0.06);
  return (
    <div className="flex h-9 flex-1 items-center justify-center gap-[3px]" aria-hidden>
      {bars.map((v, i) => (
        <span key={i} className="w-[3px] rounded-full" style={{ height: `${Math.max(8, v * 100)}%`, background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))", transition: "height 90ms linear" }} />
      ))}
    </div>
  );
}

function Section({ title, hint, children, delay = 0 }: { title: string; hint?: string; children: React.ReactNode; delay?: number }) {
  return (
    <section className="wg-rise rounded-section border border-hairline bg-surface-card p-6 max-md:p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: `${delay}ms` }}>
      <div className="mb-4">
        <h2 className="font-bold text-ink-strong" style={{ fontSize: 17, letterSpacing: "-0.01em" }}>{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] font-medium text-ink-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function FeedbackForm({
  services,
  employees,
}: {
  services: LookupOption[];
  employees: LookupOption[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const firstRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { firstRef.current?.focus(); }, []);
  const [type, setType] = React.useState<FeedbackType>("consultant");
  const [serviceId, setServiceId] = React.useState<string | null>(null);
  const [ratedEmployeeId, setRatedEmployeeId] = React.useState<string | null>(null);
  const [ratedName, setRatedName] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const [rating, setRating] = React.useState<number | null>(null);
  const [q1, setQ1] = React.useState("");
  const [q2, setQ2] = React.useState("");
  const [voiceTranscript, setVoiceTranscript] = React.useState("");
  const [escalate, setEscalate] = React.useState(false);
  const [escalatedToId, setEscalatedToId] = React.useState<string | null>(null);

  const [voice, setVoice] = React.useState<{ path: string; url: string } | null>(null);
  const [picture, setPicture] = React.useState<{ path: string; url: string } | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [uploadingVoice, setUploadingVoice] = React.useState(false);
  const [uploadingPic, setUploadingPic] = React.useState(false);
  const [levels, setLevels] = React.useState<number[]>([]);
  const [elapsed, setElapsed] = React.useState(0);
  const [summarizing, setSummarizing] = React.useState(false);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const voiceBlobRef = React.useRef<Blob | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const picInputRef = React.useRef<HTMLInputElement>(null);
  const voiceInputRef = React.useRef<HTMLInputElement>(null);

  // Tear down the live audio meter on unmount (refs only — no stale closures).
  React.useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current != null) clearInterval(timerRef.current);
    audioCtxRef.current?.close().catch(() => {});
  }, []);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tpl = FEEDBACK_TEMPLATES[type];
  const displayName = ratedName.trim() || employees.find((e) => e.id === ratedEmployeeId)?.name || "";

  async function uploadFile(file: Blob, name: string): Promise<{ path: string; kind: string } | null> {
    const fd = new FormData();
    fd.set("file", new File([file], name, { type: file.type }));
    const res = await fetch("/api/training/feedback-upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "Upload failed.");
      return null;
    }
    return { path: json.path, kind: json.kind };
  }

  function teardownMeter() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current != null) clearInterval(timerRef.current);
    timerRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevels([]);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        teardownMeter();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        voiceBlobRef.current = blob;
        setUploadingVoice(true);
        const up = await uploadFile(blob, "voice-note.webm");
        setUploadingVoice(false);
        if (up) setVoice({ path: up.path, url: URL.createObjectURL(blob) });
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setElapsed(0);

      // Live waveform from the mic stream (optional — skipped under reduced motion).
      if (!reduce) {
        try {
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AC();
          audioCtxRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.7;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          let frame = 0;
          const loop = () => {
            analyser.getByteFrequencyData(data);
            if ((frame++ & 1) === 0) {
              const N = 28;
              const bars: number[] = [];
              for (let i = 0; i < N; i++) bars.push(Math.min(1, (data[Math.floor((i / N) * 44) + 1] ?? 0) / 190));
              setLevels(bars);
            }
            rafRef.current = requestAnimationFrame(loop);
          };
          rafRef.current = requestAnimationFrame(loop);
        } catch {
          /* meter is optional — recording still works */
        }
      }
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError("Couldn't access the microphone — you can upload an audio file instead.");
    }
  }
  function stopRecording() {
    recRef.current?.stop();
    setRecording(false);
  }
  async function onPickVoice(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    voiceBlobRef.current = f;
    setUploadingVoice(true);
    const up = await uploadFile(f, f.name);
    setUploadingVoice(false);
    if (up) setVoice({ path: up.path, url: URL.createObjectURL(f) });
    if (voiceInputRef.current) voiceInputRef.current.value = "";
  }

  /** AI transcribe + summarize the voice note. English stays English; Hindi → Hinglish. */
  async function summarize() {
    const blob = voiceBlobRef.current;
    if (!blob) return setError("Record or upload a voice note first.");
    setError(null);
    setSummarizing(true);
    try {
      const { base64, mimeType } = await blobToWavBase64(blob);
      const res = await fetch("/api/training/summarize-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });
      const json = await res.json();
      if (!json.ok) return setError(json.error || "Couldn't summarize the recording.");
      const text = (json.summary?.trim() || json.transcript?.trim() || "") as string;
      if (!text) return setError("Nothing could be transcribed — try a clearer recording.");
      setVoiceTranscript((prev) => (prev.trim() ? prev.trim() + "\n\n" : "") + text);
      fireToast({ message: "AI summary added to the transcript.", type: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process the audio.");
    } finally {
      setSummarizing(false);
    }
  }
  async function onPickPic(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingPic(true);
    const up = await uploadFile(f, f.name);
    setUploadingPic(false);
    if (up) setPicture({ path: up.path, url: URL.createObjectURL(f) });
    if (picInputRef.current) picInputRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName) return setError("Add the name of the person being rated.");
    setSubmitting(true);
    const res = await createFeedback({
      type,
      ratedEmployeeId,
      ratedName: ratedName || null,
      clientName,
      serviceId,
      rating,
      q1,
      q2,
      voiceNotePath: voice?.path ?? null,
      voiceTranscript,
      picturePath: picture?.path ?? null,
      escalate,
      escalatedToId: escalate ? escalatedToId : null,
    });
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    fireToast({ message: "Feedback recorded.", type: "success" });
    router.push("/training/feedback" as Route);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Type selector — segmented, drives the questions below */}
      <Section title="Feedback Type" hint="The questions below adapt to what you pick." delay={0}>
        <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
          {FEEDBACK_TYPES.map((t) => {
            const active = type === t;
            return (
              <button key={t} type="button" onClick={() => setType(t)} className="relative rounded-xl px-4 py-3 text-[15px] font-bold transition-colors" style={active ? { color: "#fff" } : { color: "var(--color-ink-soft)", border: "1px solid var(--color-hairline-strong)", background: "#fff" }}>
                {active && <motion.span layoutId="fbtype" className="absolute inset-0 rounded-xl" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 24px -10px rgba(225,6,0,0.6)" }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }} />}
                <span className="relative z-10">{FEEDBACK_TEMPLATES[t].label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Who & What" delay={40}>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <div>
            <label className={LABEL}>{tpl.ratedLabel}</label>
            <input ref={firstRef} autoFocus className={FIELD} value={ratedName} maxLength={160} onChange={(e) => setRatedName(e.target.value)} placeholder="Type a name" />
          </div>
          <div>
            <label className={LABEL}>Link to staff (optional)</label>
            <LookupSelect label="staff member" value={ratedEmployeeId} onChange={setRatedEmployeeId} options={employees} className={FIELD} placeholder="Select staff…" />
          </div>
          <div>
            <label className={LABEL}>Client / participant</label>
            <input className={FIELD} value={clientName} maxLength={160} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" />
          </div>
          <div>
            <label className={LABEL}>Service</label>
            <LookupSelect label="service" value={serviceId} onChange={setServiceId} options={services} onAdd={(n) => addFeedbackService(n)} onDelete={(id) => deleteFeedbackService(id)} className={FIELD} />
          </div>
        </div>
      </Section>

      <Section title="Rating & Questions" delay={80}>
        <div className="rounded-xl border border-hairline bg-surface-soft p-5">
          <p className="text-[15.5px] font-semibold text-ink-strong" style={{ lineHeight: 1.45 }}>{fillTemplate(tpl.ratingQuestion, displayName)}</p>
          <div className="mt-3"><StarRating value={rating} onChange={setRating} /></div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4">
          <AnimatePresence mode="wait">
            <motion.div key={type} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col gap-4">
              <div>
                <label className={LABEL}>{tpl.q1}</label>
                <textarea className={FIELD + " min-h-[72px] resize-y"} value={q1} maxLength={4000} onChange={(e) => setQ1(e.target.value)} placeholder="Your answer" />
              </div>
              <div>
                <label className={LABEL}>{tpl.q2}</label>
                <textarea className={FIELD + " min-h-[72px] resize-y"} value={q2} maxLength={4000} onChange={(e) => setQ2(e.target.value)} placeholder="Your answer" />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </Section>

      <Section title="Attachments" hint="Record a voice note (or upload one), add a transcript, and a picture." delay={120}>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          {/* Voice */}
          <div>
            <label className={LABEL}>Voice note</label>
            <input ref={voiceInputRef} type="file" accept="audio/*" className="hidden" onChange={onPickVoice} />
            {recording ? (
              <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)", background: "color-mix(in srgb, var(--color-altus-red) 6%, transparent)" }}>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold tabular-nums" style={{ color: "var(--color-altus-red-deep)" }}>
                  <span className={"size-2.5 rounded-full" + (reduce ? "" : " animate-pulse")} style={{ background: "var(--color-altus-red)" }} /> {fmtTime(elapsed)}
                </span>
                <WaveBars levels={levels} />
                <button type="button" onClick={stopRecording} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-white" style={{ background: "var(--color-altus-red)" }}><Square size={14} /> Stop</button>
              </div>
            ) : voice ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-soft px-3 py-2.5">
                  <audio controls src={voice.url} className="h-9 flex-1" />
                  <button type="button" onClick={() => { setVoice(null); voiceBlobRef.current = null; }} aria-label="Remove" className="text-ink-subtle hover:text-altus-red"><X size={16} /></button>
                </div>
                <button type="button" onClick={summarize} disabled={summarizing || !voiceBlobRef.current} className="inline-flex items-center justify-center gap-2 rounded-lg border py-2.5 text-[13.5px] font-bold transition-colors disabled:opacity-60" style={{ borderColor: "color-mix(in srgb, var(--color-purple) 40%, transparent)", color: "var(--color-purple-deep)", background: "color-mix(in srgb, var(--color-purple) 8%, transparent)" }}>
                  {summarizing ? <><Loader2 size={15} className="animate-spin" /> Transcribing & summarizing…</> : <><Sparkles size={15} /> Summarize with AI · English / Hindi→Hinglish</>}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button type="button" onClick={startRecording} disabled={uploadingVoice} className={FIELD + " flex flex-1 items-center justify-center gap-2 text-ink-soft"}>
                  {uploadingVoice ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} Record
                </button>
                <button type="button" onClick={() => voiceInputRef.current?.click()} disabled={uploadingVoice} className="inline-flex items-center justify-center rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-ink-soft" aria-label="Upload audio"><Upload size={16} /></button>
              </div>
            )}
          </div>
          {/* Picture */}
          <div>
            <label className={LABEL}>Picture</label>
            <input ref={picInputRef} type="file" accept="image/*" className="hidden" onChange={onPickPic} />
            {picture ? (
              <div className="relative overflow-hidden rounded-lg border border-hairline-strong">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={picture.url} alt="attachment" className="max-h-44 w-full object-cover" />
                <button type="button" onClick={() => setPicture(null)} aria-label="Remove" className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white"><X size={15} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => picInputRef.current?.click()} disabled={uploadingPic} className={FIELD + " flex items-center justify-center gap-2 text-ink-subtle"}>
                {uploadingPic ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />} Add Picture
              </button>
            )}
          </div>
          <div className="col-span-2 max-md:col-span-1">
            <label className={LABEL}>Transcript / summary (optional)</label>
            <textarea className={FIELD + " min-h-[64px] resize-y"} value={voiceTranscript} maxLength={5000} onChange={(e) => setVoiceTranscript(e.target.value)} placeholder="Type out the voice note, or summarize" />
          </div>
        </div>
      </Section>

      <Section title="Escalation" delay={160}>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} className="size-5 rounded accent-[var(--color-altus-red)]" />
          <span className="text-[15px] font-semibold text-ink-strong">Escalate This Case</span>
        </label>
        {escalate && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-xl border px-4 py-3 text-[13.5px] font-medium" style={{ background: "color-mix(in srgb, var(--color-amber) 10%, transparent)", borderColor: "color-mix(in srgb, var(--color-amber) 36%, transparent)", color: "var(--color-amber-deep)" }}>
              <span className="inline-flex items-center gap-1.5 font-bold"><AlertTriangle size={15} /> The assigned consultant and a manager will be alerted.</span>
            </div>
            <div>
              <label className={LABEL}>Escalate to (consultant)</label>
              <LookupSelect label="consultant" value={escalatedToId} onChange={setEscalatedToId} options={employees} className={FIELD} placeholder="Select consultant…" />
            </div>
          </div>
        )}
      </Section>

      {error && <div role="alert" className="rounded-lg px-4 py-3 text-[14px] font-semibold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }}>{error}</div>}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        <button type="button" onClick={() => router.push("/training/feedback" as Route)} className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-[15px] font-bold text-ink-strong hover:border-hairline-strong"><ArrowLeft size={16} /> Cancel</button>
        <button type="submit" disabled={submitting} className="wg-sheen inline-flex items-center gap-2 rounded-xl py-3 px-7 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}>
          {submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={2.4} />} Submit Feedback
        </button>
      </div>
    </form>
  );
}
