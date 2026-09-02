"use client";

import { RefreshCw } from "lucide-react";

/**
 * Friendly fallback when the dashboard's data queries time out against a
 * slow/cold database. Far better than crashing the whole page to the
 * global "we hit a snag" boundary — the slowness is usually transient, so
 * we offer an immediate retry.
 */
export function DashboardLoadError() {
  return (
    <section
      className="mx-auto max-w-[720px] px-8 max-md:px-4 mt-16 mb-24 text-center"
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
        Dashboard is taking longer than usual
      </h1>
      <p
        className="text-body-lg text-ink-muted mt-3 mx-auto"
        style={{ maxWidth: 480, lineHeight: 1.6 }}
      >
        The database is responding slowly right now — this is usually
        temporary. Your data is safe; just give it another try.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-cta text-white mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-chip"
        style={{
          background:
            "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
          boxShadow: "0 4px 12px rgba(225, 6, 0, 0.25)",
          cursor: "pointer",
          border: "none",
        }}
      >
        <RefreshCw size={18} strokeWidth={2.4} />
        Retry
      </button>
    </section>
  );
}
