"use client";

import { RefreshCw } from "lucide-react";

/**
 * Scoped error boundary for the whole authenticated app shell.
 *
 * Without this, any unhandled throw inside an (app) route — a slow/failed DB
 * query in a server component, or a server action that rejects mid-write —
 * bubbles all the way to the root `app/error.tsx` ("We hit a snag.") and
 * replaces the entire screen, chrome and all.
 *
 * Most of those throws are transient (the remote DB is slow to wake), so we
 * catch them here, keep the app chrome, and offer an immediate retry via
 * `reset()` (re-renders the segment without a full reload). The user's place
 * in the app is preserved and their data is untouched.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Admin-only guards throw "Forbidden" — let the root boundary render its
  // dedicated 403 screen for that instead of a generic retry card.
  if (error.message === "Forbidden") throw error;

  return (
    <main className="mx-auto max-w-[720px] px-8 max-md:px-4 mt-16 mb-24">
      <section
        className="text-center"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(225, 6, 0, 0.08), transparent 70%), linear-gradient(180deg, var(--color-surface-card) 0%, var(--color-surface-soft) 100%)",
          border: "1px solid var(--color-hairline)",
          borderRadius: 20,
          padding: 48,
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        <span
          aria-hidden
          className="inline-flex size-14 items-center justify-center rounded-full"
          style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-muted)" }}
        >
          <RefreshCw size={26} strokeWidth={2.2} />
        </span>
        <h1
          className="text-ink-strong mt-5"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: 30,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          That didn&apos;t go through
        </h1>
        <p
          className="text-body-lg text-ink-muted mt-3 mx-auto"
          style={{ maxWidth: 480, lineHeight: 1.6 }}
        >
          Something hiccuped — usually the database being slow for a moment.
          Your data is safe. Try that again; if it keeps happening, let the
          team know.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="text-cta text-white inline-flex items-center gap-2 px-6 py-3 rounded-chip"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 4px 12px rgba(225, 6, 0, 0.25)",
              cursor: "pointer",
              border: "none",
            }}
          >
            <RefreshCw size={18} strokeWidth={2.4} />
            Try again
          </button>
        </div>
        {error.digest ? (
          <p className="text-ink-subtle text-xs mt-7 font-mono tabular-nums">
            ref: {error.digest}
          </p>
        ) : null}
      </section>
    </main>
  );
}
