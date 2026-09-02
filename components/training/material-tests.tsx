import Link from "next/link";
import type { Route } from "next";
import { Check, X, ClipboardList, Pencil } from "lucide-react";
import type { TcTestSummary } from "@/lib/queries/training";

export function MaterialTests({
  materialId,
  tests,
  canManage,
}: {
  materialId: string;
  tests: TcTestSummary[];
  canManage: boolean;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-bold text-ink-strong" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>Tests</h2>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {tests.map((t) => {
          const kindLabel = t.kind === 1 ? "MCQ" : "Fill in the Blank";
          const hasQuestions = t.questionCount > 0;
          return (
            <div key={t.kind} className="rounded-section border border-hairline bg-surface-card p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ClipboardList size={17} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} />
                    <h3 className="font-bold text-ink-strong" style={{ fontSize: 16 }}>Test {t.kind}</h3>
                  </div>
                  <p className="mt-0.5 text-[13px] font-medium text-ink-subtle">{kindLabel} · pass {t.passMark}% · {t.questionCount} {t.questionCount === 1 ? "question" : "questions"}</p>
                </div>
                {t.latest && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold" style={t.latest.passed ? { background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" } : { background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}>
                    {t.latest.passed ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />} {t.latest.score}%
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {hasQuestions ? (
                  <Link href={`/training/${materialId}/test/${t.kind}` as Route} className="inline-flex items-center gap-1.5 rounded-lg py-2 px-4 text-[14px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                    {t.latest ? "Retake Test" : "Take Test"}
                  </Link>
                ) : (
                  <span className="text-[13.5px] font-semibold text-ink-subtle">No test set yet.</span>
                )}
                {canManage && (
                  <Link href={`/training/${materialId}/tests` as Route} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong hover:border-altus-red">
                    <Pencil size={14} /> {hasQuestions ? "Edit" : "Add Questions"}
                  </Link>
                )}
              </div>
              {t.attemptCount > 1 && <p className="mt-2 text-[12px] font-medium text-ink-subtle">{t.attemptCount} attempts</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
