import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { loadPublishedPolicy } from "@/lib/hr/policies/load-db";
import { PolicyDocument } from "@/components/hr/policies/policy-document";
import { candidatePolicyKeys, candidatePolicySignature } from "@/lib/hr/candidate/policy-signing";
import { currentPolicyVersion } from "@/lib/hr/policies/compliance-sync";
import { CandidatePolicySignBox } from "@/components/hr/candidate/candidate-policy-sign-box";

export const dynamic = "force-dynamic";

/**
 * ONE POLICY, read and signed by a candidate over their access link.
 *
 * The document itself is rendered by <PolicyDocument>, the SAME pure renderer
 * the employee-facing pages use — so a candidate reads the identical text on
 * the identical letterhead, and there is no second copy of the policy body to
 * drift. What differs is only the signing box underneath it: an employee signs
 * through DigiLocker, a candidate types their name (see
 * lib/hr/candidate/policy-signing.ts for why those are recorded differently).
 *
 * Identity is the access-link cookie via `requireCandidateOwner()`. The key in
 * the URL is checked against the registry, so a hand-edited path cannot conjure
 * a signable document.
 */
export default async function CandidatePolicyPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { rowId } = await requireCandidateOwner();

  if (!candidatePolicyKeys().includes(key)) notFound();
  const doc = await loadPublishedPolicy(key);
  if (!doc) notFound();

  const [existing, published] = await Promise.all([
    candidatePolicySignature(rowId, key),
    currentPolicyVersion(key),
  ]);
  const outdated = existing ? existing.version < published : false;

  return (
    <main className="mx-auto w-full max-w-[900px] px-6 py-8 max-md:px-4">
      {/* ── "ALL POLICIES" STAYS ON SCREEN ───────────────────────────────
          A policy is several screens long and the signing box is at the
          BOTTOM, so the one link back to the list used to scroll away the
          moment you started reading — leaving a candidate who had just signed
          with nothing to do but use the browser's Back button, or scroll all
          the way up again. It is now pinned.

          Two positions on purpose. On a wide screen it is `fixed` to the left
          of the document, in the empty margin the centred page leaves, which
          is what the space is for. Below `lg` there is no margin to sit in —
          fixing it there would park it on top of the letterhead — so it stays
          in the flow and `sticky`, riding the top of the viewport instead.

          Given its own solid background, border and shadow because it now
          floats over the document rather than sitting above it. */}
      <Link
        href={"/c/policies" as Route}
        className="sticky top-4 z-40 mb-5 inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[13px] font-bold text-ink-strong shadow-[0_8px_24px_-14px_rgba(15,23,42,0.4)] transition hover:border-altus-red lg:fixed lg:left-6 lg:top-6 lg:mb-0"
      >
        <ArrowLeft size={15} />
        All policies
      </Link>

      <div className="overflow-hidden rounded-2xl border border-hairline-strong bg-white">
        <PolicyDocument doc={doc} entity={doc.entityDefault ?? "altus-corp"} />
      </div>

      <CandidatePolicySignBox
        policyKey={key}
        title={doc.title}
        signedAt={existing ? existing.signedAt.toISOString() : null}
        signedName={existing?.signedName ?? null}
        signaturePath={existing?.signaturePath ?? null}
        outdated={outdated}
      />
    </main>
  );
}
