import { redirect } from "next/navigation";
import { ShieldAlert, Lock } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCaCredentials, listCaReturns } from "@/lib/queries/accounts-ca";
import { CredentialsVault } from "@/components/accounts/ca-handover/credentials-vault";
import { ReturnsArchive } from "@/components/accounts/ca-handover/returns-archive";

export const dynamic = "force-dynamic";

export default async function CaHandoverPage() {
  // The module layout lets admins AND managers in — CA Handover is admin-only,
  // so we re-gate here and bounce managers to the hub.
  const access = await requireAccountsAccess();
  if (!access.canViewCaHandover) redirect("/hub");

  const [groups, returns] = await Promise.all([listCaCredentials(), listCaReturns()]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mt-4 mb-6 wg-rise">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              Accounts · Section 14
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
              style={{
                color: "var(--color-altus-red-deep)",
                background: "rgba(225,6,0,0.08)",
                border: "1px solid rgba(225,6,0,0.22)",
              }}
            >
              <Lock size={11} strokeWidth={2.6} aria-hidden /> Admins only
            </span>
          </div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px, 3.6vw, 46px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 6,
              maxWidth: "24ch",
            }}
          >
            CA Handover — Logins, Passwords &amp; Govt Portals
          </h1>
          <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "70ch" }}>
            The secure vault of statutory-portal credentials and the filed-returns
            document archive, ready to hand to the chartered accountant.
          </p>
        </header>

        {/* SENSITIVE banner */}
        <div
          className="mb-7 flex items-start gap-3 rounded-section px-5 py-4 wg-rise"
          style={{
            background: "rgba(225,6,0,0.05)",
            border: "1px solid rgba(225,6,0,0.22)",
          }}
        >
          <ShieldAlert
            size={22}
            strokeWidth={2.4}
            className="shrink-0 mt-0.5"
            style={{ color: "var(--color-altus-red-deep)" }}
            aria-hidden
          />
          <div>
            <p className="font-bold text-ink-strong" style={{ fontSize: 14.5 }}>
              Sensitive — handle with care
            </p>
            <p className="mt-0.5 text-ink-muted font-medium" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Passwords are encrypted at rest and masked by default. Use the eye
              button to reveal one password at a time — nothing is shown until you
              ask for it. Do not share, screenshot, or paste these credentials
              outside trusted hands.
            </p>
          </div>
        </div>

        <CredentialsVault groups={groups} />

        <div className="mt-12">
          <ReturnsArchive rows={returns} />
        </div>
      </main>
    </>
  );
}
