"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { LayoutGrid, GitBranch, Wallet, Clock, FileText, Sparkles, Archive } from "lucide-react";
import type { AmbassadorDetail } from "@/lib/queries/ambassadors";
import { archiveAmbassador } from "@/app/(app)/ambassadors/actions";
import { fireToast } from "@/lib/toast";
import { TabOverview } from "./tab-overview";
import { TabReferrals } from "./tab-referrals";
import { TabCommissions } from "./tab-commissions";
import { TabTimeline } from "./tab-timeline";
import { TabDocuments } from "./tab-documents";
import { TabAi } from "./tab-ai";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "referrals", label: "Referrals", icon: GitBranch },
  { id: "commissions", label: "Commissions", icon: Wallet },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "ai", label: "AI", icon: Sparkles },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function WorkspaceTabs({ detail }: { detail: AmbassadorDetail }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = (searchParams.get("tab") as TabId) ?? "overview";
  const [active, setActive] = useState<TabId>(TABS.some((t) => t.id === initial) ? initial : "overview");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = useCallback(
    (id: TabId) => {
      setActive(id);
      const sp = new URLSearchParams(Array.from(searchParams.entries()));
      sp.set("tab", id);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(TABS[idx]!.id);
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      const t = TABS[next]!;
      select(t.id);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div className="mt-7">
      {/* tab strip */}
      <div
        role="tablist"
        aria-label="Ambassador sections"
        className="flex flex-wrap gap-1 border-b border-hairline"
      >
        {TABS.map((t, i) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[i] = el; }}
              role="tab"
              id={`amb-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`amb-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="relative inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-[14px] font-bold transition-colors outline-none focus-visible:bg-surface-soft"
              style={{ color: on ? "var(--color-altus-red-deep)" : "var(--color-ink-muted)" }}
            >
              <t.icon size={16} strokeWidth={2.6} />
              {t.label}
              {on && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-[3px] rounded-full"
                  style={{ background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* panels */}
      <div className="pt-6">
        <div role="tabpanel" id="amb-panel-overview" aria-labelledby="amb-tab-overview" hidden={active !== "overview"}>
          {active === "overview" && <TabOverview detail={detail} onOpenTimeline={() => select("timeline")} />}
        </div>
        <div role="tabpanel" id="amb-panel-referrals" aria-labelledby="amb-tab-referrals" hidden={active !== "referrals"}>
          {active === "referrals" && <TabReferrals referrals={detail.referrals} />}
        </div>
        <div role="tabpanel" id="amb-panel-commissions" aria-labelledby="amb-tab-commissions" hidden={active !== "commissions"}>
          {active === "commissions" && <TabCommissions referrals={detail.referrals} payouts={detail.payouts} />}
        </div>
        <div role="tabpanel" id="amb-panel-timeline" aria-labelledby="amb-tab-timeline" hidden={active !== "timeline"}>
          {active === "timeline" && <TabTimeline ambassadorId={detail.ambassador.id} activities={detail.activities} />}
        </div>
        <div role="tabpanel" id="amb-panel-documents" aria-labelledby="amb-tab-documents" hidden={active !== "documents"}>
          {active === "documents" && <TabDocuments detail={detail} />}
        </div>
        <div role="tabpanel" id="amb-panel-ai" aria-labelledby="amb-tab-ai" hidden={active !== "ai"}>
          {active === "ai" && <TabAi detail={detail} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Hero archive button — confirm + archiveAmbassador + redirect to the directory.
 * Lives here so the server page can import a single client island.
 */
export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    const next = !archived;
    if (next && !window.confirm("Archive this ambassador? They'll be hidden from the directory.")) return;
    startTransition(async () => {
      const res = await archiveAmbassador(id, next);
      if (res.ok) {
        fireToast({ message: next ? "Ambassador archived." : "Ambassador restored." });
        if (next) router.push("/ambassadors/directory" as Route);
        else router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)] disabled:opacity-60"
    >
      <Archive size={17} strokeWidth={2.6} />
      {archived ? "Restore" : "Archive"}
    </button>
  );
}
