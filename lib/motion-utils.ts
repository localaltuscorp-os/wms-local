"use client";
import { useEffect, useState } from "react";

/**
 * Returns true when the user has touch as primary input (mobile/tablet).
 * Used to disable cursor-tracking effects that don't make sense on touch.
 */
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isTouch;
}

// Re-export Framer Motion's reduced-motion hook from one place so
// callers don't have to know the package name (we use `motion` v12).
export { useReducedMotion } from "motion/react";
