import Link from "next/link";
import { Check, FileSignature, ShieldCheck, X } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { canManageDeclarations } from "@/lib/hr/declaration/access";
import { DeclarationTracker } from "@/components/hr/declaration/declaration-tracker";
import { listDeclarationStatus, myDeclarationState } from "./actions";

export const dynamic = "force-dynamic";

const ACCENT = "#B91C1C";

/**
 * HR → DECLARATION STATUS. Who has returned a signed declaration, and who has
 * not, across every active employee.
 *
 * ── THE UPLOAD LIVES HERE, NOT ON HR RECORD ──────────────────────────────
 * Whoever holds the hard file scans a stack of them in one sitting and works
 * down a list. Putting the upload on each person's record would mean opening
 * twenty-odd pages to file twenty-odd sheets.
 *
 * Gated by `canManageDeclarations` — deliberately narrower than admin, see
 * lib/hr/declaration/access.ts. The gate is repeated inside every action this
 * page calls; this one only decides whether to draw the screen.
 */
export default async function DeclarationStatusPage() {
  const me = await requireWorkspace("hr");

  if (!canManageDeclarations(me, DUMMY_MODE)) {
    // Not an HR-register admin — this tab isn't a ledger for them, it's their
    // own status. Reuse myDeclarationState() (the same read /declaration uses,
    // already scoped to the caller) rather than showing the register at all.
    const state = await myDeclarationState();
    const signed = state.ok && state.acknowledgedAt != null;
    return (
      <PageShell>
        <div className="mx-auto max-w-xl rounded-2xl border border-hairline-strong bg-white px-8 py-12 text-center">
          <span
            className="mx-auto grid h-11 w-11 place-items-center rounded-xl"
            style={{ background: signed ? "#DCFCE7" : "#FEE2E2", color: signed ? "#15803D" : "#B91C1C" }}
          >
            <FileSignature className="h-5 w-5" />
          </span>
          <h1 className="mt-3 text-[20px] font-bold text-ink-strong">
            Declaration Letter Signed —{" "}
            {state.ok ? (
              signed ? (
                <span className="inline-flex items-center gap-1" style={{ color: "#15803D" }}>
                  <Check size={18} strokeWidth={3} /> Yes
                </span>
              ) : (
                <span className="inline-flex items-center gap-1" style={{ color: "#B91C1C" }}>
                  <X size={18} strokeWidth={3} /> No
                </span>
              )
            ) : (
              "Unknown"
            )}
          </h1>
          {state.ok && !signed && (
            <>
              <p className="mt-2 text-[14px] text-ink-muted">
                You haven&apos;t signed your declaration yet.
              </p>
              <Link
                href="/declaration"
                className="pastel-cta wg-btn mt-4 inline-flex h-10 items-center gap-1.5 rounded-pill px-4 text-[13.5px] font-bold"
              >
                <FileSignature size={15} strokeWidth={2.6} /> Sign it Now
              </Link>
            </>
          )}
          {state.ok && signed && (
            <p className="mt-2 text-[14px] text-ink-muted">
              Signed{state.acknowledgedAt ? ` on ${state.acknowledgedAt.toLocaleDateString()}` : ""}. You can
              review it on your{" "}
              <Link href="/declaration" className="font-semibold text-[var(--color-altus-red)] hover:underline">
                Declaration page
              </Link>
              .
            </p>
          )}
          {!state.ok && (
            <p className="mt-2 text-[14px] text-ink-muted">{state.error}</p>
          )}
        </div>
      </PageShell>
    );
  }

  const res = await listDeclarationStatus();

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: "#FEE2E2", color: ACCENT }}
        >
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Declaration Status</h1>
          <p className="text-[13px] text-ink-muted">
            Every employee signs one declaration by hand. This is who has returned theirs — the paper
            original is filed separately.
          </p>
        </div>
      </header>

      {res.ok ? (
        <DeclarationTracker rows={res.rows} version={res.version} />
      ) : (
        <div className="rounded-2xl border border-hairline-strong bg-white px-8 py-12 text-center">
          <h2 className="text-[17px] font-bold text-ink-strong">Cannot show the register</h2>
          <p className="mt-2 text-[14px] text-ink-muted">{res.error}</p>
        </div>
      )}
    </PageShell>
  );
}
