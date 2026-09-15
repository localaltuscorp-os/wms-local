"use client";

import { useSearchParams } from "next/navigation";
import { CalendarCheck2, Link2, TriangleAlert } from "lucide-react";

/**
 * Full-screen "connect your Altus Google Calendar" prompt — see
 * lib/dcc/calendar-gate.ts for who sees it and why.
 *
 * Connecting is a full-page OAuth redirect. The callback lands back on /profile
 * with `?google=…`; while still unconnected this prompt is what renders there,
 * so it reads that status and explains a cancelled or wrong-account attempt.
 */
export function DccCalendarConnectGate({ firstName, workEmail }: { firstName: string; workEmail: string }) {
  const status = useSearchParams().get("google");
  const problem =
    status === "wrong_account"
      ? `That Google account isn't your Altus account. When Google asks, choose ${workEmail}.`
      : status === "denied"
        ? "The connection was cancelled. Connect your calendar to continue."
        : status === "error"
          ? "Couldn't connect Google Calendar. Please try again."
          : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-soft px-4 py-10">
      <div
        className="w-full max-w-lg rounded-section bg-surface-card p-7 max-md:p-5"
        style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 12px 40px -18px rgba(15,23,42,0.25)" }}
      >
        <span
          className="inline-flex size-12 items-center justify-center rounded-xl"
          style={{ background: "color-mix(in srgb, var(--color-blue) 12%, transparent)", color: "var(--color-blue-deep)" }}
        >
          <CalendarCheck2 size={24} strokeWidth={2.2} />
        </span>
        <h1 className="mt-4 text-[22px] font-black tracking-tight text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
          Connect your Google Calendar, {firstName}
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">
          Your Daily Compliance now sits in your Altus Google Calendar: one entry each day with every KPI and its status,
          kept up to date as you fill it. Connect once to continue.
        </p>
        <p className="mt-3 text-[13.5px] font-semibold text-ink-muted">
          Sign in with <span className="text-ink-strong">{workEmail}</span>.
        </p>

        {problem && (
          <p
            className="mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red)" }}
          >
            <TriangleAlert size={16} className="mt-0.5 shrink-0" /> {problem}
          </p>
        )}

        <a
          href="/api/google/connect"
          className="mt-5 inline-flex items-center gap-2 rounded-pill px-5 py-3 text-[14.5px] font-bold text-white transition-all hover:brightness-110"
          style={{ background: "linear-gradient(135deg, var(--color-blue), var(--color-blue-deep))" }}
        >
          <Link2 size={17} strokeWidth={2.4} />
          Connect Google Calendar
        </a>
      </div>
    </main>
  );
}
