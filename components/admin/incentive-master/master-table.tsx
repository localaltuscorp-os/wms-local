"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { fireToast } from "@/lib/toast";
import { formatInr } from "@/lib/format";
import type { ProductOption } from "@/lib/queries/products";
import type { IncentiveMasterRow } from "@/lib/queries/incentive-master";
import {
  formatIncentiveDate,
  incentiveDurationLabel,
  incentiveMasterErrors,
  incentiveTypeLabel,
} from "@/lib/incentive/master";
import { saveIncentive, setIncentiveActive } from "@/app/(admin)/admin/incentive-master/actions";
import { IncentiveWorkspace } from "./workspace";

/**
 * THE INCENTIVE MASTER LIST.
 *
 * Compact, and built on the shared `<DataTable>` every other admin master uses
 * — which is where the search box, the dropdown filters, the sortable headers,
 * the select-all checkbox and the selection bar come from. None of that is
 * reimplemented here, so this list behaves exactly like Clients, Products and
 * Billing Master and picks up any future improvement to them.
 *
 * ── THE BRIEF'S EIGHT COLUMNS, AND NOTHING ELSE ────────────────────────────
 * Incentive · Type · Product · Amount · Duration · Eligible · Status · Actions.
 * The description, the notes, the group flags and the eligibility itself are
 * one click away in the workspace — the same split Billing Master uses, and the
 * reason this table stays readable on a laptop.
 *
 * ── STATUS IS TWO FACTS, NOT ONE ───────────────────────────────────────────
 * `active` is the switch somebody threw; `validUntil` is a date that passed on
 * its own. An expired incentive is still marked active in the database, because
 * nothing should silently rewrite a decision nobody made — so the chip says
 * Expired and the row is not on offer. Filtering has an "On offer today" option
 * for exactly that distinction.
 */
export function IncentiveMasterTable({
  rows,
  products,
  canEdit,
  canManageChart,
  today,
}: {
  rows: IncentiveMasterRow[];
  products: ProductOption[];
  canEdit: boolean;
  canManageChart: boolean;
  today: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-5 py-2.5 text-[14px] font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 6px 18px -6px var(--color-altus-red-deep)",
            }}
          >
            <Plus size={16} strokeWidth={2.6} />
            New Incentive
          </button>
        </div>
      )}

      <DataTable<IncentiveMasterRow>
        rows={rows}
        getRowKey={(r) => r.id}
        // Everything somebody might recognise an incentive by, including the
        // product and the type label — "which incentives are on BSS" is a real
        // question and the answer should not need a filter.
        searchText={(r) =>
          [r.name, r.description, incentiveTypeLabel(r.incentiveType), r.productName, r.notes]
            .filter(Boolean)
            .join(" ")
        }
        searchPlaceholder="Search incentive, type or product"
        initialSort={{ key: "name", dir: "asc" }}
        /**
         * Multi-select, with something for it to DO.
         *
         * Deliberately activate/deactivate only. Deleting needs a typed name
         * per incentive, and an amount is per-scheme by definition — neither is
         * safe in bulk.
         */
        bulkActions={
          canEdit
            ? (selected, clearSelection) => (
                <BulkStatusActions rows={selected} onDone={clearSelection} />
              )
            : undefined
        }
        filters={[
          {
            label: "Status",
            options: [
              { value: "on_offer", label: "On offer today" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "expired", label: "Expired" },
            ],
            match: (r, v) =>
              v === "on_offer"
                ? r.onOffer
                : v === "active"
                  ? r.active
                  : v === "expired"
                    ? r.expired
                    : !r.active,
          },
          {
            label: "Duration",
            options: [
              { value: "permanent", label: "Permanent" },
              { value: "one_time", label: "One-Time" },
            ],
            match: (r, v) => r.duration === v,
          },
          {
            label: "Eligibility",
            options: [
              { value: "named", label: "Named employees" },
              { value: "groups", label: "By group" },
              { value: "nobody", label: "Nobody eligible" },
            ],
            match: (r, v) =>
              v === "nobody" ? r.eligibleCount === 0 : r.eligibilityMode === v,
          },
        ]}
        columns={[
          {
            key: "name",
            label: "Incentive",
            sortValue: (r) => r.name,
            render: (r) => (
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="text-left font-semibold text-ink-strong hover:text-altus-red hover:underline"
              >
                {r.name}
              </button>
            ),
          },
          {
            key: "type",
            label: "Type",
            sortValue: (r) => incentiveTypeLabel(r.incentiveType) ?? "",
            render: (r) => <Cell value={incentiveTypeLabel(r.incentiveType)} />,
          },
          {
            key: "product",
            label: "Product",
            sortValue: (r) => r.productName ?? "",
            render: (r) => <Cell value={r.productName} />,
          },
          {
            key: "amount",
            label: "Amount",
            align: "right",
            sortValue: (r) => r.amount,
            render: (r) => (
              <span className="tabular-nums font-semibold text-ink-strong">
                {formatInr(r.amount)}
              </span>
            ),
          },
          {
            key: "duration",
            label: "Duration",
            sortValue: (r) => `${r.duration} ${r.validUntil ?? ""}`,
            render: (r) => (
              <span className="text-ink-soft">
                {incentiveDurationLabel(r.duration)}
                {r.validUntil && (
                  <span className="block text-[11.5px] text-ink-subtle">
                    until {formatIncentiveDate(r.validUntil)}
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "eligible",
            label: "Eligible",
            sortValue: (r) => r.eligibleCount,
            render: (r) => (
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="text-left text-ink-soft hover:text-altus-red hover:underline"
                title={
                  r.eligibilityMode === "named"
                    ? "Named employees — open to change who is eligible"
                    : "Eligibility by group — open to name individual employees"
                }
              >
                {r.eligibleLabel}
              </button>
            ),
          },
          {
            key: "status",
            label: "Status",
            className: "w-32",
            sortValue: (r) => (r.onOffer ? 0 : r.expired ? 1 : 2),
            render: (r) => <StatusChip row={r} />,
          },
        ]}
        rowActions={(r) => (
          <button
            type="button"
            onClick={() => setOpenId(r.id)}
            className="rounded-lg border border-hairline-strong px-2.5 py-1 text-[12px] font-semibold text-ink-muted hover:text-ink-strong"
          >
            {canEdit ? "Open" : "View"}
          </button>
        )}
        emptyState={
          <div className="px-4 py-10 text-center text-[13px] text-ink-muted">
            No incentives yet.
            {canEdit ? " Use “New Incentive” to add the first one." : ""}
          </div>
        }
        dense
      />

      {creating && (
        <NewIncentiveDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.refresh();
            // Straight into the workspace: creating an incentive by name and
            // amount is step one of filling it in, and making somebody find the
            // row they just made in order to continue is a pointless extra move.
            setOpenId(id);
          }}
        />
      )}

      {openId && (
        <IncentiveWorkspace
          // Keyed by id, so opening a different incentive is a fresh mount
          // rather than a prop change — the Employee Master's convention, and
          // what lets every field initialise from the loaded record.
          key={openId}
          catalogId={openId}
          products={products}
          canEdit={canEdit}
          canManageChart={canManageChart}
          today={today}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
          onDeleted={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/* ── Bulk ─────────────────────────────────────────────────────────────────── */

/**
 * Activate or deactivate the ticked incentives.
 *
 * Writes through the SAME `setIncentiveActive` action a single toggle uses, one
 * call per incentive, rather than a bulk endpoint of its own. That keeps one
 * write path per fact: the same permission check, the same audit row, the same
 * change record and the same notifications to the people it affects. A
 * dedicated bulk action would be a second place for all of those to be got
 * right.
 *
 * Incentives already in the target state are skipped, so the count reported is
 * what actually changed rather than what was ticked.
 */
function BulkStatusActions({
  rows,
  onDone,
}: {
  rows: IncentiveMasterRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function apply(active: boolean) {
    const targets = rows.filter((r) => r.active !== active);
    if (targets.length === 0) {
      fireToast({ message: `Already ${active ? "active" : "inactive"}.` });
      return;
    }
    setBusy(true);
    const results = await Promise.all(targets.map((r) => setIncentiveActive(r.id, active)));
    setBusy(false);

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      const first = failed[0];
      fireToast({
        message: `${targets.length - failed.length} of ${targets.length} changed. ${
          first && !first.ok ? first.error : ""
        }`,
      });
    } else {
      fireToast({
        message: `${targets.length} incentive${targets.length === 1 ? "" : "s"} ${
          active ? "activated" : "deactivated"
        }.`,
      });
    }
    onDone();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => apply(true)}
        className="rounded-lg border border-hairline-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong disabled:opacity-50"
      >
        Activate
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => apply(false)}
        className="rounded-lg border border-hairline-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong disabled:opacity-50"
      >
        Deactivate
      </button>
    </>
  );
}

/* ── Cells ────────────────────────────────────────────────────────────────── */

const DASH = "—";

function Cell({ value }: { value: string | null }) {
  return <span className="text-ink-soft">{value || DASH}</span>;
}

/**
 * The status chip. Three states, because there are three:
 *
 *   Active   — on offer today (quiet green).
 *   Expired  — still switched on, but past its Valid Until (amber, because it
 *              is probably an oversight somebody should look at).
 *   Inactive — switched off (grey; a decision, not a fault).
 *
 * Nothing here is red. Following Billing Master's note — "no unnecessary red
 * pills" — red is reserved for actions.
 */
function StatusChip({ row }: { row: IncentiveMasterRow }) {
  const tone = row.onOffer
    ? { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)", dot: "var(--color-green)", label: "Active" }
    : row.expired && row.active
      ? { bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)", dot: "var(--color-amber)", label: "Expired" }
      : { bg: "var(--color-slate-bg)", fg: "var(--color-slate-deep)", dot: "var(--color-slate)", label: "Inactive" };
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
      {tone.label}
    </span>
  );
}

/* ── Create ───────────────────────────────────────────────────────────────── */

/**
 * The new-incentive dialog: NAME and AMOUNT only.
 *
 * Everything else — type, product, duration, valid until, the description and
 * the eligibility — is filled in the workspace this opens on save. Two fields
 * here rather than ten because a create form that asks for everything is a form
 * people abandon, and because none of the rest is required to have a valid row.
 */
function NewIncentiveDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsedAmount = Number(amount);
  // The SAME validator the server applies, so the button's disabled state and
  // the action's answer cannot disagree.
  const issues = incentiveMasterErrors({
    name,
    amount: amount.trim() === "" ? 0 : parsedAmount,
  });
  const ready = !issues.name && !issues.amount;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await saveIncentive({
      name: name.trim(),
      amount: amount.trim() === "" ? 0 : parsedAmount,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: `${name.trim()} added.` });
    onCreated(res.id);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New incentive"
    >
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface-card p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-bold text-ink-strong">New incentive</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              Name it and set what it pays. The type, product, duration and who is
              eligible come next.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-subtle hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>

        <label className="block">
          <span className="text-[13px] font-bold text-ink-soft">Incentive name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Google Review"
            className="mt-1 h-9 w-full rounded-pill border border-hairline bg-surface-card px-3.5 text-[13.5px] font-medium text-ink-strong outline-none focus:border-altus-red"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[13px] font-bold text-ink-soft">Amount (₹)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className="mt-1 h-9 w-full rounded-pill border border-hairline bg-surface-card px-3.5 text-[13.5px] font-medium tabular-nums text-ink-strong outline-none focus:border-altus-red"
          />
          {amount.trim() !== "" && issues.amount && (
            <span className="mt-1 block text-[12px] font-semibold text-altus-red-deep">
              {issues.amount}
            </span>
          )}
        </label>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border px-3 py-2 text-[13.5px]"
            style={{
              borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
              background: "var(--color-altus-red-wash)",
              color: "var(--color-altus-red-deep)",
            }}
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft hover:border-hairline-strong hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            className="pastel-cta wg-btn inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Adding…" : "Add incentive"}
          </button>
        </div>
      </div>
    </div>
  );
}
