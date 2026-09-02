"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isForbidden = error.message === "Forbidden";

  const eyebrow = isForbidden ? "403" : "Something went wrong";
  const headline = isForbidden ? "Admin only." : "We hit a snag.";
  const explanation = isForbidden
    ? "This area is restricted to administrators. If you think you should have access, ask the team to update your role."
    : "An unexpected error occurred. Try again in a moment — if it keeps happening, reach out to the team.";

  const washRgba = isForbidden
    ? "rgba(245, 158, 11, 0.10)" // amber wash for 403
    : "rgba(225, 6, 0, 0.10)"; // altus red wash for generic

  return (
    <main className="min-h-screen flex items-center justify-center px-8 py-24">
      <section
        className="rounded-section w-full max-w-[640px] p-14 max-md:p-8 text-center"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${washRgba}, transparent 70%), linear-gradient(180deg, var(--color-surface-card) 0%, var(--color-surface-soft) 100%)`,
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
          opacity: 0,
          animation: "fadeUp 600ms ease-out 100ms forwards",
        }}
      >
        <p
          className="text-ink-subtle"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </p>
        <h1
          className="text-ink-strong mt-3"
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
            fontSize: 48,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {headline}
        </h1>
        <p
          className="text-body-lg text-ink-muted mt-5 mx-auto"
          style={{ maxWidth: 440, lineHeight: 1.6 }}
        >
          {explanation}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="text-cta text-white px-6 py-3 rounded-chip inline-flex items-center gap-2"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 4px 12px rgba(225, 6, 0, 0.25)",
            }}
          >
            Go to dashboard →
          </Link>
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
        </div>

        {!isForbidden && error.digest ? (
          <p className="text-ink-subtle text-xs mt-8 font-mono tabular-nums">
            ref: {error.digest}
          </p>
        ) : null}
      </section>
    </main>
  );
}
