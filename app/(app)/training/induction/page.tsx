import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { getInductionForEmployee } from "@/lib/queries/training";
import { InductionProgress } from "@/components/training/induction-progress";

export const dynamic = "force-dynamic";

export default async function InductionPage() {
  const me = await requireWorkspace("training");
  const items = await getInductionForEmployee(me.id, me.departmentId);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1000px]">
          <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><ArrowLeft size={15} /> Training Centre</Link>
          <header className="mt-3 mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Induction</span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 800, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 4 }}>Your Induction</h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>The training every new hire in your department must complete.</p>
          </header>
          <InductionProgress items={items} />
        </div>
      </main>
    </>
  );
}
