import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ScrollText } from "lucide-react";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { MODULE_THEME } from "@/lib/module-theme";
import { requirePmsV3 } from "@/lib/pms/v3/flag";
import { getConstitutionView, getV3Config, constitutionSeeded } from "@/lib/queries/pms-v3";
import { ConstitutionScorer } from "@/components/pms/v3/constitution-scorer";
import { SeedConstitutionButton } from "@/components/pms/v3/seed-constitution-button";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

function currentPeriod(): { period: string; label: string } {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const period = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = ist.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return { period, label };
}

export default async function PmsV3ConstitutionPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  requirePmsV3();
  const { subject: subjectParam } = await searchParams;
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);
  const { period, label } = currentPeriod();

  const subjectId = subjectParam && admin ? subjectParam : me.id;
  const [subject] = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.id, subjectId))
    .limit(1);
  if (!subject) redirect("/pms/v3" as Route);

  const seeded = await constitutionSeeded();
  const [paras, cfg] = await Promise.all([
    seeded ? getConstitutionView(subjectId, period) : Promise.resolve([]),
    getV3Config(),
  ]);

  // Lane: on your own page you self-score; an admin viewing someone else scores as admin.
  const editableRole: "admin" | "self" | null =
    subjectId === me.id ? "self" : admin ? "admin" : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[860px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <Link
          href={"/pms/v3" as Route}
          className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
        >
          <ArrowLeft size={15} strokeWidth={2.6} /> Monthly Scoring
        </Link>

        <header className="mb-6">
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <ScrollText size={11} strokeWidth={2.8} /> Constitution · {label}
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px,2.6vw,34px)", letterSpacing: "-0.02em" }}
          >
            Para-by-para scoring — {subject.name}
          </h1>
          <p className="mt-1.5 max-w-[74ch] text-[14.5px] text-ink-muted">
            Admin distributes a total weight of {cfg.constitutionTotalWeight} across the paragraphs; the admin scores
            AND the person self-scores each one (semi-objective). The gap between admin and self is shown per paragraph.
          </p>
        </header>

        {!seeded ? (
          <div className="rounded-2xl border border-hairline bg-surface-card p-8 text-center">
            <ScrollText size={28} className="mx-auto mb-3 text-ink-subtle" />
            <p className="mb-1 text-[15px] font-bold text-ink-strong">Constitution Not Seeded Yet</p>
            <p className="mx-auto mb-4 max-w-[52ch] text-[13.5px] text-ink-muted">
              The 29 paragraphs were captured verbatim from the source Doc. An admin seeds them once; then everyone
              can score.
            </p>
            {admin ? (
              <SeedConstitutionButton accent={ACCENT} accentDeep={ACCENT_DEEP} />
            ) : (
              <p className="text-[13px] text-ink-subtle">Ask an admin to seed the Constitution.</p>
            )}
          </div>
        ) : (
          <ConstitutionScorer
            paras={paras}
            subjectId={subjectId}
            period={period}
            scaleMax={cfg.constitutionScaleMax}
            totalWeightTarget={cfg.constitutionTotalWeight}
            canEditWeights={admin}
            editableRole={editableRole}
            accent={ACCENT}
            accentDeep={ACCENT_DEEP}
          />
        )}
      </main>
    </>
  );
}
