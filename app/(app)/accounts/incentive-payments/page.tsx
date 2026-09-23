import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Coins } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { IncentiveKpi, IncentiveKpiRow } from "@/components/incentive/ui/kpi";
import { IncentiveEmptyState } from "@/components/incentive/ui/states";
import { AccountsScopeSwitch } from "@/components/accounts/incentive/accounts-scope-switch";
import { IncentiveAccountsTable } from "@/components/accounts/incentive/incentive-accounts-table";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { getIncentiveAccountsLedger } from "@/lib/queries/incentive-accounts";
import {
  applyAnalyticsView,
  incentiveAnalyticsScopeFor,
} from "@/lib/incentive/analytics/scope";
import { currentMonthKey } from "@/lib/incentive/analytics/periods";
import type { AnalyticsView } from "@/lib/incentive/analytics/model";
import { formatInr } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * ACCOUNTS · INCENTIVE PAYMENTS — the employee incentive payable, in Accounts.
 *
 * It sits ABOVE Reimbursement on the Accounts index because it is the larger
 * and more frequent of the two employee-money flows, and because it is the one
 * with a recovery side: a reversed incentive leaves a negative payable here.
 *
 * ── WHERE THE NUMBERS COME FROM ───────────────────────────────────────────────
 * `getIncentiveAccountsLedger` composes the two tables the money path already
 * writes — the ledger rows the payout and Status/Entries editors maintain, and
 * the negative `salary_payments` rows the reversal action writes. This screen
 * re-derives nothing; it adds up what those actions decided.
 *
 * ── SCOPE ─────────────────────────────────────────────────────────────────────
 * Resolved on the server from the signed-in identity, exactly as the Incentive
 * dashboard resolves it (`incentiveAnalyticsScopeFor` + `applyAnalyticsView`),
 * and applied inside the query. `?view=` selects which of the two views the
 * viewer already owns; it can never name an employee, so a crafted value buys
 * what an absent one would have. Accounts access itself is unchanged —
 * super-admins and the Accounts department, re-asserted here.
 */
export default async function AccountsIncentivePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; year?: string }>;
}) {
  const { me } = await requireAccountsAccess();
  const sp = await searchParams;

  // The switcher only exists for a viewer who has a team; it is hidden, not
  // greyed out, for someone with no reports.
  const base = await incentiveAnalyticsScopeFor(me);
  const requested: AnalyticsView = sp.view === "user" ? "user" : "team";
  const scope = applyAnalyticsView(base, requested);

  const now = new Date();
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(currentMonthKey(now).slice(0, 4));

  const ledger = await getIncentiveAccountsLedger(scope, { year });
  const { totals } = ledger;
  const recoverable = totals.reversal < 0;

  return (
    <>
      <DashboardHeader generatedAt={now} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <PageCommandBar
          title="Incentive Payments"
          hint={`${ledger.people} ${ledger.people === 1 ? "person" : "people"} · ${totals.rows} ${
            totals.rows === 1 ? "entry" : "entries"
          } · ${year}`}
          actions={
            <Link
              href={"/salary/incentive-payout" as Route}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              <Coins size={14} strokeWidth={2.4} /> Incentive payout
              <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
            </Link>
          }
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface-card px-3 py-2">
            {scope.canSeeTeam && <AccountsScopeSwitch view={scope.view ?? "team"} />}
            <span className="text-[12.5px] font-semibold text-ink-subtle">
              Approved, paid and recoverable incentive · {year}
            </span>
            <span className="ml-auto text-[12.5px] font-semibold text-ink-subtle">{scope.label}</span>
          </div>

          <IncentiveKpiRow cols={4}>
            <IncentiveKpi
              label="Approved / Due"
              value={formatInr(totals.due)}
              caption={`${totals.rows} ${totals.rows === 1 ? "entry" : "entries"}`}
              tone="slate"
            />
            <IncentiveKpi
              label="Paid"
              value={formatInr(totals.paid)}
              caption="disbursed to employees"
              tone="teal"
              progress={totals.due > 0 ? totals.paid / totals.due : null}
            />
            <IncentiveKpi
              label="Unpaid"
              value={formatInr(totals.unpaid)}
              caption="approved but not yet paid"
              tone={totals.unpaid > 0 ? "amber" : "slate"}
            />
            <IncentiveKpi
              label={recoverable ? "To recover" : "Final payable"}
              value={formatInr(recoverable ? -totals.reversal : totals.finalPayable)}
              caption={
                recoverable
                  ? "adjusted after payment — claw back"
                  : "unpaid less any adjustment"
              }
              tone={recoverable ? "red" : totals.finalPayable > 0 ? "green" : "slate"}
            />
          </IncentiveKpiRow>

          {ledger.rows.length === 0 ? (
            <IncentiveEmptyState
              title="No incentive payments in view"
              body={`Nothing approved for ${scope.label.toLowerCase()} in ${year}.`}
            />
          ) : (
            <IncentiveAccountsTable rows={ledger.rows} />
          )}
        </div>
      </main>
    </>
  );
}
