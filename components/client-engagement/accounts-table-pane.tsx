"use client";

import * as React from "react";
import { fireToast } from "@/lib/toast";
import { ceAssignAccount } from "@/app/(app)/operations/client-engagement/actions";
import { accountLabel } from "@/lib/client-engagement/constants";
import type { Load, MemberCapacity } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { AccountDialog } from "./account-dialog";
import { TransferDialog } from "./transfer-dialog";
import { AccountsTable } from "./accounts-table";

/**
 * AccountsTable, plus the row-level Edit and Transfer dialogs and the bulk
 * transfer it needs behind them — the wiring Overview's per-category board
 * and PCA Grid's per-group board both need, pulled out once (asked
 * 2026-09-29: "change [PCA Grid's card board] into the table view as we did
 * in Overview... make the respective functions for it") rather than
 * duplicated a second time.
 */
export function AccountsTablePane({
  accounts,
  members,
  loads,
  capacity,
  callCounts,
  canManage,
  myMemberId,
  batches,
  defaultCategory,
  extraControls,
}: {
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  loads: Record<string, Load>;
  capacity: MemberCapacity[];
  /** Scheduled calls per account (any week) — a transfer moves them. */
  callCounts: Record<string, number>;
  canManage: boolean;
  myMemberId: string | null;
  /** Batch codes offered in the Edit dialog's own datalist. */
  batches: string[];
  /** The category a NEW account defaults to — irrelevant here, this pane never opens "new". */
  defaultCategory?: string;
  extraControls?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState<CeAccountRow | null>(null);
  const [moving, setMoving] = React.useState<CeAccountRow | null>(null);

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
      <AccountsTable
        accounts={accounts}
        members={members}
        loads={loads}
        canManage={canManage}
        canEdit={canEdit}
        onOpen={setEditing}
        onMove={setMoving}
        onBulkTransfer={bulkTransfer}
        extraControls={extraControls}
      />

      {editing ? (
        <AccountDialog
          account={editing}
          defaultCategory={defaultCategory}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          batches={batches}
          canManage={canManage}
          canEdit={canEdit(editing)}
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
