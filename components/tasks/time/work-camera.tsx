"use client";

import * as React from "react";
import { Camera, ShieldCheck, VideoOff, Loader2, Radio } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { giveCameraConsent, uploadWorkSnapshot } from "@/app/(app)/tasks/time-camera-actions";

/**
 * Camera monitoring — TRANSPARENT + consent-first. Only renders for the doer, and
 * only while a session is live. The employee must consent once; while active they
 * always see the indicator + a live self-preview, and their browser shows its own
 * camera light on every capture. Nothing hidden; denial just pauses snapshots
 * (the timer keeps running). Viewing snapshots is super-admin only (server-gated).
 */
export function WorkCamera({
  liveSessionId,
  intervalMin,
  hasConsent: initialConsent,
}: {
  liveSessionId: string | null;
  intervalMin: number;
  hasConsent: boolean;
}) {
  const [consent, setConsent] = React.useState(initialConsent);
  const [consenting, setConsenting] = React.useState(false);
  const [camState, setCamState] = React.useState<"idle" | "starting" | "on" | "blocked">("idle");
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const active = !!liveSessionId && consent;

  // Acquire / release the camera with the live session lifecycle.
  React.useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
      setCamState("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamState("on");
      } catch {
        if (!cancelled) setCamState("blocked");
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (!active) setCamState("idle");
    };
  }, [active]);

  // Capture loop — one shot shortly after the camera warms up, then every N min.
  React.useEffect(() => {
    if (camState !== "on" || !liveSessionId) return;

    async function capture() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !streamRef.current) return;
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.7));
      if (!blob || !liveSessionId) return;
      const fd = new FormData();
      fd.set("sessionId", liveSessionId);
      fd.set("file", new File([blob], "snapshot.jpg", { type: "image/jpeg" }));
      const r = await uploadWorkSnapshot(fd);
      if (!r.ok) console.warn("[work-camera] snapshot upload failed:", r.error);
    }

    const warmup = setTimeout(() => void capture(), 3000);
    const id = setInterval(() => void capture(), Math.max(1, intervalMin) * 60 * 1000);
    return () => {
      clearTimeout(warmup);
      clearInterval(id);
    };
  }, [camState, liveSessionId, intervalMin]);

  async function onConsent() {
    setConsenting(true);
    const r = await giveCameraConsent();
    setConsenting(false);
    if (r.ok) setConsent(true);
    else fireToast({ message: r.error, type: "error" });
  }

  // No live session → nothing to show.
  if (!liveSessionId) return null;

  // Live session but not yet consented → consent card.
  if (!consent) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink-strong">Work monitoring consent</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
              While a work session is running, the company captures a webcam snapshot every {intervalMin} minutes for
              verification. You will always see a &ldquo;monitoring active&rdquo; indicator and your browser&apos;s own
              camera light. Snapshots are visible to super-admins only. You can decline — the timer still works, no
              snapshots are taken.
              {/* NOTE: replace with your organisation's finalised monitoring policy text. */}
            </p>
            <button
              type="button"
              onClick={onConsent}
              disabled={consenting}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {consenting ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              I consent to monitoring
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-14 w-20 rounded-lg bg-black object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {camState === "on" && (
            <span className="absolute right-1 top-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-altus-red opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-altus-red" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {camState === "blocked" ? (
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-amber-600">
              <VideoOff size={14} /> Camera blocked — snapshots paused
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-strong">
              <Radio size={14} className="text-altus-red" /> Work monitoring active
            </p>
          )}
          <p className="text-[11.5px] text-ink-muted">Snapshot every {intervalMin} min · super-admin visible</p>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
