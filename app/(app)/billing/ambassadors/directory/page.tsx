import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PAGE_COMMAND_BAR_TITLE_STYLE } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listAmbassadors } from "@/lib/queries/ambassadors";
import { DirectoryTable } from "@/components/ambassadors/directory-table";

export const dynamic = "force-dynamic";

export default async function AmbassadorDirectoryPage() {
  await requireWorkspace("billing");
  const rows = await listAmbassadors();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link
          href={"/billing/ambassadors" as Route}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"
        >
          <ArrowLeft size={15} strokeWidth={2.4} />
          Partner Intelligence
        </Link>
        <header className="mt-3 mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1
              style={PAGE_COMMAND_BAR_TITLE_STYLE}
            >
              Directory
            </h1>
          </div>
          <Link
            href={"/billing/ambassadors/new" as Route}
            className="inline-flex items-center gap-2 rounded-xl py-3 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)",
            }}
          >
            <Plus size={17} strokeWidth={2.6} />
            New Ambassador
          </Link>
        </header>

        <DirectoryTable rows={rows} />
      </main>
    </>
  );
}
