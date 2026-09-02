import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listAmbassadors } from "@/lib/queries/ambassadors";
import { DirectoryTable } from "@/components/ambassadors/directory-table";

export const dynamic = "force-dynamic";

export default async function AmbassadorDirectoryPage() {
  await requireWorkspace("sales");
  const rows = await listAmbassadors();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link
          href={"/ambassadors" as Route}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"
        >
          <ArrowLeft size={15} strokeWidth={2.4} />
          Partner Intelligence
        </Link>
        <header className="mt-3 mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              Ambassadors
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px, 3.4vw, 44px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
                marginTop: 6,
              }}
            >
              Directory
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Every referral partner, their tier, score, pipeline, and commission at a glance.
            </p>
          </div>
          <Link
            href={"/ambassadors/new" as Route}
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
