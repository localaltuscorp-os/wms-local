import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PAGE_COMMAND_BAR_TITLE_STYLE } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listAmbProducts } from "@/lib/queries/ambassadors";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { AmbassadorForm } from "@/components/ambassadors/ambassador-form";

export const dynamic = "force-dynamic";

export default async function NewAmbassadorPage() {
  await requireWorkspace("billing");
  const [products, employees] = await Promise.all([listAmbProducts(), listEmployeeOptions()]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1100px]">
          <Link
            href={"/billing/ambassadors/directory" as Route}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"
          >
            <ArrowLeft size={15} strokeWidth={2.4} />
            Directory
          </Link>
          <header className="mt-3 mb-6">
            <h1
              style={PAGE_COMMAND_BAR_TITLE_STYLE}
            >
              New Ambassador
            </h1>
          </header>

          <AmbassadorForm mode="create" products={products} employees={employees} />
        </div>
      </main>
    </>
  );
}
