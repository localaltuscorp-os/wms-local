"use client";

import * as React from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { getBackgroundCheckStatus, setBackgroundCheckStatus } from "@/app/(app)/hr/record/background-check";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

/**
 * EMPLOYEE BACKGROUND CHECK — Yes/No, confirmed before either commits.
 *
 * "No" stays changeable (the buttons remain, re-clickable). "Yes" is a ONE-WAY
 * DOOR: once confirmed, the card locks to a static "Background Check Done" line
 * with no buttons — the server refuses to change it back from here (see
 * setBackgroundCheckStatus), so this UI never even offers to.
 *
 * Self-fetching on `employeeId` change rather than threaded through the parent
 * screen's already large selectCandidate — this card owns its own load/save.
 */
export function BackgroundCheckCard({ employeeId }: { employeeId: string | null }) {
  const [status, setStatus] = React.useState<"yes" | "no" | null>(null);
  const [available, setAvailable] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState<"yes" | "no" | null>(null);
  const idRef = React.useRef(employeeId);
  idRef.current = employeeId;

  React.useEffect(() => {
    setStatus(null);
    setConfirming(null);
    if (!employeeId) return;
    setLoading(true);
    void getBackgroundCheckStatus(employeeId)
      .then((res) => {
        if (idRef.current !== employeeId) return;
        if (res.ok) {
          setStatus(res.result.status);
          setAvailable(res.result.available);
        } else {
          setAvailable(true);
        }
      })
      .finally(() => {
        if (idRef.current === employeeId) setLoading(false);
      });
  }, [employeeId]);

  async function confirm(next: "yes" | "no") {
    const id = idRef.current;
    if (!id || saving) return;
    setSaving(true);
    try {
      const res = await setBackgroundCheckStatus(id, next);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      if (idRef.current === id) setStatus(res.result.status);
      setConfirming(null);
    } finally {
      setSaving(false);
    }
  }

  if (!employeeId || !available) return null;

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-4">
      <div className="mb-1 flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          <ShieldCheck size={15} />
        </span>
        <h3
          className="text-[14.5px] font-black text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}
        >
          Employee Background Check
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-[13px] font-medium text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : status === "yes" ? (
        <p className="mt-2 flex items-center gap-2 text-[13.5px] font-bold" style={{ color: "#15803D" }}>
          <Check size={16} strokeWidth={3} /> Background Check Done
        </p>
      ) : confirming ? (
        <div className="mt-2 rounded-lg border border-hairline-strong bg-white p-3">
          <p className="text-[13px] font-semibold text-ink-strong">
            Mark this person&apos;s background check as{" "}
            <strong>{confirming === "yes" ? "done" : "not done"}</strong>?
            {confirming === "yes" && (
              <span className="block font-normal text-ink-muted">This can&apos;t be undone once confirmed.</span>
            )}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void confirm(confirming)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />} Confirm
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirming(null)}
              className="rounded-lg border border-hairline-strong px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming("yes")}
            className="inline-flex items-center gap-1.5 rounded-pill border-2 border-hairline-strong px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red"
          >
            <Check size={13} strokeWidth={3} /> Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirming("no")}
            className="inline-flex items-center gap-1.5 rounded-pill border-2 px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
            style={
              status === "no"
                ? { borderColor: RED, background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }
                : { borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-strong)" }
            }
          >
            <X size={13} strokeWidth={3} /> No
          </button>
          {status === "no" && (
            <span className="text-[12px] font-medium text-ink-subtle">Not done yet — can be changed.</span>
          )}
        </div>
      )}
    </div>
  );
}
