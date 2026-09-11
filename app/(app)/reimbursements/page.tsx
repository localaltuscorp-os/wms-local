import Link from "next/link";
import type { Route } from "next";
import {
  BarChart3,
  Wallet,
  Hourglass,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireUser } from "@/lib/auth/current";
import { listModuleSubmissions, type ModuleSubmissionRow } from "@/lib/queries/modules";
import { MODULES } from "@/lib/forms/modules";
import {
  resolveRequestFields,
  resolveAdminFields,
  resolveFields,
  requestKey,
  adminKey,
  getProductOptions,
} from "@/lib/forms/server";
import { formatInr, formatCount } from "@/lib/format";
import { FormEditorDialog } from "@/components/forms/form-editor-dialog";
import { RbClaimDialog } from "@/components/reimbursements/rb-claim-dialog";
import { RbClaimsList } from "@/components/reimbursements/rb-claims-list";
import { RbFilterProvider } from "@/components/reimbursements/rb-filter-context";
import { RbKpiStrip, type RbKpi } from "@/components/reimbursements/rb-kpi-strip";
import { isPaid, sumClaims } from "@/lib/reimbursements/claim-status";
import { attachmentCountsBySubmission } from "@/lib/queries/reimbursement-attachments";

export const dynamic = "force-dynamic";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReimbursementsPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const sp = await searchParams;
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "archived" ? "archived" : "active";
  const def = MODULES.reimbursement;

  // Same loads as the generic ModulePage — zero new queries.
  const [rows, requestFields, adminFieldsLive, products, requestFieldsRaw, adminFieldsRaw] = await Promise.all([
    listModuleSubmissions({ module: "reimbursement", employeeId: me.id, isAdmin: me.isAdmin, archived: view === "archived" }),
    resolveRequestFields("reimbursement"),
    resolveAdminFields("reimbursement"),
    getProductOptions(),
    resolveFields(requestKey("reimbursement"), def.requestFields),
    resolveFields(adminKey("reimbursement"), def.adminFields),
  ]);

  // Document counts for the badges — ONE grouped query for the whole page, not
  // one per card. The files' signed URLs are minted only when a card is opened
  // (see RbClaimAttachments); a count needs no round-trip to storage.
  // Fail-soft: a bad read costs the badges, never the page.
  const attachmentCounts = Object.fromEntries(
    await attachmentCountsBySubmission(rows.map((r) => r.id)).catch(() => new Map<string, number>()),
  );

  // ── KPIs folded over the already-loaded rows (zero extra queries) ──
  // Computed over EVERY row, and they stay that way when a filter is active:
  // a strip that recomputed itself against the selection would zero every card
  // but the chosen one. The amount rule comes from the shared module the list
  // filters with, so a card's total and its filtered list always agree.
  const totalClaimed = sumClaims(rows);
  const pendingRows = rows.filter((r) => r.status === "pending");
  const approvedRows = rows.filter((r) => r.status === "approved");
  const rejectedRows = rows.filter((r) => r.status === "rejected");
  const pendingAmount = sumClaims(pendingRows);
  const approvedAmount = sumClaims(approvedRows);
  const paidCount = approvedRows.filter(isPaid).length;
  const approvedShare = totalClaimed > 0 ? approvedAmount / totalClaimed : null;

  /**
   * The KPI cards, each paired with the filter it selects.
   *
   * `filter` is read off what the card TOTALS, never off its title — see
   * components/reimbursements/rb-kpi-strip.tsx for why "Approved · paid" maps
   * to `approvedAll` (approved, settled or not) rather than the narrower
   * "approved but unpaid" the toolbar chip means.
   */
  const kpis: RbKpi[] = [
    {
      key: "total",
      filter: "all",
      icon: <Wallet size={17} strokeWidth={2.4} />,
      accent: GREEN,
      label: "Total claimed",
      value: formatInr(totalClaimed),
      caption: `across ${formatCount(rows.length)} ${rows.length === 1 ? "claim" : "claims"}${view === "archived" ? " (archived)" : ""}`,
    },
    {
      key: "pending",
      filter: "pending",
      icon: <Hourglass size={17} strokeWidth={2.4} />,
      accent: pendingRows.length > 0 ? "#d97706" : "#334155",
      label: "Pending",
      value: formatInr(pendingAmount),
      caption:
        pendingRows.length > 0
          ? `${formatCount(pendingRows.length)} awaiting review`
          : "all reviewed",
    },
    {
      key: "approved",
      filter: "approvedAll",
      icon: <CheckCircle2 size={17} strokeWidth={2.4} />,
      accent: GREEN_DEEP,
      label: "Approved · paid",
      value: formatInr(approvedAmount),
      caption:
        approvedRows.length > 0
          ? `${formatCount(paidCount)} of ${formatCount(approvedRows.length)} settled`
          : "nothing approved yet",
      progress: approvedShare,
    },
    {
      key: "claims",
      filter: "all",
      icon: <Layers size={17} strokeWidth={2.4} />,
      accent: "#334155",
      label: "Claims",
      value: formatCount(rows.length),
      caption:
        rejectedRows.length > 0
          ? `${formatCount(rejectedRows.length)} rejected`
          : "none rejected",
    },
  ];

  const tabStyle = (active: boolean) =>
    active
      ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, color: "#fff" }
      : { background: "transparent", color: "var(--color-ink-soft)" };

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 pt-6 pb-8 max-lg:px-6 max-md:px-4 max-md:pt-5 max-md:pb-6">
        {/* The glass hero — a 26px-radius gradient-mesh card with its own
            backdrop-filter — was the single heaviest header in the app. It is
            the same flat command bar as everywhere else now; the state-dependent
            subtitle survives as the inline hint, and all four controls keep
            working unchanged in the action slot. */}
        <PageCommandBar
          title="Reimbursements"
          hint={
            view === "archived"
              ? "Archived claims — restore or delete from the ⋯ menu."
              : me.isAdmin
                ? `${formatCount(pendingRows.length)} ${pendingRows.length === 1 ? "claim" : "claims"} pending review.`
                : def.subtitle
          }
          actions={
            <>
              <Link
                href={"/reimbursements/dashboard" as Route}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <BarChart3 size={14} strokeWidth={2.6} />
                Dashboard
              </Link>
              {me.isAdmin && (
                <>
                  <FormEditorDialog formKey={requestKey("reimbursement")} formName={`${def.title} — request`} fields={requestFieldsRaw} />
                  <FormEditorDialog formKey={adminKey("reimbursement")} formName={`${def.title} — admin fields`} fields={adminFieldsRaw} />
                </>
              )}
              <RbClaimDialog fields={requestFields} productOptions={products} isAdmin={me.isAdmin} />
            </>
          }
        />

        {/*
          THE KPI STRIP AND THE LIST SHARE ONE FILTER.

          `RbFilterProvider` owns it, so clicking a KPI card and clicking a
          toolbar chip drive the same state — no second filtering mechanism, and
          no way for a card's total to describe a different set from the rows
          below it. The tabs sit inside too, purely so the provider can wrap the
          whole block; they are unchanged server links.
        */}
        <RbFilterProvider>
          <RbKpiStrip kpis={kpis} />

          {/* ── Active / Archived tabs ── */}
          <div
            className="mb-5 inline-flex overflow-hidden rounded-pill bg-surface-card"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <Link
              href={def.path as Route}
              className="px-4 py-2 text-[13.5px] font-bold transition-colors"
              style={tabStyle(view === "active")}
            >
              Active
            </Link>
            <Link
              href={`${def.path}?view=archived` as Route}
              className="px-4 py-2 text-[13.5px] font-bold transition-colors"
              style={tabStyle(view === "archived")}
            >
              Archived
            </Link>
          </div>

          <RbClaimsList
            rows={rows}
            isAdmin={me.isAdmin}
            requestFields={requestFields}
            adminFields={adminFieldsLive}
            productOptions={products}
            view={view}
            attachmentCounts={attachmentCounts}
            myEmployeeId={me.id}
          />
        </RbFilterProvider>
      </main>
    </>
  );
}
