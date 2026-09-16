"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Plus, ArrowRight, UserPlus, History, Send } from "lucide-react";
import type { CandidateDraft } from "@/app/(app)/hr/candidate-actions";
import { InviteCandidateDialog } from "@/components/hr/candidate/invite-candidate-dialog";
import { formatDateHr } from "@/lib/format";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * The New / Continue chooser shown when opening the Candidate Interview Form.
 * Start fresh, or resume any in-progress draft (which autosaves to the DB).
 */
export function IntakeChooser({ drafts }: { drafts: CandidateDraft[] }) {
  const router = useRouter();

  // Clear any stale draft backup pointer so "Start new" always opens a blank form.
  function startNew() {
    try { window.localStorage.removeItem("altus:intake:draft"); } catch { /* non-fatal */ }
    router.push("/hr/intake?new=1" as Route);
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      {/* The eyebrow/heading/subtitle that used to open this page now lives in
          the frozen HrTitleBar (see page.tsx) instead of scrolling with the
          rest of the chooser. */}
      {/* SHARE THE FORM, ABOVE "start a new candidate", and built as the same
          card on purpose: handing an outsider their own link is now the
          ordinary way this form gets filled, and HR typing it on their behalf
          is the exception. Two equal-weight choices should look equal. */}
      <InviteCandidateDialog
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className="group mb-3 flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ borderColor: `color-mix(in srgb, ${RED} 45%, white)`, background: `color-mix(in srgb, ${RED} 4%, white)` }}
          >
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg,${RED},${RED_DEEP})` }}>
              <Send size={26} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-bold text-ink-strong">Share Interview Form Link</span>
              <span className="mt-0.5 block text-[14px] text-ink-muted">
                Enter a candidate&apos;s basic info to share the interview form link with them
              </span>
            </span>
            <ArrowRight size={20} className="shrink-0 transition-transform group-hover:translate-x-1" style={{ color: RED_DEEP }} />
          </button>
        )}
      />

      <button
        type="button"
        onClick={startNew}
        className="group flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
        style={{ borderColor: `color-mix(in srgb, ${RED} 45%, white)`, background: `color-mix(in srgb, ${RED} 4%, white)` }}
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg,${RED},${RED_DEEP})` }}>
          <UserPlus size={26} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-bold text-ink-strong">Start a New Candidate</span>
          <span className="mt-0.5 block text-[14px] text-ink-muted">Open a blank Candidate Interview Form.</span>
        </span>
        <ArrowRight size={20} className="shrink-0 transition-transform group-hover:translate-x-1" style={{ color: RED_DEEP }} />
      </button>

      {drafts.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-soft">
            <History size={14} /> Continue an unfinished form
          </h3>
          <div className="space-y-2.5">
            {drafts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => router.push(`/hr/intake?draft=${d.id}` as Route)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-hairline bg-white p-4 text-left transition-all hover:border-hairline-strong hover:shadow-md"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-black text-white" style={{ background: `linear-gradient(135deg,${RED},${RED_DEEP})` }}>
                  {d.pct}%
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-bold text-ink-strong">{d.name}</span>
                  <span className="mt-0.5 block text-[12.5px] font-medium text-ink-muted">
                    {d.pct}% complete · last edited {formatDateHr(d.updatedAt)}, {new Date(d.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold text-white" style={{ background: "#18181b" }}>
                  Resume <ArrowRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {drafts.length === 0 && (
        <p className="mt-6 flex items-center justify-center gap-2 text-[13px] text-ink-subtle">
          <Plus size={13} /> No unfinished forms - start a new candidate above.
        </p>
      )}
    </div>
  );
}
