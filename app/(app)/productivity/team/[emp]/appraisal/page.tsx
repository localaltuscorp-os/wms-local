/**
 * /productivity/team/[emp]/appraisal — an employee's Appraisal, reached from the
 * Team Productivity list. The Appraisal module MOVED here (2026-08): the old
 * top-level /appraisal room is retired (its bare route now redirects here) and
 * each person's rolling scorecard opens per-row from Team Performance.
 *
 * Same engine as before — the roster is loaded in the caller's scope (admin →
 * everyone; else self + anyone they manage), the selected employee comes from
 * the ROUTE (not ?emp=), and the fully-computed scorecard is handed to the
 * client <AppraisalWorkspace/>. Access is enforced by getScorecardData, which
 * throws for anyone out of scope (→ the picker prompt, never someone else's data).
 */
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { Award } from "lucide-react";
import { db, employees } from "@/lib/db";
import { apprConfig } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { getScorecardData, type ScorecardData } from "@/lib/appraisal2/data";
import { DashboardHeader } from "@/components/layout/header";
import {
  AppraisalWorkspace,
  type WorkspacePerson,
} from "@/components/appraisal2/appraisal-workspace";

export const dynamic = "force-dynamic";

const ACCENT = "var(--color-altus-red)";
const ACCENT_DEEP = "var(--color-altus-red-deep)";

export default async function TeamAppraisalPage({
  params,
}: {
  params: Promise<{ emp: string }>;
}) {
  requireAppraisal();
  const me = await requireUser();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const { emp } = await params;

  // Roster in scope — admin → full active roster; else self + anyone they are
  // assigned to as manager or management (so the manager tier is usable).
  let roster: WorkspacePerson[];
  if (isAdmin) {
    roster = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
  } else {
    const assigned = await db
      .select({ employeeId: apprConfig.employeeId })
      .from(apprConfig)
      .where(or(eq(apprConfig.managerId, me.id), eq(apprConfig.managementId, me.id)));
    const ids = Array.from(new Set([me.id, ...assigned.map((a) => a.employeeId)]));
    roster = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(and(eq(employees.isActive, true), inArray(employees.id, ids)))
      .orderBy(asc(employees.name));
  }

  const departments = Array.from(
    new Set(roster.map((p) => p.department).filter((d): d is string => !!d)),
  ).sort((a, b) => a.localeCompare(b));

  let data: ScorecardData | null = null;
  try {
    data = await getScorecardData(emp, me);
  } catch {
    data = null; // Forbidden / not in scope → render the picker prompt.
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] overflow-x-hidden px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${ACCENT} 9%, transparent), transparent 55%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Award size={13} strokeWidth={2.6} /> Team Productivity · Appraisal
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
            Appraisal
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
            One live rolling scorecard per person — the KPI bucket drives the incentive payout,
            Monthly Goals and the culture/competency dimensions round out the rest. Self and
            Manager advise, Management is final.
          </p>
        </header>

        <AppraisalWorkspace
          people={roster}
          departments={departments}
          selectedId={emp}
          data={data}
          isAdmin={isAdmin}
        />
      </main>
    </>
  );
}
