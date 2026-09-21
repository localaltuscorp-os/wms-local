import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { getOnboarding } from "@/lib/queries/onboarding";
import { OnboardingForm } from "@/components/dossier/onboarding-form";

export const dynamic = "force-dynamic";

/**
 * THE ONBOARDING FORM, BEFORE A LOGIN EXISTS — opened from an emailed link.
 *
 * Identity comes from `requireCandidateOwner()` (the link cookie), exactly like
 * /c/form and /c/policies; nothing here takes a candidate id from the client. The
 * candidate can come back on the same link to check or correct what they sent.
 */
export default async function CandidateOnboardingPage() {
  const { me } = await requireCandidateOwner();
  const data = await getOnboarding(me.id);
  if (!data) redirect("/c/expired" as Route);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 pb-16 pt-10 max-md:px-4">
      {/* A signed-out visitor has no app shell — a plain <img>, not next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Altus Corp" className="mb-6 h-9 w-auto" />
      <p className="mb-6 max-w-[74ch] text-[14.5px] leading-[1.6] text-ink-muted">
        Please fill in your joining details and attach the documents below. Your answers save as you
        type, and you can come back to this link any time to check or change them —{" "}
        <strong>no login needed</strong>.
      </p>
      <OnboardingForm initial={data} backHref={null} mode="candidate" />
    </main>
  );
}
