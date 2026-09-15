import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices } from "@/db/schema";
import { requireSessionSkippingDeviceCheck } from "@/lib/auth/current";
import { resolveDeviceContext } from "@/lib/security/device-access";
import { DEVICE_KIND_LABELS } from "@/db/enums";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Device not authorized",
  robots: { index: false, follow: false },
};

/**
 * WHERE AN UNAUTHORIZED DEVICE LANDS.
 *
 * `requireUser()` redirects here when the device this request came from is not
 * one of the employee's registered devices. It is deliberately OUTSIDE the
 * `(app)` route group, so it inherits none of the application chrome, none of
 * the daily-ritual gates and none of the workspace access checks — an employee
 * who cannot use the WMS should not be rendering the WMS around a refusal.
 *
 * It uses `requireSessionSkippingDeviceCheck()` for the obvious reason: routed
 * through the normal guard, the page that explains the device refusal would be
 * redirected to itself, forever.
 *
 * The page is INFORMATIONAL, not a workaround. Nothing on it changes device
 * authorization — that is an administrator's act, from
 * Attendance → Registered Devices. All it does is answer the three questions
 * somebody staring at a refusal actually has: why, which devices do work, and
 * who fixes it.
 */
export default async function DeviceBlockedPage() {
  const me = await requireSessionSkippingDeviceCheck();
  const ctx = await resolveDeviceContext(me);

  // Reachable by typing the URL from a perfectly good laptop. Send them back to
  // the app rather than showing a refusal that does not apply to them.
  if (ctx.allowed) redirect("/hub" as Route);

  const registered = await db
    .select({
      kind: mobileDevices.kind,
      label: mobileDevices.label,
      status: mobileDevices.status,
      lastSeenAt: mobileDevices.lastSeenAt,
    })
    .from(mobileDevices)
    .where(eq(mobileDevices.employeeId, me.id))
    .orderBy(desc(mobileDevices.createdAt));

  const approved = registered.filter((d) => d.status === "approved");
  const pending = registered.filter((d) => d.status === "pending");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background:
          "radial-gradient(120% 80% at 50% -10%, #FCE4E2 0%, #F7F7F6 55%, #F7F7F6 100%)",
        fontFamily:
          "var(--font-display), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <section className="w-full max-w-[520px] rounded-[24px] border border-hairline-strong bg-white p-8 shadow-[0_20px_60px_-24px_rgba(58,21,18,0.28)] max-md:p-6">
        <span
          className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          Device not authorized
        </span>

        <h1
          className="mt-4 text-ink-strong"
          style={{
            fontWeight: 900,
            fontSize: "clamp(22px,3vw,30px)",
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          You can&rsquo;t use Altus from this device
        </h1>

        <p className="mt-3 text-[14px] font-medium leading-relaxed text-ink-muted">{ctx.error}</p>

        <div className="mt-6 rounded-2xl border border-hairline-strong bg-[#FAFAF9] p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
            Your registered devices
          </h2>
          {approved.length === 0 ? (
            <p className="mt-2 text-[13px] font-medium text-ink-muted">
              You have no approved devices yet. Ask a device administrator to register the laptop
              and phone you work from.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {approved.map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
                  <span className="inline-block size-1.5 rounded-full bg-[#15803d]" />
                  {DEVICE_KIND_LABELS[d.kind] ?? d.kind}
                  <span className="font-medium text-ink-muted">— {d.label ?? "Unnamed device"}</span>
                </li>
              ))}
            </ul>
          )}

          {pending.length > 0 && (
            <p className="mt-3 text-[12.5px] font-medium text-ink-muted">
              {pending.length} device{pending.length === 1 ? "" : "s"} waiting for approval.
            </p>
          )}
        </div>

        <p className="mt-5 text-[13px] font-medium leading-relaxed text-ink-muted">
          Each person may use one registered laptop and one registered phone. To add or replace a
          device, ask a device administrator — you cannot approve your own.
        </p>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
