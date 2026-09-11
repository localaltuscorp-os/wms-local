"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MoreHorizontal, Pencil, Plus, Power } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/admin/ui/data-table";
import type {
  CreateProductInput,
  ProductActionResult,
  UpdateProductInput,
} from "@/app/(admin)/admin/products/actions";

/**
 * THE PRODUCT MASTER screen.
 *
 * A near-twin of `OutstandingRosterList`, and deliberately not a fork of it: the
 * shared component takes `{name, sortOrder, isActive}` and products carry a
 * CODE as well. Threading an optional column through the shared table would give
 * the other five rosters a column they must always render empty, and would put
 * a `code` field in a create dialog for entities and payment modes that have no
 * such column.
 *
 * ── CODE AND NAME ARE SHOWN AS TWO COLUMNS ─────────────────────────────────
 * The brief: "Product Code must be separately stored/displayed from Product
 * Name." A single "BSS · Business Support System" cell would satisfy neither
 * half — it is not separately displayed, and it is not sortable or searchable by
 * code alone. A product with no code yet shows "—", which is a real state
 * (migration 0217 declined to invent codes for the multi-word products) and not
 * an error.
 */

export interface ProductItem {
  id: string;
  code: string | null;
  name: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
}

type CreateAction = (input: CreateProductInput) => Promise<ProductActionResult>;
type UpdateAction = (id: string, fields: UpdateProductInput) => Promise<ProductActionResult>;

interface Props {
  items: ProductItem[];
  createAction: CreateAction;
  updateAction: UpdateAction;
  /** False when the permission matrix denies edit on admin.masters.products —
   *  the buttons go away. The actions re-check server-side regardless. */
  canEdit: boolean;
}

const FIELD_INPUT =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]";

export function ProductMasterList({ items, createAction, updateAction, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductItem | null>(null);

  return (
    <>
      {canEdit && (
        <div className="mb-6 flex justify-end">
          <CreateProductDialog createAction={createAction} onDone={() => router.refresh()} />
        </div>
      )}

      <DataTable<ProductItem>
        rows={items}
        getRowKey={(r) => r.id}
        // Searchable by BOTH, so somebody who knows the code can find the row
        // without knowing how the name is spelled.
        searchText={(r) => `${r.code ?? ""} ${r.name}`}
        searchPlaceholder="Search products by code or name"
        initialSort={{ key: "name", dir: "asc" }}
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
            label: "Code",
            options: [
              { value: "coded", label: "Has a code" },
              { value: "uncoded", label: "No code yet" },
            ],
            match: (r, v) => (v === "coded" ? Boolean(r.code) : !r.code),
          },
        ]}
        columns={[
          {
            key: "code",
            label: "Code",
            className: "w-32",
            sortValue: (r) => r.code ?? "￿", // un-coded rows sort last
            render: (r) =>
              r.code ? (
                <span className="font-mono text-[13px] font-semibold tracking-wide text-ink-strong">
                  {r.code}
                </span>
              ) : (
                <span className="text-ink-subtle" title="No code set yet">
                  —
                </span>
              ),
          },
          {
            key: "name",
            label: "Product Name",
            sortValue: (r) => r.name,
            render: (r) => <span className="font-medium text-ink-strong">{r.name}</span>,
          },
          {
            key: "sortOrder",
            label: "Sort",
            align: "right",
            className: "w-20",
            sortValue: (r) => r.sortOrder,
            render: (r) => <span className="tabular-nums text-ink-soft">{r.sortOrder}</span>,
          },
          {
            key: "usageCount",
            label: "Usage",
            align: "right",
            className: "w-36",
            sortValue: (r) => r.usageCount,
            render: (r) => (
              <span className="tabular-nums text-ink-soft">{r.usageCount} contracts</span>
            ),
          },
          {
            key: "status",
            label: "Status",
            className: "w-32",
            sortValue: (r) => (r.isActive ? 0 : 1),
            render: (r) => <StatusBadge active={r.isActive} />,
          },
        ]}
        rowActions={
          canEdit
            ? (r) => (
                <ProductRowActions
                  item={r}
                  updateAction={updateAction}
                  onEdit={() => setEditing(r)}
                  onDone={() => router.refresh()}
                />
              )
            : undefined
        }
        emptyState={
          <>
            <p
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-serif), system-ui, sans-serif",
                fontStyle: "italic",
                fontSize: 22,
                letterSpacing: "-0.015em",
              }}
            >
              No products yet
            </p>
            <p
              className="mt-2 max-w-sm mx-auto text-[14px] text-ink-subtle"
              style={{ lineHeight: 1.5 }}
            >
              Products created here are the ones every module offers — Billing,
              Outstanding contracts and the product fields on intake forms.
            </p>
          </>
        }
      />

      {/*
        MOUNTED ONLY WHEN A ROW IS BEING EDITED, and KEYED BY ITS ID.

        The shared roster dialog keeps a single always-mounted instance and
        re-syncs its fields from props in an effect. That is a setState inside an
        effect body, which this repo lints against and which causes a cascading
        render on every open. Remounting per row instead lets `useState` take the
        row as its initial value — the state is derived from the identity of the
        thing being edited, so identity is the right thing to key on.
      */}
      {editing && (
        <EditProductDialog
          key={editing.id}
          item={editing}
          updateAction={updateAction}
          onClose={() => setEditing(null)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  );
}

function StatusBadge({ active }: { active: boolean }) {
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
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--color-ink-subtle)" }}
      />
      Inactive
    </span>
  );
}

function ProductRowActions({
  item,
  updateAction,
  onEdit,
  onDone,
}: {
  item: ProductItem;
  updateAction: UpdateAction;
  onEdit: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const res = await updateAction(item.id, { isActive: !item.isActive });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: item.isActive
          ? `${item.name} deactivated — it stays on past contracts but is no longer offered.`
          : `${item.name} reactivated.`,
      });
      onDone();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Actions"
          disabled={pending}
          className="inline-flex items-center justify-center size-9 rounded-lg border border-hairline text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors disabled:opacity-50 data-[state=open]:border-altus-red data-[state=open]:text-altus-red"
        >
          <MoreHorizontal size={18} strokeWidth={2.2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil size={15} strokeWidth={2.2} />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            toggleActive();
          }}
        >
          <Power size={15} strokeWidth={2.2} />
          {item.isActive ? "Deactivate" : "Reactivate"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateProductDialog({
  createAction,
  onDone,
}: {
  createAction: CreateAction;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setCode("");
    setName("");
    setSortOrder(100);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAction({
        name: name.trim(),
        code: code.trim(),
        sortOrder,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${name.trim()} created.` });
      reset();
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="wg-btn inline-flex items-center gap-1.5 rounded-pill py-2.5 px-5 text-[14px] font-semibold text-white"
          style={{
            background: "linear-gradient(135deg, #E10600, #A80400)",
            boxShadow: "0 6px 18px -6px rgba(225,6,0,0.55)",
          }}
        >
          <Plus size={16} strokeWidth={2.6} />
          New product
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New product
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            This becomes available in every product picker — Billing, Outstanding
            contracts, and the product fields on intake forms.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              label="Product Code"
              hint="Short and stable, e.g. BSS or GP. Optional — you can add it later. Letters, digits, dot, dash and underscore; no spaces."
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={24}
                placeholder="BSS"
                className={`${FIELD_INPUT} font-mono uppercase`}
              />
            </Field>
            <Field label="Product Name">
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Business Support System"
                className={FIELD_INPUT}
              />
            </Field>
            <Field
              label="Sort Order"
              hint="Lower numbers appear first in the picker. Default 100."
            >
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </Field>
            <FormError error={error} />
            <DialogButtons pending={pending} submitLabel="Create" pendingLabel="Creating…" />
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Mounted per row and keyed by its id (see the caller), so the fields simply
 *  initialise from the row and no effect is needed to keep them in step. */
function EditProductDialog({
  item,
  updateAction,
  onClose,
  onDone,
}: {
  item: ProductItem;
  updateAction: UpdateAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState(item.code ?? "");
  const [name, setName] = useState(item.name);
  const [sortOrder, setSortOrder] = useState(item.sortOrder);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const patch: UpdateProductInput = {};
    const nextName = name.trim();
    const nextCode = code.trim();
    if (nextName !== item.name) patch.name = nextName;
    // Sent whenever it differs from what is stored, INCLUDING when it becomes
    // empty — an empty code is a deliberate clear, and the action stores NULL.
    if (nextCode !== (item.code ?? "")) patch.code = nextCode;
    if (sortOrder !== item.sortOrder) patch.sortOrder = sortOrder;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateAction(item.id, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${nextName} updated.` });
      onClose();
      onDone();
    });
  }

  return (
    <Dialog.Root
      // Always open: the dialog is mounted only while a row is being edited.
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit product
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            Renaming updates every picker. Past contracts keep pointing at this
            same product, because they reference it by id and not by name.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Product Code" hint="Clear the field to remove the code.">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={24}
                className={`${FIELD_INPUT} font-mono uppercase`}
              />
            </Field>
            <Field label="Product Name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className={FIELD_INPUT}
              />
            </Field>
            <Field label="Sort Order">
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </Field>
            <FormError error={error} />
            <DialogButtons pending={pending} submitLabel="Save" pendingLabel="Saving…" />
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-[#94A3B8]">{hint}</p>}
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
    >
      {error}
    </div>
  );
}

function DialogButtons({
  pending,
  submitLabel,
  pendingLabel,
}: {
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Dialog.Close asChild>
        <button
          type="button"
          className="brand-btn px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
          disabled={pending}
        >
          Cancel
        </button>
      </Dialog.Close>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}
