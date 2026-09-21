import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { documentInstances } from "@/db/schema";
import { DashboardHeader } from "@/components/layout/header";
import { getSignatureState } from "@/app/(app)/documents/sign/actions";
import { SignDocument } from "@/components/documents/sign/sign-document";
import { DOC_KIND_LABELS, isDocKind, type SignatureState } from "@/lib/documents/signing";
import { HrShellSidebar } from "@/components/hr/hr-shell-sidebar";
import { HrBackButton } from "@/components/hr/hr-back-button";

export const dynamic = "force-dynamic";

/** Is this letter a policy acknowledgement? Best-effort: false on any failure. */
async function isPolicyLetter(docId: string): Promise<boolean> {
  try {
    const row = await db.query.documentInstances.findFirst({
      where: eq(documentInstances.id, docId),
      columns: { bodySnapshotMd: true },
    });
    return JSON.parse(row?.bodySnapshotMd ?? "{}")?.kind === "policy";
  } catch {
    return false;
  }
}

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

/**
 * Documents · the universal DigiLocker-verified signing surface.
 *
 * Reached (a) from the "Review & sign" links on Letters / Agreements / Exit
 * documents, and (b) as the return target of the DigiLocker OAuth callback,
 * which redirects here as
 *   /documents/sign?kind=<docKind>&doc=<docId>&sig=<signatureId>&verified=1
 * or …&error=<message> on failure. We read those params, resolve the current
 * signature state (owner/admin-guarded), and render the <SignDocument> flow.
 */
export default async function DocumentSignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined): string =>
    Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

  const kind = one(sp.kind);
  const docId = one(sp.doc);
  const verified = one(sp.verified) === "1";
  const callbackError = one(sp.error) || null;

  if (!isDocKind(kind) || !docId) {
    redirect("/hub" as Route);
  }

  let state: SignatureState;
  try {
    state = await getSignatureState({ docKind: kind, docId });
  } catch {
    // Not the owner / not an admin, or the document could not be resolved.
    redirect("/hub" as Route);
  }

  const label = DOC_KIND_LABELS[kind];
  // A policy signed through DigiLocker comes back here from an external
  // redirect, so "Back" in the browser history leads into DigiLocker, not to the
  // policy list. Offer the list directly (policy letters are tagged
  // kind:"policy" by lib/hr/policies/acknowledge-core.ts).
  const fromPolicy = kind === "letter" ? await isPolicyLetter(docId) : false;

  return (
    <div className="flex min-h-dvh">
      {/* Signing is reached from the HR room (Policies / Letters / Agreements) —
          carry the HR rail here, not the WMS one this path maps to by URL. */}
      <HrShellSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[720px] px-8 max-md:px-4 pt-8 pb-16">
        {fromPolicy ? (
          <Link
            href={"/policies" as Route}
            className="mb-4 inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition hover:border-altus-red"
          >
            <ArrowLeft size={15} strokeWidth={2.4} /> Back to policies
          </Link>
        ) : (
          <HrBackButton fallbackHref="/hr" />
        )}
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <ShieldCheck size={13} strokeWidth={2.6} /> {state.digilockerConfigured ? "Verified e-signing" : "Self-attested e-signing"}
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px,3vw,40px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            Sign your {label.toLowerCase()}
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-[13.5px] font-medium text-ink-muted">
            {state.digilockerConfigured
              ? "Confirm your identity with DigiLocker (Aadhaar e-KYC — masked last-4 only), then draw or type your signature. We archive a signed PDF to your private document vault."
              : "Read the document, then draw or type your signature to self-attest it (identity not DigiLocker-verified). We archive a signed PDF to your private document vault."}
          </p>
        </header>

        <SignDocument
          docKind={kind}
          docId={docId}
          initialState={state}
          justVerified={verified}
          callbackError={callbackError}
          doneHref={fromPolicy ? "/policies" : undefined}
          doneLabel={fromPolicy ? "Back to policies" : undefined}
        />
      </main>
      </div>
    </div>
  );
}
