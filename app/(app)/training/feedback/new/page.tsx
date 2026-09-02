import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listTcServices } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { FeedbackForm } from "@/components/training/feedback/feedback-form";

export const dynamic = "force-dynamic";

export default async function NewFeedbackPage() {
  await requireWorkspace("training");
  const [services, emps] = await Promise.all([listTcServices(), listEmployeeOptions()]);
  const employees = emps.map((e) => ({ id: e.id, name: e.name }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1080px]">
          <Link href={"/training/feedback" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><ArrowLeft size={15} /> Feedback Desk</Link>
          <header className="mt-3 mb-6">
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 800, fontSize: "clamp(28px, 3vw, 40px)", letterSpacing: "-0.025em" }}>New Feedback</h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>Record client or internal feedback. The questions adapt to the type.</p>
          </header>
          <FeedbackForm services={services} employees={employees} />
        </div>
      </main>
    </>
  );
}
