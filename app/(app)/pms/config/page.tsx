import { redirect } from "next/navigation";
import type { Route } from "next";
import { Settings } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { getScoreConfig } from "@/lib/queries/pms";
import { ScoreConfigEditor } from "@/components/pms/score-config-editor";
import { MODULE_THEME } from "@/lib/module-theme";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function PmsConfigPage() {
  const me = await requireUser();
  if (!me.isAdmin && !isSuperAdmin(me.email)) redirect("/pms" as Route);

  const config = await getScoreConfig();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* Back link */}
        <div className="mb-5 wg-rise">
        </div>

        {/* ── Glass hero ── */}
        <header
          className="wg-rise relative mb-6 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            animationDelay: "35ms",
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${ACCENT} 9%, transparent), transparent 55%)`,
              `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${ACCENT} 5%, transparent), transparent 52%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Settings size={13} strokeWidth={2.6} /> Employees · Performance · Settings
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.2vw,42px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Scoring Policy
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
            You define exactly how performance is measured — every weight, threshold and curve lives
            here as data, not code. Changes apply on the next score, no deploy.
          </p>
        </header>

        <ScoreConfigEditor initial={config} />
      </main>
    </>
  );
}
