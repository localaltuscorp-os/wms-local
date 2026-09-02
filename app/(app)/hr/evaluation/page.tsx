import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { EvaluationV2Screen } from "@/components/hr/candidate/evaluation-v2/evaluation-v2-screen";
import { HrShellSidebar } from "@/components/hr/hr-shell-sidebar";
import { EvalHeaderNav } from "@/components/hr/candidate/evaluation-v2/eval-header-nav";
// NOTE: the custom Weight Metrics editor (WeightMatrixPanel) is temporarily
// disabled — bespoke per-designation weights need a Department → Role →
// Designation mapping that doesn't exist yet. Scoring falls back to
// DEFAULT_SECTION_WEIGHTS while the panel is unmounted. Keep the component file
// for when that hierarchy lands; just re-mount it below to bring it back.
// import { WeightMatrixPanel } from "@/components/hr/candidate/evaluation-v2/weight-matrix-panel";
import type { EvaluatorRole } from "@/lib/hr/candidate/evaluation-v2";

export const dynamic = "force-dynamic";

/**
 * Candidate Evaluation v2 — the structured, weighted, two-instance instrument.
 * A FULL-SCREEN focused surface (no rail). Interviewer role by default; the
 * Management Assessment links in with `?role=management&candidate=<id>` to fill
 * its own management pass on the same instrument (locked to that candidate).
 */
export default async function EvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; candidate?: string }>;
}) {
  const me = await requireHrStaff();
  const superAdmin = isSuperAdmin(me.email);
  const { role: roleParam, candidate } = await searchParams;
  const role: EvaluatorRole = roleParam === "management" ? "management" : "interviewer";

  let candidates: Awaited<ReturnType<typeof listCandidateIntakes>> = [];
  try {
    candidates = await Promise.race([
      listCandidateIntakes(),
      new Promise<typeof candidates>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    candidates = [];
  }

  const backHref = (role === "management" ? "/hr/management-assessment" : "/hr?open=pre-interview") as Route;
  const backLabel = role === "management" ? "Back to Assessment" : "Back to Pre-Interview";

  return (
    <div className="flex min-h-dvh bg-[#faf9fb]">
      <HrShellSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={backHref}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">{backLabel}</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <h1
          className="justify-self-center text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(17px,2vw,22px)", letterSpacing: "-0.02em" }}
        >
          Interview Intelligence
        </h1>
        <div className="justify-self-end">
          <EvalHeaderNav />
        </div>
      </header>

      {/* Weight Metrics editor temporarily disabled — see import note above.
          Scoring uses DEFAULT_SECTION_WEIGHTS until the Dept → Role → Designation
          hierarchy exists, so evaluations still score correctly with no panel. */}

      <EvaluationV2Screen
        candidates={candidates}
        role={role}
        isSuperAdmin={superAdmin}
        fixedCandidateId={candidate || undefined}
      />
      </div>
    </div>
  );
}
