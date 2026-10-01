"use client";

import * as React from "react";
import { Plus, Search, X } from "lucide-react";
import { CE_CATEGORIES } from "@/lib/client-engagement/constants";
import type { Load, MemberCapacity } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { CapacityBar } from "./capacity-bar";
import { AccountsBoard } from "./accounts-board";
import { FIELD } from "./tokens";

// A genuinely SOLID red button, white text — not `BTN_PRIMARY` (the app's
// `.pastel-cta`, a light-red hollow look). Asked for by name, 2026-09-28:
// "make it red like other filled red buttons with white text (not light red
// and hollow)".
const SOLID_RED_BTN =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 text-[13px] font-bold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The Overview page's top half: the KPI bar and the accounts board, wired
 * together so a KPI card click filters the board to that person and scrolls
 * down to it (asked 2026-09-28 — the same "click a KPI, see it below" pattern
 * PcaGrid's matrix headers already use). Split out of page.tsx because that
 * wiring needs client state, and the page itself stays a server component.
 */
export function OverviewBoard({
  accounts,
  members,
  capacity,
  loads,
  callCounts,
  canManage,
  myMemberId,
  initialTab,
  unassigned,
  referencesSlot,
}: {
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  capacity: MemberCapacity[];
  loads: Record<string, Load>;
  callCounts: Record<string, number>;
  canManage: boolean;
  myMemberId: string | null;
  initialTab?: string;
  unassigned: number;
  referencesSlot: React.ReactNode;
}) {
  const [focusMember, setFocusMember] = React.useState<{ id: string; nonce: number } | null>(null);
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchJump, setSearchJump] = React.useState<{ category: string; nonce: number } | null>(null);
  const [addRequest, setAddRequest] = React.useState<{ nonce: number } | null>(null);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  function selectMember(id: string) {
    setFocusMember({ id, nonce: Date.now() });
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  React.useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  function jumpToMatch() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match = accounts.find((a) =>
      `${a.fullName} ${a.organization ?? ""} ${a.batchCode ?? ""} ${a.tags.join(" ")}`.toLowerCase().includes(q),
    );
    if (match && CE_CATEGORIES.some((c) => c.code === match.category)) {
      setSearchJump({ category: match.category, nonce: Date.now() });
    }
  }

  return (
    <>
      {/* The KPI bar and the search/add controls share one line (asked
          2026-09-28: "shift these KPIs up — same line as the search icon").
          The button here is deliberately ONE fixed "+ Add People" button,
          top right — not the old per-category "Add participant/client/
          ambassador" button that used to sit lower, inside the board's own
          toolbar (asked 2026-09-28: "one button 'Add People'"). It calls the
          same dialog AccountsBoard already opens for "Add participant" —
          only the button itself moved and got one fixed label. */}
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CapacityBar capacity={capacity} unassigned={unassigned} onSelectMember={selectMember} />
        </div>
        <div className="relative flex shrink-0 items-center gap-2 pt-1">
          {canManage ? (
            <button
              type="button"
              className={SOLID_RED_BTN}
              style={{ background: "var(--color-altus-red)" }}
              onClick={() => setAddRequest({ nonce: Date.now() })}
            >
              <Plus size={14} strokeWidth={2.8} /> Add People
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={searchOpen ? "Close search" : "Search"}
            aria-expanded={searchOpen}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-card text-ink-subtle transition-colors hover:border-hairline-strong hover:text-ink-strong"
          >
            {searchOpen ? <X size={15} strokeWidth={2.4} /> : <Search size={15} strokeWidth={2.4} />}
          </button>
          {searchOpen ? (
            <div
              className="absolute right-0 top-11 z-20 w-[280px] rounded-xl border border-hairline bg-surface-card p-2"
              style={{ boxShadow: "0 20px 50px -20px rgba(15,23,42,0.35)" }}
            >
              <div className="relative">
                <Search size={14} strokeWidth={2.4} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input
                  ref={searchInputRef}
                  className={`${FIELD} pl-8`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearchOpen(false);
                    if (e.key === "Enter") jumpToMatch();
                  }}
                  onBlur={() => setQuery("")}
                  placeholder="Search…"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div ref={boardRef}>
        <AccountsBoard
          accounts={accounts}
          members={members}
          capacity={capacity}
          loads={loads}
          callCounts={callCounts}
          canManage={canManage}
          myMemberId={myMemberId}
          initialTab={initialTab}
          referencesSlot={referencesSlot}
          focusMember={focusMember}
          query={query}
          searchJump={searchJump}
          addRequest={addRequest}
        />
      </div>
    </>
  );
}
