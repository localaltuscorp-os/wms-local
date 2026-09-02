"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Search, X, Eye, Download, Mail, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { compareRows, type FilledFormSortKey } from "@/lib/hr/forms/sort";

/**
 * The one compact table behind BOTH filled-forms surfaces — the employee's
 * "My Filled Forms" and HR's "All Filled Forms". Same component, same actions,
 * one `variant` switch for the employee column and the toolbar's breadth.
 *
 * Built as a table rather than the cards the spec warned against: these lists
 * exist to be scanned and compared ("what's still a draft?", "who filed an exit
 * interview last week?"), and columns are what make rows comparable. Sharing one
 * component also means View / Download / Mail can never behave differently
 * depending on which page you reached them from.
 *
 * Rows arrive PRE-FORMATTED from the server — dates already rendered, section
 * labels already resolved — so this component holds no date or registry logic
 * and the two pages can't drift in how they present the same row.
 */

export type FilledFormStatus = "draft" | "submitted";

export interface FilledFormRow {
  id: string;
  formKey: string;
  formName: string;
  /** Stored stage key — the filter value. */
  section: string;
  /** Human label for `section`, resolved server-side via the registry. */
  sectionLabel: string;
  /** Present only on the HR surface. */
  employeeName?: string;
  /** Pre-formatted, e.g. "11 AUG 2026". Empty for a never-submitted draft. */
  submittedOn: string;
  /** Sortable timestamp (ms). 0 when unsubmitted, so drafts sink under Newest. */
  submittedTs: number;
  status: FilledFormStatus;
}

/** Ordering lives in lib/hr/forms/sort.ts — pure, so it can be tested directly. */
type SortKey = FilledFormSortKey;

const ALL = "__all__";

const STATUS_META: Record<FilledFormStatus, { label: string; color: string; bg: string }> = {
  submitted: {
    label: "Submitted",
    color: "#15803d",
    bg: "color-mix(in srgb, var(--color-green) 15%, transparent)",
  },
  draft: {
    label: "Draft",
    color: "#b45309",
    bg: "color-mix(in srgb, var(--color-amber) 16%, transparent)",
  },
};

/** Same compact control language the Goals toolbars use (see ViewingSelect):
 *  `unstyled` hands the whole look to this string instead of the default
 *  gdd-trigger, which is too heavy for a filter row. */
const FIELD = [
  "h-9 w-[160px] cursor-pointer rounded-lg border border-hairline-strong bg-surface-card px-3",
  "text-[13px] font-semibold text-ink-strong transition-colors",
  "hover:border-[color-mix(in_srgb,var(--color-altus-red)_35%,var(--color-hairline-strong))]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40",
  "max-md:w-full",
].join(" ");

export function FilledFormsTable({
  rows,
  variant,
  hideStatusFilter = false,
  emptyTitle,
  emptyBody,
}: {
  rows: FilledFormRow[];
  /** "mine" hides the Employee column and its filters; "all" is the HR list. */
  variant: "mine" | "all";
  /** Set when the PAGE already owns the submitted/draft split (My Filled Forms
   *  uses tabs), so the toolbar doesn't offer a second, contradictory control. */
  hideStatusFilter?: boolean;
  /** Override the "nothing here" copy. A page that splits its own rows into tabs
   *  knows which slice is empty and why; this component only sees an empty array. */
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [section, setSection] = React.useState(ALL);
  const [form, setForm] = React.useState(ALL);
  const [status, setStatus] = React.useState<FilledFormStatus | typeof ALL>(ALL);
  const [sort, setSort] = React.useState<SortKey>("newest");

  const showEmployee = variant === "all";

  // Filter vocabularies come from the rows themselves, so an option can never
  // point at something that isn't in the list.
  const sections = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.section, r.sectionLabel);
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [rows]);

  const forms = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.formKey, r.formName);
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [rows]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (section !== ALL && r.section !== section) return false;
      if (form !== ALL && r.formKey !== form) return false;
      if (status !== ALL && r.status !== status) return false;
      if (q) {
        const hay = `${r.formName} ${r.employeeName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return out.sort(compareRows(sort));
  }, [rows, query, section, form, status, sort]);

  const filtersActive = query.trim() !== "" || section !== ALL || form !== ALL || status !== ALL;
  function clearFilters() {
    setQuery("");
    setSection(ALL);
    setForm(ALL);
    setStatus(ALL);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={showEmployee ? "Search employee or form…" : "Search form…"}
            aria-label={showEmployee ? "Search employee or form" : "Search form"}
            className="h-9 w-[230px] rounded-lg border border-hairline-strong bg-surface-card pl-8 pr-7 text-[13px] font-medium text-ink-strong outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40 max-md:w-full"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle transition-colors hover:text-ink-strong"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          )}
        </label>

        <Select
          value={section}
          onValueChange={setSection}
          ariaLabel="Filter by HR section"
          unstyled
          className={FIELD}
          options={[{ value: ALL, label: "All sections" }, ...sections]}
        />
        <Select
          value={form}
          onValueChange={setForm}
          ariaLabel="Filter by form"
          searchable={forms.length > 8}
          unstyled
          className={FIELD}
          options={[{ value: ALL, label: "All forms" }, ...forms]}
        />
        {!hideStatusFilter && (
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as FilledFormStatus | typeof ALL)}
            ariaLabel="Filter by status"
            unstyled
            className={FIELD}
            options={[
              { value: ALL, label: "All statuses" },
              { value: "submitted", label: "Submitted" },
              { value: "draft", label: "Draft" },
            ]}
          />
        )}
        <Select
          value={sort}
          onValueChange={(v) => setSort(v as SortKey)}
          ariaLabel="Sort submissions"
          unstyled
          className={FIELD}
          options={[
            { value: "newest", label: "Sort: Newest" },
            { value: "oldest", label: "Sort: Oldest" },
            ...(showEmployee ? [{ value: "employee", label: "Sort: Employee name" }] : []),
          ]}
        />
      </div>

      {filtersActive && (
        <div className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-subtle">
          <span>
            Showing <span className="font-bold tabular-nums text-ink-strong">{visible.length}</span> of{" "}
            <span className="tabular-nums">{rows.length}</span>
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="font-bold text-altus-red underline underline-offset-2 transition-opacity hover:opacity-75"
          >
            Reset
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={
            emptyTitle ??
            (showEmployee ? "No forms have been submitted yet." : "You haven't filled any forms yet.")
          }
          body={
            emptyBody ??
            (showEmployee
              ? "Submissions appear here as soon as employees submit their HR forms."
              : "Once you fill and submit an HR form, it will appear here with options to view, download or mail it.")
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No submissions match these filters."
          body="Try a different section, form or status — or reset to see everything."
          action={
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 inline-flex items-center rounded-lg border border-hairline-strong px-3 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                {showEmployee && <Th className="pl-4">Employee</Th>}
                <Th className={showEmployee ? "" : "pl-4"}>Form</Th>
                <Th className="max-md:hidden">{showEmployee ? "HR Section" : "Section"}</Th>
                <Th className="max-sm:hidden">Submitted On</Th>
                <Th>Status</Th>
                <Th className="pr-4 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <Row key={r.id} row={r} showEmployee={showEmployee} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Row({ row, showEmployee }: { row: FilledFormRow; showEmployee: boolean }) {
  // Fall back rather than trust the type: `status` is a plain text column, and a
  // single unexpected value used to read `.color` off `undefined` and blank the
  // entire table for everyone. The 0182 CHECK constraint makes that unreachable
  // from the database side; this is the cheap belt to its braces.
  const st = STATUS_META[row.status] ?? STATUS_META.draft;
  return (
    <tr className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface-soft">
      {showEmployee && (
        <td className="py-2.5 pl-4 pr-3 text-[13.5px] font-bold text-ink-strong">
          {row.employeeName || "—"}
        </td>
      )}
      <td className={`py-2.5 pr-3 text-[13.5px] font-semibold text-ink-strong ${showEmployee ? "" : "pl-4"}`}>
        {row.formName}
      </td>
      <td className="py-2.5 pr-3 text-[12.5px] text-ink-subtle max-md:hidden">{row.sectionLabel}</td>
      <td className="py-2.5 pr-3 text-[12.5px] tabular-nums text-ink-subtle max-sm:hidden">
        {row.submittedOn || "—"}
      </td>
      <td className="py-2.5 pr-3">
        <span
          className="inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold"
          style={{ color: st.color, background: st.bg }}
        >
          {st.label}
        </span>
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center justify-end gap-1">
          <ActionLink href={`/hr/forms/${row.id}` as Route} label="View" icon={<Eye size={13} strokeWidth={2.4} />} />
          <ActionAnchor
            href={`/api/hr/forms/${row.id}/pdf`}
            label="Download"
            icon={<Download size={13} strokeWidth={2.4} />}
          />
          <MailButton id={row.id} />
        </div>
      </td>
    </tr>
  );
}

const ACTION_CLS =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:bg-surface-card hover:text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40";

function ActionLink({ href, label, icon }: { href: Route; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className={ACTION_CLS} title={label}>
      {icon}
      <span className="max-lg:sr-only">{label}</span>
    </Link>
  );
}

/** A plain anchor, not next/link: the PDF route streams a file download rather
 *  than navigating to a page, so client-side routing must not intercept it. */
function ActionAnchor({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a href={href} className={ACTION_CLS} title={label}>
      {icon}
      <span className="max-lg:sr-only">{label}</span>
    </a>
  );
}

function MailButton({ id }: { id: string }) {
  const [sending, setSending] = React.useState(false);

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/hr/forms/${id}/email`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
      if (!res.ok) {
        fireToast({ message: body.error ?? "Couldn't send the form.", type: "error" });
        return;
      }
      fireToast({ message: body.to ? `Sent to ${body.to}.` : "Form sent." });
    } catch {
      fireToast({ message: "Couldn't send the form. Check your connection.", type: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <button type="button" onClick={send} disabled={sending} className={ACTION_CLS} title="Mail">
      {sending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} strokeWidth={2.4} />}
      <span className="max-lg:sr-only">Mail</span>
    </button>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`py-2 pr-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle ${className}`}
    >
      {children}
    </th>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-card px-6 py-12 text-center">
      <p className="text-[14px] font-bold text-ink-strong">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] text-ink-muted">{body}</p>
      {action}
    </div>
  );
}
