"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, PenLine, Upload } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { submitConsent } from "@/app/(app)/salary/policy/actions";

const CANVAS_W = 480;
const CANVAS_H = 160;

/**
 * Accessible e-signature capture. The employee either draws their signature on
 * a canvas (pointer + touch) — exported as a PNG via `canvas.toBlob` — or
 * uploads a signature image (PNG/JPEG). On submit it builds a FormData and
 * calls the `submitConsent` server action, which records the consent against
 * the CURRENT policy version (re-derived server-side; nothing here can forge
 * the version or the employee).
 */
export function SignaturePad() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prepare the 2D context (white background, dark stroke) once mounted.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const pointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Map CSS pixels → canvas backing-store pixels.
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current!;
      canvas.setPointerCapture(e.pointerId);
      drawing.current = true;
      lastPoint.current = pointFromEvent(e);
    },
    [pointFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;
      const ctx = canvasRef.current!.getContext("2d");
      if (!ctx) return;
      const p = pointFromEvent(e);
      const last = lastPoint.current;
      if (last) {
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        hasInk.current = true;
      }
      lastPoint.current = p;
    },
    [pointFromEvent],
  );

  const onPointerUp = useCallback(() => {
    drawing.current = false;
    lastPoint.current = null;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }, []);

  const canvasToBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob((b) => resolve(b), "image/png");
    });
  }, []);

  async function onSubmit() {
    setSubmitting(true);
    try {
      const form = new FormData();
      if (uploadFile) {
        form.set("signatureKind", "image");
        form.set("signature", uploadFile, uploadFile.name);
      } else {
        if (!hasInk.current) {
          fireToast({ message: "Draw your signature or upload an image first." });
          setSubmitting(false);
          return;
        }
        const blob = await canvasToBlob();
        if (!blob) {
          fireToast({ message: "Could not read the drawn signature. Try again." });
          setSubmitting(false);
          return;
        }
        form.set("signatureKind", "draw");
        form.set("signature", blob, "signature.png");
      }

      const res = await submitConsent(form);
      if (!res.ok) {
        fireToast({ message: res.error });
        setSubmitting(false);
        return;
      }
      fireToast({ message: "Thank you — your consent has been recorded." });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-section border border-hairline bg-surface-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <PenLine size={16} strokeWidth={2.2} className="text-ink-soft" />
        <h3 className="text-[15px] font-bold text-ink-strong">Sign to acknowledge</h3>
      </div>
      <p className="text-[13px] text-ink-subtle mb-4" style={{ lineHeight: 1.5 }}>
        Draw your signature below, or upload a signature image (PNG or JPEG).
        Signing records your consent to the current salary policy.
      </p>

      <div className="inline-block">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          role="img"
          aria-label="Signature drawing area"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block max-w-full rounded-md border border-hairline-strong bg-white touch-none cursor-crosshair"
          style={{ width: CANVAS_W, height: CANVAS_H }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={clearCanvas}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2 px-3.5 text-[13px] font-medium text-ink-strong hover:border-hairline-strong transition-colors disabled:opacity-50"
        >
          <Eraser size={14} strokeWidth={2.2} />
          Clear
        </button>

        <label className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2 px-3.5 text-[13px] font-medium text-ink-strong hover:border-hairline-strong transition-colors cursor-pointer">
          <Upload size={14} strokeWidth={2.2} />
          {uploadFile ? "Change image" : "Upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {uploadFile ? (
          <span className="text-[13px] text-ink-soft">
            {uploadFile.name}
            <button
              type="button"
              onClick={() => setUploadFile(null)}
              className="ml-2 text-ink-subtle underline hover:text-ink-strong"
            >
              remove
            </button>
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
      >
        <PenLine size={15} strokeWidth={2.2} />
        {submitting ? "Submitting…" : "Sign & Submit"}
      </button>
    </div>
  );
}
