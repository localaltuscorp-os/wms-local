"use client";

import * as React from "react";
import { Check, CloudOff, Loader2 } from "lucide-react";
import type { SaveState } from "./use-autosave";

/**
 * The autosave status line every HR form shows.
 *
 * DELIBERATELY SUBTLE while things are going well and DELIBERATELY NOT while
 * they are not. "Saving…" and "Saved" sit in muted ink and are easy to ignore,
 * because a form that is working should not keep interrupting the person filling
 * it. A failure switches to the danger colour and states plainly that it is
 * retrying — the previous behaviour was a save that failed silently and a form
 * that went on looking saved, which is how people lose an hour of typing without
 * ever seeing a warning.
 *
 * `idle` renders NOTHING rather than "Not saved". A form nobody has touched yet
 * has nothing to report, and an empty-state label there reads as a problem.
 */
export function SaveIndicator({
  state,
  savedAt,
  error,
  className = "",
}: {
  state: SaveState;
  savedAt?: Date | null;
  error?: string | null;
  className?: string;
}) {
  if (state === "idle" && !savedAt) return null;

  if (state === "retrying") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${className}`}
        style={{ color: "var(--color-altus-red)" }}
        role="status"
        aria-live="assertive"
        title={error ?? undefined}
      >
        <CloudOff size={13} strokeWidth={2.4} />
        Save failed — retrying
      </span>
    );
  }

  if (state === "saving") {
    return (
      <span
        className={`text-ink-subtle inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${className}`}
        role="status"
        aria-live="polite"
      >
        <Loader2 size={13} className="animate-spin" />
        Saving…
      </span>
    );
  }

  return (
    <span
      className={`text-ink-subtle inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${className}`}
      role="status"
      aria-live="polite"
    >
      <Check size={13} strokeWidth={2.6} />
      {savedAt ? `Saved ${hhmm(savedAt)}` : "Saved"}
    </span>
  );
}

/** Local wall-clock, no seconds — the time is reassurance, not a measurement. */
function hhmm(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
