import type { Route } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { withRetry } from "@/lib/db/with-timeout";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  obligationsForRoster,
  currentObligationPeriod,
  type ObligationRow,
} from "@/lib/queries/training-obligations";
import { statusFor, type ObligationStatus } from "@/components/training/obligations/obligation-bar";

export const dynamic = "force-dynamic";

type Person = { id: string; name: string; avatarUrl: string | null; department: string | null };

function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function value(actual: number, target: number, unit: string, expectedPct: number): { text: string; status: ObligationStatus } {
  return { text: `${Math.round(actual * 10) / 10} / ${Math.round(target * 10) / 10}${unit}`, status: statusFor(actual, target, expectedPct) };
}

export default async function TrainingObligationsPage() {
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);
  const retry = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };
  let people: Person[];

  if (admin) {
    people = await withRetry(
      () => db.select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
      { ...retry, label: "obl-roster-admin" },
    );
  } else {
    const allowed = new Set([me.id, ...(await getDownlineIds(me.id))]);
    const rows = await withRetry(
      () => db.select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department }).from(employees).where(and(eq(employees.isActive, true))),
      { ...retry, label: "obl-roster" },
    );
    people = rows.filter((person) => allowed.has(person.id)).sort((a, b) => a.name.localeCompare(b.name));
  }

  const period = currentObligationPeriod();
  const data = await obligationsForRoster(people.map((person) => person.id), period);
  const byId = new Map<string, ObligationRow>(data.rows.map((row) => [row.employeeId, row]));
  const { targets } = data;
  const expectedPct = period.periodFraction;
  const expectedShares = data.weeksElapsed;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4">
        <PageCommandBar
          title="Skill-Upgrade Obligations"
          actions={<Link href={"/pms" as Route} className="wg-btn rounded-lg px-3 py-2 text-[13px] font-bold">Performance Scores</Link>}
          toolbar={<span className="text-[12.5px] font-medium text-ink-muted">{monthLabel(period.period)} · {Math.round(expectedPct * 100)}% elapsed</span>}
        />

        {people.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-muted">No one to show yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card">
            <table className="w-full min-w-[940px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft">
                  {['Employee', 'Function', 'Give', 'Attend', 'Self-Learning', 'Share', 'Status'].map((heading) => (
                    <th key={heading} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const row = byId.get(person.id);
                  const isManager = row?.isManager ?? false;
                  const give = value(row?.givenHours ?? 0, targets.giveHours, "h", expectedPct);
                  const attend = value(row?.attendedHours ?? 0, targets.attendHours, "h", expectedPct);
                  const selfLearning = value(row?.selfLearnHours ?? 0, targets.selfLearnHours, "h", expectedPct);
                  const share = value(row?.sharesDone ?? 0, targets.shareMinPerWeek > 0 ? expectedShares : 0, " wk", expectedPct);
                  const statuses = [attend.status, selfLearning.status, share.status, ...(isManager ? [give.status] : [])];
                  const overall = statuses.includes("behind") ? "Behind" : statuses.every((status) => status === "met" || status === "na") ? "Complete" : "On track";
                  return (
                    <tr key={person.id} className="border-b border-hairline last:border-b-0 hover:bg-surface-soft">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5"><EmployeeAvatar name={person.name} size="sm" /><span className="font-semibold text-ink-strong">{person.name}</span></div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">{person.department ?? "—"}</td>
                      <ProgressCell value={isManager ? give : null} />
                      <ProgressCell value={attend} />
                      <ProgressCell value={selfLearning} />
                      <ProgressCell value={share} />
                      <td className="px-4 py-2.5"><StatusBadge status={overall} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

function ProgressCell({ value }: { value: { text: string; status: ObligationStatus } | null }) {
  if (!value) return <td className="px-4 py-2.5 text-ink-subtle">—</td>;
  const color = value.status === "behind" ? "text-altus-red" : value.status === "met" ? "text-green-deep" : "text-ink-strong";
  return <td className={`px-4 py-2.5 font-semibold tabular-nums ${color}`}>{value.text}</td>;
}

function StatusBadge({ status }: { status: "Behind" | "Complete" | "On track" }) {
  const tone = status === "Behind" ? "bg-red-50 text-altus-red" : status === "Complete" ? "bg-green-50 text-green-deep" : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold ${tone}`}>{status}</span>;
}
