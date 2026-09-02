import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { Pencil, Plus, Mail, Phone, Building2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { getAmbassador } from "@/lib/queries/ambassadors";
import { isWonStage } from "@/lib/ambassadors/stages";
import { inr, inrCompact } from "@/lib/ambassadors/format";
import { Avatar } from "@/components/ui/avatar";
import { TierPill } from "@/components/ambassadors/tier-pill";
import { ScoreBadge } from "@/components/ambassadors/score-badge";
import { WorkspaceTabs, ArchiveButton } from "@/components/ambassadors/workspace-tabs";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { label: string; bg: string; ink: string }> = {
  active: { label: "Active", bg: "rgba(20,140,80,0.14)", ink: "#0f7a47" },
  paused: { label: "Paused", bg: "rgba(214,138,20,0.14)", ink: "#9a5a00" },
  archived: { label: "Archived", bg: "rgba(80,80,100,0.12)", ink: "#4a4a57" },
};

function payoutTerms(type: string, value: number): string {
  if (type === "flat") return `${inr(value)} flat`;
  return `${value}% of deal`;
}

export default async function AmbassadorWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWorkspace("sales");
  const { id } = await params;
  const detail = await getAmbassador(id);
  if (!detail) notFound();

  const a = detail.ambassador;
  const score = a.partnerScore == null ? null : Number(a.partnerScore);
  const payoutValue = Number(a.payoutValue);
  const monthlyTarget = a.monthlyTarget == null ? null : Number(a.monthlyTarget);

  const revenue = detail.referrals
    .filter((r) => isWonStage(r.stage))
    .reduce((acc, r) => acc + (r.dealAmount ?? 0), 0);
  const targetPct = monthlyTarget && monthlyTarget > 0 ? Math.min(1, revenue / monthlyTarget) : null;
  const status = STATUS_STYLE[a.status] ?? STATUS_STYLE.active!;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        {/* breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
          <Link href={"/ambassadors/directory" as Route} className="hover:text-[color:var(--color-altus-red)] transition-colors">
            Ambassadors
          </Link>
          <span aria-hidden>/</span>
          <span className="text-ink-muted">{a.name}</span>
        </div>

        {/* HERO */}
        <header
          className="relative overflow-hidden rounded-3xl border border-hairline bg-white p-6 max-md:p-5"
          style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 24px 60px -34px rgba(0,0,0,0.45)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ background: "radial-gradient(90% 120% at 6% -10%, color-mix(in srgb, var(--color-altus-red) 8%, transparent), transparent 55%)" }}
          />
          <div className="relative flex items-start justify-between gap-6 max-lg:flex-col">
            {/* identity */}
            <div className="flex min-w-0 items-start gap-4">
              <Avatar name={a.name} avatarUrl={a.photoUrl} size={68} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1
                    className="text-ink-strong"
                    style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,2.8vw,38px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
                  >
                    {a.name}
                  </h1>
                  <TierPill tier={a.tier} />
                  <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ background: status.bg, color: status.ink }}>
                    {status.label}
                  </span>
                </div>
                {a.company && (
                  <p className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-ink-muted">
                    <Building2 size={15} strokeWidth={2.4} />
                    {a.company}
                  </p>
                )}
                <p className="mt-1.5 text-[13px] font-medium text-ink-soft">
                  {a.ownerName ? `Managed by ${a.ownerName}` : "No relationship manager assigned"}
                  <span className="mx-2" aria-hidden>·</span>
                  <span className="font-semibold text-ink-muted">{payoutTerms(a.payoutType, payoutValue)}</span>
                </p>

                {/* contact chips */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.email && (
                    <a
                      href={`mailto:${a.email}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)]"
                    >
                      <Mail size={13} strokeWidth={2.5} />
                      {a.email}
                    </a>
                  )}
                  {a.phone && (
                    <a
                      href={`tel:${a.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)]"
                    >
                      <Phone size={13} strokeWidth={2.5} />
                      {a.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* score + actions */}
            <div className="flex shrink-0 flex-col items-end gap-4 max-lg:w-full max-lg:flex-row max-lg:items-center max-lg:justify-between">
              <div className="flex items-center gap-3">
                <ScoreBadge score={score} size={64} />
                <div className="leading-tight">
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Partner score</div>
                  <div className="text-[13px] font-semibold text-ink-muted">out of 100</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href={`/ambassadors/${a.id}/edit` as Route}
                  className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
                >
                  <Pencil size={16} strokeWidth={2.6} />
                  Edit
                </Link>
                <Link
                  href={"/ambassadors/pipeline" as Route}
                  className="inline-flex items-center gap-2 rounded-xl py-3 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99]"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}
                >
                  <Plus size={16} strokeWidth={2.6} />
                  New Referral
                </Link>
                <ArchiveButton id={a.id} archived={a.archived} />
              </div>
            </div>
          </div>

          {/* monthly target progress */}
          {monthlyTarget && monthlyTarget > 0 && (
            <div className="relative mt-5 border-t border-hairline pt-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-ink-soft">Monthly target</span>
                <span className="text-[13.5px] font-semibold text-ink-muted tabular-nums">
                  <span className="font-extrabold text-ink-strong">{inrCompact(revenue)}</span> of {inrCompact(monthlyTarget)}
                  {targetPct != null && <span className="ml-2 text-ink-soft">({Math.round(targetPct * 100)}%)</span>}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-soft">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(2, (targetPct ?? 0) * 100)}%`,
                    background:
                      (targetPct ?? 0) >= 1
                        ? "linear-gradient(90deg, color-mix(in srgb, var(--color-green,#15803d) 70%, transparent), var(--color-green,#15803d))"
                        : "linear-gradient(90deg, color-mix(in srgb, var(--color-altus-red) 55%, transparent), var(--color-altus-red))",
                  }}
                />
              </div>
            </div>
          )}
        </header>

        <WorkspaceTabs detail={detail} />
      </main>
    </>
  );
}
