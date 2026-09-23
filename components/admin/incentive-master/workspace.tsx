"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Check,
  History,
  Loader2,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatInr } from "@/lib/format";
import type { ProductOption } from "@/lib/queries/products";
import type { IncentiveEligibilityView } from "@/lib/queries/incentive-master";
import {
  INCENTIVE_APPLICABILITIES,
  INCENTIVE_APPLICABILITY_LABELS,
  INCENTIVE_DURATIONS,
  INCENTIVE_TYPE_OPTIONS,
  MAX_ELIGIBILITY_BATCH,
  eligibilityChangeError,
  filterCandidates,
  formatIncentiveDate,
  incentiveDurationLabel,
  incentiveMasterErrors,
  mayBecomeEligible,
  type CandidateRow,
  type CandidateScope,
  type IncentiveApplicability,
  type IncentiveDuration,
} from "@/lib/incentive/master";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import {
  addIncentiveEligibility,
  deleteIncentive,
  incentiveDeleteImpact,
  loadIncentiveWorkspace,
  removeIncentiveEligibility,
  saveIncentive,
} from "@/app/(admin)/admin/incentive-master/actions";
import type { IncentiveType } from "@/db/enums";

/**
 * THE INCENTIVE WORKSPACE — one incentive's details, and its Incentive Chart.
 *
 * Presentation follows the Aura liquid-glass language (see
 * ../employee-master/aura.css, which carries every token and is scoped to
 * `.aura` so none of it reaches the rest of the application). The stylesheet is
 * imported, not copied: Employee Master and Billing Master use the same file,
 * and a second copy is how the three drift apart.
 *
 * The admin LIST behind this overlay stays in the ordinary WMS admin design,
 * exactly as Billing Master does — the brief asks not to redesign unrelated
 * Admin Panel sections, and the full-screen workspace is the one surface where
 * this language already lives.
 *
 * ── TWO AUTHORITIES ON ONE SCREEN ──────────────────────────────────────────
 * `canEdit` governs the incentive's own fields. `canManageChart` governs
 * eligibility and only Manan holds it. So an admin can land here, correct an
 * amount, and find the Add / Remove controls disabled with a reason — rather
 * than pressing a button that fails. Both are re-asked from the server when
 * this opens (`loadIncentiveWorkspace`), and both are checked again by every
 * action regardless: hiding a control is presentation, never authorization.
 */

import "../employee-master/aura.css";

type SectionKey = "details" | "eligibility" | "history";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "details", label: "Incentive details" },
  { key: "eligibility", label: "Eligible employees" },
  { key: "history", label: "Eligibility history" },
];

interface Draft {
  name: string;
  description: string;
  amount: string;
  incentiveType: IncentiveType | "";
  productId: string;
  duration: IncentiveDuration;
  validUntil: string;
  /** Who this applies to (0244) — the three-way choice. */
  applicability: IncentiveApplicability;
  /** The functions a FUNCTION-scoped scheme covers. */
  functionIds: string[];
  notes: string;
  active: boolean;
}

function draftOf(v: IncentiveEligibilityView): Draft {
  const r = v.incentive;
  return {
    name: r.name,
    description: r.description ?? "",
    amount: String(r.amount),
    incentiveType: r.incentiveType ?? "",
    productId: r.productId ?? "",
    duration: r.duration,
    validUntil: r.validUntil ?? "",
    applicability: r.applicability,
    functionIds: [...r.functionIds],
    notes: r.notes ?? "",
    active: r.active,
  };
}

export function IncentiveWorkspace({
  catalogId,
  products,
  canEdit,
  canManageChart,
  today,
  onClose,
  onChanged,
  onDeleted,
}: {
  catalogId: string;
  products: ProductOption[];
  canEdit: boolean;
  canManageChart: boolean;
  today: string;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [view, setView] = React.useState<IncentiveEligibilityView | null>(null);
  const [mayManage, setMayManage] = React.useState(canManageChart);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<SectionKey>("details");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  /**
   * Re-read the incentive from the server.
   *
   * `keepDraft` is for a reload triggered by an ELIGIBILITY change: eligibility
   * is saved immediately and separately, so the details half of the screen may
   * be holding unsaved edits that must survive the refresh.
   */
  const load = React.useCallback(
    async (keepDraft = false) => {
      const res = await loadIncentiveWorkspace(catalogId);
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setView(res.view);
      setMayManage(res.canManageChart);
      if (!keepDraft) setDraft(draftOf(res.view));
    },
    [catalogId],
  );

  // The initial read. Inlined rather than calling `load()` so the state is set
  // from an async callback with an unmount guard — closing the workspace while
  // the request is in flight must not set state on a gone component.
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await loadIncentiveWorkspace(catalogId);
      if (!alive) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setView(res.view);
      setMayManage(res.canManageChart);
      setDraft(draftOf(res.view));
    })();
    return () => {
      alive = false;
    };
  }, [catalogId]);

  const dirty = React.useMemo(() => {
    if (!view || !draft) return false;
    const base = draftOf(view);
    return (Object.keys(base) as (keyof Draft)[]).some((k) => base[k] !== draft[k]);
  }, [view, draft]);

  const requestClose = React.useCallback(() => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }, [dirty, onClose]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // A nested confirmation owns its own Escape — closing the workspace out
      // from under it would lose the dialog and the context together.
      if (e.key === "Escape" && !confirmDelete) requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose, confirmDelete]);

  /** Aura's sheen follows the pointer across a pane (§2 of the design language). */
  function trackSheen(e: React.PointerEvent<HTMLDivElement>) {
    const pane = (e.target as HTMLElement).closest<HTMLElement>(".glass.interactive");
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    pane.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    pane.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setMessage(null);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const issues = React.useMemo(
    () =>
      draft
        ? incentiveMasterErrors({
            name: draft.name,
            amount: draft.amount.trim() === "" ? 0 : Number(draft.amount),
            incentiveType: draft.incentiveType === "" ? null : draft.incentiveType,
            duration: draft.duration,
            validUntil: draft.validUntil === "" ? null : draft.validUntil,
            description: draft.description,
            notes: draft.notes,
          })
        : {},
    [draft],
  );
  const hasIssues = Object.keys(issues).length > 0;

  async function save() {
    if (!draft || !dirty || hasIssues) return;
    setSaving(true);
    setMessage(null);
    const res = await saveIncentive({
      id: catalogId,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      amount: draft.amount.trim() === "" ? 0 : Number(draft.amount),
      incentiveType: draft.incentiveType === "" ? null : draft.incentiveType,
      productId: draft.productId === "" ? null : draft.productId,
      duration: draft.duration,
      validUntil: draft.validUntil === "" ? null : draft.validUntil,
      applicability: draft.applicability,
      functionIds: draft.applicability === "FUNCTION" ? draft.functionIds : [],
      notes: draft.notes.trim() || null,
      active: draft.active,
    });
    setSaving(false);
    if (!res.ok) {
      setMessage({ tone: "bad", text: res.error });
      return;
    }
    setMessage({ tone: "ok", text: "Saved" });
    await load();
    onChanged();
  }

  // ── Mount guard ──────────────────────────────────────────────────────────
  //
  // Rendered into `document.body`: `position: fixed` resolves against the
  // nearest ancestor carrying a `transform`, `filter` or `contain`, and the
  // admin shell has one. Left in the tree this overlay lays out inside the
  // content column, offset by the sidebar and clipped at the bottom. Mounted
  // behind a flag so the first client render matches the server's, which has no
  // `document`.
  const [mounted, setMounted] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []); // the SSR guard above
  if (!mounted) return null;

  const r = view?.incentive;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-[3vh_3vw]"
      style={{ background: "rgba(8, 11, 26, 0.46)", backdropFilter: "blur(3px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Incentive"
    >
      <div
        data-incentive-workspace
        data-section={section}
        className="aura flex h-[94vh] w-[94vw] max-w-[1500px] flex-col overflow-hidden rounded-[20px]"
        style={{
          boxShadow: "0 60px 140px -40px rgba(8,11,26,0.7), 0 0 0 1px rgba(255,255,255,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={trackSheen}
      >
        {/* The field the glass refracts, and the grain that makes it read as
            material rather than white plastic. */}
        <div className="aura-field" aria-hidden>
          <div className="aura-blob b1" />
          <div className="aura-blob b2" />
          <div className="aura-blob b3" />
        </div>
        <div className="aura-grain" aria-hidden />

        {/* ── Sticky header ──────────────────────────────────────────────── */}
        <header className="chrome-bar z-[2] flex shrink-0 items-center gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            {!r || !draft ? (
              <div className="muted text-[14px]">{loadError ?? "Loading…"}</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="display truncate text-[23px] leading-none">
                    {draft.name || r.name}
                  </h2>
                  {r.onOffer ? (
                    <span className="pill state ok">On offer</span>
                  ) : r.expired && r.active ? (
                    <span className="pill state warn">Expired</span>
                  ) : (
                    <span className="pill state idle">Inactive</span>
                  )}
                  {!canEdit && <span className="pill state idle">View only</span>}
                </div>
                <div className="quiet mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                  <span>{formatInr(r.amount)}</span>
                  <span aria-hidden>·</span>
                  <span className="muted">{incentiveDurationLabel(r.duration)}</span>
                  {r.productName && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="muted">{r.productName}</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span className="muted">{r.eligibleLabel} eligible</span>
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {dirty && !message && <span className="pill state warn">Unsaved</span>}
            {message && (
              <span className={`pill state ${message.tone === "ok" ? "ok" : "hot"}`}>
                {message.text}
              </span>
            )}
            {canEdit && r && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="btn-quiet"
                style={{ color: "var(--accent)" }}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving || hasIssues}
                className="btn"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save Changes
              </button>
            )}
            <button type="button" onClick={requestClose} aria-label="Close" className="icon-btn">
              <X size={17} />
            </button>
          </div>
        </header>

        {/* ── Rail + body ────────────────────────────────────────────────── */}
        <div className="z-[2] flex min-h-0 flex-1">
          <nav className="chrome-rail scroll w-[22%] min-w-[184px] max-w-[248px] shrink-0 overflow-y-auto px-3 py-4 max-md:hidden">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-current={section === s.key}
                onClick={() => setSection(s.key)}
                data-section-tab={s.key}
                className="nav-item"
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="md:hidden">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as SectionKey)}
              aria-label="Section"
              className="ctl m-3 w-auto"
            >
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <main className="scroll min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {!view || !draft ? (
              <Empty>{loadError ?? "Loading the incentive…"}</Empty>
            ) : section === "details" ? (
              <DetailsBody
                draft={draft}
                set={set}
                issues={issues}
                products={products}
                functions={view.functions}
                readOnly={!canEdit}
              />
            ) : section === "eligibility" ? (
              <EligibilityBody
                view={view}
                canManage={mayManage}
                today={today}
                onChanged={async () => {
                  await load(true);
                  onChanged();
                }}
              />
            ) : (
              <HistoryBody view={view} />
            )}
          </main>
        </div>
      </div>

      {confirmDelete && r && (
        <DeleteConfirm
          catalogId={catalogId}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={() => {
            setConfirmDelete(false);
            fireToast({ message: `${r.name} deleted.` });
            onDeleted();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   §1 · INCENTIVE DETAILS
   ════════════════════════════════════════════════════════════════════════════ */

function DetailsBody({
  draft,
  set,
  issues,
  products,
  functions,
  readOnly,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  issues: Partial<Record<string, string>>;
  products: ProductOption[];
  /** The Function master's active rows — the same list Employee Master shows
   *  in its Function column, so a scheme is scoped to a real function. */
  functions: { id: string; name: string }[];
  readOnly: boolean;
}) {
  return (
    <Stack>
      <Panes>
        <Pane title="What it is">
          <Rows>
            <Field label="Incentive name" error={issues.name}>
              <input
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                readOnly={readOnly}
                className="ctl"
              />
            </Field>
            <Field label="Incentive type">
              <select
                value={draft.incentiveType}
                onChange={(e) => set("incentiveType", e.target.value as IncentiveType | "")}
                disabled={readOnly}
                className="ctl"
              >
                <option value="">Not tied to a request type</option>
                {INCENTIVE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Product">
              <select
                value={draft.productId}
                onChange={(e) => set("productId", e.target.value)}
                disabled={readOnly}
                className="ctl"
              >
                <option value="">Not product-specific</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.name} (${p.code})` : p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (₹)" error={issues.amount}>
              <input
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))}
                readOnly={readOnly}
                inputMode="decimal"
                className="ctl"
                style={{ fontVariantNumeric: "tabular-nums" }}
              />
            </Field>
          </Rows>
          <Note>
            The product list is the Admin Panel’s Product Master — the same rows
            every other product dropdown reads. Add or rename a product there,
            not here.
          </Note>
        </Pane>

        <Pane title="How long it runs">
          <Rows>
            <Field label="Duration">
              <select
                value={draft.duration}
                onChange={(e) => set("duration", e.target.value as IncentiveDuration)}
                disabled={readOnly}
                className="ctl"
              >
                {INCENTIVE_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {incentiveDurationLabel(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valid until" error={issues.validUntil}>
              <input
                type="date"
                value={draft.validUntil}
                onChange={(e) => set("validUntil", e.target.value)}
                readOnly={readOnly}
                className="ctl"
              />
            </Field>
          </Rows>
          <label className="check mt-3" style={readOnly ? { opacity: 0.6 } : undefined}>
            <input
              type="checkbox"
              data-flag="active"
              checked={draft.active}
              onChange={(e) => set("active", e.target.checked)}
              disabled={readOnly}
            />
            Active — available to earn
          </label>
          <Note>
            Deactivating takes the incentive off offer and tells the people who
            were eligible. It removes nothing: past requests, approvals and
            payments are untouched, and the eligibility history is kept.
          </Note>
        </Pane>
      </Panes>

      <Panes>
        <Pane title="Applies to">
          <Field label="Who can earn this">
            <Select
              value={draft.applicability}
              onValueChange={(v) => set("applicability", v as IncentiveApplicability)}
              disabled={readOnly}
              options={INCENTIVE_APPLICABILITIES.map((a) => ({
                value: a,
                label: INCENTIVE_APPLICABILITY_LABELS[a],
              }))}
            />
          </Field>

          {draft.applicability === "FUNCTION" && (
            <div className="mt-3">
              <span className="label mb-1.5 block">Functions</span>
              <MultiSelect
                options={functions.map((f) => ({ value: f.id, label: f.name }))}
                selected={draft.functionIds}
                onChange={(ids) => set("functionIds", ids)}
                placeholder="Select functions…"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="pastel-cta"
                  disabled={readOnly}
                  onClick={() => set("functionIds", functions.map((f) => f.id))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="pastel-cta"
                  disabled={readOnly}
                  onClick={() => set("functionIds", [])}
                >
                  Deselect all
                </button>
              </div>
              <Note>
                Everyone in the selected functions is eligible. The list is the
                Function master (Admin → Functions), so a function renamed or
                retired there is never matched by a stale copy here.
              </Note>
            </div>
          )}

          {draft.applicability === "SELECTED_EMPLOYEES" && (
            <Note>
              Only the people listed on the <strong>Eligible employees</strong>{" "}
              tab are eligible, each from their own effective date. Adding
              somebody there is what fills this list — and removing them keeps
              the record of when they were eligible.
            </Note>
          )}

          <Note>
            Interns are never eligible, whatever is chosen here — that comes from
            the employee&apos;s type, set on the Designation master or overridden
            on their own record. A new incentive applies to{" "}
            <strong>All Employees</strong> until this is changed.
          </Note>
        </Pane>

        <Pane title="Description and notes">
          <Field label="Description" error={issues.description}>
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              readOnly={readOnly}
              rows={3}
              className="ctl"
            />
          </Field>
          <div className="mt-3">
            <Field label="Internal notes" error={issues.notes}>
              <textarea
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                readOnly={readOnly}
                rows={3}
                className="ctl"
              />
            </Field>
          </div>
          <Note>
            The description is shown to employees in the Incentive Table. Notes
            are internal.
          </Note>
        </Pane>
      </Panes>
    </Stack>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   §2 + §3 · THE INCENTIVE CHART — eligible employees, search and Function
   ════════════════════════════════════════════════════════════════════════════ */

function EligibilityBody({
  view,
  canManage,
  today,
  onChanged,
}: {
  view: IncentiveEligibilityView;
  canManage: boolean;
  today: string;
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [scope, setScope] = React.useState<CandidateScope>("all");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [effectiveFrom, setEffectiveFrom] = React.useState(view.today || today);
  const [busy, setBusy] = React.useState<"add" | "remove" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Search AND Function, applied together by the shared pure filter — the
  // brief's worked example (Function: Sales + Search: Rahul → only Rahul from
  // Sales) is that one function's behaviour, not a second implementation here.
  const visible = React.useMemo(
    () => filterCandidates(view.candidates, { search, departmentId: departmentId || null, scope }),
    [view.candidates, search, departmentId, scope],
  );

  const pickedRows = React.useMemo(
    () => view.candidates.filter((c) => picked.has(c.id)),
    [view.candidates, picked],
  );
  const toAdd = pickedRows.filter((c) => c.eligibleFrom == null && mayBecomeEligible(c));
  const toRemove = pickedRows.filter((c) => c.eligibleFrom != null);

  // The same validator the actions apply, so a date this screen accepts is a
  // date the server accepts. Only asked once something is selected — an empty
  // selection is communicated by the buttons being disabled, not by an error.
  const dateError =
    picked.size > 0
      ? eligibilityChangeError({ employeeIds: [...picked], effectiveFrom, today })
      : null;

  const eligibleNow = view.candidates.filter((c) => c.eligibleFrom != null).length;

  async function apply(kind: "add" | "remove") {
    const rows = kind === "add" ? toAdd : toRemove;
    if (rows.length === 0 || busy) return;
    setBusy(kind);
    setError(null);
    const input = {
      catalogId: view.incentive.id,
      employeeIds: rows.map((r) => r.id),
      effectiveFrom,
    };
    // Branched rather than unified: the two actions report different counts
    // ("added" / "removed"), and collapsing them would mean reading a field off
    // a union that does not always carry it.
    let message: string;
    if (kind === "add") {
      const res = await addIncentiveEligibility(input);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      message = `${res.added} employee${res.added === 1 ? "" : "s"} made eligible from ${formatIncentiveDate(effectiveFrom)}.`;
    } else {
      const res = await removeIncentiveEligibility(input);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      message = `${res.removed} employee${res.removed === 1 ? "" : "s"} removed with effect from ${formatIncentiveDate(effectiveFrom)}.`;
    }
    fireToast({ message });
    setPicked(new Set());
    await onChanged();
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisiblePicked = visible.length > 0 && visible.every((v) => picked.has(v.id));

  return (
    <Stack>
      {!canManage && (
        <div className="glass px-5 py-4">
          <p className="quiet text-[12.5px] leading-relaxed">
            You can see who is eligible, but only <strong>Manan Vasa</strong> can
            change it. The controls below are disabled, and the server refuses
            the change regardless of what this screen shows.
          </p>
        </div>
      )}

      {view.incentive.eligibilityMode !== "selected" && (
        <div className="glass px-5 py-4">
          <p className="quiet text-[12.5px] leading-relaxed">
            This incentive currently applies to{" "}
            <strong>{view.incentive.applicabilityLabel.toLowerCase()}</strong>. Adding
            employees below switches it to <strong>Selected Employees</strong>, and
            then only the people listed here are eligible.
          </p>
        </div>
      )}

      {/* ── Toolbar: search + Function, and what to do with a selection ── */}
      <section className="glass px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <span className="label mb-1.5 block">Search employees</span>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--ink-3)" }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, employee code or email"
                aria-label="Search employees by name, code or email"
                className="ctl"
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>

          {/* ONE control, two names. The department record IS what Employee
              Master calls a Function (see `CandidateRow.departmentId`), so a
              separate "Department" filter would be a second control over the
              same column — and two filters that can disagree about the same
              fact is how a roster screen starts lying. The label carries both
              names instead. */}
          <div className="min-w-[190px]">
            <span className="label mb-1.5 block">Function / Department</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              aria-label="Filter by Function or Department"
              className="ctl"
            >
              <option value="">All Functions</option>
              {view.functions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px]">
            <span className="label mb-1.5 block">Show</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as CandidateScope)}
              aria-label="Filter by eligibility"
              className="ctl"
            >
              <option value="all">Everyone</option>
              <option value="eligible">Eligible only</option>
              <option value="not_eligible">Not eligible</option>
            </select>
          </div>

          <div className="min-w-[150px]">
            <span className="label mb-1.5 block">Effective from</span>
            <input
              type="date"
              data-effective-from
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={!canManage}
              aria-label="Eligibility effective date"
              className="ctl"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <span className="quiet text-[12px]">
            {visible.length} of {view.candidates.length} shown · {eligibleNow} eligible
            {picked.size > 0 && ` · ${picked.size} selected`}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => apply("add")}
            disabled={!canManage || toAdd.length === 0 || busy != null || dateError != null}
            className="btn"
            title={
              canManage
                ? "Make the selected employees eligible from the effective date"
                : "Only Manan Vasa can change eligibility"
            }
          >
            {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Add {toAdd.length > 0 ? `(${toAdd.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => apply("remove")}
            disabled={!canManage || toRemove.length === 0 || busy != null || dateError != null}
            className="btn-quiet"
            title={
              canManage
                ? "End the selected employees' eligibility from the effective date"
                : "Only Manan Vasa can change eligibility"
            }
          >
            {busy === "remove" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UserMinus size={14} />
            )}
            Remove {toRemove.length > 0 ? `(${toRemove.length})` : ""}
          </button>
        </div>

        {dateError && (
          <p role="alert" className="mt-2 text-[12.5px] font-semibold" style={{ color: "#9b1509" }}>
            {dateError}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[12.5px] font-semibold" style={{ color: "#9b1509" }}>
            {error}
          </p>
        )}
        {picked.size > MAX_ELIGIBILITY_BATCH && (
          <p className="quiet mt-2 text-[12px]">
            At most {MAX_ELIGIBILITY_BATCH} employees can be changed at once.
          </p>
        )}
      </section>

      {/* ── The list ───────────────────────────────────────────────────── */}
      <section className="glass px-5 py-4">
        {visible.length === 0 ? (
          <Empty>
            {view.candidates.length === 0
              ? "There are no active employees to show."
              : "No employees match that search and Function."}
          </Empty>
        ) : (
          <div className="overflow-x-auto" data-candidates>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      checked={allVisiblePicked}
                      onChange={(e) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          for (const v of visible) {
                            if (e.target.checked) next.add(v.id);
                            else next.delete(v.id);
                          }
                          return next;
                        })
                      }
                      aria-label="Select all shown"
                      style={{ accentColor: "var(--accent)" }}
                    />
                  </th>
                  <th>Employee</th>
                  <th>Function</th>
                  <th>Designation</th>
                  <th>Eligibility status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <CandidateRowView
                    key={c.id}
                    row={c}
                    picked={picked.has(c.id)}
                    onToggle={() => toggle(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Stack>
  );
}

function CandidateRowView({
  row,
  picked,
  onToggle,
}: {
  row: CandidateRow;
  picked: boolean;
  onToggle: () => void;
}) {
  const current = mayBecomeEligible(row);
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={picked}
          onChange={onToggle}
          aria-label={`Select ${row.name}`}
          style={{ accentColor: "var(--accent)" }}
        />
      </td>
      <td className="strong">
        {row.name}
        <span className="quiet block text-[11.5px]">
          {row.employeeCode ? `${row.employeeCode} · ` : ""}
          {row.email}
        </span>
      </td>
      <td>{row.departmentName ?? "—"}</td>
      <td>{row.designationName ?? "—"}</td>
      <td>
        {row.eligibleFrom ? (
          <span className="pill state ok">
            <Check size={11} /> Eligible from {formatIncentiveDate(row.eligibleFrom)}
          </span>
        ) : current ? (
          <span className="pill state idle">Not eligible</span>
        ) : (
          // Shown only when they still hold no grant AND are no longer current
          // — which the loader only allows for someone who has left while
          // eligible, so this is the "cannot be re-added" case.
          <span className="pill state warn">Left — cannot be added</span>
        )}
      </td>
    </tr>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   ELIGIBILITY HISTORY
   ════════════════════════════════════════════════════════════════════════════ */

function HistoryBody({ view }: { view: IncentiveEligibilityView }) {
  return (
    <Stack>
      <section className="glass px-5 py-4">
        <h3 className="label mb-3 flex items-center gap-1.5">
          <History size={12} /> Every eligibility change, newest first
        </h3>
        {view.history.length === 0 ? (
          <Empty>No employee has been named on this incentive yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Eligible from</th>
                  <th>Removed from</th>
                  <th>Added by</th>
                  <th>Removed by</th>
                </tr>
              </thead>
              <tbody>
                {view.history.map((h) => (
                  <tr key={h.id}>
                    <td className="strong">{h.employeeName}</td>
                    <td>{formatIncentiveDate(h.effectiveFrom)}</td>
                    <td>
                      {h.removedEffectiveFrom ? (
                        formatIncentiveDate(h.removedEffectiveFrom)
                      ) : (
                        <span className="pill state ok">Current</span>
                      )}
                    </td>
                    <td>{h.addedByName ?? "—"}</td>
                    <td>{h.removedByName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          Removing an employee records the effective date and keeps the row, so
          “who was eligible in June” stays answerable. Nothing here is ever
          deleted by a removal.
        </Note>
      </section>
    </Stack>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   DELETE, WITH A TYPED NAME
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * The strong confirmation the brief asks for.
 *
 * It names what goes and what stays, and requires the incentive's name to be
 * typed — which the server also checks, so the deliberateness is a property of
 * the request rather than of this dialog.
 */
function DeleteConfirm({
  catalogId,
  onCancel,
  onDeleted,
}: {
  catalogId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = React.useState<{
    name: string;
    eligibleCount: number;
    grantCount: number;
  } | null>(null);
  const [typed, setTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await incentiveDeleteImpact(catalogId);
      if (!alive) return;
      if (res.ok) {
        setImpact({
          name: res.name,
          eligibleCount: res.eligibleCount,
          grantCount: res.grantCount,
        });
      } else setError(res.error);
    })();
    return () => {
      alive = false;
    };
  }, [catalogId]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const matches =
    impact != null &&
    typed.replace(/\s+/g, " ").trim().toLowerCase() === impact.name.toLowerCase();

  async function confirm() {
    if (!impact || !matches) return;
    setBusy(true);
    setError(null);
    const res = await deleteIncentive(catalogId, typed);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDeleted();
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete incentive"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-[#0F172A]">Delete this incentive?</h2>

        {!impact ? (
          <p className="mt-3 text-[14px] text-[#64748B]">{error ?? "Checking…"}</p>
        ) : (
          <>
            <p className="mt-2 text-[15px] text-[#0F172A]">
              <strong>{impact.name}</strong>
            </p>

            <ul className="mt-3 space-y-1.5 text-[13.5px] text-[#475569]">
              <li>
                The incentive and everything recorded on it — amount, type,
                product, duration and notes — are permanently removed, and it
                disappears from the Incentive Table.
              </li>
              {impact.grantCount > 0 && (
                <li>
                  <strong>
                    {impact.grantCount} eligibility record
                    {impact.grantCount === 1 ? "" : "s"}
                  </strong>{" "}
                  go with it. The change record keeps a snapshot of who was
                  eligible at this moment.
                </li>
              )}
              {impact.eligibleCount > 0 && (
                <li>
                  <strong>
                    {impact.eligibleCount} employee
                    {impact.eligibleCount === 1 ? "" : "s"}
                  </strong>{" "}
                  are eligible today and will be told it is no longer available.
                </li>
              )}
              <li>
                <strong>
                  Past requests, approvals, resubmissions and payments are not
                  affected.
                </strong>{" "}
                None of them reference this record, so every historical incentive
                stays exactly as it is.
              </li>
              <li>
                Any weekly goal that pointed at this incentive keeps its amount
                and loses only the link.
              </li>
            </ul>

            <p className="mt-4 text-[13.5px] text-[#475569]">
              Deactivating it instead keeps all of this and removes it from new
              selections. To delete it, type <strong>{impact.name}</strong> below.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}

            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Type the incentive name to confirm"
              placeholder={impact.name}
              className="mt-3 w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
            />
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#CBD5E1] px-4 py-2.5 text-[14px] font-semibold text-[#475569]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!matches || busy}
            className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-45"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Deleting…" : "Delete incentive"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PRIMITIVES — the Employee Master / Billing Master workspace's, so all three
   read identically.
   ════════════════════════════════════════════════════════════════════════════ */

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 pb-2">{children}</div>;
}

/** Panes rebalance instead of orphaning — `auto-fit` with a 300px floor. */
function Panes({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}
    >
      {children}
    </div>
  );
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass px-5 py-4">
      <h3 className="label mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-4 gap-y-3 min-[520px]:grid-cols-2">{children}</div>;
}

/**
 * `data-field` is the stable hook the verification script addresses fields by.
 * Derived from the label, so it cannot drift from what is on screen, and it
 * survives the layout changes that break a structural selector.
 */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0" data-field={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {error && (
        <span className="mt-1 block text-[11.5px] font-semibold" style={{ color: "#9b1509" }}>
          {error}
        </span>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="quiet mt-3 text-[12px] leading-relaxed">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="quiet rounded-[12px] border border-dashed px-3 py-5 text-center text-[12.5px]"
      style={{ borderColor: "rgba(10,15,34,0.16)" }}
    >
      {children}
    </div>
  );
}
