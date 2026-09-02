import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ContractList } from "@/components/outstanding/contract-list";
import { requireAdmin } from "@/lib/auth/current";
import { listOutstandingContractsAdmin } from "@/lib/queries/outstanding";
import {
  listOutstandingProducts,
  listOutstandingEntities,
  listOutstandingPaymentModes,
} from "@/lib/queries/outstanding-rosters";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const dynamic = "force-dynamic";

export default async function ManageContractsPage() {
  await requireAdmin();

  const [contracts, products, entities, modes, employees] = await Promise.all([
    listOutstandingContractsAdmin(),
    listOutstandingProducts(),
    listOutstandingEntities(),
    listOutstandingPaymentModes(),
    listEmployeeOptions(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-8 pb-16">
        <Link
          href={"/outstanding" as Route}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors mb-4"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          Outstanding dashboard
        </Link>
        <header className="mb-7">
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(36px, 3.6vw, 48px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Manage Contracts
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 18 }}>
            Edit contract terms, status, and installment schedules ·{" "}
            {contracts.length} {contracts.length === 1 ? "contract" : "contracts"}
          </p>
        </header>

        <ContractList
          contracts={contracts}
          lookups={{ products, entities, modes, employees }}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
