"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { fireToast } from "@/lib/toast";
import {
  createBillingEntity,
  updateBillingEntity,
} from "@/app/(admin)/admin/billing-master/actions";
import type { BillingEntityRow, BillingEntityAccess } from "@/lib/queries/billing-entities";
import { primaryContact } from "@/lib/billing/entity-master";
import { BillingEntityWorkspace } from "./workspace";

/**
 * THE BILLING MASTER LIST.
 *
 * Compact, and built on the shared `<DataTable>` every other admin master uses
 * — which is where the search box, the dropdown filters, the sortable headers,
 * the select-all checkbox and the selection bar come from. None of that is
 * reimplemented here, so this list behaves exactly like Clients and Products
 * and picks up any future improvement to them.
 *
 * ── SEVEN COLUMNS, AND NOTHING ELSE ────────────────────────────────────────
 * Select · Entity · Proprietor · GST No. · PAN No. · Contact · Status ·
 * Actions, as specified. The brief is explicit about not overloading it — the
 * address, the SAC codes, the bank account and the files are all one click
 * away in the workspace, and a bank account in particular has no business
 * being in a list that gets screen-shared.
 *
 * ── NO ENTITY CODE ─────────────────────────────────────────────────────────
 * There is no such column and no such field anywhere in this feature.
 */
export function BillingMasterTable({
  rows,
  access,
  canDelete,
}: {
  rows: BillingEntityRow[];
  access: BillingEntityAccess;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  return (
    <>
      {access.entityEdit && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-5 py-2.5 text-[14px] font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #E10600, #A80400)",
              boxShadow: "0 6px 18px -6px rgba(225,6,0,0.55)",
            }}
          >
            <Plus size={16} strokeWidth={2.6} />
            New Entity
          </button>
        </div>
      )}

      <DataTable<BillingEntityRow>
        rows={rows}
        getRowKey={(r) => r.id}
        // Everything a person might recognise an entity by. The tax numbers are
        // included because "who is 27AAAAA…" is a real question when
        // reconciling a return against an invoice.
        searchText={(r) =>
          [r.name, r.proprietorName, r.gstNo, r.panNo, r.cellNo, r.email]
            .filter(Boolean)
            .join(" ")
        }
        searchPlaceholder="Search entity, proprietor, GST or PAN"
        initialSort={{ key: "name", dir: "asc" }}
        /**
         * Multi-select, with something for it to DO.
         *
         * `<DataTable>` supports a `selectable` flag that shows the checkbox
         * column on its own, but a checkbox with no action attached is worse
         * than no checkbox — it invites a selection and then offers nothing.
         * So the selection drives the one bulk change that is safe in bulk:
         * activating or deactivating.
         *
         * Deliberately NOT bulk delete, and not bulk field editing. Deleting is
         * one person's authority and needs a per-entity confirmation, and a GST
         * number is per-entity by definition.
         */
        bulkActions={
          access.entityEdit
            ? (selected, clearSelection) => (
                <BulkStatusActions rows={selected} onDone={clearSelection} />
              )
            : undefined
        }
        filters={[
          {
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            match: (r, v) => (v === "active" ? r.isActive : !r.isActive),
          },
          {
            // The filter that answers "which of these can actually raise an
            // invoice today" — the reason the page shows a Missing GST/PAN stat.
            label: "Tax details",
            options: [
              { value: "complete", label: "GST + PAN on file" },
              { value: "missing", label: "Missing GST or PAN" },
            ],
            match: (r, v) =>
              v === "complete" ? Boolean(r.gstNo && r.panNo) : !r.gstNo || !r.panNo,
          },
        ]}
        columns={[
          {
            key: "name",
            label: "Entity",
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
            key: "proprietor",
            label: "Proprietor",
            sortValue: (r) => r.proprietorName ?? "",
            render: (r) => <Cell value={r.proprietorName} />,
          },
          {
            key: "gst",
            label: "GST No.",
            sortValue: (r) => r.gstNo ?? "",
            render: (r) => <Mono value={r.gstNo} />,
          },
          {
            key: "pan",
            label: "PAN No.",
            sortValue: (r) => r.panNo ?? "",
            render: (r) => <Mono value={r.panNo} />,
          },
          {
            key: "contact",
            label: "Contact",
            render: (r) => <Cell value={primaryContact(r)} />,
          },
          {
            key: "status",
            label: "Status",
            className: "w-28",
            sortValue: (r) => (r.isActive ? 0 : 1),
            render: (r) => <StatusChip active={r.isActive} />,
          },
        ]}
        rowActions={(r) => (
          <button
            type="button"
            onClick={() => setOpenId(r.id)}
            className="rounded-lg border border-hairline-strong px-2.5 py-1 text-[12px] font-semibold text-ink-muted hover:text-ink-strong"
          >
            {access.entityEdit ? "Open" : "View"}
          </button>
        )}
        emptyState={
          <div className="px-4 py-10 text-center text-[13px] text-ink-muted">
            No billing entities yet.
            {access.entityEdit ? " Use “New Entity” to add the first one." : ""}
          </div>
        }
        dense
      />

      {creating && (
        <NewEntityDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.refresh();
            // Straight into the workspace: creating an entity by name is step
            // one of filling it in, and making somebody find the row they just
            // made in order to continue is a pointless extra move.
            setOpenId(id);
          }}
        />
      )}

      {openId && (
        <BillingEntityWorkspace
          // Keyed by id, so opening a different entity is a fresh mount rather
          // than a prop change — the Employee Master's convention, and what
          // lets every field initialise from the loaded record.
          key={openId}
          entityId={openId}
          access={access}
          canDelete={canDelete}
          onClose={() => setOpenId(null)}
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
 * Activate or deactivate the ticked entities.
 *
 * Writes through the SAME `updateBillingEntity` action a single edit uses, one
 * call per entity, rather than a bulk endpoint of its own. That keeps one write
 * path per fact: the same validation, the same permission check, the same audit
 * row and the same version-history entry. A dedicated bulk action would be a
 * second place for all of those to be got right.
 *
 * Entities already in the target state are skipped, so the count reported is
 * what actually changed rather than what was ticked.
 */
function BulkStatusActions({
  rows,
  onDone,
}: {
  rows: BillingEntityRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function apply(isActive: boolean) {
    const targets = rows.filter((r) => r.isActive !== isActive);
    if (targets.length === 0) {
      fireToast({
        message: `Already ${isActive ? "active" : "inactive"}.`,
      });
      return;
    }
    setBusy(true);
    const results = await Promise.all(
      targets.map((r) => updateBillingEntity(r.id, { isActive })),
    );
    setBusy(false);

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      // Named, not counted: a partial failure needs to say what did not happen.
      const first = failed[0];
      fireToast({
        message: `${targets.length - failed.length} of ${targets.length} changed. ${
          first && !first.ok ? first.error : ""
        }`,
      });
    } else {
      fireToast({
        message: `${targets.length} entit${targets.length === 1 ? "y" : "ies"} ${
          isActive ? "activated" : "deactivated"
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

/** Tax numbers in tabular figures — they are compared by eye, column to column. */
function Mono({ value }: { value: string | null }) {
  return value ? (
    <span className="font-mono text-[12px] tabular-nums text-ink-soft">{value}</span>
  ) : (
    <span className="text-ink-subtle">{DASH}</span>
  );
}

/**
 * The status chip, copied from the roster masters rather than invented.
 *
 * The brief asks for "no unnecessary red pills" and "clear status indicators
 * only where relevant" — so Active is a quiet green and Inactive is grey. An
 * inactive entity is a decision, not a fault, and nothing here is red.
 */
function StatusChip({ active }: { active: boolean }) {
  return active ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-green)" }} />
      Active
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
    >
      Inactive
    </span>
  );
}

/* ── New entity ───────────────────────────────────────────────────────────── */

/**
 * Creating asks for the NAME only.
 *
 * Everything else is optional at the database level and is filled in on the
 * workspace, which is the screen built for it. A create dialog reproducing all
 * twenty fields would be a second form to keep in step with the first, and it
 * would block somebody who has the company's name but is still waiting on its
 * GST certificate.
 */
function NewEntityDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await createBillingEntity({ name });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: `${name.trim()} created.` });
    onCreated(res.id);
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New entity"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="font-serif text-xl text-[#0F172A]">New Entity</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-subtle hover:text-ink-strong"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-[15px] text-[#64748B]" style={{ lineHeight: 1.5 }}>
          The legal entity Billing will bill from. You can add the proprietor, tax
          details, banking and files next.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
          >
            {error}
          </div>
        )}

        <label className="mb-1.5 block text-[13px] font-semibold text-ink-strong">
          Entity Name
        </label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
          placeholder="e.g. Unleashed"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#CBD5E1] px-4 py-2.5 text-[14px] font-semibold text-ink-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || name.trim() === ""}
            className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
