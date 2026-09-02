import Link from "next/link";
import type { Route } from "next";
import { asc, and, eq } from "drizzle-orm";
import { Target, ScrollText, TriangleAlert } from "lucide-react";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { MODULE_THEME } from "@/lib/module-theme";
import { requirePmsV3 } from "@/lib/pms/v3/flag";
import { getGradeBandsForMonth, getV3Config, getMonthlyTotalsForMonth } from "@/lib/queries/pms-v3";
import { GradeBandBadge } from "@/components/pms/v3/grade-band-badge";
import { TotalBadge } from "@/components/pms/v3/total-summary";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

/** Current IST month as YYYY-MM + a human label. */
function currentPeriod(): { period: string; label: string } {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const period = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = ist.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return { period, label };
}

export default async function PmsV3Page() {
  requirePmsV3();
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);
  const { period, label } = currentPeriod();

  let people: { id: string; name: string; avatarUrl: string | null; department: string | null }[];
  if (admin) {
    people = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
  } else {
    const reports = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(and(eq(employees.managerId, me.id), eq(employees.isActive, true)))
      .orderBy(asc(employees.name));
    const self = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.id, me.id));
    const seen = new Set<string>();
    people = [...self, ...reports].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }

  const [grades, cfg, totals] = await Promise.all([
    getGradeBandsForMonth(people.map((p) => ({ id: p.id, name: p.name })), period),
    getV3Config(),
    getMonthlyTotalsForMonth(people.map((p) => ({ id: p.id, name: p.name })), period),
  ]);
  const gradeById = new Map(grades.map((g) => [g.employeeId, g]));
  const totalById = new Map(totals.map((t) => [t.employeeId, t]));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1200px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${ACCENT} 9%, transparent), transparent 55%)`,
              "rgba(255,255,255,0.72)",
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
            <Target size={13} strokeWidth={2.6} /> Performance Intelligence · v3 (dark)
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,42px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            Monthly Scoring · {label}
          </h1>
          <p className="mt-1.5 max-w-[80ch] text-[15px] font-medium text-ink-muted">
            Everyone self-scores; managers score their juniors; Manan scores everyone. Incentives convert to a
            grade band of monthly CTC (paid only). This surface is DARK behind <code>PMS_V3</code> — it does not
            affect the live score until Sir verifies.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href={"/pms/v3/constitution" as Route}
              className="wg-btn inline-flex items-center gap-2 rounded-pill border-2 bg-white/70 px-4 py-2.5 text-[14px] font-bold"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
            >
              <ScrollText size={16} strokeWidth={2.4} /> Constitution Scoring
            </Link>
          </div>
        </header>

        {cfg.nonManagerActive == null && (
          <div
            className="mb-5 flex items-center gap-2 rounded-xl border border-hairline p-3.5 text-[13.5px]"
            style={{ background: "color-mix(in srgb, #d97706 8%, transparent)", color: "#b45309" }}
          >
            <TriangleAlert size={17} strokeWidth={2.4} />
            Non-manager weight band is <b className="mx-1">pending Sir&apos;s ruling</b> (3 variants given). Scores are
            captured; the weighted total for non-managers is withheld until the canonical band is chosen.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3.5 max-lg:grid-cols-1">
          {people.map((p, i) => {
            const g = gradeById.get(p.id);
            const t = totalById.get(p.id);
            return (
              <Link
                key={p.id}
                href={`/pms/v3/score/${p.id}` as Route}
                className="wg-rise group flex items-center gap-4 rounded-2xl bg-surface-card p-4 transition-all hover:-translate-y-0.5"
                style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, boxShadow: CARD_SHADOW }}
              >
                <EmployeeAvatar name={p.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold text-ink-strong">{p.name}</span>
                  <span className="text-[13px] text-ink-subtle">{p.department || "—"}</span>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {t && <TotalBadge total={t.total} accent={ACCENT} accentDeep={ACCENT_DEEP} />}
                  {g && <GradeBandBadge grade={g.grade} size="sm" />}
                </div>
              </Link>
            );
          })}
        </div>
        {people.length === 0 && (
          <div className="rounded-2xl bg-surface-card p-12 text-center text-[14.5px] text-ink-muted" style={{ boxShadow: CARD_SHADOW }}>
            No one to show yet.
          </div>
        )}
      </main>
    </>
  );
}
