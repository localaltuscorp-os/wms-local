/**
 * /appraisal/admin — Appraisal v2 ADMIN PANEL (admin-only).
 *
 * Pick a department + employee, then shape that person's live scorecard config:
 * the <=5 KPIs, the <=3 Skills, the incentive target, the knowledge do/give
 * rule, the six dimension weights (sum-to-100), and the manager + management
 * assignees. All edits go through the "use server" admin actions.
 *
 * Non-admins are bounced back to the read /appraisal surface.
 */
import { redirect } from "next/navigation";
import type { Route } from "next";
import { asc, eq } from "drizzle-orm";
import { SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { apprConfig, designations, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { DashboardHeader } from "@/components/layout/header";
import type { RoleClass } from "@/lib/appraisal2/types";
import {
  AdminPanel,
  type AdminEmployee,
  type EmployeeConfig,
} from "@/components/appraisal2/admin-panel";

export const dynamic = "force-dynamic";

const ACCENT = "var(--color-altus-red)";
const ACCENT_DEEP = "var(--color-altus-red-deep)";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AppraisalAdminPage({ searchParams }: PageProps) {
  requireAppraisal();
  const me = await requireUser();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  if (!isAdmin) redirect("/appraisal" as Route);

  const sp = await searchParams;
  const selectedId = typeof sp.emp === "string" ? sp.emp : null;

  // Full active roster (picker + manager/management assignee options).
  const roster = await db
    .select({
      id: employees.id,
      name: employees.name,
      department: employees.department,
      designation: designations.name,
      avatarUrl: employees.avatarUrl,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  const people: AdminEmployee[] = roster.map((r) => ({
    id: r.id,
    name: r.name,
    department: r.department,
    designation: r.designation,
    avatarUrl: r.avatarUrl,
  }));

  const departments = Array.from(
    new Set(people.map((p) => p.department).filter((d): d is string => !!d)),
  ).sort((a, b) => a.localeCompare(b));

  // Selected employee's current config (role class + assignees).
  let config: EmployeeConfig | null = null;
  if (selectedId && people.some((p) => p.id === selectedId)) {
    const cfgRow = await db.query.apprConfig.findFirst({
      where: eq(apprConfig.employeeId, selectedId),
    });

    config = {
      employeeId: selectedId,
      roleClass: (cfgRow?.roleClass === "manager" ? "manager" : "non-manager") as RoleClass,
      managerId: cfgRow?.managerId ?? null,
      managementId: cfgRow?.managementId ?? null,
    };
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <header className="wg-rise mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <SlidersHorizontal size={13} strokeWidth={2.6} /> Appraisal · Admin config
            </span>
          </div>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.4vw,44px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Scorecard Configuration
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
            Pick a person, then set their role class (Manager or Non-Manager — this selects the
            dimension set and weights) and the manager + management assignees. KPI targets come
            from the shared KPI dictionary; actuals and dimension scores are entered on the scorecard.
          </p>
        </header>

        <AdminPanel
          people={people}
          departments={departments}
          selectedId={selectedId}
          config={config}
        />
      </main>
    </>
  );
}
