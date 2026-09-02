import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { MODULE_THEME } from "@/lib/module-theme";

const THEME = MODULE_THEME.hr;
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * Shared "Coming soon" shell for the scaffolded HR sections (Policies /
 * Holiday List / Letters / Queries & Notifications / Support). Keeps the nav
 * 404-free while each section awaits its real build phase — the pages that use
 * this are thin wrappers that swap to their real UI when built.
 */
export function HrComingSoon({
  title,
  blurb,
  Icon,
}: {
  title: string;
  blurb: string;
  Icon: LucideIcon;
}) {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-8 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            HR · {title}
          </span>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px, 3.6vw, 46px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 6,
            }}
          >
            {title}
          </h1>
        </header>

        <section className="wg-rise mx-auto flex max-w-[560px] flex-col items-center rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
          >
            <Icon size={30} strokeWidth={2.1} />
          </span>
          <h2
            className="mt-5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: "-0.015em",
            }}
          >
            Coming soon — {title}
          </h2>
          <p className="mt-2 max-w-[46ch] text-[14.5px] font-medium leading-relaxed text-ink-muted">
            {blurb}
          </p>
          <Link
            href={"/hr" as Route}
            className="mt-6 inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold text-white transition hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} /> Back to HR
          </Link>
        </section>
      </main>
    </>
  );
}
