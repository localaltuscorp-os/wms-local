import Link from "next/link";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * Where every dead link lands — unknown token, expired, revoked, or a candidate
 * whose record has been closed. ONE page for all four on purpose: which one it
 * was would tell a stranger whether the token they are holding was ever real.
 */
export default function LinkExpiredPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-[460px]">
        {/* A signed-out visitor with no app shell — a plain <img> of the public
            logo, not next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Altus Corp" className="mx-auto mb-6 h-10 w-auto" />
        <h1
          className="text-[26px] font-black text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}
        >
          This link isn&apos;t valid any more
        </h1>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-muted">
          Interview-form links expire, and sending a new one cancels the older link. Enter your email
          and we&apos;ll send you a fresh one.
        </p>
        <Link
          href={"/c/resume" as Route}
          className="mt-6 inline-flex items-center justify-center rounded-xl px-5 py-3 text-[14px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          Email me a new link
        </Link>
      </div>
    </div>
  );
}
