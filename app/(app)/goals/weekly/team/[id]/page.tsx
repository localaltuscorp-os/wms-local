import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ClipboardList, Check, Circle, Briefcase, Target } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DayReviewControl } from "@/components/weekly-goals/day-review-control";
import { canReviewChecklist, memberChecklistDays } from "@/lib/queries/checklist-review";
import { TZ } from "@/lib/weekly-goals/week";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const RED = "var(--color-altus-red)";

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday}, ${formatDate(ymd)}`;
}

const REVIEW_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: "Approved", color: "#15803d", bg: "color-mix(in srgb, var(--color-green) 15%, transparent)" },
  needs_rework: { label: "Needs rework", color: "#b45309", bg: "color-mix(in srgb, var(--color-amber) 16%, transparent)" },
};

export default async function MemberChecklistReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireUser();
  // Your own "Daily checklist" tile → your own checklist, not the review page
  // (you don't review yourself; the review guard would otherwise bounce you
  // straight back to the team page — the "same page again" dead-end).
  if (id === me.id) redirect("/my-day" as Route);
  const allowed = await canReviewChecklist({ id: me.id, isAdmin: me.isAdmin, email: me.email }, id);
  if (!allowed) redirect("/goals/weekly/team" as Route);

  const { name, days } = await memberChecklistDays(id);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/goals/weekly/team" as Route} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-subtle hover:text-ink-strong">
          <ArrowLeft size={15} strokeWidth={2.4} /> Team performance
        </Link>
        <header className="mt-3 mb-6 flex items-center gap-4 wg-rise">
          <EmployeeAvatar name={name ?? "—"} size="lg" />
          <div>
            <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}>
              <ClipboardList size={13} strokeWidth={2.6} /> Daily checklist review
            </span>
            <h1 className="mt-2 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px,3vw,38px)", letterSpacing: "-0.025em" }}>
              {name ?? "Team member"}
            </h1>
          </div>
        </header>

        {days.length === 0 ? (
          <p className="py-12 text-center text-ink-muted">No daily checklists in the last few weeks.</p>
        ) : (
          <div className="space-y-4">
            {days.map((day, i) => {
              const doneN = day.items.filter((it) => it.done).length;
              const badge = day.review ? REVIEW_BADGE[day.review.status] : undefined;
              return (
                <section key={day.date} className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm" style={{ animationDelay: `${i * 25}ms` }}>
                  <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-[16px] font-bold text-ink-strong">{prettyDate(day.date)}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">{doneN}/{day.items.length} done</span>
                      {badge && (
                        <span className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold" style={{ color: badge.color, background: badge.bg }}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {day.items.map((it) => (
                      <li key={it.id} className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded"
                          style={it.done ? { background: "var(--color-green)", color: "#fff" } : { border: "1.5px solid var(--color-hairline-strong)" }}
                        >
                          {it.done ? <Check size={13} strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`inline-flex items-center gap-1.5 text-[14.5px] font-medium ${it.done ? "text-ink-subtle line-through" : "text-ink-strong"}`}>
                            <span style={{ color: it.taskId ? "#2563eb" : it.origin === "goal_related" ? RED : "var(--color-ink-subtle)" }}>
                              {it.taskId ? <Briefcase size={12} /> : it.origin === "goal_related" ? <Target size={12} /> : <Circle size={7} strokeWidth={0} fill="currentColor" />}
                            </span>
                            {it.title}
                          </span>
                          {it.doneNote && <span className="block text-[12.5px] text-ink-subtle">— {it.doneNote}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {day.review?.note && (
                    <p className="mt-2.5 text-[12.5px] text-ink-muted"><strong>Review note:</strong> {day.review.note}</p>
                  )}
                  <DayReviewControl employeeId={id} planDate={day.date} status={day.review?.status ?? null} note={day.review?.note ?? null} />
                </section>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-[12px] text-ink-subtle">Showing the last few weeks. Times shown in {TZ}.</p>
      </main>
    </>
  );
}
