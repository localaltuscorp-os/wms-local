import Link from "next/link";
import type { Route } from "next";
import { Wallet, Landmark, Users, Building2, ScrollText } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAdmin } from "@/lib/auth/current";
import { getSalaryConfig, resolveDivisor } from "@/lib/salary/config";
import { salaryV2Enabled } from "@/lib/salary/flags";
import { listMonthlyCtc } from "@/lib/queries/salary-ctc";
import {
  getCtcBreakup,
  getRetentionBonus,
  listAdjustments,
} from "@/lib/queries/salary-ctc-store";
import { entityTotals, grandTotalAfterPt, type EntityPayableRow } from "@/lib/salary/entity-totals";
import { daysInMonth as calcDaysInMonth, monthLabel } from "@/lib/salary/period";
import { CtcBreakupForm, type CtcFormEmployee } from "@/components/salary/ctc-breakup-form";

export const dynamic = "force-dynamic";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";
const MONTH_RE = /^\d{4}-\d{2}$/;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SalaryCtcPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const v2 = salaryV2Enabled();

  const nowYm = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const rawMonth = typeof sp.month === "string" ? sp.month : undefined;
  const month = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : nowYm;
  const selectedEmp = typeof sp.emp === "string" ? sp.emp : undefined;

  const [cfg, people] = await Promise.all([getSalaryConfig(), listMonthlyCtc(month)]);
  const dim = calcDaysInMonth(month);
  const divisor = resolveDivisor(cfg, dim);

  // ── Entity-wise totals (CTC-basis: full monthly payable, PT deducted) ──
  const payableRows: EntityPayableRow[] = people
    .filter((p) => p.monthlyCtc > 0)
    .map((p) => ({
      employeeId: p.employeeId,
      employeeName: p.name,
      payingEntityId: p.payingEntityId,
      payingEntityName: p.payingEntityName,
      payableBeforePt: p.monthlyCtc,
      pt: p.ptExempt ? 0 : cfg.defaultPt,
    }));
  const totals = entityTotals(payableRows);
  const grand = grandTotalAfterPt(totals);

  // ── Selected employee → load the editable detail ──
  let formEmp: CtcFormEmployee | null = null;
  if (selectedEmp) {
    const p = people.find((x) => x.employeeId === selectedEmp);
    if (p) {
      const [breakup, retention, adjustments] = await Promise.all([
        getCtcBreakup(p.employeeId),
        getRetentionBonus(p.employeeId),
        listAdjustments(p.employeeId, month),
      ]);
      const ptMonthly = p.ptExempt ? 0 : cfg.defaultPt;
      const perDay = divisor > 0 ? p.monthlyCtc / divisor : 0;
      formEmp = {
        employeeId: p.employeeId,
        name: p.name,
        month,
        payingEntityId: p.payingEntityId,
        payingEntityName: p.payingEntityName,
        annualCtc: breakup?.annualCtc || p.annualCtc,
        ptMonthly,
        perDay,
        amountPayableBeforeAdjust: Math.max(0, p.monthlyCtc - ptMonthly),
        components: breakup?.components ?? [],
        retention: retention
          ? {
              amount: retention.amount,
              payableDate: retention.payableDate,
              paid: retention.paid,
              paidDate: retention.paidDate,
              note: retention.note,
            }
          : null,
        adjustments: adjustments.map((a) => ({
          id: a.id,
          kind: a.kind,
          days: a.days,
          reason: a.reason,
        })),
        v2Enabled: v2,
      };
    }
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Hero ── */}
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${GREEN} 9%, transparent), transparent 55%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
          >
            <Wallet size={13} strokeWidth={2.6} /> Salary · CTC breakup
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.4vw,42px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            {monthLabel(month)} — CTC & entity payable
          </h1>
          <p className="mt-1.5 max-w-[80ch] text-[15px] font-medium text-ink-muted">
            Entity-wise Salary Payable after Professional Tax, plus the per-person CTC breakup form,
            retention bonus, and accountant adjustments (Payable vs Paid). WS-5 salary core.
          </p>
        </header>

        {/* ── Flag + config-gap banners ── */}
        {!v2 && (
          <Banner tone="warn">
            <strong>SALARY_V2 is OFF.</strong> This screen is live and editable, but the money math is
            dark — figures show as “—”. Existing salary numbers are untouched. Set{" "}
            <code>SALARY_V2=&quot;true&quot;</code> to reveal v2 figures.
          </Banner>
        )}
        {cfg.gaps.length > 0 && (
          <Banner tone="info">
            <strong>Config notes:</strong> {cfg.gaps.join(" · ")}. Divisor policy:{" "}
            <code>{cfg.divisorPolicy}</code> (÷{divisor} for {monthLabel(month)}); free-training{" "}
            {cfg.freeTrainingDays}d; PT {inr(cfg.defaultPt)}/mo.
          </Banner>
        )}

        {/* ── KPI strip ── */}
        <section className="mb-5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
          <Kpi icon={<Users size={17} />} accent="#334155" label="Salaried headcount" value={String(payableRows.length)} />
          <Kpi icon={<Building2 size={17} />} accent={GREEN} label="Entities" value={String(totals.length)} />
          <Kpi
            icon={<Landmark size={17} />}
            accent={GREEN_DEEP}
            label="Total payable after PT"
            value={v2 ? inr(grand) : "—"}
          />
          <Kpi
            icon={<ScrollText size={17} />}
            accent="var(--color-altus-red)"
            label="PT collected"
            value={v2 ? inr(payableRows.reduce((s, r) => s + r.pt, 0)) : "—"}
          />
        </section>

        {/* ── Entity totals ── */}
        <section
          className="wg-rise mb-6 overflow-hidden rounded-2xl bg-surface-card"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 12px 30px -24px rgba(15,23,42,0.3)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3 text-right">Headcount</th>
                  <th className="px-4 py-3 text-right">Payable (pre-PT)</th>
                  <th className="px-4 py-3 text-right">PT</th>
                  <th className="px-4 py-3 text-right">Retention</th>
                  <th className="px-4 py-3 text-right">Payable after PT</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.payingEntityId ?? "none"} className="border-t border-hairline">
                    <td className="px-4 py-2.5 font-semibold text-ink-strong">{t.payingEntityName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t.headcount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{v2 ? inr(t.payableBeforePt) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{v2 ? inr(t.pt) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{v2 ? inr(t.retentionBonus) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums" style={{ color: GREEN_DEEP }}>
                      {v2 ? inr(t.payableAfterPt) : "—"}
                    </td>
                  </tr>
                ))}
                {totals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-subtle">
                      No salaried employees with a CTC for {monthLabel(month)}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── People + selected form ── */}
        <div className="grid grid-cols-[280px_1fr] gap-5 max-lg:grid-cols-1">
          <aside
            className="rounded-2xl bg-surface-card p-2"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
              People
            </p>
            <ul className="grid gap-0.5 max-h-[620px] overflow-y-auto">
              {people.map((p) => {
                const active = p.employeeId === selectedEmp;
                return (
                  <li key={p.employeeId}>
                    <Link
                      href={`/salary/ctc?month=${month}&emp=${p.employeeId}` as Route}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px]"
                      style={
                        active
                          ? { background: "color-mix(in srgb, #E10600 12%, transparent)", color: GREEN_DEEP, fontWeight: 700 }
                          : { color: "var(--color-ink-soft)" }
                      }
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="tabular-nums text-[11px] text-ink-subtle">
                        {p.monthlyCtc > 0 ? inr(p.monthlyCtc) : "—"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div>
            {formEmp ? (
              <CtcBreakupForm emp={formEmp} />
            ) : (
              <div
                className="grid place-items-center rounded-2xl bg-surface-card px-6 py-20 text-center"
                style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              >
                <p className="text-[15px] font-semibold text-ink-soft">
                  Pick a person to edit their CTC breakup, retention bonus, and adjustments.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Banner({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  const bg = tone === "warn" ? "color-mix(in srgb, #f59e0b 14%, transparent)" : "color-mix(in srgb, #0ea5e9 12%, transparent)";
  const fg = tone === "warn" ? "#92400e" : "#075985";
  return (
    <div className="mb-3 rounded-xl px-4 py-2.5 text-[12.5px] font-medium" style={{ background: bg, color: fg }}>
      {children}
    </div>
  );
}

function Kpi({ icon, accent, label, value }: { icon: React.ReactNode; accent: string; label: string; value: string }) {
  return (
    <div
      className="wg-rise rounded-2xl bg-surface-card px-4.5 py-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -20px rgba(15,23,42,0.35)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</span>
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(20px,1.6vw,25px)", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
    </div>
  );
}
