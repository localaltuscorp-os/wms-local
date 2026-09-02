import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireDossierAccess, canManageEmployeeOnboarding } from "@/lib/dossier/access";
import { getOnboarding } from "@/lib/queries/onboarding";
import { OnboardingForm } from "@/components/dossier/onboarding-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const access = await requireDossierAccess();
  const sp = await searchParams;
  // `?emp=` names WHOSE form this is. Only when it is absent does this fall back
  // to the viewer — that fallback is for an employee opening their own form, and
  // every HR entry point now passes the id explicitly.
  const emp = typeof sp.emp === "string" ? sp.emp : null;
  const targetId = emp ?? access.me.id;
  // HR staff reach anyone's onboarding form (not the wider dossier) — see
  // canManageEmployeeOnboarding.
  if (!canManageEmployeeOnboarding(access, targetId)) redirect("/dossier");

  const data = await getOnboarding(targetId);
  if (!data) redirect(access.isAdmin || access.isHr ? "/dossier" : "/hub");

  const onBehalf = targetId !== access.me.id;
  const backHref = onBehalf ? `/dossier?emp=${targetId}` : "/dossier";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <header className="wg-rise mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
              <ClipboardList size={13} strokeWidth={2.6} /> Employees · Dossier · Onboarding
            </span>
          </div>
          <h1 className="mt-3 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,42px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
            Onboarding Form
          </h1>
          {/* WHOSE FORM, said out loud. HR editing on someone's behalf must never
              have to infer it from the answers — that is how an edit ends up on
              the wrong record. */}
          {onBehalf ? (
            <p className="mt-1.5 max-w-[74ch] text-[15.5px] font-medium text-ink-muted">
              Editing <strong className="font-black text-ink-strong">{data.employee.name}</strong>
              &rsquo;s onboarding form. Changes save against their record, not yours.
            </p>
          ) : (
            <p className="mt-1.5 max-w-[74ch] text-[15.5px] font-medium text-ink-muted">
              Your details, previous employment, background verification, addresses, ID and bank
              details. Files can be attached in each section — save a draft anytime and submit when done.
            </p>
          )}
        </header>
        <OnboardingForm initial={data} backHref={backHref} />
      </main>
    </>
  );
}
