"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Premium gradient submit button with arrow-nudge on hover and a
 * properly-designed spinner state (not generic "Loading…" text).
 */
export function AuthSubmit({
  children,
  pending,
  pendingLabel = "Working",
  arrow = true,
  disabled,
}: {
  children: ReactNode;
  pending: boolean;
  pendingLabel?: string;
  arrow?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="submit" disabled={pending || disabled} className="auth-cta group">
      {/* Sweep highlight on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.22) 50%, transparent 70%)",
          backgroundSize: "200% 100%",
          animation: "accentStripFlow 2.6s linear infinite",
        }}
      />
      {pending ? (
        <>
          <Loader2
            className="h-4 w-4"
            style={{ animation: "spinFast 0.8s linear infinite" }}
            aria-hidden
          />
          <span>{pendingLabel}</span>
          <span className="sr-only">Please wait</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          {arrow && (
            <ArrowRight
              className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden
            />
          )}
        </>
      )}
    </button>
  );
}
