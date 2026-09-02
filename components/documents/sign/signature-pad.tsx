"use client";

import * as React from "react";
import { Eraser, PenLine } from "lucide-react";

/**
 * Documents · reusable canvas signature pad for the DigiLocker-verified signing
 * flow. Draw with pointer OR touch (unified via Pointer Events), Clear to reset,
 * and read the mark out as a transparent PNG data-URL for finalizeSignature().
 *
 * - Backing store is sized to devicePixelRatio for crisp strokes on retina.
 * - Transparent background so the PNG composites cleanly onto the signed PDF.
 * - `onChange(hasInk)` lets the parent enable/disable "Confirm & Sign".
 * - Imperative handle exposes toPngDataUrl()/clear() so the parent drives it.
 * - Reduced-motion safe: no animation here; strokes are drawn synchronously.
 */

export interface SignaturePadHandle {
  /** Returns a `data:image/png;base64,...` of the drawn mark, or null if empty. */
  toPngDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

const INK = "#111827"; // near-black stroke; reads on both light/dark PDF paper

export const SignaturePad = React.forwardRef<
  SignaturePadHandle,
  {
    /** Fires with true once the pad has ink, false when cleared. */
    onChange?: (hasInk: boolean) => void;
    height?: number;
    disabled?: boolean;
  }
>(function SignaturePad({ onChange, height = 180, disabled = false }, ref) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = React.useRef(false);
  const [empty, setEmpty] = React.useState(true);

  const setEmptyBoth = React.useCallback(
    (v: boolean) => {
      hasInkRef.current = !v;
      setEmpty(v);
      onChange?.(!v);
    },
    [onChange],
  );

  // Size the backing store to the element × DPR, preserving nothing (a resize
  // clears the pad — acceptable, signatures are drawn in one sitting).
  const resize = React.useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = wrap.clientWidth;
    const h = height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    setEmptyBoth(true);
  }, [height, setEmptyBoth]);

  React.useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointFrom(e);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = pointFrom(e);
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmptyBoth(false);
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    last.current = null;
  }

  const clear = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setEmptyBoth(true);
  }, [setEmptyBoth]);

  React.useImperativeHandle(
    ref,
    () => ({
      clear,
      isEmpty: () => !hasInkRef.current,
      toPngDataUrl: () => {
        if (!hasInkRef.current) return null;
        return canvasRef.current?.toDataURL("image/png") ?? null;
      },
    }),
    [clear],
  );

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border border-hairline bg-surface-soft"
        style={{ height }}
      >
        {/* Baseline the signer draws on */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-solid"
          style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)" }}
        />
        {empty && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[13px] font-medium text-ink-subtle"
          >
            <PenLine size={15} strokeWidth={2.2} />
            Draw your signature here
          </div>
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Signature drawing area"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
          className="relative block touch-none"
          style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11.5px] text-ink-subtle">Use a mouse, trackpad, or finger.</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || empty}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Eraser size={13} strokeWidth={2.2} />
          Clear
        </button>
      </div>
    </div>
  );
});
