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
      <Link
        href={"/c/policies" as Route}
        className="mb-5 inline-flex items-center gap-2 text-[13px] font-bold text-ink-muted hover:text-ink-strong"
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
        outdated={outdated}
      />
    </main>
  );
}
