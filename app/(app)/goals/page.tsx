import Link from "next/link";
import type { Route } from "next";
import type { CSSProperties } from "react";
import { ArrowUpRight, Target } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";
import { GOALS_SECTIONS } from "@/lib/goals/sections";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireGoalsAccess } from "@/lib/goals/access";

export const dynamic = "force-dynamic";

const THEME = MODULE_THEME.goals;
const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400"; // Altus red deep

/** Glossy amber icon chip — goals-toned twin of `admin-section-icon`. */
const ICON_CHIP: CSSProperties = {
  background: `linear-gradient(135deg, #E10600 0%, ${ACCENT} 48%, ${ACCENT_DEEP} 100%)`,
  border: `1px solid ${ACCENT_DEEP}88`,
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.32), 0 10px 22px -10px rgba(180,83,9,0.55), 0 2px 4px rgba(124,45,18,0.28)",
  color: "#fff",
};

export default async function GoalsHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  const { isAdmin } = await requireGoalsAccess();

  const sections = [...GOALS_SECTIONS]
    .filter((s) => isAdmin || !s.adminOnly)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <header className="mb-9">
          {/* Signature module masthead — animated gradient wordmark + glossy tile. */}
          <div className="module-wordmark flex items-center gap-3.5">
            <span
              aria-hidden
              className="module-wordmark-icon inline-flex h-12 w-12 items-center justify-center rounded-2xl"
              style={ICON_CHIP}
            >
              <Target size={24} strokeWidth={2.3} />
            </span>
            <span
              className="module-wordmark-text leading-none"
              style={
                {
                  "--mw-a": ACCENT,
                  "--mw-b": ACCENT_DEEP,
                  fontSize: "clamp(30px, 4.4vw, 52px)",
                } as CSSProperties
              }
            >
              Goals
            </span>
          </div>

          <h1
            className="wg-rise mt-5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 3.2vw, 40px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.06,
              maxWidth: "20ch",
              animationDelay: "60ms",
            }}
          >
            Sir&apos;s yearly goals, cascaded down to today
          </h1>
          <p
            className="wg-rise mt-2.5 text-body-lg font-medium text-ink-muted"
            style={{ maxWidth: "64ch", animationDelay: "120ms" }}
          >
            Plan the year, auto-divide it into quarters, months and weeks, commit
            every Saturday, get your manager&apos;s Monday sign-off, and deliver it
            in the daily plan — one connected loop.
          </p>
        </header>

        <CardGrid min={300} gap="1rem">
          {sections.map((s, i) => {
            const Icon = s.Icon;
            return (
              <Link
                key={s.href}
                href={s.href as Route}
                className="group wg-rise wg-sheen relative flex flex-col overflow-hidden rounded-section border border-hairline bg-surface-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-[0_18px_40px_-24px_rgba(124,45,18,0.45),0_2px_6px_rgba(15,23,42,0.05)]"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {/* Amber aurora wash for depth (GPU-only, reduced-motion safe). */}
                <span
                  aria-hidden
                  className="kpi-aurora-primary rounded-section"
                  style={
                    {
                      "--kpi-tone": ACCENT,
                      "--kpi-index": i % 6,
                    } as CSSProperties
                  }
                />
                <span
                  aria-hidden
                  className="kpi-aurora-secondary rounded-section"
                  style={{ "--kpi-tone-deep": ACCENT_DEEP } as CSSProperties}
                />
                {/* Top accent seam. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-chip transition-transform duration-200 group-hover:scale-105"
                    style={ICON_CHIP}
                  >
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <ArrowUpRight
                    size={18}
                    className="text-ink-soft transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    style={{ color: ACCENT_DEEP }}
                  />
                </div>
                <h2
                  className="relative mt-3.5 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.title}
                </h2>
                <p className="relative mt-1.5 text-[13.5px] font-medium leading-snug text-ink-muted">
                  {s.blurb}
                </p>
              </Link>
            );
          })}
        </CardGrid>
      </PageShell>
    </>
  );
}
