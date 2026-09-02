import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ReceiptIndianRupee } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { getBillingDashboard } from "@/lib/queries/billing";
import { BillingDashboard } from "@/components/incentive/billing-dashboard";
import { PageShell } from "@/components/layout/page-shell";

/**
 * BILLING — the room's landing page (the hub's Billing card opens here).
 *
 * Invoices, payments, billing cycles & revenue. Today it surfaces the live
 * billing ledger ("All Billing Stacked" → Billing tab) that previously existed
 * only as a tab inside Employees › Incentive — SAME reader, SAME component, now
 * with its own front door. Invoice/payment/cycle surfaces join this page as
 * they ship.
 *
 * The sheet read is streamed via <Suspense> (as on /incentive) so Google never
 * gates first paint, and `getBillingDashboard` is already self-resilient — a
 * Sheets/auth hiccup degrades to an in-page notice instead of a 500.
 */
export const dynamic = "force-dynamic";

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BillingPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;

  // Year selector — same trailing window as /incentive so the two agree.
  const currentYear = new Date().getFullYear();
  const raw = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const parsed = raw ? Number(raw) : currentYear;
  const year = Number.isFinite(parsed) ? parsed : currentYear;
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  if (!years.includes(year)) years.unshift(year);

  return (
    <PageShell width="wide">
      <header
        className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
        style={{
          background: [
            `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${PURPLE} 9%, transparent), transparent 55%)`,
            `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${PURPLE} 5%, transparent), transparent 52%)`,
            "rgba(255, 255, 255, 0.72)",
          ].join(", "),
          backdropFilter: "blur(14px) saturate(140%)",
          boxShadow:
            "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
            >
              <ReceiptIndianRupee size={13} strokeWidth={2.6} /> Billing
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px,3.6vw,46px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              Billing · {year}
            </h1>
            <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
              Invoices, payments, billing cycles &amp; revenue management — billed,
              collected and outstanding across the year.
            </p>
          </div>

          <nav aria-label="Billing year" className="flex flex-wrap items-center gap-2">
            {years.map((y) => {
              const active = y === year;
              return (
                <Link
                  key={y}
                  href={`/billing?year=${y}` as Route}
                  aria-current={active ? "page" : undefined}
                  className="rounded-pill px-3.5 py-1.5 text-[13px] font-bold transition"
                  style={
                    active
                      ? { background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})`, color: "#fff" }
                      : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "var(--color-ink-muted)" }
                  }
                >
                  {y}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <Suspense fallback={<BillingLoading />}>
        <BillingLedger year={year} />
      </Suspense>
    </PageShell>
  );
}

async function BillingLedger({ year }: { year: number }) {
  const billing = await getBillingDashboard(year);
  return <BillingDashboard data={billing} />;
}

function BillingLoading() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-10 text-center text-[14px] font-semibold text-ink-muted">
      Loading billing from the live sheet…
    </div>
  );
}
