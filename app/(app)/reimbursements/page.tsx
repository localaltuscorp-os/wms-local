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

export const dynamic = "force-dynamic";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/** Claim ₹ as a number — module fields are stored as strings. */
function claimAmount(r: ModuleSubmissionRow): number {
  const n = Number(String(r.fields.amount ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Approved AND admin logged a payment date ⇒ settled ("paid"). */
function isPaid(r: ModuleSubmissionRow): boolean {
  return r.status === "approved" && (r.adminFields?.payment_date ?? "") !== "";
}

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

  // ── KPIs folded over the already-loaded rows (zero extra queries) ──
  const sum = (rs: ModuleSubmissionRow[]) => rs.reduce((s, r) => s + claimAmount(r), 0);
  const totalClaimed = sum(rows);
  const pendingRows = rows.filter((r) => r.status === "pending");
  const approvedRows = rows.filter((r) => r.status === "approved");
  const rejectedRows = rows.filter((r) => r.status === "rejected");
  const pendingAmount = sum(pendingRows);
  const approvedAmount = sum(approvedRows);
  const paidCount = approvedRows.filter(isPaid).length;
  const approvedShare = totalClaimed > 0 ? approvedAmount / totalClaimed : null;

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

        {/* ── KPI strip (folded over the loaded rows — zero extra queries) ── */}
        <section
          aria-label="Reimbursement totals"
          className="mb-6 grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1"
        >
          <KpiCard
            icon={<Wallet size={17} strokeWidth={2.4} />}
            accent={GREEN}
            label="Total claimed"
            value={formatInr(totalClaimed)}
            caption={`across ${formatCount(rows.length)} ${rows.length === 1 ? "claim" : "claims"}${view === "archived" ? " (archived)" : ""}`}
            delay={0}
          />
          <KpiCard
            icon={<Hourglass size={17} strokeWidth={2.4} />}
            accent={pendingRows.length > 0 ? "#d97706" : "#334155"}
            label="Pending"
            value={formatInr(pendingAmount)}
            caption={
              pendingRows.length > 0
                ? `${formatCount(pendingRows.length)} awaiting review`
                : "all reviewed"
            }
            delay={50}
          />
          <KpiCard
            icon={<CheckCircle2 size={17} strokeWidth={2.4} />}
            accent={GREEN_DEEP}
            label="Approved · paid"
            value={formatInr(approvedAmount)}
            caption={
              approvedRows.length > 0
                ? `${formatCount(paidCount)} of ${formatCount(approvedRows.length)} settled`
                : "nothing approved yet"
            }
            progress={approvedShare}
            delay={100}
          />
          <KpiCard
            icon={<Layers size={17} strokeWidth={2.4} />}
            accent="#334155"
            label="Claims"
            value={formatCount(rows.length)}
            caption={
              rejectedRows.length > 0
                ? `${formatCount(rejectedRows.length)} rejected`
                : "none rejected"
            }
            delay={150}
          />
        </section>

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
        />
      </main>
    </>
  );
}

/* ── KPI card — same construction as the Attendance / Salary / Overtime stat cards ── */

function KpiCard({
  icon,
  accent,
  label,
  value,
  caption,
  progress,
  delay,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
  delay: number;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{
            background: `color-mix(in srgb, ${accent} 10%, transparent)`,
            color: accent,
          }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(21px, 1.7vw, 27px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 75%, #fff), ${accent})`,
            }}
          />
        </div>
      )}
    </div>
  );
}
