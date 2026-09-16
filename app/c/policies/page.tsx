import Link from "next/link";
import type { Route } from "next";
import { Check, ChevronRight, ShieldCheck } from "lucide-react";
import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { listCandidatePolicies } from "@/lib/hr/candidate/policy-signing";
import { formatDateHr } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * THE CANDIDATE'S POLICY LIST — every policy they are asked to acknowledge,
 * with their own progress, opened from an emailed link and no account at all.
 *
 * Identity comes from `requireCandidateOwner()`, the same guard the interview
 * form uses; it resolves the access-link cookie (or bounces to /c/resume when
 * the link has expired). Nothing here takes a candidate id from the client.
 *
 * A signed policy is NOT hidden or locked — it keeps its row and shows what
 * they signed as and when, and the card stays open so they can read it again or
 * sign again. That is the same promise the interview form makes: the link stays
 * live for its whole term, and coming back to check is normal.
 */
export default async function CandidatePoliciesPage() {
  const { me, rowId } = await requireCandidateOwner();
  const policies = await listCandidatePolicies(rowId);
  const done = policies.filter((p) => p.signedAt && !p.outdated).length;

  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-10 max-md:px-4">
      {/* A signed-out visitor has no app shell — a plain <img>, not next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Altus Corp" className="mb-8 h-9 w-auto" />

      <h1
        className="text-[26px] font-black text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}
      >
        Your policies to sign
      </h1>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-muted">
        {me.name ? `${me.name.split(" ")[0]}, please` : "Please"} read each policy below and sign it.
        You can come back to this link any time to read them again or change what you signed —{" "}
        <strong>no login needed</strong>.
      </p>

      <div className="mt-4 flex items-center gap-2 text-[13px] font-bold text-ink-muted">
        <ShieldCheck size={15} />
        {done} of {policies.length} signed
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {policies.map((p) => {
          const signed = !!p.signedAt && !p.outdated;
          return (
            <li key={p.key}>
              <Link
                href={`/c/policies/${p.key}` as Route}
                className="flex items-center gap-4 rounded-2xl border border-hairline-strong bg-white p-4 transition hover:border-altus-red"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[13px] font-black text-white"
                  style={{ background: signed ? "#16a34a" : "var(--color-altus-red)" }}
                >
                  {signed ? <Check size={18} /> : p.badge}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold text-ink-strong">{p.title}</span>
                  <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-ink-muted">
                    {signed && p.signedAt
                      ? `Signed as ${p.signedName} on ${formatDateHr(p.signedAt)}`
                      : p.outdated
                        ? "An updated version has been published — please sign again."
                        : p.blurb}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-muted" />
              </Link>
            </li>
          );
        })}
      </ul>

      {policies.length === 0 ? (
        <p className="mt-6 rounded-xl border border-hairline-strong bg-white p-4 text-[13.5px] text-ink-muted">
          There are no policies to sign right now. You can close this page.
        </p>
      ) : null}
    </main>
  );
}
