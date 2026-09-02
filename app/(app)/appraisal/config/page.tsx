import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { BookOpen, Settings } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { isAppraisalAdmin } from "@/lib/pms/appraisal/access";
import { loadAppraisalConfig } from "@/lib/pms/appraisal/config";
import { ConfigForm } from "@/components/appraisal/config-form";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function AppraisalConfigPage() {
  requireAppraisal();
  const me = await requireUser();
  if (!isAppraisalAdmin(me)) redirect("/appraisal" as Route);

  const config = await loadAppraisalConfig();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header className="mb-5">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            <Settings size={13} strokeWidth={2.6} /> Appraisal · Config
          </span>
          <h1 className="mt-3 text-[30px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}>
            Appraisal Configuration
          </h1>
          <p className="mt-1 text-[14px] text-ink-muted">Dimension weights, rating terms and the auto-dimension knobs. The scoring engine reads only this.</p>
          <Link href={"/appraisal/culture" as Route} className="mt-3 inline-flex items-center gap-1.5 rounded-pill border-2 bg-white/70 px-3.5 py-1.5 text-[13px] font-bold" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}>
            <BookOpen size={14} /> Manage Culture Rotation
          </Link>
        </header>

        <ConfigForm initial={config} />
      </main>
    </>
  );
}
