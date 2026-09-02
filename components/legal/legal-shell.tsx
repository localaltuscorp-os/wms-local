import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";

interface Props {
  eyebrow: string;
  title: string;
  /** ISO date like "2026-05-14" — shown as "Last updated …" */
  lastUpdated: string;
  /** One-paragraph editorial subtitle below the title. */
  intro: string;
  children: ReactNode;
}

/**
 * Light-canvas legal page shell used by /terms and /privacy.  Public route
 * (allowlisted in middleware) so unauthenticated visitors can read it
 * directly from the login form footer or share the URL with peers.
 */
export function LegalShell({ eyebrow, title, lastUpdated, intro, children }: Props) {
  const formatted = new Date(lastUpdated).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[var(--color-canvas-base)]">
      {/* Top chrome — Altus Corp brand + back-to-sign-in */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-[rgba(250,251,252,0.85)] backdrop-blur-xl">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between px-8 py-4 max-md:px-4">
          <Link
            href={"/login" as Route}
            className="flex items-center gap-3 group"
          >
            <span
              aria-hidden
              className="inline-block h-[10px] w-[10px] rounded-full shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, #ff5560, var(--color-altus-red))",
                boxShadow: "0 0 12px rgba(225, 6, 0, 0.45)",
              }}
            />
            <span
              className="font-serif text-[22px] leading-none whitespace-nowrap text-ink-strong"
              style={{ fontStyle: "italic", letterSpacing: "-0.01em" }}
            >
              Altus{" "}
              <span
                style={{
                  display: "inline-block",
                  paddingRight: "0.18em",
                  background:
                    "linear-gradient(135deg, #ff5560, var(--color-altus-red))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Corp
              </span>
            </span>
          </Link>
          <Link
            href={"/login" as Route}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
            Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-8 max-md:px-4 py-16 max-md:py-10">
        <div
          className="text-[11px] uppercase tracking-[0.18em] font-bold mb-3"
          style={{ color: "var(--color-altus-red)" }}
        >
          {eyebrow}
        </div>
        <h1
          className="font-serif text-ink-strong"
          style={{
            fontStyle: "italic",
            fontSize: 56,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            fontWeight: 500,
          }}
        >
          {title}
        </h1>
        <p
          className="text-ink-soft mt-5"
          style={{ fontSize: 17, lineHeight: 1.6, maxWidth: 640 }}
        >
          {intro}
        </p>
        <p className="text-[13px] text-ink-subtle mt-3 tabular-nums">
          Last updated · {formatted}
        </p>

        <div
          aria-hidden
          className="my-10"
          style={{
            height: 2,
            background:
              "linear-gradient(90deg, var(--color-altus-red) 0%, var(--color-rose) 20%, var(--color-purple) 40%, var(--color-blue) 60%, var(--color-green) 80%, var(--color-amber) 100%)",
            opacity: 0.7,
            borderRadius: 2,
            maxWidth: 80,
          }}
        />

        <article className="legal-prose">{children}</article>

        <div
          className="mt-16 pt-6 border-t border-hairline text-[13px] text-ink-subtle"
          style={{ lineHeight: 1.55 }}
        >
          Questions? Write to{" "}
          <a
            href="mailto:heteshvichare927@gmail.com"
            className="auth-link font-semibold"
          >
            heteshvichare927@gmail.com
          </a>
          .
        </div>
      </main>
    </div>
  );
}
