"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { PenLine } from "lucide-react";
import type { IntakeInitial, IntakeActions } from "@/components/hr/candidate/intake-wizard";
import {
  saveOwnCandidateDraft,
  submitOwnCandidateForm,
} from "@/app/candidate/candidate-self-actions";

// The 108-field wizard is a full-screen client surface.
const IntakeWizard = dynamic(
  () => import("@/components/hr/candidate/intake-wizard").then((m) => m.IntakeWizard),
  { ssr: false },
);

/** Owner-scoped writes — every call targets the caller's OWN row server-side. */
const CANDIDATE_ACTIONS: IntakeActions = {
  save: saveOwnCandidateDraft,
  submit: submitOwnCandidateForm,
};

/**
 * The candidate's self-fill surface. Mounts the shared wizard in "candidate"
 * mode (recruiter fields hidden) with owner-scoped actions. We show an inline
 * thank-you rather than navigating: on the signed-in path the guest account has
 * just been deactivated server-side, so any route would bounce to /login.
 *
 * `canEditAfterSubmit` is the access-link path (the server decides this, not the
 * browser — see requireCandidateOwner's `viaLink`). Those candidates keep their
 * link, so the thank-you offers a way back INTO the form and a returning
 * candidate is told, plainly, that what they change here is what HR will see.
 */
export function CandidateFormLauncher({
  positions,
  departments,
  initial,
  canEditAfterSubmit = false,
  alreadySubmitted = false,
}: {
  positions: string[];
  departments: string[];
  initial?: IntakeInitial;
  canEditAfterSubmit?: boolean;
  alreadySubmitted?: boolean;
}) {
  // The thank-you is shown after a submit IN THIS SESSION. A link candidate
  // RETURNING to a submitted form lands on the form itself — they came back to
  // change something, and a thank-you screen would only be in the way.
  const [submitted, setSubmitted] = React.useState(false);

  if (submitted) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#faf9fb] px-6 text-center">
        <div className="max-w-[440px]">
          <img src="/logo.png" alt="Altus Corp" className="mx-auto mb-6 h-10 w-auto" />
          <h1
            className="text-[26px] font-black text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}
          >
            Thank you — your form is submitted.
          </h1>
          <p className="mt-2 text-[14px] text-ink-muted">
            Our HR team has received your details. You can close this window now.
          </p>
          {canEditAfterSubmit && (
            <>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-5 py-3 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft"
              >
                <PenLine size={15} /> Need to change something? Edit my answers
              </button>
              <p className="mt-4 text-[12.5px] leading-[1.6] text-ink-subtle">
                Keep the link from your email — it stays open, so you can come back later and correct
                anything. You never need an account or a password.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {alreadySubmitted && (
        <div
          className="border-b px-6 py-2.5 text-center text-[13px] font-semibold max-md:px-4 print:hidden"
          style={{
            background: "color-mix(in srgb, var(--color-green) 10%, white)",
            borderColor: "color-mix(in srgb, var(--color-green) 26%, white)",
            color: "#166534",
          }}
        >
          You&apos;ve already submitted this form. Anything you change here is saved, and submitting
          again updates what our HR team sees.
        </div>
      )}
      <IntakeWizard
        mode="candidate"
        actions={CANDIDATE_ACTIONS}
        positions={positions}
        departments={departments}
        canManagePositions={false}
        initial={initial}
        onClose={() => {
          /* The candidate has no other screen — the close button is a no-op. */
        }}
        onSaved={() => setSubmitted(true)}
      />
    </>
  );
}
