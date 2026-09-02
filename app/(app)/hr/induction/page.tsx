import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { listInductionEmployees, type InductionPerson } from "@/app/(app)/hr/induction/actions";
import { InductionScreen } from "@/components/hr/induction/induction-screen";

export const dynamic = "force-dynamic";

/**
 * Post-joining INDUCTION — a full-screen focused surface. Pick a new joiner and
 * their submitted onboarding form is rendered as a read-only, section-grouped
 * summary to confirm on day one (no re-asking). Reached from the Post-Joining
 * stage's "Induction" item.
 */
export default async function HrInductionPage() {
  await requireHrStaff();

  let people: InductionPerson[] = [];
  try {
    people = await Promise.race([
      listInductionEmployees(),
      new Promise<InductionPerson[]>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    people = [];
  }

  return (
    <div className="min-h-dvh" style={{ background: "#faf9fb" }}>
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/hr" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">HR Home</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>

      <InductionScreen people={people} />
    </div>
  );
}
