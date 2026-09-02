import { redirect } from "next/navigation";
import type { Route } from "next";

import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { getMaterialTests, getTestForTaking } from "@/lib/queries/training";
import { TestTaker } from "@/components/training/test-taker";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; kind: string }>;
}

export default async function TakeTestPage({ params }: PageProps) {
  const { id, kind } = await params;
  const k = parseInt(kind, 10);
  const me = await requireWorkspace("training");
  if (k !== 1 && k !== 2) redirect(`/training/${id}` as Route);

  const tests = await getMaterialTests(id, me.id);
  const summary = tests.find((t) => t.kind === k);
  if (!summary?.testId || summary.questionCount === 0) redirect(`/training/${id}` as Route);

  const test = await getTestForTaking(summary!.testId!);
  if (!test) redirect(`/training/${id}` as Route);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[860px]">
          <header className="mt-3 mb-6">
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2.8vw, 38px)", letterSpacing: "-0.025em" }}>
              Test {k}
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              {test!.questions.length} {test!.questions.length === 1 ? "question" : "questions"} · pass mark {test!.passMark}%
            </p>
          </header>
          <TestTaker test={test!} />
        </div>
      </main>
    </>
  );
}
