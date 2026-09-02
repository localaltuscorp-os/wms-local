import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { OutstandingFormDialog } from "@/components/outstanding/outstanding-form-dialog";
import { CollectionFormDialog } from "@/components/outstanding/collection-form-dialog";
import { OutstandingFilterBar } from "@/components/outstanding/dashboard/filter-bar";
import { OutstandingStatCards } from "@/components/outstanding/dashboard/stat-cards";
import { OverdueBucketsPanel } from "@/components/outstanding/dashboard/overdue-buckets";
import { MonthSummaryPanel } from "@/components/outstanding/dashboard/month-summary";
import { EmployeeEntityRollups } from "@/components/outstanding/dashboard/rollups";
import { PdcPanel } from "@/components/outstanding/dashboard/pdc-table";
import { OutstandingEntriesTable } from "@/components/outstanding/dashboard/entries-table";
import { CollectionOverview } from "@/components/outstanding/dashboard/collection-overview";
import { CollectionEntriesTable } from "@/components/outstanding/dashboard/collection-entries";
import { OutstandingExportDialog } from "@/components/outstanding/export-dialog";
import { OutstandingPrintButton } from "@/components/outstanding/dashboard/export-buttons";
import { OutstandingImportDialog } from "@/components/outstanding/import-dialog";
import Link from "next/link";
import type { Route } from "next";
import { Settings2 } from "lucide-react";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { todayISO, rollingHorizon } from "@/lib/outstanding/horizon";
import { parseOutstandingFilters } from "@/lib/outstanding/filters";
import { loadOutstandingDashboard } from "@/lib/queries/outstanding";
import {
  listOutstandingProducts,
  listOutstandingEntities,
  listOutstandingPaymentModes,
  listOutstandingResponsibles,
} from "@/lib/queries/outstanding-rosters";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { OUTSTANDING_CYCLES, OUTSTANDING_CYCLE_LABELS } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CYCLE_OPTIONS = OUTSTANDING_CYCLES.map((c) => ({
  value: c,
  label: OUTSTANDING_CYCLE_LABELS[c],
}));

export default async function OutstandingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await requireUser();
  const me = await getCurrentEmployee();
  const isAdmin = me?.isAdmin ?? false;

  const today = todayISO();
  const horizon = rollingHorizon(today);
  const filters = parseOutstandingFilters(sp);

  type Loaded = Awaited<ReturnType<typeof loadOutstandingDashboard>>;
  let dashboard: Loaded["dashboard"];
  let entries: Loaded["entries"];
  let collectionEntries: Loaded["collectionEntries"];
  let products: { id: string; name: string }[];
  let entities: { id: string; name: string }[];
  let modes: { id: string; name: string }[];
  let clients: string[];
  let employees: { id: string; name: string }[];
  let responsibles: { id: string; name: string }[];

  try {
    const [loaded, productsR, entitiesR, modesR, clientsR, employeesR, responsiblesR] =
      await Promise.all([
        loadOutstandingDashboard(filters, today, horizon),
        listOutstandingProducts(),
        listOutstandingEntities(),
        listOutstandingPaymentModes(),
        listActiveClientNames(),
        listEmployeeOptions(),
        listOutstandingResponsibles(),
      ]);
    dashboard = loaded.dashboard;
    entries = loaded.entries;
    collectionEntries = loaded.collectionEntries;
    products = productsR;
    entities = entitiesR;
    modes = modesR;
    clients = clientsR;
    employees = employeesR;
    responsibles = responsiblesR;
  } catch (err) {
    console.error("[outstanding] dashboard load failed:", err);
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-8 pb-16">
          <div
            className="bg-surface-card rounded-section border border-hairline p-10 text-center"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <p
              className="font-bold"
              style={{ fontSize: 20, color: "var(--color-ink-strong)" }}
            >
              Could not load the outstanding dashboard.
            </p>
            <p
              className="mt-2 font-semibold"
              style={{ fontSize: 15, color: "var(--color-ink-muted)" }}
            >
              Please refresh in a moment. If it keeps failing, contact support.
            </p>
          </div>
        </main>
        <DashboardFooter />
      </>
    );
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <OutstandingFilterBar
        employees={employees}
        entities={entities}
        modes={modes}
        cycles={CYCLE_OPTIONS}
      />
      <main className="outstanding-print-root mx-auto max-w-[1600px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(40px, 4.2vw, 56px)",
                letterSpacing: "-0.025em",
                lineHeight: 1,
              }}
            >
              Outstanding Dashboard
            </h1>
            <p
              className="mt-2 text-ink-muted font-semibold"
              style={{ fontSize: 18 }}
            >
              Outstanding payment monitoring
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {isAdmin && (
              <Link
                href={"/outstanding/contracts" as Route}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2.5 px-4 text-[14px] font-medium text-ink-strong hover:border-hairline-strong transition-colors"
              >
                <Settings2 size={15} strokeWidth={2.2} />
                Manage contracts
              </Link>
            )}
            {isAdmin && <OutstandingImportDialog />}
            <OutstandingExportDialog
              entries={entries}
              collectionEntries={collectionEntries}
            />
            <OutstandingPrintButton />
            <OutstandingFormDialog
              responsibles={responsibles}
              products={products}
              entities={entities}
              modes={modes}
            />
            <CollectionFormDialog
              clients={clients}
              responsibles={responsibles}
              modes={modes}
            />
          </div>
        </header>

        <OutstandingStatCards totals={dashboard.totals} sp={sp} />

        <OverdueBucketsPanel buckets={dashboard.buckets} sp={sp} />

        <div className="mt-7 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          <MonthSummaryPanel
            title="Month-wise Overdue"
            rows={dashboard.monthOverdue}
            tone="red"
          />
          <MonthSummaryPanel
            title="Month-wise Not Due"
            rows={dashboard.monthNotDue}
            tone="green"
          />
        </div>

        <EmployeeEntityRollups
          byEmployee={dashboard.byEmployee}
          byEntity={dashboard.byEntity}
          sp={sp}
        />

        <PdcPanel pdc={dashboard.pdc} sp={sp} />

        <OutstandingEntriesTable entries={entries} />

        <CollectionOverview collections={dashboard.collections} />

        <CollectionEntriesTable rows={collectionEntries} />
      </main>
      <DashboardFooter />
    </>
  );
}
