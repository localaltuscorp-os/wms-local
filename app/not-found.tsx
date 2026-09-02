import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-8 py-24">
      <section
        className="rounded-section w-full max-w-[640px] p-14 max-md:p-8 text-center"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(168, 85, 247, 0.10), transparent 70%), linear-gradient(180deg, var(--color-surface-card) 0%, var(--color-surface-soft) 100%)",
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
          404
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
          Not here.
        </h1>
        <p
          className="text-body-lg text-ink-muted mt-5 mx-auto"
          style={{ maxWidth: 440, lineHeight: 1.6 }}
        >
          The page you’re looking for doesn’t exist or was moved.
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
            Back to dashboard →
          </Link>
        </div>
      </section>
    </main>
  );
}
