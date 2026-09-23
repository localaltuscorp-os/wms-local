"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  Search,
  ChevronDown,
  ChevronUp,
  Archive,
  ArchiveRestore,
  Trash2,
  Check,
  X,
  Paperclip,
  Link2 as LinkIcon,
  Tag,
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
import {
  CLAIM_FILTER_LABELS,
  claimAmount,
  deriveStatus,
  matchesFilter,
  type DerivedClaimStatus,
} from "@/lib/reimbursements/claim-status";
import {
  CLAIM_STATUS_CARD,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_STRIPE,
} from "@/lib/reimbursements/claim-kpis";
import { statusCardTokens } from "@/lib/status-palette";
import { canChangeClaimDocuments } from "@/lib/reimbursements/claim-access";
import { legacyBillKind } from "@/lib/reimbursements/attachment-rules";
import { useClaimFilter } from "./rb-filter-context";
import { RbClaimAttachments } from "./rb-claim-attachments";
import type { ModuleSubmissionRow } from "@/lib/queries/modules";
import { formatDate, formatInr, formatCount } from "@/lib/format";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Select } from "@/components/ui/select";
import { Field, FieldInput } from "@/components/forms/form-fields";

// Status + amount rules live in lib/reimbursements/claim-status.ts, shared with
// the KPI strip so a card's total and the list it filters to cannot disagree.
type Status = "pending" | "approved" | "rejected";
type DerivedStatus = DerivedClaimStatus;
type SortKey = "newest" | "oldest" | "amount-desc" | "amount-asc";

/**
 * A row's status badge and stripe, from the SAME palette map the key cards
 * above are painted with (`lib/reimbursements/claim-kpis.ts`).
 *
 * This replaced a local table of raw hexes sitting beside a local
 * `const GREEN = "#16a34a"` — a second private copy of the module's palette,
 * which is precisely how a "Paid" badge and the "Paid" card above it come to be
 * different greens. That table also gave Approved and Paid the SAME green; they
 * are deliberately different now, because "we said yes" and "the money left"
 * are different facts, and the strip above draws them as different cards.
 */
function statusBadge(status: DerivedStatus) {
  const t = statusCardTokens(CLAIM_STATUS_CARD[status]);
  return {
    label: CLAIM_STATUS_LABEL[status],
    badge: t.badge,
    stripe: CLAIM_STATUS_STRIPE[status],
  };
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "amount-desc", label: "Amount · High → Low" },
  { value: "amount-asc", label: "Amount · Low → High" },
];

/**
 * An external bill LINK, ready for an anchor.
 *
 * Only ever called for a value `legacyBillKind` classified as "url". It used to
 * be called for everything, which turned a mobile upload's storage path into
 * "https://<employee-uuid>/bill.jpg" — a dead link on every claim the Android
 * app had filed. Storage paths now go through the Documents section instead,
 * which signs them.
 */
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
  attachmentCounts,
  myEmployeeId,
  headerActions,
}: {
  rows: ModuleSubmissionRow[];
  isAdmin: boolean;
  requestFields: FormFieldDef[];
  adminFields: FormFieldDef[];
  productOptions: string[];
  view: "active" | "archived";
  /** submissionId → document count, from the page's single grouped query. */
  attachmentCounts: Record<string, number>;
  /** The viewer, so a card knows whether the claim is theirs to change. */
  myEmployeeId: string;
  /** Server-rendered view controls that belong beside the list toolbar. */
  headerActions?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  // SHARED with the KPI strip above (rb-filter-context), so a KPI card and the
  // toolbar chips drive the same one filter rather than two that can disagree.
  const { filter: statusFilter, setFilter: setStatusFilter } = useClaimFilter();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => matchesFilter(r, statusFilter));
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
          style={{ background: `color-mix(in srgb, var(--module-accent) 10%, transparent)`, color: "var(--module-accent-deep)" }}
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

  return (
    <div>
      {/* ── Toolbar: search · sort · the active filter ──
          THE STATUS CHIPS ARE GONE. There were two filter controls stacked on
          top of each other — five key cards and, immediately below them, five
          chips driving the same state. Clicking either moved both, which is
          not a feature: it is one control drawn twice, costing a row of
          vertical space and making people wonder which one is authoritative.
          The cards won; they carry the money as well as the count. What the
          chips did that the cards cannot — SAY which filter is on, and clear
          it in one click — is the pill on the right. */}
      <div
        className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3"
      >
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--color-altus-red)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-altus-red)_12%,transparent)] text-[var(--color-altus-red)]">
            <Wallet size={18} strokeWidth={2.4} aria-hidden />
          </span>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Claims</h2>
        </div>
        <label className="relative min-w-[220px] flex-1 max-w-[420px]">
          <span className="sr-only">Search claims</span>
          <Search size={15} strokeWidth={2.4} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Local search - claims, person, head, amount" title="Local search - filters only the list on this page" aria-label="Local search - claims - expense, person, head, amount - this page only"
            className="w-full rounded-lg border border-hairline bg-surface-card py-2 pl-9 pr-4 text-[13px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-[color-mix(in_srgb,var(--color-altus-red)_60%,transparent)]"
          />
        </label>

        {/* THE COUNT LINE LIVES IN THE BAR NOW. The search rests as a 36px
            magnifier (CollapsibleSearch — the same one 40 toolbars use), so
            with the chip row gone this was a wide empty strip with a sort box
            at the end of it. What was floating underneath as loose text is the
            natural thing to put there: what you are looking at, and what it
            adds up to. */}
        <p
          className="text-[12.5px] font-bold text-ink-subtle max-sm:w-full"
          aria-live="polite"
        >
          {formatCount(shown.length)} {shown.length === 1 ? "claim" : "claims"}
          <span className="tabular-nums" style={{ color: "var(--module-accent-deep)" }}>
            {" "}
            · {formatInr(shownTotal)}
          </span>
          {statusFilter !== "all" ? ` · ${CLAIM_FILTER_LABELS[statusFilter].toLowerCase()}` : ""}
          {query.trim() ? " · matching your search" : ""}
        </p>

        <div className="ml-auto flex items-center gap-2 max-sm:ml-0 max-sm:w-full">
          {statusFilter !== "all" && (
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="wg-btn inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #334155, #1e293b)" }}
              title="Clear the filter and show every claim"
            >
              {CLAIM_FILTER_LABELS[statusFilter]}
              <X size={13} strokeWidth={3} aria-hidden />
              <span className="sr-only">— clear this filter</span>
            </button>
          )}
          <div className="min-w-[190px] max-sm:flex-1">
            <Select
              options={SORT_OPTIONS}
              value={sort}
              onValueChange={(v) => setSort(v as SortKey)}
              ariaLabel="Sort claims"
              searchable={false}
            />
          </div>
          {headerActions}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-1 py-6 text-[14.5px] font-medium text-ink-subtle">No claims match - clear the search or filters.</p>
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
              attachmentCount={attachmentCounts[r.id] ?? 0}
              myEmployeeId={myEmployeeId}
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
  attachmentCount,
  myEmployeeId,
}: {
  row: ModuleSubmissionRow;
  index: number;
  isAdmin: boolean;
  requestFields: FormFieldDef[];
  adminFields: FormFieldDef[];
  productOptions: string[];
  view: "active" | "archived";
  attachmentCount: number;
  myEmployeeId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();

  const status = deriveStatus(row);
  const meta = statusBadge(status);
  const amount = claimAmount(row);
  const headline = row.fields.expense_for || requestFields.map((f) => row.fields[f.key]).find((v) => v) || "Claim";
  const expenseHead = row.adminFields?.expense_head ?? "";
  const product = row.fields.product ?? "";
  const receipt = row.fields.bill_url ?? "";
  // Two shapes in the wild: an external link (old web form) or a private
  // storage path (Android app). Only the former can be an anchor.
  const receiptKind = legacyBillKind(receipt);
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
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[4px] ${meta.stripe}`} />

      <div className="grid gap-4 py-4 pl-5 pr-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center max-md:pl-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {isAdmin && <EmployeeAvatar name={row.employeeName} size="md" className="mt-0.5" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words text-[15.5px] font-bold text-ink-strong">{headline}</span>
              <span
                className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${meta.badge}`}
              >
                {meta.label}
              </span>
            </div>
            {/* THE META LINE IS THE TWO DATES AND THE PERSON, nothing else.
                It used to end with the payment method floating in accent green
                with a wallet icon and no label — "98207 GPay" hanging off a
                sentence about when the claim was submitted, reading like a
                stray phone number. That is a fact about the PAYMENT, so it is a
                labelled chip below with the rest of the facts. The spend date
                came up from the chip row in exchange: a date belongs beside the
                other date, not in a pill between a category and a file count. */}
            <p className="mt-1 text-[13px] font-medium text-ink-subtle">
              {isAdmin ? `${row.employeeName} · ` : ""}
              Submitted {formatDate(row.createdAt)}
              {expenseDate ? ` · Spent ${formatDate(expenseDate)}` : ""}
            </p>
            {/* chips: category · product · paid via · documents · receipt */}
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
              {/* HOW IT WAS SETTLED — labelled, so the value reads as a
                  payment method rather than as a loose number. */}
              {paidThrough && (
                <span
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
                  style={{
                    background: "color-mix(in srgb, var(--module-accent) 11%, transparent)",
                    color: "var(--module-accent-deep)",
                  }}
                  title="How this claim was paid out"
                >
                  <Wallet size={11} strokeWidth={2.6} /> Paid via {paidThrough}
                </span>
              )}
              {/* UPLOADED DOCUMENTS — the count only; the files themselves (and
                  their signed URLs) load when Details is opened. */}
              {attachmentCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
                  style={{ background: `color-mix(in srgb, var(--module-accent) 11%, transparent)`, color: "var(--module-accent-deep)" }}
                  title="Open Details to view the attached documents"
                >
                  <Paperclip size={11} strokeWidth={2.6} />
                  {attachmentCount} {attachmentCount === 1 ? "document" : "documents"}
                </span>
              )}
              {/* LEGACY EXTERNAL LINK — claims filed through the old web form,
                  which asked for a Drive URL. Labelled "link" so it is
                  distinguishable from a document the firm actually holds. A
                  mobile-filed bill is a STORAGE PATH, not a URL, so it is not
                  rendered here — it appears under Documents, signed. */}
              {receiptKind === "url" && (
                <a
                  href={receiptHref(receipt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                  title="External receipt link filed with this claim"
                >
                  <LinkIcon size={11} strokeWidth={2.6} /> Receipt link
                </a>
              )}
            </div>
          </div>
        </div>

        {/* AMOUNT + ACTIONS, ON A FIXED MEASURE.
            A pending row carries Approve AND Reject; a decided row carries only
            one of them. With the block sized to its contents that difference
            shoved the ₹ column left and right by ~90px from row to row, so the
            one number a reader scans down the list never lined up. The actions
            reserve a constant width — 320px, measured off the widest case
            (Approve + Reject + Details + menu = 317px) — and the amount sits in
            a fixed column, so both edges hold still whatever buttons a row
            happens to show. Below `lg` the reserve is dropped: there the row
            wraps anyway and holding 320px open would only squeeze the title. */}
        <div className="flex items-center justify-end gap-3 max-md:w-full max-md:justify-between">
          <div className="w-[104px] shrink-0 text-right max-md:w-auto">
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
          {/* APPROVE AND REJECT MUST NOT LOOK ALIKE — and they did.
              Approve carried `.brand-btn`, which sets background, colour AND
              border with `!important` (globals.css). That beat the inline green
              gradient and the `text-white` beside it, so Approve rendered as a
              pale red pill — the same pale red as Reject, immediately to its
              right. Two opposite, irreversible decisions, one appearance.
              `.brand-btn` is gone from it; the affirmative action is the only
              solid button in the row, and Reject stays quiet until wanted. */}
          <div className="flex min-w-[320px] items-center justify-end gap-1.5 max-lg:min-w-0">
            {isAdmin && row.status !== "approved" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("approved")}
                title={`Approve this claim for ${formatInr(amount)}`}
                className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #059669, #047857)",
                  boxShadow: "0 8px 20px -12px rgba(4,120,87,0.6)",
                }}
              >
                <Check size={14} strokeWidth={3} aria-hidden />
                Approve
              </button>
            )}
            {isAdmin && row.status !== "rejected" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("rejected")}
                title="Reject this claim"
                className="wg-btn inline-flex items-center gap-1.5 rounded-pill border border-rose-200 bg-rose-50 px-3.5 py-2 text-[13px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
              >
                <X size={14} strokeWidth={3} aria-hidden />
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
            {isAdmin && <CardActions row={row} view={view} />}
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
                  <dt className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--module-accent-deep)" }}>{label}</dt>
                  <dd className="mt-0.5 break-words text-[14.5px] font-medium text-ink-strong">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {/* DOCUMENTS. Only the claimant may change them, and only while the
              claim is still pending — a receipt swapped after a verdict would
              change the evidence behind a decision already taken. The server
              enforces both; this only decides whether the controls are shown. */}
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-hairline)" }}>
            <RbClaimAttachments
              submissionId={row.id}
              count={attachmentCount}
              // The SAME predicate the server enforces, so the controls appear
              // exactly when the action would accept them. This only decides
              // what is SHOWN — the server refuses regardless.
              canEdit={canChangeClaimDocuments(row, { id: myEmployeeId })}
            />
          </div>
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
        background: `color-mix(in srgb, var(--module-accent) 3%, transparent)`,
      }}
    >
      <p className="mb-3 text-[11.5px] font-black uppercase tracking-[0.08em]" style={{ color: "var(--module-accent-deep)" }}>
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
        /* Same `.brand-btn` trap as Approve above: the class wins on
           background AND colour with `!important`, so the inline gradient and
           `text-white` here were dead weight. Dropped — this is the admin
           response form's own save, not the page's primary action, and the
           soft accent fill `.brand-btn` gives it is the right weight for it. */
        className="brand-btn wg-btn mt-3 inline-flex items-center gap-1.5 rounded-pill px-4.5 py-2 text-[13px] font-bold disabled:opacity-50"
      >
        <Check size={14} strokeWidth={2.8} /> {pending ? "Saving…" : "Save Response"}
      </button>
    </div>
  );
}

/* ───────────────────── archive / delete menu ───────────────────── */

/**
 * THE ROW'S OWN ACTIONS — no dropdown.
 *
 * This was a "⋯" button that opened a menu containing exactly one thing you
 * would ever want on an active claim: Archive. A menu whose only useful item is
 * one click deep is a click tax, and "⋯" tells you nothing about what is behind
 * it. The archive control sits directly in the row now, in the slot the dots
 * used to occupy.
 *
 * DELETE MOVED RATHER THAN VANISHED. It used to sit in that same menu on every
 * row, one slip away from destroying a claim someone had filed. It now appears
 * only in the Archived view, so the destructive step follows the reversible one
 * — archive first, then delete from the archive if you really mean it.
 */
function CardActions({ row, view }: { row: ModuleSubmissionRow; view: "active" | "archived" }) {
  const [pending, start] = useTransition();

  function archive(next: boolean) {
    start(async () => {
      const res = await setModuleArchived({ id: row.id, archived: next });
      fireToast(
        res.ok
          ? { message: next ? "Archived." : "Restored.", type: "success" }
          : { message: res.error, type: "error" },
      );
    });
  }

  function remove() {
    if (!confirm("Delete this claim permanently? This cannot be undone.")) return;
    start(async () => {
      const res = await deleteModuleSubmission({ id: row.id });
      fireToast(res.ok ? { message: "Deleted.", type: "error" } : { message: res.error, type: "error" });
    });
  }

  const iconBtn =
    "inline-flex size-9 items-center justify-center rounded-pill transition-colors disabled:opacity-50";

  if (view === "archived") {
    return (
      <>
        <button
          type="button"
          disabled={pending}
          onClick={() => archive(false)}
          aria-label="Restore this claim"
          title="Restore to the active list"
          className={`${iconBtn} text-ink-soft hover:bg-surface-soft hover:text-ink-strong`}
        >
          <ArchiveRestore size={16} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          aria-label="Delete this claim permanently"
          title="Delete permanently"
          className={`${iconBtn} text-rose-600 hover:bg-rose-50`}
        >
          <Trash2 size={16} strokeWidth={2.2} />
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => archive(true)}
      aria-label="Archive this claim"
      title="Archive — it moves to the Archived tab and can be restored"
      className={`${iconBtn} text-ink-soft hover:bg-surface-soft hover:text-ink-strong`}
    >
      <Archive size={16} strokeWidth={2.2} />
    </button>
  );
}
