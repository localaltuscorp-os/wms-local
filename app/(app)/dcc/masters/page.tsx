import Link from "next/link";
import type { Route } from "next";
import { Gauge } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { listOwnerItems } from "@/lib/queries/dcc";
import { loadDccMasterData } from "@/lib/queries/dcc-masters";
import { loadMasterLinksForItems } from "@/lib/dcc/master-sync";
import { checkDccItemDelete } from "@/lib/dcc/item-lock";
import { DccMasterView } from "@/components/dcc/masters/dcc-master-view";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * DCC MASTER — like the Job Description: a master DCC per POSITION (the
 * employee's designation), and the SPECIFIC DCC of each employee on top of it.
 *
 * Everyone can read the masters. Manan Sir and the super-admins change them
 * (./actions.ts). The Employee DCC tab shows the people this viewer can see —
 * themselves, their team, or everyone — and lets whoever manages that person's
 * KPIs add the specific ones, through the same actions as the DCC board.
 */
export default async function DccMastersPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const [scope, data, sp] = await Promise.all([loadDccScope(me), loadDccMasterData(), searchParams]);

  const view = sp.view === "employee" ? "employee" : "position";
  const designationId = typeof sp.designation === "string" ? sp.designation : null;
  const people = data.employees.filter((e) => scope.visibleIds.has(e.id));
  const employeeId = typeof sp.emp === "string" && scope.visibleIds.has(sp.emp) ? sp.emp : me.id;

  let employeeItems: Awaited<ReturnType<typeof listOwnerItems>> = [];
  if (view === "employee") {
    const items = await listOwnerItems(employeeId);
    const links = await loadMasterLinksForItems(items.map((i) => i.id));
    employeeItems = items.map(({ createdByEmail, ...it }) => ({
      ...it,
      masterDesignation: links.get(it.id) ?? null,
      deleteLocked: !checkDccItemDelete({ actorEmail: me.email, creatorEmail: createdByEmail }).ok,
    }));
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 pt-6 pb-8 max-lg:px-6 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <PageCommandBar
          title="DCC Master"
          hint={isSuperAdmin(me.email) ? undefined : "Read-only"}
          actions={
            <Link
              href={"/dcc" as Route}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              <Gauge size={14} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
              DCC Board
            </Link>
          }
        />
        <DccMasterView
          view={view}
          canAuthor={isSuperAdmin(me.email)}
          missing={data.missing}
          designations={data.designations}
          items={data.items}
          selectedDesignationId={designationId}
          people={people}
          employeeId={employeeId}
          meId={me.id}
          employeeItems={employeeItems}
          canManageEmployee={canManageItemsFor(scope, employeeId)}
        />
      </main>
    </>
  );
}
