"use client";

import * as React from "react";
import { MonitorSmartphone, ArrowRight } from "lucide-react";

/**
 * Single-window lock — the WMS is usable in only ONE browser window/tab at a
 * time (like WhatsApp Web). Opening a second tab shows an "open in another
 * window · Use here" overlay instead of the app; clicking "Use here" takes over
 * and locks the previously-active tab.
 *
 * Mechanism (cross-tab, same origin): a heartbeat record in localStorage holds
 * the currently-active tabId + a timestamp. On mount a tab claims control only
 * if no other tab is actively heartbeating; otherwise it shows the overlay. A
 * `storage` event fires in every OTHER tab whenever the record changes, so a
 * take-over instantly locks the loser. Fail-safe: if localStorage is
 * unavailable (private mode) the guard no-ops and never locks anyone out.
 */
const KEY = "altus_wms_active_window";
const HEARTBEAT_MS = 3000;
const STALE_MS = 9000; // a tab is considered dead if its heartbeat is older than this

type Rec = { tabId: string; ts: number };

function readRec(): Rec | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Rec;
    return v && typeof v.tabId === "string" && typeof v.ts === "number" ? v : null;
  } catch {
    return null;
  }
}

export function SingleWindowGuard({ enabled = true }: { enabled?: boolean }) {
  const [locked, setLocked] = React.useState(false);
  const tabIdRef = React.useRef<string>("");
  const hbRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable tab id for THIS browser tab. It MUST survive a reload and a hard
  // `<a href>` navigation (e.g. "Back to Hub"), otherwise a reloaded same-window
  // gets a brand-new id, fails to recognise its OWN still-fresh heartbeat record
  // in localStorage, and wrongly locks itself out — the spurious-firing bug.
  //
  // sessionStorage is exactly the right scope: it persists across reloads and
  // same-tab navigations, but a genuinely NEW tab/window starts with an empty
  // sessionStorage → a fresh id → so a real second window still locks correctly.
  if (!tabIdRef.current) {
    const newId = () => {
      try {
        return typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
      } catch {
        return `t_${Date.now()}`;
      }
    };
    try {
      const SS_KEY = "altus_wms_tab_id";
      let id = sessionStorage.getItem(SS_KEY);
      if (!id) {
        id = newId();
        sessionStorage.setItem(SS_KEY, id);
      }
      tabIdRef.current = id;
    } catch {
      // sessionStorage unavailable (SSR / private mode) → fall back to a
      // per-mount id; the localStorage probe in the effect still fail-safes.
      tabIdRef.current = newId();
    }
  }

  React.useEffect(() => {
    if (!enabled) return; // only guards an authenticated session
    let supported = true;
    try {
      const probe = "__altus_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
    } catch {
      supported = false;
    }
    if (!supported) return; // private mode / no storage → never lock

    const tabId = tabIdRef.current;

    const beat = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ tabId, ts: Date.now() } satisfies Rec));
      } catch {
        /* ignore */
      }
    };
    const startHeartbeat = () => {
      if (hbRef.current) clearInterval(hbRef.current);
      beat();
      hbRef.current = setInterval(beat, HEARTBEAT_MS);
    };
    const stopHeartbeat = () => {
      if (hbRef.current) {
        clearInterval(hbRef.current);
        hbRef.current = null;
      }
    };
    const claim = () => {
      startHeartbeat();
      setLocked(false);
    };

    // Decide on mount: is another tab actively heartbeating right now?
    const cur = readRec();
    if (cur && cur.tabId !== tabId && Date.now() - cur.ts < STALE_MS) {
      setLocked(true); // another live window owns the session → show overlay
    } else {
      claim(); // no live owner (or the record is stale/ours) → take control
    }

    // React to other tabs writing the record.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      let v: Rec | null = null;
      try {
        v = JSON.parse(e.newValue) as Rec;
      } catch {
        return;
      }
      if (!v || v.tabId === tabId) return;
      // Someone else is (or just became) active. If WE were the owner, we lose.
      stopHeartbeat();
      setLocked(true);
    };
    window.addEventListener("storage", onStorage);

    // On close/refresh, release the record if we hold it, so the next load isn't
    // wrongly locked out by our own stale entry.
    const release = () => {
      const c = readRec();
      if (c && c.tabId === tabId) {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("beforeunload", release);

    return () => {
      stopHeartbeat();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", release);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Declared before the `enabled` / `locked` early returns — a hook after them
  // changes the hook order when the guard toggles, which throws
  // "rendered more hooks than during the previous render".
  const useHere = React.useCallback(() => {
    const tabId = tabIdRef.current;
    try {
      localStorage.setItem(KEY, JSON.stringify({ tabId, ts: Date.now() } satisfies Rec));
    } catch {
      /* ignore */
    }
    // resume heartbeat + unlock
    if (hbRef.current) clearInterval(hbRef.current);
    hbRef.current = setInterval(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ tabId, ts: Date.now() } satisfies Rec));
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_MS);
    setLocked(false);
  }, []);

  if (!enabled) return null;
  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Altus WMS is open in another window"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-[min(460px,calc(100vw-32px))] rounded-[22px] bg-surface-card p-7 max-md:p-6 text-center"
        style={{
          boxShadow:
            "0 30px 80px -30px rgba(15,23,42,0.6), inset 0 0 0 1px var(--color-hairline)",
        }}
      >
        <span
          aria-hidden
          className="mx-auto mb-4 inline-grid size-14 place-items-center rounded-2xl text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 12px 26px -12px rgba(225,6,0,0.55)",
          }}
        >
          <MonitorSmartphone size={26} strokeWidth={2.2} />
        </span>
        <h2
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 21,
            letterSpacing: "-0.02em",
          }}
        >
          Altus WMS is open in another window
        </h2>
        <p className="mt-2 text-[14.5px] font-medium text-ink-muted" style={{ lineHeight: 1.55 }}>
          For your security, the WMS runs in one window at a time. Click{" "}
          <strong className="text-ink-strong">Use here</strong> to switch control to this window —
          the other one will be locked.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => window.close()}
            title="Close this window (keeps the other one active)"
            className="rounded-xl px-4 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={useHere}
            autoFocus
            className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-[14.5px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 10px 24px -12px rgba(225,6,0,0.55)",
            }}
          >
            Use here <ArrowRight size={15} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>
  );
}
