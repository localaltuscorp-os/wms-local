import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
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
      <HrTitleBar />
      <main className="mx-auto max-w-[1400px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        {/* WHOSE FORM, said out loud — kept in the body deliberately. This is a
            safety notice, not the decorative blurb that used to sit here: HR
            editing on someone's behalf must never have to infer whose record
            they are on, because that is how an edit lands on the wrong one. */}
        {onBehalf && (
          <p className="wg-rise mb-6 max-w-[74ch] text-[15.5px] font-medium text-ink-muted">
            Editing <strong className="font-black text-ink-strong">{data.employee.name}</strong>
            &rsquo;s onboarding form. Changes save against their record, not yours.
          </p>
        )}
        <OnboardingForm initial={data} backHref={backHref} />
      </main>
    </>
  );
}
