"use client";

import * as React from "react";
import { Camera, X, Check, RefreshCw } from "lucide-react";
import { fireToast } from "@/lib/toast";

/**
 * Device-camera selfie capture for the Candidate photo. Opens an inline live
 * preview (front camera) via getUserMedia, freezes a frame to a canvas, and hands
 * the result back as a JPEG File through `onCapture` — which flows into the same
 * upload path as the file tile above it (so upload stays the fallback).
 *
 * Load-neutral: pure browser APIs, no new deps, client-only. Camera access needs
 * a secure origin (https / localhost); on an insecure LAN IP getUserMedia is
 * blocked, so we fail soft with a toast and the upload tile remains available.
 */
export function SelfieCapture({ onCapture }: { onCapture: (f: File) => void }) {
  const [open, setOpen] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
    setOpen(false);
  }, []);

  const start = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fireToast({ message: "This browser can't access the camera — upload a photo instead.", type: "error" });
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      fireToast({
        message: "Open the app at http://localhost:3000 to use the camera — it's blocked on the network IP. You can still upload a photo.",
        type: "error",
      });
      return;
    }
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
        setReady(true);
      }
    } catch {
      stop();
      fireToast({ message: "Couldn't access the camera. Allow camera access, or upload a photo instead.", type: "error" });
    }
  }, [stop]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          fireToast({ message: "Couldn't capture the photo — try again.", type: "error" });
          return;
        }
        onCapture(new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" }));
        stop();
      },
      "image/jpeg",
      0.9,
    );
  }

  // Always release the camera when the component unmounts (leaving the step).
  React.useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        className="mt-3 inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red"
      >
        <Camera size={15} strokeWidth={2.3} /> Take selfie
      </button>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border-2 border-hairline-strong bg-black">
      <div className="relative">
        {/* Mirror the preview so the selfie reads naturally. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className="block h-64 w-full object-cover" style={{ transform: "scaleX(-1)" }} />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-[13px] font-semibold text-white/80">
            Starting camera…
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 bg-white p-3">
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-[13px] font-bold text-ink-muted transition-colors hover:bg-altus-red/10 hover:text-altus-red"
        >
          <X size={15} /> Cancel
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void start(); }}
            title="Restart camera"
            className="grid h-9 w-9 place-items-center rounded-pill border border-hairline-strong text-ink-muted transition-colors hover:text-ink-strong"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            <Check size={15} strokeWidth={2.6} /> Capture
          </button>
        </div>
      </div>
    </div>
  );
}
