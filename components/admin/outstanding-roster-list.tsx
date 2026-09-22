"use client";

import { useEffect, useState, useTransition } from "react";
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
  ActionResult,
  CreateRosterInput,
  UpdateRosterInput,
} from "@/lib/outstanding/roster-actions";
import {
  EMPLOYEE_KIND_OPTIONS,
  EMPLOYEE_TYPE_LABELS,
  type EmployeeTypeCode,
} from "@/lib/employees/employee-type";

export interface RosterItem {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
  /** Designations only (see `showEmployeeType` below). */
  employeeType?: EmployeeTypeCode;
}

type CreateAction = (
  input: CreateRosterInput,
) => Promise<ActionResult<{ id: string }>>;
type UpdateAction = (
  id: string,
  fields: UpdateRosterInput,
) => Promise<ActionResult>;

interface Props {
  title: string;
  items: RosterItem[];
  createAction: CreateAction;
  updateAction: UpdateAction;
  /** Singular noun for the usage column, e.g. "contracts". */
  usageLabel: string;
  /**
   * EMPLOYEE-TYPE OPT-IN (Employee / Intern). When false — which is every
   * roster except Designations — no Type column and no Type control in either
   * dialog are rendered, and the create payload never carries the field, so
   * those screens are exactly as they were. Only Designations passes this, and
   * only because its table has an `employee_type` column (migration 0244); the
   * matching write-side opt-in is `writesEmployeeType` in
   * lib/outstanding/roster-actions.ts, which ignores the field for every other
   * table even if a caller did send it.
   */
  showEmployeeType?: boolean;
}

/**
 * Shared admin roster manager for the four Outstanding lookup lists
 * (products / entities / payment modes / responsibles). Now built on the
 * premium admin kit: the create CTA renders standalone (mounted in the page's
 * <AdminSection actions> slot via <RosterCreateButton>) and the table is the
 * kit <DataTable> with client search, an Active/Inactive filter, and sortable
 * Name/Sort/Usage columns. Inline rename + activate/deactivate live in the
 * per-row menu. There's no delete — the roster actions intentionally only
 * support create + update (rows are referenced by contracts via ON DELETE SET
 * NULL, so deactivation is the safe "remove from picker" path).
 */
export function OutstandingRosterList({
  title,
  items,
  createAction,
  updateAction,
  usageLabel,
  showEmployeeType = false,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<RosterItem | null>(null);

  const noun = title.replace(/s$/, "").toLowerCase();

  return (
    <>
      <div className="mb-6 flex justify-end">
        <CreateRosterDialog
          title={title}
          createAction={createAction}
          showEmployeeType={showEmployeeType}
          onDone={() => router.refresh()}
        />
      </div>

      <DataTable<RosterItem>
        rows={items}
        getRowKey={(r) => r.id}
        searchText={(r) => r.name}
        searchPlaceholder={`Search ${title.toLowerCase()}`}
        initialSort={{ key: "sortOrder", dir: "asc" }}
        filters={[
          {
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            match: (r, v) => (v === "active" ? r.isActive : !r.isActive),
          },
        ]}
        columns={[
          {
            key: "name",
            label: "Name",
            sortValue: (r) => r.name,
            render: (r) => (
              <span className="font-medium text-ink-strong">{r.name}</span>
            ),
          },
          // Opt-in: the Type column exists only for rosters that carry an
          // employee_type (Designations — see the `showEmployeeType` prop).
          // Every other caller leaves it false, so their columns are unchanged.
          ...(showEmployeeType
            ? [
                {
                  key: "employeeType",
                  label: "Type",
                  className: "w-32",
                  sortValue: (r: RosterItem) => r.employeeType ?? "employee",
                  render: (r: RosterItem) => (
                    <EmployeeTypeBadge type={r.employeeType} />
                  ),
                },
              ]
            : []),
          {
            key: "sortOrder",
            label: "Sort",
            align: "right",
            className: "w-24",
            sortValue: (r) => r.sortOrder,
            render: (r) => (
              <span className="tabular-nums text-ink-soft">{r.sortOrder}</span>
            ),
          },
          {
            key: "usageCount",
            label: "Usage",
            align: "right",
            className: "w-40",
            sortValue: (r) => r.usageCount,
            render: (r) => (
              <span className="tabular-nums text-ink-soft">
                {r.usageCount} {usageLabel}
              </span>
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
        rowActions={(r) => (
          <RosterRowActions
            item={r}
            updateAction={updateAction}
            onEdit={() => setEditing(r)}
            onDone={() => router.refresh()}
          />
        )}
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
              No {title.toLowerCase()} yet
            </p>
            <p className="mt-2 max-w-sm mx-auto text-[14px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
              Create your first one with the button above. It then shows up in
              the contract form picker.
            </p>
          </>
        }
      />

      <EditRosterDialog
        noun={noun}
        item={editing}
        updateAction={updateAction}
        showEmployeeType={showEmployeeType}
        onClose={() => setEditing(null)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold"
        style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-green)" }} />
        Active
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-ink-subtle)" }} />
      Inactive
    </span>
  );
}

/**
 * DESIGNATION TYPE tag (opt-in — Designations only). Built from the same
 * rounded-pill + tone-token recipe as <StatusBadge> above, no new colours:
 * "Intern" is a calm, distinct blue, and the default is a quiet neutral
 * "Employee" so the baseline reads as the absence of a state rather than a
 * second status.
 */
function EmployeeTypeBadge({ type }: { type?: string }) {
  if (type === "intern") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold"
        style={{ background: "var(--color-blue-bg)", color: "var(--color-blue-deep)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-blue)" }} />
        {EMPLOYEE_TYPE_LABELS.intern}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
    >
      {EMPLOYEE_TYPE_LABELS.employee}
    </span>
  );
}

function RosterRowActions({
  item,
  updateAction,
  onEdit,
  onDone,
}: {
  item: RosterItem;
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
          ? `${item.name} deactivated.`
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

function CreateRosterDialog({
  title,
  createAction,
  showEmployeeType,
  onDone,
}: {
  title: string;
  createAction: CreateAction;
  showEmployeeType?: boolean;
  onDone: () => void;
}) {
  const noun = title.replace(/s$/, "").toLowerCase();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(100);
  const [employeeType, setEmployeeType] = useState<EmployeeTypeCode>("employee");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setSortOrder(100);
    setEmployeeType("employee");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAction({
        name: name.trim(),
        sortOrder,
        // Opt-in: only sent when the roster stores it, so the other rosters'
        // payloads stay byte-for-byte what they were.
        ...(showEmployeeType ? { employeeType } : {}),
      });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
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
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)", boxShadow: "0 6px 18px -6px rgba(225,6,0,0.55)" }}
        >
          <Plus size={16} strokeWidth={2.6} />
          New {noun}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New {noun}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            This appears in the picker when anyone creates or edits an
            outstanding contract.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <RosterField label="Name">
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </RosterField>
            {showEmployeeType && (
              <EmployeeTypeField value={employeeType} onChange={setEmployeeType} />
            )}
            <RosterField
              label="Sort Order"
              hint="Lower numbers appear first in the picker when names tie. Default 100."
            >
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </RosterField>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
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
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditRosterDialog({
  noun,
  item,
  updateAction,
  showEmployeeType,
  onClose,
  onDone,
}: {
  noun: string;
  item: RosterItem | null;
  updateAction: UpdateAction;
  showEmployeeType?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [sortOrder, setSortOrder] = useState<number>(item?.sortOrder ?? 100);
  const [employeeType, setEmployeeType] = useState<EmployeeTypeCode>(
    item?.employeeType ?? "employee",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setName(item?.name ?? "");
    setSortOrder(item?.sortOrder ?? 100);
    setEmployeeType(item?.employeeType ?? "employee");
    setError(null);
  }, [item?.id, item?.name, item?.sortOrder, item?.employeeType]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError(null);

    const patch: {
      name?: string;
      sortOrder?: number;
      employeeType?: EmployeeTypeCode;
    } = {};
    const trimmedName = name.trim();
    if (trimmedName !== item.name) patch.name = trimmedName;
    if (sortOrder !== item.sortOrder) patch.sortOrder = sortOrder;
    // Opt-in: only the roster that owns the flag sends it.
    if (showEmployeeType && employeeType !== (item.employeeType ?? "employee")) {
      patch.employeeType = employeeType;
    }

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateAction(item.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmedName} updated.` });
      onClose();
      onDone();
    });
  }

  return (
    <Dialog.Root open={item !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit {noun}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            Renaming updates the picker everywhere this {noun} is offered.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <RosterField label="Name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </RosterField>
            {showEmployeeType && (
              <EmployeeTypeField value={employeeType} onChange={setEmployeeType} />
            )}
            <RosterField label="Sort Order">
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </RosterField>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
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
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The Employee / Intern picker (opt-in — Designations only), shared by both
 * dialogs. `employee` is the column default, so leaving it alone writes nothing
 * new. Options and labels come from lib/employees/employee-type.ts, the same
 * module the eligibility rule reads.
 */
function EmployeeTypeField({
  value,
  onChange,
}: {
  value: EmployeeTypeCode;
  onChange: (v: EmployeeTypeCode) => void;
}) {
  return (
    <RosterField
      label="Type"
      hint="Interns cannot earn incentives. This applies to everybody holding this designation."
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as EmployeeTypeCode)}
        className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
      >
        {EMPLOYEE_KIND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </RosterField>
  );
}

function RosterField({
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
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-[#94A3B8]">{hint}</p>}
    </div>
  );
}
