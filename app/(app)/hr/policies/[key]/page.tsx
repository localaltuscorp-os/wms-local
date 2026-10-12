import { ShieldCheck, Clock } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isHrStaff } from "@/lib/hr/access";
import { getPolicyCard, isComingSoon } from "@/lib/hr/policies/registry";
import { loadPublishedPolicy } from "@/lib/hr/policies/load-db";
import { PageShell } from "@/components/layout/page-shell";
import { PolicyView } from "@/components/hr/policies/policy-view";
import { PolicySignOffBox } from "@/components/hr/policies/policy-sign-off-box";
import { myPolicySignOff } from "@/app/(app)/hr/policies/sign-off-actions";
import { getMyPolicySignStatus, type MyPolicySignStatus } from "@/app/(app)/hr/policies/sign-status";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { policyEntityForEmployee } from "@/lib/hr/policies/employee-entity";

export const dynamic = "force-dynamic";

/**
 * A single policy, on its own full-screen page: `/hr/policies/<key>`. Loads the
 * PolicyDoc from the CMS (the currently-published version, so live edits render),
 * falling back to the code registry, and renders it on the shared <Letterhead>
 * via <PolicyView> (read-only body on the employee's assigned company letterhead
 * + Export PDF + day-one Sign /
 * Acknowledge). Workspace admins additionally see an "Edit policy" entry point.
 * Keys that are advertised-but-unauthored ("coming soon", e.g. CLASH) show a
 * tasteful greyed placeholder so the popup links never dead-end.
 */
export default async function PolicyPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const me = await requireWorkspace("hr");
  const { key } = await params;
  const policy = await loadPublishedPolicy(key);
  const card = getPolicyCard(key);
  const comingSoon = isComingSoon(key);
  const title = policy?.title ?? card?.title ?? "Policy";
  // The Edit button must match the rule on the EDIT ROUTE itself
  // (requireHrStaff). It used to be `isAdmin || isSuperAdmin`, which is a
  // wider set: an admin outside the HR department saw a button that bounced
  // them straight back here. Reading stays open to everyone (2026-09-17).
  const [canEdit, entity] = await Promise.all([
    isHrStaff(me),
    policyEntityForEmployee(me),
  ]);
  const showDoc = Boolean(policy) && !comingSoon;
  // Has the CURRENT viewer already signed this policy? Drives the "Signed · date"
  // state so they don't re-sign just to check (self-scoped, best-effort).
  // `outdated` = signed, but a NEWER version has been published since — the view
  // then prompts to sign the new version instead of reading as done.
  const EMPTY_SIGN_STATUS: MyPolicySignStatus = { signed: {}, outdated: {} };
  const signStatus: MyPolicySignStatus = showDoc
    ? await getMyPolicySignStatus().catch(() => EMPTY_SIGN_STATUS)
    : EMPTY_SIGN_STATUS;
  const signedAt = signStatus.signed[key] ?? null;
  const outdated = Boolean(signStatus.outdated?.[key]);
  // The viewer's own printed-name + signature-image sign-off, if they used that
  // route rather than DigiLocker. Best-effort like the status above: the policy
  // must still render if this lookup fails.
  const signOff = showDoc ? await myPolicySignOff(key).catch(() => null) : null;

  return (
    <div className="min-h-full bg-[#faf9fb]">
      <HrTitleBar
        title={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={17} strokeWidth={2.4} style={{ color: "#A80400" }} aria-hidden />
            {title}
          </span>
        }
      />

      <PageShell width="wide" py={false} className="pt-6 pb-24">
        {showDoc && policy ? (
          <>
            <PolicyView
              doc={policy}
              entity={entity}
              signedAt={signedAt}
              outdated={outdated}
              backHref="/policies"
              editHref={canEdit ? `/hr/policies/${key}/edit` : undefined}
            />
            {/* The printed-name + date + signature-image sign-off, ALONGSIDE
                the DigiLocker action in PolicyView's toolbar rather than
                instead of it: DigiLocker files the stronger record (verified
                identity, archived PDF) and this one always works. Its own
                table, so the two kinds of signature stay distinguishable. */}
            <PolicySignOffBox
              policyKey={policy.key}
              title={policy.title}
              signedName={signOff?.signedName ?? null}
              signedAt={signOff ? signOff.signedAt.toISOString() : null}
              hasSignature={!!signOff?.signaturePath}
            />
          </>
        ) : (
          <ComingSoon title={card?.title} />
        )}
      </PageShell>
    </div>
  );
}

function ComingSoon({ title }: { title?: string }) {
  return (
    <div className="mx-auto mt-10 max-w-[560px] rounded-2xl border border-solid border-hairline-strong bg-white px-8 py-14 text-center">
      <span
        className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "#64748b1a", color: "#64748b" }}
      >
        <Clock size={26} strokeWidth={2.1} />
      </span>
      <h1
        className="text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22 }}
      >
        {title ? `${title} - coming soon` : "This policy is coming soon"}
      </h1>
      <p className="mt-2 text-[14px] font-medium leading-relaxed text-ink-muted">
        This policy is being drafted. It will appear here as a fully readable,
        day-one signable document on the employee's assigned company letterhead soon.
      </p>
    </div>
  );
}
