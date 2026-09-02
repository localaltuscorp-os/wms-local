"use client";

import * as React from "react";
import dynamic from "next/dynamic";
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
 * mode (recruiter fields hidden) with owner-scoped actions. On submit the guest
 * account is deactivated server-side, so we show an inline thank-you rather than
 * navigate (any gated route would now bounce to /login).
 */
export function CandidateFormLauncher({
  positions,
  departments,
  initial,
}: {
  positions: string[];
  departments: string[];
  initial?: IntakeInitial;
}) {
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
        </div>
      </div>
    );
  }

  return (
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
  );
}
