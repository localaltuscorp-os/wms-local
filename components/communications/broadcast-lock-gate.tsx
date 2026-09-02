"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldAlert, Check, Loader2, Lock } from "lucide-react";
import { acknowledgeBroadcast } from "@/app/(app)/hr/communications/actions";
import type { BroadcastPriority, BroadcastCategory, BroadcastAuthorIdentity } from "@/db/enums";

/**
 * ECOS "Compliance Lock Mode" — the mandatory-broadcast APP-LOCK gate.
 *
 * When an employee has an unacknowledged Critical/Emergency broadcast published
 * with `requireLock=true`, `app/(app)/layout.tsx` renders THIS full-screen
 * takeover INSTEAD of the app. There is NO nav and NO way around it — the only
 * exit is the "I Acknowledge" button, which calls `acknowledgeBroadcast(id)` and
 * then `router.refresh()`. The refresh re-runs the layout gate chain →
 * `pendingLockBroadcastForEmployee` no longer returns this broadcast → the gate
 * clears and the normal app returns.
 *
 * The whole enforcement path is FAIL-OPEN (see the layout): this component only
 * ever mounts when the server already confirmed a genuine pending lock.
 */

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

type Priority = BroadcastPriority;

export interface BroadcastLockGateProps {
  broadcast: {
    id: string;
    title: string;
    bodyHtml: string;
    priority: Priority;
    category: BroadcastCategory;
    senderName: string | null;
    authorIdentity: BroadcastAuthorIdentity;
  };
}

/** Human sender label — mirrors the server's `senderLabelFor` (actions.ts). */
function senderLabel(senderName: string | null, identity: BroadcastAuthorIdentity): string {
  if (senderName && senderName.trim()) return senderName.trim();
  switch (identity) {
    case "ceo":
      return "The CEO";
    case "founder":
      return "The Founder";
    default:
      return "Altus HR";
  }
}

/** Priority chip copy — Emergency reads hardest, Critical next. */
function priorityLabel(priority: Priority): string {
  if (priority === "emergency") return "Emergency";
  if (priority === "critical") return "Critical";
  // Lock is reserved for critical/emergency, but never mislabel if that widens.
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function BroadcastLockGate({ broadcast }: BroadcastLockGateProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const ackBtnRef = React.useRef<HTMLButtonElement>(null);

  // Pull keyboard focus onto the acknowledge button so the takeover is operable
  // by keyboard alone (there is nothing else to tab to).
  React.useEffect(() => {
    ackBtnRef.current?.focus();
  }, []);

  const isEmergency = broadcast.priority === "emergency";
  const sender = senderLabel(broadcast.senderName, broadcast.authorIdentity);

  function acknowledge() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await acknowledgeBroadcast(broadcast.id);
        if (res.ok) {
          // Re-run the layout → gate clears → the normal app returns.
          router.refresh();
        } else {
          setError(res.error ?? "Could not acknowledge. Please try again.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not acknowledge. Please try again.");
      }
    });
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ecos-lock-title"
      className="fixed inset-0 z-[85] overflow-y-auto"
      style={{
        background:
          "radial-gradient(130% 90% at 50% -10%, color-mix(in srgb, var(--color-altus-red) 22%, #1A0B0B), #150707)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div className="mx-auto flex min-h-full max-w-[680px] flex-col justify-center px-5 py-10 max-md:py-7">
        {/* ── Lock badge ── */}
        <div className="wg-rise mb-5 flex items-center gap-3">
          <span
            className="inline-grid size-12 place-items-center rounded-2xl text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Lock size={22} strokeWidth={2.4} />
          </span>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/70">
              Compliance Lock
            </div>
            <div className="text-[14px] font-semibold text-white/90">
              Action required to continue
            </div>
          </div>
        </div>

        {/* ── The message card ── */}
        <section
          className="wg-rise rounded-[24px] bg-surface-card p-7 max-md:p-5"
          style={{
            animationDelay: "60ms",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), 0 30px 80px -30px rgba(0,0,0,0.6)",
          }}
        >
          {/* Priority banner */}
          <div
            className="mb-5 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            {isEmergency ? (
              <ShieldAlert size={20} strokeWidth={2.4} />
            ) : (
              <AlertTriangle size={20} strokeWidth={2.4} />
            )}
            <span className="text-[13px] font-black uppercase tracking-[0.14em]">
              {priorityLabel(broadcast.priority)}
            </span>
            <span className="ml-auto text-[12px] font-bold uppercase tracking-[0.1em] text-white/80">
              {broadcast.category}
            </span>
          </div>

          {/* Sender + title */}
          <div className="mb-1 text-[13px] font-bold text-ink-subtle">From {sender}</div>
          <h1
            id="ecos-lock-title"
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui",
              fontWeight: 900,
              fontSize: "clamp(22px,3.4vw,30px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {broadcast.title}
          </h1>

          {/* Body — authored by HR-staff (trusted, HR-gated composer). */}
          <div
            className="ecos-lock-body mt-4 max-h-[46vh] overflow-y-auto pr-1 text-[15px] leading-relaxed text-ink-muted"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: broadcast.bodyHtml }}
          />

          {/* Acknowledge */}
          <div className="mt-6">
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-[color:var(--color-altus-red-deep)]"
                style={{
                  background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                  boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 28%, transparent)",
                }}
              >
                {error}
              </p>
            )}
            <button
              ref={ackBtnRef}
              type="button"
              onClick={acknowledge}
              disabled={pending}
              className="brand-btn wg-btn flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-[16px] font-black text-white transition disabled:cursor-not-allowed disabled:opacity-70"
              style={{
                background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
                boxShadow: `0 16px 34px -16px ${RED_DEEP}`,
              }}
            >
              {pending ? (
                <>
                  <Loader2 size={19} className="animate-spin" /> Acknowledging…
                </>
              ) : (
                <>
                  <Check size={19} strokeWidth={2.8} /> I Acknowledge
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[12.5px] font-medium text-ink-subtle">
              You must acknowledge this message before you can use the app.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
