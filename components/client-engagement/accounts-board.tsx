"use client";

import * as React from "react";
import { fireToast } from "@/lib/toast";
import { ceAssignAccount } from "@/app/(app)/operations/client-engagement/actions";
import { accountLabel, CE_CATEGORIES, type CeProductOption } from "@/lib/client-engagement/constants";
import type { Load, MemberCapacity } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { AccountDialog } from "./account-dialog";
import { TransferDialog } from "./transfer-dialog";
import { AccountsTable } from "./accounts-table";
import { Select } from "./ui";

/**
 * OVERVIEW — every account, by category, split Active | Inactive.
 *
 * Categories are the brief's numbered sections (1 Retainer … 5 Corporate; the
 * Reference Pipeline is its own tab). Inside each, the left pane is ACTIVE
 * accounts in one swimlane per person (Unassigned first, because that pool is
 * the thing to act on), and the right pane is INACTIVE / ON HOLD, also by
 * person, so a paused client still shows whose they are.
 */

type Tab = (typeof CE_CATEGORIES)[number]["code"];

export function AccountsBoard({
  accounts,
  members,
  capacity,
  loads,
  callCounts,
  canManage,
  myMemberId,
  initialTab,
  referencesSlot,
  focusMember,
  query,
  addRequest,
  productOptions,
}: {
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  capacity: MemberCapacity[];
  loads: Record<string, Load>;
  /** Scheduled calls per account (any week) — a transfer moves them. */
  callCounts: Record<string, number>;
  canManage: boolean;
  myMemberId: string | null;
  initialTab?: string;
  /** The Reference Pipeline, rendered by the page, shown as the sixth tab. */
  referencesSlot: React.ReactNode;
  /**
   * A member id (or "none" for Unassigned) pushed down from a KPI card click,
   * paired with a nonce so clicking the SAME card twice still re-applies the
   * filter. Undefined/null does nothing — the board's own filter dropdown
   * stays in charge otherwise.
   */
  focusMember?: { id: string; nonce: number } | null;
  /**
   * The search text, now owned by the page-level search bar above the KPIs
   * (asked 2026-09-28: "move this to the top... in the same bar as the nav
   * bar") rather than by this board's own toolbar.
   */
  query: string;
  /**
   * A top-right "+ Add People" click, paired with a nonce so the same button
   * clicked twice still re-opens the dialog. The button itself now lives in
   * OverviewBoard (one fixed button, top right — asked 2026-09-28: "keep the
   * button at the top right, one button 'Add People'", not a per-category
   * relabelled one down here), but the dialog it opens still needs THIS
   * component's own idea of which category tab is active.
   */
  addRequest?: { nonce: number } | null;
  productOptions: CeProductOption[];
}) {
  const [tab, setTab] = React.useState<Tab | "references">(
    initialTab === "references" || CE_CATEGORIES.some((c) => c.code === initialTab) ? (initialTab as Tab) : "ps",
  );
  const [batch, setBatch] = React.useState("");
  const [memberFilter, setMemberFilter] = React.useState("");
  const [editing, setEditing] = React.useState<CeAccountRow | "new" | null>(null);
  const [moving, setMoving] = React.useState<CeAccountRow | null>(null);

  // A KPI card click can arrive between renders, same as TimeField's own
  // outside-value sync in ./ui.tsx — adjusted during render (React's own
  // pattern for this, https://react.dev/learn/you-might-not-need-an-effect)
  // rather than in an effect, so there is no extra render pass.
  const [appliedNonce, setAppliedNonce] = React.useState(focusMember?.nonce);
  if (focusMember && focusMember.nonce !== appliedNonce) {
    setAppliedNonce(focusMember.nonce);
    setMemberFilter(focusMember.id);
  }

  // Same render-time-adjustment pattern for the top-right "+ Add People"
  // button's clicks, which arrive from OverviewBoard as a prop.
  const [appliedAddNonce, setAppliedAddNonce] = React.useState(addRequest?.nonce);
  if (addRequest && addRequest.nonce !== appliedAddNonce) {
    setAppliedAddNonce(addRequest.nonce);
    setEditing("new");
  }

  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name] as const)), [members]);
  const batches = React.useMemo(
    () => [...new Set(accounts.map((a) => a.batchCode).filter((b): b is string => Boolean(b)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [accounts],
  );

  const counts = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of accounts) out[a.category] = (out[a.category] ?? 0) + 1;
    return out;
  }, [accounts]);

  const category = tab === "references" ? null : CE_CATEGORIES.find((c) => c.code === tab)!;
  const cohortBatches = category?.batch ? [...new Set(accounts.filter((a) => a.category === category.code && a.batchCode).map((a) => a.batchCode!))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];

  const q = query.trim().toLowerCase();
  const inTab = category
    ? accounts.filter(
        (a) =>
          a.category === category.code &&
          (!batch || a.batchCode === batch) &&
          (!memberFilter || (memberFilter === "none" ? !a.assignedTo : a.assignedTo === memberFilter)) &&
          (!q || `${a.fullName} ${a.organization ?? ""} ${a.batchCode ?? ""} ${a.tags.join(" ")}`.toLowerCase().includes(q)),
      )
    : [];

  const canEdit = (a: CeAccountRow) => canManage || (myMemberId !== null && a.assignedTo === myMemberId);

  async function bulkTransfer(rows: CeAccountRow[], toMemberId: string) {
    const toName = members.find((m) => m.id === toMemberId)?.name ?? "someone";
    let ok = 0;
    let clashes = 0;
    for (const a of rows) {
      const res = await ceAssignAccount(a.id, toMemberId);
      if (res.ok) {
        ok += 1;
        clashes += res.clashes;
      }
    }
    const failed = rows.length - ok;
    fireToast({
      message: `${ok} of ${rows.length} moved to ${toName}${clashes ? ` — ${clashes} call${clashes === 1 ? "" : "s"} now overlap and need re-timing` : ""}${failed ? `, ${failed} failed` : ""}`,
      type: failed ? "info" : "success",
      duration: 8000,
    });
  }

  return (
    <>
      {/* Category tabs. */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
        {CE_CATEGORIES.map((c) => (
          <TabButton key={c.code} active={tab === c.code} onClick={() => { setTab(c.code); setBatch(""); }} label={c.section} count={counts[c.code] ?? 0} />
        ))}
        <TabButton active={tab === "references"} onClick={() => setTab("references")} label="Reference Pipeline" />
      </div>

      {tab === "references" ? (
        referencesSlot
      ) : (
        <AccountsTable
          accounts={inTab}
          members={members}
          loads={loads}
          canManage={canManage}
          canEdit={canEdit}
          onOpen={setEditing}
          onMove={setMoving}
          onBulkTransfer={bulkTransfer}
          extraControls={
            <>
              {category!.batch ? (
                <Select value={batch} onChange={setBatch} ariaLabel="Cohort" className="w-[150px] shrink-0">
                  <option value="">All cohorts</option>
                  {cohortBatches.map((b) => (
                    <option key={b} value={b}>
                      {category!.label}
                      {b}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Select
                value={memberFilter}
                onChange={setMemberFilter}
                ariaLabel="Team member"
                className="w-[170px] shrink-0"
                highlighted={memberFilter !== ""}
              >
                <option value="">Everyone</option>
                <option value="none">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </>
          }
        />
      )}

      {editing ? (
        <AccountDialog
          account={editing === "new" ? null : editing}
          defaultCategory={category?.code}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          batches={batches}
          productOptions={productOptions}
          canManage={canManage}
          canEdit={editing === "new" ? true : canEdit(editing)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {moving ? (
        <TransferDialog
          accountId={moving.id}
          label={accountLabel(moving.fullName, moving.batchCode)}
          currentMemberId={moving.assignedTo}
          capacity={capacity}
          hasCalls={(callCounts[moving.id] ?? 0) > 0}
          onClose={() => setMoving(null)}
        />
      ) : null}
    </>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3 text-[12.5px] font-bold transition-colors"
      style={
        active
          ? {
              borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
              background: "color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card))",
              color: "var(--color-altus-red-deep)",
            }
          : { borderColor: "var(--color-hairline)", background: "var(--color-surface-card)", color: "var(--color-ink-soft)" }
      }
    >
      {label}
      {count !== undefined ? (
        <span
          className="rounded-full px-1.5 text-[11px] tabular-nums"
          style={{ background: active ? "color-mix(in srgb, var(--color-altus-red) 14%, transparent)" : "var(--color-surface-soft)" }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
