import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listPgLookups } from "@/lib/queries/people-gives";
import { IntroductionForm } from "@/components/people-gives/introduction-form";
import { formatDate, localDateString } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NewIntroductionPage() {
  await requireWorkspace("sales");
  const lookups = await listPgLookups();
  const todayLabel = formatDate(localDateString("Asia/Kolkata"));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1100px]">
          <Link
            href={"/people-gives" as Route}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"
          >
            <ArrowLeft size={15} strokeWidth={2.4} />
            People Gives
          </Link>
          <header className="mt-3 mb-6">
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(28px, 3vw, 40px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
              }}
            >
              New Introduction
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Record who can introduce us, and to whom.
            </p>
          </header>

          <IntroductionForm lookups={lookups} todayLabel={todayLabel} />
        </div>
      </main>
    </>
  );
}
