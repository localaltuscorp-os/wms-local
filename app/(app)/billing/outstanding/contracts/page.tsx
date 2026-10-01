import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { ContractList } from "@/components/outstanding/contract-list";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { listOutstandingContractsAdmin } from "@/lib/queries/outstanding";
import {
  listOutstandingProducts,
  listOutstandingEntities,
  listOutstandingPaymentModes,
} from "@/lib/queries/outstanding-rosters";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { PageShell } from "@/components/layout/page-shell";
import { PAGE_COMMAND_BAR_TITLE_STYLE } from "@/components/layout/page-command-bar";

export const dynamic = "force-dynamic";

export default async function ManageContractsPage() {
  await requireWorkspaceAdmin("billing");
  const base = "/billing/outstanding";

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
      <PageShell width="full">
        <Link
          href={base as Route}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors mb-4"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          Outstanding Dashboard
        </Link>
        <header className="mb-7">
          <h1
            style={PAGE_COMMAND_BAR_TITLE_STYLE}
          >
            Manage Contracts
          </h1>
        </header>

        <ContractList
          contracts={contracts}
          lookups={{ products, entities, modes, employees }}
        />
      </PageShell>
    </>
  );
}
