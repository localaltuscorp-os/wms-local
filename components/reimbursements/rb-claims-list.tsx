"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Search,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Trash2,
  Check,
  Paperclip,
  Tag,
  CalendarDays,
  Wallet,
  ReceiptText,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  setModuleAdminFields,
  decideModule,
  setModuleArchived,
  deleteModuleSubmission,
} from "@/app/(app)/forms/actions";
import { visibleFields, fieldPairs, type FormFieldDef } from "@/lib/forms/field-types";
import type { ModuleSubmissionRow } from "@/lib/queries/modules";
import { formatDate, formatInr, formatCount } from "@/lib/format";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Select } from "@/components/ui/select";
import { Field, FieldInput } from "@/components/forms/form-fields";

type Status = "pending" | "approved" | "rejected";
type DerivedStatus = Status | "paid";
type SortKey = "newest" | "oldest" | "amount-desc" | "amount-asc";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/* amber = pending · green = approved/paid · red = rejected */
const STATUS_META: Record<DerivedStatus, { label: string; fg: string; bg: string; stripe: string }> = {
  pending: {
    label: "Pending",
    fg: "#b45309",
    bg: "rgba(245,158,11,0.14)",
    stripe: "linear-gradient(180deg, #f59e0b, #d97706)",
  },
  approved: {
    label: "Approved",
    fg: GREEN_DEEP,
    bg: "rgba(22,163,74,0.13)",
    stripe: `linear-gradient(180deg, ${GREEN}, ${GREEN_DEEP})`,
  },
  paid: {
    label: "Paid",
    fg: "#fff",
    bg: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
    stripe: `linear-gradient(180deg, ${GREEN}, ${GREEN_DEEP})`,
  },
  rejected: {
    label: "Rejected",
    fg: "#A80400",
    bg: "rgba(225,6,0,0.10)",
    stripe: "linear-gradient(180deg, #E10600, #A80400)",
  },
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "amount-desc", label: "Amount · High → Low" },
  { value: "amount-asc", label: "Amount · Low → High" },
];

/** Claim ₹ as a number — fields are stored as strings. */
function claimAmount(r: ModuleSubmissionRow): number {
  const n = Number(String(r.fields.amount ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** A claim is "paid" once approved AND the admin has logged a payment date. */
function deriveStatus(r: ModuleSubmissionRow): DerivedStatus {
  if (r.status === "approved" && (r.adminFields?.payment_date ?? "") !== "") return "paid";
  return (r.status as Status) ?? "pending";
}

function receiptHref(v: string): string {
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Searchable / sortable reimbursement claims list — status-striped claim
 * cards with the exact same approve / reject / admin-response / archive /
 * delete behaviour as the generic module list (same server actions).
 */
export function RbClaimsList({
  rows,
  isAdmin,
  requestFields,
  adminFields,
  productOptions,
  view,
}: {
  rows: ModuleSubmissionRow[];
  isAdmin: boolean;
  requestFields: FormFieldDef[];
  adminFields: FormFieldDef[];
  productOptions: string[];
  view: "active" | "archived";
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [statusFilter, setStatusFilter] = useState<"all" | DerivedStatus>("all");

  const counts = useMemo(() => {
    const c: Record<"all" | DerivedStatus, number> = { all: rows.length, pending: 0, approved: 0, paid: 0, rejected: 0 };
    for (const r of rows) c[deriveStatus(r)] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => deriveStatus(r) === statusFilter);
    if (q) {
      list = list.filter((r) =>
        [r.employeeName, ...Object.values(r.fields), ...Object.values(r.adminFields ?? {})]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    if (sort === "oldest") sorted.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    if (sort === "amount-desc") sorted.sort((a, b) => claimAmount(b) - claimAmount(a));
    if (sort === "amount-asc") sorted.sort((a, b) => claimAmount(a) - claimAmount(b));
    return sorted;
  }, [rows, query, sort, statusFilter]);

  const shownTotal = shown.reduce((s, r) => s + claimAmount(r), 0);

  if (rows.length === 0) {
    return (
      <div
        className="wg-rise grid place-items-center rounded-[22px] bg-surface-card px-8 py-16 text-center"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      >
        <span
          className="mb-3 inline-grid size-12 place-items-center rounded-2xl"
          style={{ background: `color-mix(in srgb, ${GREEN} 10%, transparent)`, color: GREEN_DEEP }}
        >
          <ReceiptText size={22} strokeWidth={2.2} />
        </span>
        <p className="text-[16px] font-bold text-ink-strong">
          {view === "archived" ? "Nothing archived." : "No claims yet."}
        </p>
        <p className="mt-1 text-[13.5px] font-medium text-ink-subtle">
          {view === "archived"
            ? "Archived claims will appear here."
            : "Raise your first expense with “Request Reimbursement”."}
        </p>
      </div>
    );
  }

  const chip = (key: "all" | DerivedStatus, label: string) => {
    const active = statusFilter === key;
    const meta = key !== "all" ? STATUS_META[key] : null;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setStatusFilter(key)}
        aria-pressed={active}
        className="wg-btn rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors"
        style={
          active
            ? key === "all"
              ? { background: "linear-gradient(135deg, #334155, #1e293b)", color: "#fff" }
              : key === "paid"
                ? { background: STATUS_META.paid.bg, color: "#fff" }
                : { background: meta!.fg, color: "#fff" }
            : { background: "var(--color-surface-card)", color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
        }
      >
        {label}
        <span className="ml-1.5 tabular-nums opacity-70">{formatCount(counts[key])}</span>
      </button>
    );
  };

  return (
    <div>
      {/* ── Toolbar: search · status chips · sort ── */}
      <div
        className="wg-rise mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-card px-4 py-3"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -22px rgba(15,23,42,0.35)" }}
      >
        <label className="relative flex-1 min-w-[220px]">
          <span className="sr-only">Search claims</span>
          <Search size={15} strokeWidth={2.4} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Local search — claims, person, head, amount" title="Local search — filters only the list on this page" aria-label="Local search — claims — expense, person, head, amount — this page only"
            className="w-full rounded-pill border border-hairline bg-white py-2 pl-9 pr-4 text-[13.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-[#16a34a99]"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
          {chip("all", "All")}
          {chip("pending", "Pending")}
          {chip("approved", "Approved")}
          {chip("paid", "Paid")}
          {chip("rejected", "Rejected")}
        </div>
        <div className="min-w-[190px]">
          <Select
            options={SORT_OPTIONS}
            value={sort}
            onValueChange={(v) => setSort(v as SortKey)}
            ariaLabel="Sort claims"
            searchable={false}
          />
        </div>
      </div>

      <p className="mb-3 px-1 text-[12.5px] font-bold text-ink-subtle" aria-live="polite">
        {formatCount(shown.length)} {shown.length === 1 ? "claim" : "claims"}
        <span className="tabular-nums" style={{ color: GREEN_DEEP }}> · {formatInr(shownTotal)}</span>
        {statusFilter !== "all" ? ` · ${STATUS_META[statusFilter].label.toLowerCase()}` : ""}
      </p>

      {shown.length === 0 ? (
        <p className="px-1 py-6 text-[14.5px] font-medium text-ink-subtle">No claims match — clear the search or filters.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r, i) => (
            <ClaimCard
              key={r.id}
              row={r}
              index={i}
              isAdmin={isAdmin}
              requestFields={requestFields}
              adminFields={adminFields}
              productOptions={productOptions}
              view={view}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── claim card ───────────────────────── */

function ClaimCard({
  row,
  index,
  isAdmin,
  requestFields,
  adminFields,
  productOptions,
  view,
}: {
  row: ModuleSubmissionRow;
  index: number;
  isAdmin: boolean;
  requestFields: FormFieldDef[];
  adminFields: FormFieldDef[];
  productOptions: string[];
  view: "active" | "archived";
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();

  const status = deriveStatus(row);
  const meta = STATUS_META[status];
  const amount = claimAmount(row);
  const headline = row.fields.expense_for || requestFields.map((f) => row.fields[f.key]).find((v) => v) || "Claim";
  const expenseHead = row.adminFields?.expense_head ?? "";
  const product = row.fields.product ?? "";
  const receipt = row.fields.bill_url ?? "";
  const expenseDate = row.fields.expense_date ?? "";
  const paidThrough = row.adminFields?.paid_through ?? "";

  const pairs = fieldPairs(visibleFields(requestFields, row.fields), row.fields);
  const adminPairs = fieldPairs(adminFields, row.adminFields);

  function decide(next: Status) {
    start(async () => {
      const res = await decideModule({ id: row.id, status: next });
      fireToast(
        res.ok
          ? { message: next === "approved" ? "Approved." : next === "rejected" ? "Rejected." : "Reopened.", type: next === "rejected" ? "info" : "success" }
          : { message: res.error, type: "error" },
      );
    });
  }

  return (
    <li
      className="wg-rise relative overflow-hidden rounded-2xl bg-surface-card"
      style={{
        boxShadow: "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -22px rgba(15,23,42,0.35)",
        animationDelay: `${Math.min(index, 8) * 45}ms`,
      }}
    >
      {/* status stripe */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[4px]" style={{ background: meta.stripe }} />

      <div className="flex flex-wrap items-start justify-between gap-3 py-4 pl-5 pr-4 max-md:pl-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {isAdmin && <EmployeeAvatar name={row.employeeName} size="md" className="mt-0.5" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words text-[15.5px] font-bold text-ink-strong">{headline}</span>
              <span
                className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
                style={{ background: meta.bg, color: meta.fg }}
              >
                {meta.label}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-ink-subtle">
              {isAdmin ? `${row.employeeName} · ` : ""}Submitted {formatDate(row.createdAt)}
              {paidThrough ? (
                <span className="inline-flex items-center gap-1 pl-1.5" style={{ color: GREEN_DEEP }}>
                  <Wallet size={12} strokeWidth={2.4} /> {paidThrough}
                </span>
              ) : null}
            </p>
            {/* chips: category · product · expense date · receipt */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {expenseHead && (
                <span className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "rgba(124,58,237,0.10)", color: "#5b21b6" }}>
                  <Tag size={11} strokeWidth={2.6} /> {expenseHead}
                </span>
              )}
              {product && (
                <span className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-ink-soft" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
                  {product}
                </span>
              )}
              {expenseDate && (
                <span className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-ink-soft tabular-nums" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
                  <CalendarDays size={11} strokeWidth={2.6} /> {expenseDate}
                </span>
              )}
              {receipt && (
                <a
                  href={receiptHref(receipt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold transition-colors hover:text-white"
                  style={{ background: `color-mix(in srgb, ${GREEN} 11%, transparent)`, color: GREEN_DEEP }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = GREEN; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${GREEN} 11%, transparent)`; }}
                >
                  <Paperclip size={11} strokeWidth={2.6} /> Receipt
                </a>
              )}
            </div>
          </div>
        </div>

        {/* amount + actions */}
        <div className="flex items-center gap-3 max-md:w-full max-md:justify-between">
          <div className="text-right">
            <div
              className="tabular-nums text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 22,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {formatInr(amount)}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">claimed</div>
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin && row.status !== "approved" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("approved")}
                className="brand-btn wg-btn rounded-pill px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                  boxShadow: `0 8px 20px -12px color-mix(in srgb, ${GREEN_DEEP} 75%, transparent)`,
                }}
              >
                Approve
              </button>
            )}
            {isAdmin && row.status !== "rejected" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("rejected")}
                className="wg-btn rounded-pill px-3.5 py-2 text-[13px] font-bold disabled:opacity-50"
                style={{ background: "rgba(225,6,0,0.08)", color: "#A80400", boxShadow: "inset 0 0 0 1px rgba(225,6,0,0.25)" }}
              >
                Reject
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-pill px-2.5 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Details
            </button>
            {isAdmin && <CardMenu row={row} view={view} />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-5 py-4 max-md:px-4" style={{ borderColor: "var(--color-hairline)" }}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 max-md:grid-cols-1">
            {pairs.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</dt>
                <dd className="mt-0.5 break-words text-[14.5px] font-medium text-ink-strong">{value}</dd>
              </div>
            ))}
          </dl>
          {!isAdmin && adminPairs.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 max-md:grid-cols-1" style={{ borderColor: "var(--color-hairline)" }}>
              {adminPairs.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: GREEN_DEEP }}>{label}</dt>
                  <dd className="mt-0.5 break-words text-[14.5px] font-medium text-ink-strong">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {isAdmin && adminFields.length > 0 && (
            <AdminPanel row={row} adminFields={adminFields} productOptions={productOptions} />
          )}
        </div>
      )}
    </li>
  );
}

/* ───────────────────── admin response panel ───────────────────── */

function AdminPanel({ row, adminFields, productOptions }: { row: ModuleSubmissionRow; adminFields: FormFieldDef[]; productOptions: string[] }) {
  const [values, setValues] = useState<Record<string, string>>(row.adminFields ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setValue = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));
  const visible = visibleFields(adminFields, values);

  function save() {
    setError(null);
    start(async () => {
      const res = await setModuleAdminFields({ id: row.id, adminFields: values });
      if (!res.ok) { setError(res.error); return; }
      fireToast({ message: "Saved." });
    });
  }

  return (
    <div
      className="mt-4 rounded-xl p-4"
      style={{
        border: "1px dashed var(--color-hairline-strong)",
        background: `color-mix(in srgb, ${GREEN} 3%, transparent)`,
      }}
    >
      <p className="mb-3 text-[11.5px] font-black uppercase tracking-[0.08em]" style={{ color: GREEN_DEEP }}>
        Admin · Payment response
      </p>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {visible.map((f) => (
          <Field key={f.key} label={f.label} required={f.required}>
            <FieldInput field={f} value={values[f.key] ?? ""} onChange={setValue} productOptions={productOptions} isAdmin />
          </Field>
        ))}
      </div>
      {error && (
        <div role="alert" className="mt-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] font-medium text-[#A80400]">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="brand-btn wg-btn mt-3 inline-flex items-center gap-1.5 rounded-pill px-4.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        style={{
          background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
          boxShadow: `0 8px 20px -12px color-mix(in srgb, ${GREEN_DEEP} 75%, transparent)`,
        }}
      >
        <Check size={14} strokeWidth={2.8} /> {pending ? "Saving…" : "Save Response"}
      </button>
    </div>
  );
}

/* ───────────────────── archive / delete menu ───────────────────── */

function CardMenu({ row, view }: { row: ModuleSubmissionRow; view: "active" | "archived" }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function archive(next: boolean) {
    setOpen(false);
    start(async () => {
      const res = await setModuleArchived({ id: row.id, archived: next });
      fireToast(res.ok ? { message: next ? "Archived." : "Restored.", type: "success" } : { message: res.error, type: "error" });
    });
  }
  function remove() {
    setOpen(false);
    if (!confirm("Delete this claim permanently?")) return;
    start(async () => {
      const res = await deleteModuleSubmission({ id: row.id });
      fireToast(res.ok ? { message: "Deleted.", type: "success" } : { message: res.error, type: "error" });
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="inline-flex size-9 items-center justify-center rounded-pill text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-30 mt-1 min-w-[168px] rounded-xl bg-white p-1.5"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 16px 36px -12px rgba(15,23,42,0.25)" }}
          >
            {view === "archived" ? (
              <button type="button" onClick={() => archive(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold text-ink-strong hover:bg-surface-soft">
                <ArchiveRestore size={15} /> Restore
              </button>
            ) : (
              <button type="button" onClick={() => archive(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold text-ink-strong hover:bg-surface-soft">
                <Archive size={15} /> Archive
              </button>
            )}
            <button type="button" onClick={remove} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold text-[#A80400] hover:bg-[#FEF2F2]">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
