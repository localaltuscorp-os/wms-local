import type { Route } from "next";
import { redirect } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireUser } from "@/lib/auth/current";
import { getMondayConfirmQueue, mondayConfirmUiEnabled } from "@/lib/attendance/confirmations";
import { MondayConfirmQueueView } from "@/components/attendance/monday-confirm-queue";

export const dynamic = "force-dynamic";

/**
 * WS-5 — Monday attendance confirmation queue. Behind MONDAY_CONFIRM_UI
 * (default OFF): while the flag is off the route 404-redirects to /attendance,
 * so nothing is exposed until Sir flips it on.
 */
export default async function ConfirmationsPage() {
  if (!mondayConfirmUiEnabled()) redirect("/attendance" as Route);
  const me = await requireUser();
  const queue = await getMondayConfirmQueue(me);

  if (queue.mode === "none") {
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <main className="mx-auto w-full max-w-[1100px] px-8 max-md:px-4 pt-10 pb-20">
          <p
            className="mt-6 rounded-2xl bg-surface-card px-6 py-10 text-center text-[15px] font-bold text-ink-muted"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
          >
            Monday confirmations are for managers and the accounts team.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1100px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header className="wg-rise mb-6">
          <div className="mt-3">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              <CalendarCheck2 size={13} strokeWidth={2.6} /> Attendance · Monday confirm
            </span>
          </div>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.4vw,44px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            {queue.mode === "accountant" ? "Confirm Managers' Week" : "Confirm Your Team's Week"}
          </h1>
          <p className="mt-1.5 text-[15.5px] font-medium text-ink-muted">
            {queue.mode === "accountant"
              ? "Outside-office managers"
              : "Reports who work outside the office"}{" "}
            · week of {queue.week.label}
          </p>
        </header>

        <MondayConfirmQueueView queue={queue} />
      </main>
    </>
  );
}

