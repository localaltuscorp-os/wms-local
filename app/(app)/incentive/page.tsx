import Link from "next/link";
import type { Route } from "next";
import { BarChart3 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { IncentiveFormDialog } from "@/components/incentive/incentive-form-dialog";
import { IncentiveSyncButton } from "@/components/incentive/incentive-sync-button";
import { IncentiveList } from "@/components/incentive/incentive-list";
import { SocialEarnerSetting } from "@/components/incentive/social-earner-setting";
import { requireUser } from "@/lib/auth/current";
import { listIncentiveRequests } from "@/lib/queries/incentive";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getProductOptions } from "@/lib/forms/server";
import { db } from "@/lib/db";
import { orgSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
// Sheet sync hits a (sometimes cold) Apps Script web app; give the server
// action room to finish instead of the platform killing it early.
export const maxDuration = 60;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IncentivePage({ searchParams }: PageProps) {
  const me = await requireUser();
  const sp = await searchParams;
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "archived" ? "archived" : "active";

  const [rows, productOptions] = await Promise.all([
    listIncentiveRequests({
      employeeId: me.id,
      isAdmin: me.isAdmin,
      archived: view === "archived",
    }),
    getProductOptions(),
  ]);

  const employees = me.isAdmin ? await listEmployeeOptions() : [];
  // Defensive: the column may not exist yet if migrations haven't run.
  let socialEarner = "Rohan Choudhary";
  if (me.isAdmin) {
    try {
      const [s] = await db.select({ earner: orgSettings.incentiveSocialEarner }).from(orgSettings).where(eq(orgSettings.id, 1)).limit(1);
      if (s?.earner) socialEarner = s.earner;
    } catch { /* column not migrated yet — keep the default */ }
  }

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  const tab = (active: boolean) =>
    `px-4 py-2 text-[13.5px] font-bold transition-colors ${
      active ? "text-white" : "text-ink-soft"
    }`;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[860px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-display-lg text-ink-strong">Incentive</h1>
            <p className="text-body-lg text-ink-subtle mt-1">
              {view === "archived"
                ? "Archived incentives — restore or delete from the ⋯ menu."
                : me.isAdmin
                  ? `Team incentive requests — ${pendingCount} pending review.`
                  : "File incentive requests and track their approval."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={"/incentive/dashboard" as Route}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold border border-hairline bg-surface-card text-ink-strong hover:brightness-95 transition-all"
            >
              <BarChart3 size={16} strokeWidth={2.4} /> Dashboard
            </Link>
            {me.isAdmin && <IncentiveSyncButton />}
            <IncentiveFormDialog productOptions={productOptions} isAdmin={me.isAdmin} />
          </div>
        </header>

        {me.isAdmin && view === "active" && (
          <div className="mb-5">
            <SocialEarnerSetting current={socialEarner} employees={employees} />
          </div>
        )}

        {/* Active / Archived tabs */}
        <div className="mb-5 inline-flex rounded-full border border-hairline bg-surface-card overflow-hidden">
          <Link href={"/incentive" as Route} className={tab(view === "active")}
            style={{ background: view === "active" ? "var(--color-altus-red)" : "transparent" }}>
            Active
          </Link>
          <Link href={"/incentive?view=archived" as Route} className={tab(view === "archived")}
            style={{ background: view === "archived" ? "var(--color-altus-red)" : "transparent" }}>
            Archived
          </Link>
        </div>

        <IncentiveList rows={rows} isAdmin={me.isAdmin} view={view} employees={employees} />
      </main>
      <DashboardFooter />
    </>
  );
}
