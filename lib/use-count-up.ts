"use client";
import { useEffect, useState } from "react";

/**
 * Animate a numeric value counting up from 0 to `value` once, on mount or
 * whenever `value` changes. Returns the current animated value.
 */
export function useCountUp(value: number, duration = 1100): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value === 0) {
      setN(0);
      return;
    }
    let frame: number;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const elapsed = t - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setN(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return n;
}
