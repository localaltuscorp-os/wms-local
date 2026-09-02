"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion-utils";

/**
 * Reduced-motion-aware count-up. Animates 0 → `value` once on mount and
 * whenever `value` changes. When the user prefers reduced motion, the final
 * value is returned immediately (no animation). GPU-free — this only drives a
 * number; callers feed it into transform/opacity/SVG-stroke for motion.
 *
 * `decimals` keeps fractional values smooth (e.g. percentages) while integers
 * stay crisp.
 */
export function useAnimCount(value: number, duration = 1100, decimals = 0): number {
  const reduce = useReducedMotion() ?? false;
  const [n, setN] = useState(reduce ? value : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      setN(value);
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) {
      setN(value);
      return;
    }
    const factor = Math.pow(10, decimals);
    let frame = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const progress = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = from + delta * eased;
      setN(Math.round(current * factor) / factor);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, decimals, reduce]);

  return n;
}
