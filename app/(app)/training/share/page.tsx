import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { MODULE_THEME } from "@/lib/module-theme";
import { getThisWeekShare, listSharesForFeedback } from "@/lib/queries/learning";
import { currentWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { ShareForm } from "@/components/training/learning/share-form";
import { ShareFeed } from "@/components/training/learning/share-feed";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400"; // Altus red deep

export default async function WeeklySharePage() {
  const me = await requireWorkspace("training");
  const weekLabel = formatWeekLabel(currentWeekStart());
  const [mine, feed] = await Promise.all([
    getThisWeekShare(me.id),
    listSharesForFeedback({ excludeEmployeeId: me.id, limit: 24 }),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Weekly Share
          </span>
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}
          >
            Share & Learn
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Once a week, share 10 minutes of what you know — and rate what colleagues share. Both feed your Skill-Upgrade score.
          </p>
        </header>

        <div className="grid grid-cols-5 gap-5 max-lg:grid-cols-1">
          {/* This week's Share form */}
          <section className="col-span-2 max-lg:col-span-1">
            <div className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm" style={{ animationDelay: "0ms" }}>
              <h2 className="text-[15px] font-bold text-ink-strong">Your Share This Week</h2>
              <p className="mt-0.5 mb-4 text-[13px] font-medium text-ink-subtle">{weekLabel}</p>
              <ShareForm existing={mine} weekLabel={weekLabel} />
            </div>
          </section>

          {/* Peer-feedback feed */}
          <section className="col-span-3 max-lg:col-span-1">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-ink-strong" style={{ letterSpacing: "-0.01em" }}>
                  Recent Colleague Shares
                </h2>
                <p className="text-[13px] font-medium text-ink-subtle">Rate each 1–5 and leave a line of feedback.</p>
              </div>
            </div>
            <ShareFeed shares={feed} />
          </section>
        </div>
      </main>
    </>
  );
}
