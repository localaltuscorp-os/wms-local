import Link from "next/link";
import type { Route } from "next";
import { HandCoins, Wallet, BadgeCheck, Coins, Undo2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAdmin } from "@/lib/auth/current";
import { getIncentivePayoutBoard } from "@/lib/queries/incentive-payout";
import { getIncentivePaymentLedger } from "@/lib/queries/incentive-payments";
import { incentivePayoutEnabled } from "@/lib/incentive/payout-flag";
import { IncentivePayoutPanel } from "@/components/salary/incentive-payout-panel";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";
const MONTH_RE = /^\d{4}-\d{2}$/;
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

function monthLabel(ym: string, style: "long" | "short" = "long"): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The last `count` month keys ending at (and including) the current IST month. */
function recentMonths(count: number): string[] {
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${m < 10 ? `0${m}` : m}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export default async function IncentivePayoutPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const enabled = incentivePayoutEnabled();

  const months = recentMonths(6);
  const nowYm = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const raw = typeof sp.month === "string" ? sp.month : undefined;
  const defaultMonth = months.find((m) => m < nowYm) ?? months[0] ?? nowYm;
  const month = raw && MONTH_RE.test(raw) ? raw : defaultMonth;

  const board = await getIncentivePayoutBoard(month);
  const ledger = await getIncentivePaymentLedger(month);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1200px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
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
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
              >
                <Coins size={13} strokeWidth={2.6} /> Salary · Incentive payout
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
                Pay Incentive with Salary
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                {monthLabel(month)} — pay each person&apos;s incentive from the same place as
                salary. Payable is what the client has fully paid (Accrued); the account nils when
                Paid catches up. This records the payout only — it does not disburse to a bank.
              </p>
            </div>

            <nav aria-label="Month" className="flex max-w-[520px] flex-wrap items-center justify-end gap-2 max-md:justify-start">
              {months.map((m) => {
                const active = m === month;
                return (
                  <Link
                    key={m}
                    href={`/salary/incentive-payout?month=${m}` as Route}
                    aria-current={active ? "page" : undefined}
                    className="wg-btn rounded-pill px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap"
                    style={
                      active
                        ? {
                            background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                            color: "#fff",
                            boxShadow: `0 8px 20px -10px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent)`,
                          }
                        : {
                            background: "var(--color-surface-card)",
                            color: "var(--color-ink-soft)",
                            boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                          }
                    }
                  >
                    {monthLabel(m, "short")}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <section
          aria-label="Payout totals"
          className="mb-5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1"
        >
          <Kpi icon={<HandCoins size={17} strokeWidth={2.4} />} accent="#d97706" label="Booked" value={inr(board.totals.booked)} caption="client paid partial" />
          <Kpi icon={<Wallet size={17} strokeWidth={2.4} />} accent={GREEN} label="Accrued · payable" value={inr(board.totals.payable)} caption="client paid in full" />
          <Kpi icon={<BadgeCheck size={17} strokeWidth={2.4} />} accent={GREEN_DEEP} label="Paid" value={inr(board.totals.paid)} caption="paid to employees" />
          <Kpi icon={<Coins size={17} strokeWidth={2.4} />} accent="var(--color-altus-red)" label="Remainder" value={inr(board.totals.remainder)} caption={`${board.totals.payableRows} still to pay`} />
        </section>

        <IncentivePayoutPanel board={board} enabled={enabled} />

        <PaymentLedgerSection ledger={ledger} />
      </main>
    </>
  );
}

/**
 * WS-6 — the incentive payment ledger (read path). Reads `salary_payments`
 * (`kind='incentive'`) directly: positive payout lines and negative reversal
 * lines. The per-employee "net" is what the employee has actually been paid
 * after reversals, so a reversal offsets their payable.
 */
function PaymentLedgerSection({
  ledger,
}: {
  ledger: Awaited<ReturnType<typeof getIncentivePaymentLedger>>;
}) {
  const fmt = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
  const hasLines = ledger.lines.length > 0;

  return (
    <section aria-label="Incentive payments and adjustments" className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Undo2 size={16} strokeWidth={2.4} style={{ color: GREEN }} aria-hidden />
        <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}>
          Incentive payments &amp; adjustments
        </h2>
      </div>

      {!hasLines ? (
        <p className="rounded-2xl border border-hairline bg-surface-card px-4 py-6 text-[13px] text-ink-subtle">
          No incentive payments recorded for this month yet. Negative payable adjustments appear here as
          negative lines.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface-card">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-ink-subtle" style={{ background: "var(--color-surface-sunken)" }}>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em]">Employee</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em]">Incentive</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em]">Date</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em]">Gross paid</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em]">Negative payable adj.</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em]">Net paid</th>
              </tr>
            </thead>
            <tbody>
              {ledger.byEmployee.map((s) => (
                <tr key={s.employeeId ?? s.employeeName} className="border-t border-hairline align-middle">
                  <td className="px-4 py-2.5 font-bold text-ink-strong">{s.employeeName}</td>
                  <td className="px-4 py-2.5 text-ink-subtle">{s.lineCount} line{s.lineCount === 1 ? "" : "s"}</td>
                  <td className="px-4 py-2.5 text-right text-ink-subtle">—</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">{fmt(s.grossPaid)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: s.reversal < 0 ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}>
                    {s.reversal < 0 ? `− ${fmt(-s.reversal)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-ink-strong">{fmt(s.netPaid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline-strong font-bold text-ink-strong">
                <td className="px-4 py-3">Totals</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{fmt(ledger.totals.grossPaid)}</td>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: ledger.totals.reversal < 0 ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}>
                  {ledger.totals.reversal < 0 ? `− ${fmt(-ledger.totals.reversal)}` : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(ledger.totals.netPaid)}</td>
              </tr>
            </tfoot>
          </table>

          <details className="border-t border-hairline">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-bold text-ink-muted hover:text-ink-strong">
              Show individual payment &amp; adjustment lines
            </summary>
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {ledger.lines.map((l) => (
                  <tr key={l.id} className="border-t border-hairline align-middle">
                    <td className="px-4 py-2 text-ink-strong">{l.employeeName ?? "—"}</td>
                    <td className="px-4 py-2 text-ink-soft">{l.incentiveName ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-subtle">{l.paidDate ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-subtle">{l.method ?? "—"}</td>
                    <td
                      className="px-4 py-2 text-right font-bold tabular-nums"
                      style={{ color: l.amount < 0 ? "var(--color-altus-red)" : "var(--color-ink-strong)" }}
                    >
                      {l.amount < 0 ? `− ${fmt(-l.amount)}` : fmt(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </section>
  );
}

function Kpi({
  icon,
  accent,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
      }}
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
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(20px, 1.6vw, 25px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
    </div>
  );
}
