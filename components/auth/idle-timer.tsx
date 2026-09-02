"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
] as const;

interface Props {
  /** Milliseconds of inactivity before onTimeout fires. */
  timeoutMs: number;
  /** Milliseconds before timeout when the warning toast appears. */
  warningMs?: number;
  /** Called once when the idle window elapses without activity. */
  onTimeout: () => void;
}

export function IdleTimer({ timeoutMs, warningMs = 30_000, onTimeout }: Props) {
  const [warning, setWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef<number>(0);
  const firedRef = useRef(false);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warnRef.current) clearTimeout(warnRef.current);
    setWarning(false);
    firedRef.current = false;
    warnRef.current = setTimeout(
      () => setWarning(true),
      Math.max(0, timeoutMs - warningMs),
    );
    timerRef.current = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onTimeout();
    }, timeoutMs);
  }, [timeoutMs, warningMs, onTimeout]);

  const onActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastResetRef.current < 1000) return; // throttle
    lastResetRef.current = now;
    schedule();
  }, [schedule]);

  useEffect(() => {
    schedule();
    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, onActivity, { capture: true, passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        document.removeEventListener(ev, onActivity, { capture: true });
      }
    };
  }, [schedule, onActivity]);

  if (!warning) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-6 right-6 z-50 max-w-sm rounded-section border border-hairline bg-surface-card shadow-lg p-4 flex items-center gap-3"
      style={{ boxShadow: "0 24px 48px -16px rgba(15,23,42,0.18)" }}
    >
      <div className="flex-1 text-body">
        <strong className="block">You&apos;ll be signed out shortly.</strong>
        <span className="text-ink-subtle text-[13px]">
          No activity in the last few minutes.
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          lastResetRef.current = Date.now();
          schedule();
        }}
        className="px-3 py-2 rounded-md bg-altus-red text-white text-[13px] font-bold whitespace-nowrap"
      >
        Stay signed in
      </button>
    </div>
  );
}
