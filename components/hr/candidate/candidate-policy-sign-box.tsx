"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PenLine } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { signPolicyAsCandidate } from "@/app/c/policies/actions";
import { formatDateHr } from "@/lib/format";

/**
 * THE CANDIDATE'S SIGN BOX — typed acceptance of one policy, no login.
 *
 * Deliberately NOT the employee's <PolicyView> signing control: that one starts
 * a DigiLocker-verified signature and archives a signed PDF, neither of which an
 * account-less candidate can do. This states plainly what is being recorded —
 * their name, the policy, the moment — so nobody signs believing they did
 * something stronger than they did.
 *
 * ALREADY SIGNED IS NOT LOCKED. The box keeps showing what they signed as and
 * when, with the field pre-filled, because the promise made at the top of this
 * flow is that a candidate may come back and correct what they sent. Signing
 * again updates the one row (lib/hr/candidate/policy-signing.ts).
 */
export function CandidatePolicySignBox({
  policyKey,
  title,
  signedAt,
  signedName,
  outdated,
}: {
  policyKey: string;
  title: string;
  signedAt: string | null;
  signedName: string | null;
  outdated: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(signedName ?? "");
  const [busy, setBusy] = React.useState(false);
  const signed = !!signedAt && !outdated;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await signPolicyAsCandidate({ key: policyKey, signedName: name });
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `You've signed the ${title}.`, type: "success" });
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-2xl border border-hairline-strong bg-white p-5"
      aria-label={`Sign the ${title}`}
    >
      {signed ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-800">
          <Check size={16} />
          Signed as {signedName} on {formatDateHr(signedAt)}. You can change this below.
        </p>
      ) : outdated ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-900">
          You signed an earlier version of this policy. Please read it again and sign.
        </p>
      ) : null}

      <label htmlFor={`sign-${policyKey}`} className="block text-[13px] font-bold text-ink-strong">
        Type your full name to sign
      </label>
      <p className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">
        By typing your name you confirm you have read the {title} and agree to it. We record your
        name, the policy version and the date and time.
      </p>

      <div className="mt-3 flex gap-2 max-sm:flex-col">
        <input
          id={`sign-${policyKey}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          autoComplete="name"
          className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-5 py-2 text-[13.5px] font-bold text-white disabled:opacity-60"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
          {signed ? "Update signature" : "Sign"}
        </button>
      </div>
    </form>
  );
}
