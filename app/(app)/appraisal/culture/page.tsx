import type { Route } from "next";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { isAppraisalAdmin } from "@/lib/pms/appraisal/access";
import { loadAppraisalConfig } from "@/lib/pms/appraisal/config";
import { loadCultureBoard } from "@/lib/pms/appraisal/queries";
import { CultureBoardCard } from "@/components/appraisal/culture-board";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function AppraisalCulturePage() {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) redirect("/appraisal" as Route);

  const config = await loadAppraisalConfig();
  const board = await loadCultureBoard(config.culturePerMonth);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header className="mb-5">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <BookOpen size={13} strokeWidth={2.6} /> Appraisal · Culture pool
          </span>
          <h1 className="mt-3 text-[30px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}>
            Culture Rotation
          </h1>
          <p className="mt-1 max-w-[70ch] text-[14px] text-ink-muted">
            The Altus Corp Constitution items, in rotation order. Each month the next {config.culturePerMonth} are auto-assigned serial-wise (in sequence, never random) and rated together as one Culture item. Reorder here to change which items the rotation reaches first.
          </p>
        </header>

        <CultureBoardCard
          pool={board.pool}
          upcoming={board.upcoming}
          perMonth={board.perMonth}
          used={board.used}
        />
      </main>
    </>
  );
}
