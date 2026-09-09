import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { FolderLock, Users, LayoutGrid } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireDossierAccess, canAccessEmployeeDossier } from "@/lib/dossier/access";
import {
  listDossierEmployees,
  getEmployeeDossier,
  listDossierByType,
  dossierTypeCounts,
} from "@/lib/queries/dossier";
import { isDossierDocType, type DossierDocType } from "@/lib/dossier/types";
import { EmployeeGrid } from "@/components/dossier/employee-grid";
import { EmployeeDossierView } from "@/components/dossier/employee-dossier-view";
import { TypeBrowse } from "@/components/dossier/type-browse";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DossierPage({ searchParams }: PageProps) {
  const access = await requireDossierAccess();
  const sp = await searchParams;
  const emp = typeof sp.emp === "string" ? sp.emp : null;
  const tab = sp.tab === "type" ? "type" : "employee";
  const typeParam = typeof sp.type === "string" && isDossierDocType(sp.type) ? (sp.type as DossierDocType) : "appointment";

  // ── One employee's dossier ──────────────────────────────────────────────
  if (emp || !access.isAdmin) {
    const targetId = emp ?? access.me.id;
    if (!canAccessEmployeeDossier(access, targetId)) redirect("/dossier" as Route);
    const data = await getEmployeeDossier(targetId, { includeArchived: access.isAdmin });
    if (!data) redirect((access.isAdmin ? "/dossier" : "/hub") as Route);
    return (
      <Shell isAdmin={access.isAdmin} tab="employee">
        <EmployeeDossierView data={data} isAdmin={access.isAdmin} backHref={access.isAdmin ? "/dossier" : null} />
      </Shell>
    );
  }

  // ── Admin: By type ──────────────────────────────────────────────────────
  if (tab === "type") {
    const [rows, counts] = await Promise.all([listDossierByType(typeParam), dossierTypeCounts()]);
    return (
      <Shell isAdmin tab="type">
        <TypeBrowse active={typeParam} rows={rows} counts={counts} />
      </Shell>
    );
  }

  // ── Admin: By employee (default) ────────────────────────────────────────
  const employees = await listDossierEmployees(access);
  return (
    <Shell isAdmin tab="employee">
      <EmployeeGrid employees={employees} />
    </Shell>
  );
}

function Shell({ children, isAdmin, tab }: { children: React.ReactNode; isAdmin: boolean; tab: "employee" | "type" }) {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <header className="wg-rise mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
              <FolderLock size={13} strokeWidth={2.6} /> Employees · Dossier
            </span>
          </div>
          <h1 className="mt-3 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px,3.6vw,46px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
            {isAdmin ? "Employee Dossier" : "My Dossier"}
          </h1>
          <p className="mt-1.5 max-w-[74ch] text-[15.5px] font-medium text-ink-muted">
            {isAdmin
              ? "Every person's complete document file — appointment, probation, CTC, increments, confidentiality and onboarding — in one secure place."
              : "Your documents on file — appointment, probation, CTC, increments, confidentiality and onboarding. View or download anytime."}
          </p>

          {isAdmin && (
            <div className="mt-5 flex flex-wrap gap-2">
              <TabPill href="/dossier" active={tab === "employee"} Icon={Users} label="By Employee" />
              <TabPill href="/dossier?tab=type" active={tab === "type"} Icon={LayoutGrid} label="By Document Type" />
            </div>
          )}
        </header>
        {children}
      </main>
    </>
  );
}

function TabPill({ href, active, Icon, label }: { href: string; active: boolean; Icon: typeof Users; label: string }) {
  return (
    <Link
      href={href as Route}
      aria-current={active ? "page" : undefined}
      className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold transition"
      style={
        active
          ? { background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", color: "#fff", boxShadow: "0 8px 20px -12px var(--color-altus-red-deep)" }
          : { background: "var(--color-surface-card)", color: "var(--color-ink-muted)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }
      }
    >
      <Icon size={15} strokeWidth={2.4} /> {label}
    </Link>
  );
}
