"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { X, Check, Megaphone, Loader2, ArrowUpRight } from "lucide-react";
import {
  markBroadcastRead,
  acknowledgeBroadcast,
  snoozeBroadcast,
} from "@/app/(app)/hr/communications/actions";
import { browserSessionId } from "@/lib/ecos/browser-session";
import {
  BROADCAST_CATEGORY_LABELS,
  BROADCAST_PRIORITY_LABELS,
  BROADCAST_PRIORITY_TONE,
} from "@/lib/ecos/labels";
import type { BroadcastCategory, BroadcastPriority } from "@/db/enums";

/**
 * THE BROADCAST POPUP — a broadcast lands in the middle of the screen, in the
 * app, within about five seconds of being sent.
 *
 * Mounted once in app/(app)/layout.tsx, so it rides along on every authed page
 * and draws nothing until there is something to show. A short poll of
 * /api/broadcasts/popup is what turns "published" into "on screen now" without
 * the recipient having to navigate, refresh, or open their inbox.
 *
 * THE TWO WAYS OUT ARE NOT THE SAME, and that difference is the feature:
 *
 *   "Read"  → the receipt becomes read (or acknowledged, when the sender
 *             required it). The message is done: it never pops again and the
 *             sender's dashboard counts them as having seen it.
 *
 *   "X"     → SNOOZED. The receipt stays unread — it is still unread in the
 *             sender's analytics and still sitting in the inbox — and the popup
 *             returns at this person's NEXT LOGIN. Deliberately not a "read"
 *             and deliberately not gone: closing a window is not the same as
 *             having read what was in it.
 *
 * Esc snoozes too (it is the keyboard's X). There is no click-outside-to-close:
 * a stray click on the page behind should not silence a company announcement.
 *
 * NOT the app-lock gate. That is a different, harder thing — a full-screen
 * takeover with no X at all, for Critical/Emergency messages HR marks as
 * lock-mode (components/communications/broadcast-lock-gate.tsx). This popup
 * skips those entirely so the two can never fight over the same screen.
 */

/**
 * 4s, not 5. The brief is "within 5 seconds of Send", and the worst case for a
 * poller is a full interval plus the round trip — at 5000 that lands *on* the
 * boundary and measured 5.08s in an end-to-end run. 4000 leaves a second of
 * headroom for the request, so the promise holds rather than nearly holds.
 */
const POLL_MS = 4000;

interface PopupMedia {
  url: string;
  name: string;
  kind: "image" | "video";
}

interface PopupBroadcast {
  id: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  from: string;
  publishedAt: string | null;
  requireAck: boolean;
  media: PopupMedia[];
}

export function BroadcastPopup() {
  const router = useRouter();
  const pathname = usePathname();
  const [broadcast, setBroadcast] = React.useState<PopupBroadcast | null>(null);
  const [busy, setBusy] = React.useState<null | "read" | "snooze">(null);

  /*
   * THREE REFS, ALL WRITTEN FROM EFFECTS. The poll below is set up once and
   * must not be torn down and rebuilt every time the route or the shown
   * broadcast changes — a 5-second interval that restarts on every navigation
   * would re-fire on mount each time and hammer the endpoint. So the values it
   * needs to read are mirrored into refs by their own effects, and the poll
   * effect itself keeps an empty dependency list.
   */

  // Never pop a broadcast on top of the page that IS that broadcast. Opening it
  // marks it read a moment later, so the modal would flash over the message the
  // reader just navigated to and then vanish on its own — which reads as a bug.
  const pathRef = React.useRef(pathname);
  React.useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  // Whether one is already on screen — the poll skips while it is.
  const showing = React.useRef<string | null>(null);
  React.useEffect(() => {
    showing.current = broadcast?.id ?? null;
  }, [broadcast]);

  // Ids resolved in THIS tab. The server is the source of truth, but a poll can
  // already be in flight when the user presses Read, and without this the same
  // broadcast flashes back for one cycle. Cheap belt-and-braces.
  const handled = React.useRef<Set<string>>(new Set());

  // The snooze key. Minted in the poll effect rather than during render: it
  // reads sessionStorage, which does not exist on the server.
  const sessionRef = React.useRef<string>("");

  /* ── The poll ──────────────────────────────────────────────────── */
  React.useEffect(() => {
    let cancelled = false;
    sessionRef.current = browserSessionId();

    async function check() {
      // Nothing to do while one is already up, or while a click is in flight.
      if (cancelled || showing.current) return;
      try {
        const qs = sessionRef.current ? `?s=${encodeURIComponent(sessionRef.current)}` : "";
        const res = await fetch(`/api/broadcasts/popup${qs}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { broadcast: PopupBroadcast | null };
        const next = data.broadcast;
        if (!next || cancelled || handled.current.has(next.id)) return;
        if (pathRef.current === `/communications/${next.id}`) return;
        setBroadcast(next);
      } catch {
        // Offline, or the tab is being torn down. Try again next tick.
      }
    }

    void check();
    const t = setInterval(() => void check(), POLL_MS);

    // Coming back to the tab is the other moment a broadcast may be waiting —
    // browsers throttle timers in background tabs, so the interval alone can be
    // minutes stale by the time someone looks at the screen again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /* ── Close paths ───────────────────────────────────────────────── */
  const close = React.useCallback(() => {
    setBroadcast(null);
    setBusy(null);
  }, []);

  const onRead = React.useCallback(async () => {
    if (!broadcast || busy) return;
    setBusy("read");
    handled.current.add(broadcast.id);
    try {
      // An acknowledge-required broadcast needs the stronger receipt — pressing
      // the button IS the acknowledgement, so it must not settle for "read".
      if (broadcast.requireAck) await acknowledgeBroadcast(broadcast.id);
      else await markBroadcastRead(broadcast.id);
      router.refresh(); // repaint the bell + any inbox on screen
    } catch {
      /* the receipt is best-effort; never trap the user behind a failed write */
    } finally {
      close();
    }
  }, [broadcast, busy, close, router]);

  const onSnooze = React.useCallback(async () => {
    if (!broadcast || busy) return;
    setBusy("snooze");
    handled.current.add(broadcast.id);
    try {
      if (sessionRef.current) await snoozeBroadcast(broadcast.id, sessionRef.current);
    } catch {
      /* if the snooze doesn't stick, it simply pops again — acceptable */
    } finally {
      close();
    }
  }, [broadcast, busy, close]);

  // Esc = the X. Focus is pulled to the Read button so the whole thing is
  // operable from the keyboard.
  const readRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!broadcast) return;
    readRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void onSnooze();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [broadcast, onSnooze]);

  if (!broadcast) return null;

  const tone = BROADCAST_PRIORITY_TONE[broadcast.priority];
  const loud = broadcast.priority === "critical" || broadcast.priority === "emergency";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bc-popup-title"
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto p-5 max-md:p-3"
      style={{ background: "rgba(15,17,21,0.55)", backdropFilter: "blur(3px)" }}
    >
      <section
        className="bc-popup-in relative w-full max-w-[620px] overflow-hidden rounded-[22px] bg-surface-card"
        style={{
          boxShadow: "inset 0 0 0 1px var(--color-hairline, #e2e8f0), 0 40px 90px -32px rgba(0,0,0,0.55)",
        }}
      >
        {/* Priority band */}
        <div
          className="flex items-center gap-2 px-5 py-3 pr-14"
          style={
            loud
              ? { background: "linear-gradient(135deg, #E10600, #A80400)" }
              : { background: tone.bg, boxShadow: `inset 0 -1px 0 ${tone.border}` }
          }
        >
          <Megaphone size={15} strokeWidth={2.6} style={{ color: loud ? "#fff" : tone.fg }} />
          <span
            className="text-[11px] font-black uppercase tracking-[0.14em]"
            style={{ color: loud ? "#fff" : tone.fg }}
          >
            {BROADCAST_PRIORITY_LABELS[broadcast.priority]}
          </span>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: loud ? "rgba(255,255,255,0.85)" : tone.fg }}
          >
            · {BROADCAST_CATEGORY_LABELS[broadcast.category]}
          </span>
        </div>

        {/* The X — snooze. Labelled so nobody has to guess what it does. */}
        <button
          type="button"
          onClick={() => void onSnooze()}
          disabled={busy !== null}
          aria-label="Remind me at my next login"
          title="Remind me at my next login"
          className="absolute right-3 top-2.5 inline-grid size-9 place-items-center rounded-full transition hover:bg-black/10 disabled:opacity-50"
          style={{ color: loud ? "#fff" : "var(--color-ink-soft, #64748b)" }}
        >
          {busy === "snooze" ? <Loader2 size={17} className="animate-spin" /> : <X size={18} strokeWidth={2.6} />}
        </button>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 max-md:px-4">
          <div className="text-[12.5px] font-bold text-ink-subtle">From {broadcast.from}</div>
          <h2
            id="bc-popup-title"
            className="mt-0.5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(20px,3vw,27px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
            }}
          >
            {broadcast.title}
          </h2>

          {/* Image / video sent with the message — shown, not linked. */}
          {broadcast.media.length > 0 && (
            <div className="mt-4 grid gap-2.5">
              {broadcast.media.map((m) =>
                m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.url}
                    src={m.url}
                    alt={m.name}
                    className="w-full rounded-xl object-contain"
                    style={{ maxHeight: "42vh", background: "#0b0b0d" }}
                  />
                ) : (
                  <video
                    key={m.url}
                    src={m.url}
                    controls
                    playsInline
                    className="w-full rounded-xl"
                    style={{ maxHeight: "42vh", background: "#0b0b0d" }}
                  />
                ),
              )}
            </div>
          )}

          <div
            className="ecos-body mt-4 text-[14.5px] leading-relaxed text-ink-strong"
            // Sanitised on save (sanitizeRichHtml in saveBroadcastDraft).
            dangerouslySetInnerHTML={{ __html: broadcast.bodyHtml || escapeText(broadcast.bodyText) }}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-6 py-4 max-md:px-4">
          <button
            ref={readRef}
            type="button"
            onClick={() => void onRead()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-black text-white transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #E10600, #A80400)",
              boxShadow: "0 14px 28px -14px rgba(168,4,0,0.6)",
            }}
          >
            {busy === "read" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} strokeWidth={3} />
            )}
            {broadcast.requireAck ? "Read & acknowledge" : "Read"}
          </button>

          <Link
            href={`/communications/${broadcast.id}` as Route}
            onClick={() => void onSnooze()}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-muted underline-offset-2 hover:underline"
          >
            Open in full <ArrowUpRight size={14} strokeWidth={2.6} />
          </Link>

          <span className="ml-auto text-[12px] font-medium text-ink-subtle max-md:ml-0">
            Close (✕) to be reminded at your next login
          </span>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: POPUP_CSS }} />
    </div>
  );
}

/** Plain-text fallback for a broadcast saved without rich HTML. */
function escapeText(s: string): string {
  return `<p>${s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")}</p>`;
}

// The "flash": a short scale-and-lift on entry so a message that appears while
// someone is mid-task reads as an ARRIVAL rather than as a page that changed
// under them. Honours prefers-reduced-motion. Body typography mirrors the read
// view's .ecos-body so the same message looks the same in both places.
const POPUP_CSS = `
  @keyframes bcPopIn { from { opacity: 0; transform: translateY(10px) scale(0.975); } to { opacity: 1; transform: none; } }
  .bc-popup-in { animation: bcPopIn 220ms cubic-bezier(0.16,0.84,0.44,1) both; }
  @media (prefers-reduced-motion: reduce) { .bc-popup-in { animation: none; } }
  .ecos-body h1, .ecos-body h2, .ecos-body h3 { font-family: var(--font-display), system-ui, sans-serif; font-weight: 800; letter-spacing: -0.01em; color: #18181b; margin: 1em 0 0.35em; line-height: 1.2; }
  .ecos-body h1 { font-size: 1.4em; } .ecos-body h2 { font-size: 1.22em; } .ecos-body h3 { font-size: 1.08em; }
  .ecos-body p { margin: 0.6em 0; }
  .ecos-body ul, .ecos-body ol { margin: 0.6em 0; padding-left: 1.4em; }
  .ecos-body ul { list-style: disc; } .ecos-body ol { list-style: decimal; }
  .ecos-body li { margin: 0.22em 0; }
  .ecos-body a { color: #A80400; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .ecos-body strong, .ecos-body b { font-weight: 700; color: #18181b; }
  .ecos-body img { max-width: 100%; height: auto; border-radius: 10px; }
  .ecos-body blockquote { margin: 0.75em 0; padding: 0.35em 0 0.35em 1em; border-left: 3px solid color-mix(in srgb, #E10600 45%, white); color: #475569; }
  .ecos-body table { width: 100%; border-collapse: collapse; margin: 0.75em 0; }
  .ecos-body td, .ecos-body th { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
`;
