"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ClipboardList, ArrowRight, X } from "lucide-react";
import { getMyOnboardingStatusAction } from "@/app/(app)/dossier/onboarding/actions";

/**
 * Onboarding nudge — a SOFT, dismissible banner shown to a signed-in employee
 * who hasn't submitted their Onboarding Form. Not a gate: it floats over the app
 * (fixed, bottom-right), never shifts layout, and an X dismisses it for the
 * rest of the session (sessionStorage) so it isn't naggy.
 *
 * Rendered once from the (app) layout with NO props: it fetches its own
 * onboarding status CLIENT-SIDE after mount (never on the SSR/dashboard load
 * path — that's sacred), and only when the session isn't already dismissed. It
 * hides on the onboarding route and after dismissal.
 *
 * Brand tokens only · reduced-motion-safe (entrance animation is CSS, gated by a
 * media query) · keyboard-first (the CTA link and the dismiss button are both
 * focusable, Esc dismisses).
 */

const DISMISS_KEY = "altus.onboardingNudge.dismissed";
const ONBOARDING_PATH = "/dossier/onboarding";

const NUDGE_CSS = `
  .onb-nudge {
    animation: onbNudgeIn 0.42s cubic-bezier(0.22,1,0.36,1) both;
  }
  @keyframes onbNudgeIn {
    from { opacity: 0; transform: translate(0, 16px); }
    to   { opacity: 1; transform: translate(0, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .onb-nudge { animation: none; }
  }
`;

export function OnboardingNudge(): React.JSX.Element | null {
  const pathname = usePathname();
  const [dismissed, setDismissed] = React.useState(true);
  const [submitted, setSubmitted] = React.useState<boolean | null>(null);

  // After mount (sessionStorage + the status query are client-only): read the
  // dismiss flag, and ONLY if not dismissed this session, fetch the current
  // user's onboarding status via a server action — so the SSR/dashboard load
  // path is never touched. Fail-open (treat as submitted → stay hidden).
  React.useEffect(() => {
    let dis = false;
    try {
      dis = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      dis = false;
    }
    setDismissed(dis);
    if (dis) return; // dismissed → don't even query
    let alive = true;
    getMyOnboardingStatusAction()
      .then((r) => alive && setSubmitted(r.submitted))
      .catch(() => alive && setSubmitted(true));
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — dismissal just won't persist */
    }
  }, []);

  const onOnboardingPage = pathname?.startsWith(ONBOARDING_PATH) ?? false;
  const visible = submitted === false && !dismissed && !onOnboardingPage;

  React.useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: NUDGE_CSS }} />
      <div
        role="region"
        aria-label="Onboarding reminder"
        className="onb-nudge fixed bottom-5 right-5 z-[90] w-[min(560px,calc(100vw-2rem))] max-md:right-4"
      >
        <div
          className="flex items-center gap-3.5 rounded-[16px] px-4 py-3.5 max-md:flex-wrap"
          style={{
            background: "var(--color-surface-card)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 30%, var(--color-hairline))",
            boxShadow:
              "0 18px 44px -22px rgba(168,4,0,0.42), 0 2px 8px -3px rgba(15,23,42,0.14)",
          }}
        >
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            }}
          >
            <ClipboardList size={19} strokeWidth={2.2} />
          </span>

          <div className="min-w-0 flex-1">
            <p
              className="text-[14.5px] font-bold text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}
            >
              Please complete your Onboarding Form
            </p>
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink-subtle">
              A few minutes now sets up your records, payroll & workspace.
            </p>
          </div>

          <Link
            href={ONBOARDING_PATH as Route}
            onClick={dismiss}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-transform active:scale-[0.98] max-md:order-3 max-md:w-full max-md:justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              outlineColor: "var(--color-altus-red)",
            }}
          >
            Fill it now
            <ArrowRight size={15} strokeWidth={2.6} />
          </Link>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss for now"
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:text-ink-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: "var(--color-altus-red)" }}
          >
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </>
  );
}
