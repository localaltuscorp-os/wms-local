"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { X, UserPlus, ArrowRight, History, Loader2 } from "lucide-react";
import { listCandidateDrafts, type CandidateDraft } from "@/app/(app)/hr/candidate-actions";
import { formatDate } from "@/lib/format";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * The New/Continue chooser as a quick POP-UP (opened from the Pre-Interview menu
 * instead of navigating to a full page). Fetches in-progress drafts on open;
 * "Start new" / "Resume" navigate to the wizard. Uses the global hrOverlayIn /
 * hrPopIn keyframes defined by the HR landing.
 */
export function IntakeChooserPopup({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<CandidateDraft[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    listCandidateDrafts()
      .then((d) => { if (alive) setDrafts(d); })
      .catch(() => { if (alive) setDrafts([]); });
    return () => { alive = false; };
  }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clear any stale draft backup pointer so "Start new" always opens a blank form.
  function startNew() {
    try { window.localStorage.removeItem("altus:intake:draft"); } catch { /* non-fatal */ }
    router.push("/hr/intake?new=1" as Route);
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)", animation: "hrOverlayIn 0.18s ease-out both" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[22px] bg-white"
        style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)", border: "1px solid color-mix(in srgb, #E10600 22%, white)", animation: "hrPopIn 0.24s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        {/* header */}
        <div className="relative px-6 pt-6 pb-4" style={{ background: "linear-gradient(180deg, color-mix(in srgb, #E10600 7%, white), #ffffff)" }}>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink-strong">
            <X size={18} strokeWidth={2.4} />
          </button>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
            Pre-Interview · Candidate Interview Form
          </span>
          <h2 className="mt-2.5 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            New candidate, or continue?
          </h2>
          <p className="mt-1 max-w-[46ch] text-[13.5px] font-medium leading-snug text-ink-muted">
            Start a fresh form, or pick up one you left mid-way. Everything autosaves as you go.
          </p>
        </div>

        <div className="p-4 pt-2">
          <button
            type="button"
            onClick={startNew}
            className="group flex w-full items-center gap-3.5 rounded-2xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ borderColor: `color-mix(in srgb, ${RED} 45%, white)`, background: `color-mix(in srgb, ${RED} 4%, white)` }}
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg,${RED},${RED_DEEP})` }}>
              <UserPlus size={22} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold text-ink-strong">Start a New Candidate</span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">Open a blank Candidate Interview Form.</span>
            </span>
            <ArrowRight size={19} className="shrink-0 transition-transform group-hover:translate-x-1" style={{ color: RED_DEEP }} />
          </button>

          {drafts === null ? (
            <p className="mt-5 flex items-center justify-center gap-2 py-3 text-[13px] text-ink-subtle">
              <Loader2 size={14} className="animate-spin" /> Checking for unfinished forms…
            </p>
          ) : drafts.length > 0 ? (
            <section className="mt-5">
              <h3 className="mb-2.5 flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                <History size={13} /> Continue an unfinished form
              </h3>
              <div className="max-h-[240px] space-y-2 overflow-y-auto">
                {drafts.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => router.push(`/hr/intake?draft=${d.id}` as Route)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-hairline bg-white p-3 text-left transition-all hover:border-hairline-strong hover:shadow-sm"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[12px] font-black text-white" style={{ background: `linear-gradient(135deg,${RED},${RED_DEEP})` }}>
                      {d.pct}%
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-ink-strong">{d.name}</span>
                      <span className="mt-0.5 block text-[12px] font-medium text-ink-muted">
                        {d.pct}% complete · last edited {formatDate(d.updatedAt)}, {new Date(d.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: "#18181b" }}>
                      Resume <ArrowRight size={13} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-4 text-center text-[12.5px] text-ink-subtle">No unfinished forms — start a new candidate above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
