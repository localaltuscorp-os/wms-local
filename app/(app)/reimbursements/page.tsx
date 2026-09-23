import Link from "next/link";
import type { Route } from "next";
import type React from "react";
import {
  BarChart3,
  Wallet,
  Hourglass,
  CheckCircle2,
  Banknote,
  XCircle,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { PageShell } from "@/components/layout/page-shell";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { SectionIcon } from "@/components/dashboard/section-icon";
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
import {
  CLAIM_ACCENT,
  CLAIM_ACCENT_DEEP,
  CLAIM_CARD_FILTER,
  CLAIM_STATUS_CARD,
  computeClaimKpis,
  settledShare,
} from "@/lib/reimbursements/claim-kpis";
import { attachmentCountsBySubmission } from "@/lib/queries/reimbursement-attachments";

export const dynamic = "force-dynamic";

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

  /* ── KEY CARDS ────────────────────────────────────────────────────────────
     Folded over the already-loaded rows in ONE pass (zero extra queries) by
     `lib/reimbursements/claim-kpis.ts`, which also owns which filter each card
     selects and which shared palette slot paints it.

     Computed over EVERY row, and they stay that way when a filter is active: a
     strip that recomputed itself against the selection would zero every card
     but the chosen one.

     The five cards PARTITION the book — pending + approved + paid + rejected
     add up to total, in money and in count. The old four did not: "Total
     claimed" and "Claims" both filtered to every row, so one card existed only
     to restate the other's caption, while Rejected had no card at all. */
  const f = computeClaimKpis(rows);
  const claimWord = (n: number) => (n === 1 ? "claim" : "claims");
  const archivedNote = view === "archived" ? " (archived)" : "";

  const kpis: RbKpi[] = [
    {
      key: "total",
      filter: CLAIM_CARD_FILTER.total,
      card: "total",
      icon: <Wallet size={14} strokeWidth={2.5} />,
      label: "Total claimed",
      value: formatInr(f.total.amount),
      caption: `across ${formatCount(f.total.count)} ${claimWord(f.total.count)}${archivedNote}`,
      count: f.total.count,
    },
    {
      key: "pending",
      filter: CLAIM_CARD_FILTER.pending,
      card: CLAIM_STATUS_CARD.pending,
      icon: <Hourglass size={14} strokeWidth={2.5} />,
      label: "Pending",
      value: formatInr(f.pending.amount),
      caption:
        f.pending.count > 0
          ? `${formatCount(f.pending.count)} awaiting review`
          : "nothing awaiting review",
      count: f.pending.count,
    },
    {
      key: "approved",
      filter: CLAIM_CARD_FILTER.approved,
      card: CLAIM_STATUS_CARD.approved,
      icon: <CheckCircle2 size={14} strokeWidth={2.5} />,
      label: "Approved",
      // NARROW on purpose: approved money that has NOT been paid out yet, i.e.
      // what the firm still owes. The settled money is the Paid card's.
      value: formatInr(f.approved.amount),
      caption:
        f.approved.count > 0
          ? `${formatCount(f.approved.count)} ${claimWord(f.approved.count)} owed`
          : "nothing owed",
      count: f.approved.count,
    },
    {
      key: "paid",
      filter: CLAIM_CARD_FILTER.paid,
      card: CLAIM_STATUS_CARD.paid,
      icon: <Banknote size={14} strokeWidth={2.5} />,
      label: "Paid",
      value: formatInr(f.paid.amount),
      caption:
        f.paid.count > 0
          ? `${formatCount(f.paid.count)} settled`
          : "nothing settled yet",
      count: f.paid.count,
      // The share of approved money that has actually left. Null — no bar at
      // all — when nothing has been approved, because an empty bar would say
      // "none of it has been paid", which is a different statement.
      progress: settledShare(f),
    },
    {
      key: "rejected",
      filter: CLAIM_CARD_FILTER.rejected,
      card: CLAIM_STATUS_CARD.rejected,
      icon: <XCircle size={14} strokeWidth={2.5} />,
      label: "Rejected",
      value: formatInr(f.rejected.amount),
      caption:
        f.rejected.count > 0
          ? `${formatCount(f.rejected.count)} ${claimWord(f.rejected.count)} turned down`
          : "none turned down",
      count: f.rejected.count,
    },
  ];

  /* Active / Archived is a VIEW SWITCH, not a brand moment. It used to be a
     green gradient — the same green as "Request Reimbursement" directly above
     it — so the loudest thing on the page was a segmented control pointing at
     the view you were already looking at. Neutral ink now; the green is spent
     on the one button that starts something. */
  const tabStyle = (active: boolean) =>
    active
      ? { background: "var(--color-altus-red)", color: "#fff" }
      : { background: "transparent", color: "var(--color-ink-soft)" };

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-white">
      <DashboardHeader generatedAt={new Date()} />
      {/* THE MODULE'S GREEN, DECLARED ONCE. Three files each carried their own
          `const GREEN = "#16a34a"` — this page, the claims list and the claim
          dialog. Everything inside now inherits it through the accent variables
          the app already uses for per-module identity (see `.brand-btn` in
          globals.css), so the colour is one declaration instead of three. */}
      <PageShell
        as="main"
        width="full"
        py={false}
        /* `w-full` IS LOAD-BEARING. main is a flex item in a column flex
           container, where `mx-auto` alone shrinks the box to its content
           width and centres it — which is why this page sat at 1119px in a
           1708px shell with ~295px of dead margin down each side, despite
           saying max-w-[1400px]. With w-full, max-w is the real constraint. */
        className="bg-white pb-12 pt-7 max-md:pt-5"
        style={
          {
            "--module-accent": CLAIM_ACCENT,
            "--module-accent-deep": CLAIM_ACCENT_DEEP,
          } as React.CSSProperties
        }
      >
        {/* The glass hero — a 26px-radius gradient-mesh card with its own
            backdrop-filter — was the single heaviest header in the app. It is
            the same flat command bar as everywhere else now; the state-dependent
            subtitle survives as the inline hint, and all four controls keep
            working unchanged in the action slot. */}
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reimbursements</h1>
            <p className="text-[13px] font-medium text-ink-muted">
              {view === "archived"
                ? "Archived claims"
                : me.isAdmin
                  ? `${formatCount(f.pending.count)} ${claimWord(f.pending.count)} pending review.`
                  : def.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:justify-start">
            <Link
              href={"/reimbursements/dashboard" as Route}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              <BarChart3 size={14} strokeWidth={2.6} /> Dashboard
            </Link>
            {me.isAdmin && (
              <>
                <FormEditorDialog
                  formKey={requestKey("reimbursement")}
                  formName={`${def.title} request`}
                  triggerLabel="Claim form"
                  fields={requestFieldsRaw}
                />
                <FormEditorDialog
                  formKey={adminKey("reimbursement")}
                  formName={`${def.title} admin fields`}
                  triggerLabel="Admin fields"
                  fields={adminFieldsRaw}
                />
              </>
            )}
            <RbClaimDialog fields={requestFields} productOptions={products} isAdmin={me.isAdmin} />
          </div>
        </header>

        <PageCommandBar
          className="hidden"
          title="Reimbursements"
          hint={
            view === "archived"
              ? "Archived claims — restore or delete from the ⋯ menu."
              : me.isAdmin
                ? `${formatCount(f.pending.count)} ${claimWord(f.pending.count)} pending review.`
                : def.subtitle
          }
          actions={
            <>
              {/* Icon-only once the row gets tight. Four actions plus a long
                  primary CTA overflow the command bar's fixed row below about
                  1024px, and it clips rather than wraps — so the button that
                  loses its word is this one, the only chart icon in the row and
                  the only one that stays unambiguous without it. The two form
                  editors keep their words, because THEY are the pair that was
                  impossible to tell apart. */}
              <Link
                href={"/reimbursements/dashboard" as Route}
                aria-label="Reimbursement dashboard"
                title="Reimbursement dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft max-lg:gap-0"
              >
                <BarChart3 size={14} strokeWidth={2.6} />
                <span className="max-lg:hidden">Dashboard</span>
              </Link>
              {me.isAdmin && (
                <>
                  {/* These two edit DIFFERENT forms — the fields a claimant
                      fills in, and the fields an admin fills in when deciding —
                      and both used to render a button labelled "Edit Form".
                      Two identical buttons side by side, one of which silently
                      does something else. They are named now. */}
                  <FormEditorDialog
                    formKey={requestKey("reimbursement")}
                    formName={`${def.title} — request`}
                    triggerLabel="Claim form"
                    fields={requestFieldsRaw}
                  />
                  <FormEditorDialog
                    formKey={adminKey("reimbursement")}
                    formName={`${def.title} — admin fields`}
                    triggerLabel="Admin fields"
                    fields={adminFieldsRaw}
                  />
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

          <DashboardSectionHeader
            icon={<SectionIcon icon={Wallet} tone="red" />}
            title={view === "archived" ? "Archived claims" : "Claims"}
            subtitle="Search, sort, and review reimbursement requests."
            className="hidden"
            inset="px-0"
            actions={
              <div
                className="inline-flex overflow-hidden rounded-lg bg-surface-card"
                style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              >
                <Link
                  href={def.path as Route}
                  className="px-3 py-1.5 text-[12px] font-bold transition-colors"
                  style={tabStyle(view === "active")}
                >
                  Active
                </Link>
                <Link
                  href={`${def.path}?view=archived` as Route}
                  className="px-3 py-1.5 text-[12px] font-bold transition-colors"
                  style={tabStyle(view === "archived")}
                >
                  Archived
                </Link>
              </div>
            }
          />

          {/* ── Active / Archived tabs ── */}
          <div
            className="hidden"
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
            headerActions={
              <div
                className="inline-flex overflow-hidden rounded-lg bg-surface-card"
                style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              >
                <Link
                  href={def.path as Route}
                  className="px-3 py-1.5 text-[12px] font-bold transition-colors"
                  style={tabStyle(view === "active")}
                >
                  Active
                </Link>
                <Link
                  href={`${def.path}?view=archived` as Route}
                  className="px-3 py-1.5 text-[12px] font-bold transition-colors"
                  style={tabStyle(view === "archived")}
                >
                  Archived
                </Link>
              </div>
            }
          />
        </RbFilterProvider>
      </PageShell>
    </div>
  );
}
