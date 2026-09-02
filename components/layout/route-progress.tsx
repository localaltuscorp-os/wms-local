"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top-of-page progress bar that fires the instant a user clicks an
 * in-app link and completes when the new route paints — the signature
 * "it's working" signal large products use.
 *
 * The App Router has no router events, so navigation START is detected by
 * capturing internal-anchor clicks, and navigation COMPLETE by a change in
 * pathname / search params. This is purely perceived performance: it can't
 * make the server faster, but the immediate motion on click plus a steady
 * trickle while the data resolves makes the wait feel short and intentional.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = React.useState(0);
  const [active, setActive] = React.useState(false);

  const trickle = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (trickle.current) clearInterval(trickle.current);
    if (safety.current) clearTimeout(safety.current);
    trickle.current = null;
    safety.current = null;
  }, []);

  const finish = React.useCallback(() => {
    clearTimers();
    setProgress(100);
    if (fade.current) clearTimeout(fade.current);
    fade.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 260);
  }, [clearTimers]);

  const start = React.useCallback(() => {
    if (fade.current) clearTimeout(fade.current);
    clearTimers();
    setActive(true);
    setProgress(8);
    // Ease toward 90% but never reach it on our own — the route change is
    // what completes the bar. Bigger steps early, slowing as it fills.
    trickle.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(0.5, (90 - p) * 0.06) : p));
    }, 180);
    // Safety net for navigations we can't observe completing (blocked,
    // same-page, external redirect): finish after a few seconds.
    safety.current = setTimeout(() => finish(), 8000);
  }, [clearTimers, finish]);

  // Navigation START — capture clicks on internal anchors.
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        anchor.getAttribute("target") === "_blank" ||
        anchor.hasAttribute("download") ||
        !href.startsWith("/") ||
        href.startsWith("//")
      ) {
        return;
      }
      // Same URL → no navigation will happen, so don't start the bar.
      const qs = searchParams?.toString();
      const current = qs ? `${pathname}?${qs}` : pathname;
      if (href === pathname || href === current) return;
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, searchParams, start]);

  // Navigation COMPLETE — the route changed (skip the initial mount).
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    finish();
  }, [pathname, searchParams, finish]);

  React.useEffect(
    () => () => {
      clearTimers();
      if (fade.current) clearTimeout(fade.current);
    },
    [clearTimers],
  );

  if (!active && progress === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, var(--color-altus-red), #ff5560)",
          boxShadow: "0 0 8px rgba(225, 6, 0, 0.55), 0 0 2px rgba(225, 6, 0, 0.9)",
          borderRadius: "0 2px 2px 0",
          opacity: active ? 1 : 0,
          transition: "width 180ms ease-out, opacity 260ms ease",
        }}
      />
    </div>
  );
}
