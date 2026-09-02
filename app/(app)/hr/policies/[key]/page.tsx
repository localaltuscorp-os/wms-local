import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ShieldCheck, Clock, PencilLine } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getPolicyCard, isComingSoon } from "@/lib/hr/policies/registry";
import { loadPublishedPolicy } from "@/lib/hr/policies/load-db";
import { PageShell } from "@/components/layout/page-shell";
import { PolicyView } from "@/components/hr/policies/policy-view";
import { getMyPolicySignStatus, type MyPolicySignStatus } from "@/app/(app)/hr/policies/sign-status";

export const dynamic = "force-dynamic";

/**
 * A single policy, on its own full-screen page: `/hr/policies/<key>`. Loads the
 * PolicyDoc from the CMS (the currently-published version, so live edits render),
 * falling back to the code registry, and renders it on the shared <Letterhead>
 * via <PolicyView> (read-only body + entity picker + Export PDF + day-one Sign /
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
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
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

  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4 print:hidden">
        <div className="justify-self-start">
          <Link
            href={"/hr" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{
              background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)",
              boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">All Policies</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <span className="justify-self-center inline-flex items-center gap-1.5 truncate text-[15px] font-extrabold tracking-tight text-ink-strong">
          <ShieldCheck size={15} strokeWidth={2.4} style={{ color: "#A80400" }} aria-hidden />
          <span className="truncate">{title}</span>
        </span>
        <div className="justify-self-end">
          {isAdmin && showDoc && (
            <Link
              href={`/hr/policies/${key}/edit` as Route}
              className="group inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-transform hover:-translate-y-0.5 max-md:px-3"
              style={{ boxShadow: "0 10px 24px -16px rgba(24,24,27,0.55)" }}
            >
              <PencilLine size={15} strokeWidth={2.4} style={{ color: "#A80400" }} />
              <span className="max-md:hidden">Edit Policy</span>
              <span className="md:hidden">Edit</span>
            </Link>
          )}
        </div>
      </header>

      <PageShell width="narrow" py={false} className="pt-8 pb-24" style={{ maxWidth: "900px" }}>
        {showDoc && policy ? (
          <PolicyView doc={policy} signedAt={signedAt} outdated={outdated} />
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
        {title ? `${title} — coming soon` : "This policy is coming soon"}
      </h1>
      <p className="mt-2 text-[14px] font-medium leading-relaxed text-ink-muted">
        This policy is being drafted. It will appear here as a fully readable,
        day-one signable document on the Altus letterhead soon.
      </p>
    </div>
  );
}
