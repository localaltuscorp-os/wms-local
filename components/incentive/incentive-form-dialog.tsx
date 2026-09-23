"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Award, Check, Mic, Plus, RotateCcw, Trash2, UserRound, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { useDictation } from "@/components/ui/use-dictation";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";
import { formatDateTimeInTz } from "@/lib/format";
import { createIncentiveRequest, resubmitIncentiveRequest } from "@/app/(app)/incentive/actions";
import {
  INCENTIVE_STATUS_LABELS,
  INCENTIVE_TYPES,
  INCENTIVE_TYPE_LABELS,
  type IncentiveStatus,
  type IncentiveType,
} from "@/db/enums";
import {
  JUSTIFICATION_LABEL,
  JUSTIFICATION_REQUIRED_MESSAGE,
  NOTE_MAX,
} from "@/lib/incentive/workflow";
import { INCENTIVE_REVIEWER_NAME } from "@/lib/auth/incentive-permissions";
import { INCENTIVE_BTN_PRIMARY } from "./ui/chrome";
import type { EmployeeOption } from "@/lib/queries/employees";
import {
  INCENTIVE_DATE_KEY,
  incentiveFieldErrors,
  optionsFor,
  visibleIncentiveFields,
  type IncentiveField,
  type IncentiveValidationContext,
} from "@/lib/incentive-fields";
import {
  FULL_SPLIT_BP,
  MAX_SPLIT_PEOPLE,
  checkSplit,
  equalSplitBasisPoints,
  formatPct,
  parsePct,
  sanitizePctTyping,
  splitTotalMessage,
  type SplitCheck,
} from "@/lib/incentive/split";

/**
 * "New incentive request" dialog — DUAL SCREEN.
 *
 * Renders the per-type fields generically from lib/incentive-fields.ts — the
 * same config, and the same `incentiveFieldError` rules, the server enforces
 * through lib/incentive/prepare-request.ts, so the two can't drift.
 *
 * ── LAYOUT ─────────────────────────────────────────────────────────────────
 * Two columns from `md` up, one below. The left holds the general part (type,
 * who is requesting) and the first group of the type's fields; the right holds
 * the rest, then the Incentive Date and Split Incentive, then the validation
 * summary. Which column a field sits in is the config's `pane` hint, so the
 * split is deliberate per form rather than "first half / second half" — a
 * half-way cut would move fields between columns as `showIf` fields appear.
 * Header and footer stay put; only the body scrolls, so Submit is always in
 * reach.
 *
 * ── VALIDATION ─────────────────────────────────────────────────────────────
 * `noValidate`: the browser's bubbles are replaced by inline messages and a
 * summary. A field's message appears once it has been left (blur) or chosen
 * (select/radio), and everywhere after a submit attempt. A mobile number that
 * already contains a non-digit or an 11th digit is flagged while typing, since
 * no further typing can fix it.
 */

interface SplitRow {
  employeeId: string;
  /** As typed — sanitised, but possibly half-finished ("12."). */
  pct: string;
}

interface Problem {
  key: string;
  label: string;
  message: string;
}

const fieldId = (key: string) => `inc-${key}`;
const RED_DEEP = "var(--color-altus-red-deep)";
const OK_GREEN = "#15803D";

/** Today in the browser's own calendar — the requester's day, not the server's. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function equalised(rows: SplitRow[]): SplitRow[] {
  const bps = equalSplitBasisPoints(rows.length);
  return rows.map((r, i) => ({ ...r, pct: formatPct((bps[i] ?? 0) / 100) }));
}

function inputClass(invalid: boolean): string {
  return cn(
    "w-full rounded-lg border px-3.5 py-2.5 text-[15px] bg-white text-ink-strong transition-colors outline-none focus:ring-2 placeholder:text-ink-subtle",
    invalid
      ? "border-altus-red focus:border-altus-red focus:ring-altus-red/20"
      : "border-hairline-strong focus:border-altus-red focus:ring-altus-red/15",
  );
}

/**
 * The request a JUSTIFY & RESUBMIT dialog opens on (0230) — what was submitted,
 * and the decision the employee is answering.
 */
export interface IncentiveResubmitRequest {
  id: string;
  type: IncentiveType;
  details: Record<string, string>;
  split: { employeeId: string; name: string; pct: number }[] | null;
  status: IncentiveStatus;
  reason: string | null;
  decidedAt: Date | string | null;
  decidedByName: string | null;
  submissionNo: number;
}

/** Stored split shares → the editor's rows, with the requester first (the
 *  editor pins row 0 to "You"). */
function splitRowsFrom(
  split: IncentiveResubmitRequest["split"],
  meId: string,
): SplitRow[] {
  if (!split || split.length === 0) return [];
  const mine = split.find((s) => s.employeeId === meId);
  const others = split.filter((s) => s.employeeId !== meId);
  return [
    { employeeId: meId, pct: formatPct(mine?.pct ?? 0) },
    ...others.map((s) => ({ employeeId: s.employeeId, pct: formatPct(s.pct) })),
  ];
}

export function IncentiveFormDialog({
  products,
  employees,
  me,
  resubmit,
}: {
  /** Active names from Admin → Products — the Conversion form's Product options. */
  products: string[];
  /** Active employees — the Split Incentive picker. */
  employees: EmployeeOption[];
  /** The signed-in requester; always the first person in a split. */
  me: { id: string; name: string };
  /**
   * JUSTIFY & RESUBMIT (0230). When set, this is the same form opened on an
   * existing Not Approved / Revision Requested request: every answer, link and
   * split share is filled in from what was submitted, the incentive type is
   * fixed, and a required Justification / Resubmission Note is added. Nothing
   * has to be re-entered from scratch, and the previous submission is kept.
   */
  resubmit?: IncentiveResubmitRequest;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncentiveType | "">(resubmit?.type ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => (resubmit ? { ...resubmit.details } : {}));
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [splitOn, setSplitOn] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
  const [equalMode, setEqualMode] = useState(true);
  const [justification, setJustification] = useState("");
  const [justificationTouched, setJustificationTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    if (resubmit) {
      const rows = splitRowsFrom(resubmit.split, me.id);
      setType(resubmit.type);
      setValues({ ...resubmit.details });
      setTouched(new Set());
      setSubmitted(false);
      setServerError(null);
      setSplitOn(rows.length > 0);
      setSplitRows(rows);
      // The submitted shares are the employee's own numbers — not re-divided.
      setEqualMode(false);
      setJustification("");
      setJustificationTouched(false);
      return;
    }
    setType("");
    setValues({ [INCENTIVE_DATE_KEY]: todayIso() });
    setTouched(new Set());
    setSubmitted(false);
    setServerError(null);
    setSplitOn(false);
    setSplitRows([]);
    setEqualMode(true);
  }

  const ctx: IncentiveValidationContext = { productNames: products };
  const fields = type ? visibleIncentiveFields(type, values) : [];
  const errors = type ? incentiveFieldErrors(type, values, ctx) : {};
  const splitDraft = splitRows.map((r) => ({ employeeId: r.employeeId, pct: parsePct(r.pct) }));
  const split: SplitCheck | null = splitOn ? checkSplit(splitDraft, { requesterId: me.id }) : null;

  const problems: Problem[] = [];
  for (const f of fields) {
    const message = errors[f.key];
    if (message) problems.push({ key: f.key, label: f.label, message });
  }
  if (split && !split.ok) problems.push({ key: "split", label: "Split Incentive", message: split.error });
  // A resubmission must say why (the server refuses it without one too).
  const justificationMissing = !!resubmit && !justification.trim();
  if (justificationMissing) {
    problems.unshift({ key: "justification", label: JUSTIFICATION_LABEL, message: JUSTIFICATION_REQUIRED_MESSAGE });
  }

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function touch(key: string) {
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  function errorFor(f: IncentiveField): string | null {
    const message = errors[f.key];
    if (!message) return null;
    if (submitted || touched.has(f.key)) return message;
    if (f.type === "tel") {
      const v = (values[f.key] ?? "").trim();
      if (/\D/.test(v) || v.length > 10) return message;
    }
    return null;
  }

  function focusField(key: string) {
    const el = document.getElementById(fieldId(key));
    if (!el) return;
    el.focus();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function changeType(next: IncentiveType) {
    setType(next);
    // The date describes the incentive, not the form, so it survives a change
    // of type; the type-specific answers do not.
    setValues((prev) => ({ [INCENTIVE_DATE_KEY]: prev[INCENTIVE_DATE_KEY] ?? todayIso() }));
    setTouched(new Set());
    setSubmitted(false);
    setServerError(null);
  }

  function toggleSplit(on: boolean) {
    setSplitOn(on);
    if (on && splitRows.length === 0) {
      setEqualMode(true);
      setSplitRows(equalised([{ employeeId: me.id, pct: "" }, { employeeId: "", pct: "" }]));
    }
  }

  function changeSplitRows(next: SplitRow[], edit: "people" | "share") {
    if (edit === "share") {
      // Typing a share is a custom split; people added later keep their own.
      setEqualMode(false);
      setSplitRows(next);
    } else {
      setSplitRows(equalMode ? equalised(next) : next);
    }
  }

  function splitEqually() {
    setEqualMode(true);
    setSplitRows((rows) => equalised(rows));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    setSubmitted(true);
    setServerError(null);
    if (problems.length > 0) {
      const first = problems[0]!;
      requestAnimationFrame(() => focusField(first.key));
      return;
    }
    const requestType = type;
    const splitPayload = splitOn ? splitDraft.map((r) => ({ employeeId: r.employeeId, pct: r.pct ?? 0 })) : null;
    startTransition(async () => {
      if (resubmit) {
        const res = await resubmitIncentiveRequest({
          id: resubmit.id,
          details: values,
          split: splitPayload,
          justification,
        });
        if (!res.ok) {
          setServerError(res.error);
          return;
        }
        fireToast({
          message: `${INCENTIVE_TYPE_LABELS[requestType]} incentive resubmitted — it's back with ${INCENTIVE_REVIEWER_NAME} for review.`,
        });
        setOpen(false);
        reset();
        return;
      }
      const res = await createIncentiveRequest({
        type: requestType,
        details: values,
        split: splitPayload,
      });
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      fireToast({ message: `${INCENTIVE_TYPE_LABELS[requestType]} request submitted.` });
      setOpen(false);
      reset();
    });
  }

  function renderField(f: IncentiveField): ReactNode {
    const id = fieldId(f.key);
    const error = errorFor(f);
    return (
      <FieldShell
        key={f.key}
        id={id}
        label={f.label}
        required={f.required}
        error={error}
        group={f.control === "radio"}
      >
        <FieldControl
          field={f}
          id={id}
          value={values[f.key] ?? ""}
          invalid={!!error}
          ctx={ctx}
          onChange={(v) => setValue(f.key, v)}
          onCommit={() => touch(f.key)}
        />
      </FieldShell>
    );
  }

  /** A pane's fields, with consecutive `half` fields sharing a row. The
   *  Incentive Date is rendered with the split, not in the list. */
  function renderPane(pane: "left" | "right"): ReactNode[] {
    const list = fields.filter((f) => (f.pane ?? "left") === pane && f.key !== INCENTIVE_DATE_KEY);
    const out: ReactNode[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      const next = list[i + 1];
      if (f.half && next?.half) {
        out.push(
          <div key={`${f.key}+${next.key}`} className="grid gap-4 sm:grid-cols-2">
            {renderField(f)}
            {renderField(next)}
          </div>,
        );
        i++;
      } else {
        out.push(renderField(f));
      }
    }
    return out;
  }

  const dateField = fields.find((f) => f.key === INCENTIVE_DATE_KEY);
  const hairline = { borderColor: "var(--color-hairline)" };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        reset();
      }}
    >
      <Dialog.Trigger asChild>
        {/* Both triggers are the design system's pastel CTA, at one height.
            They used to be solid red slabs — as were the Add Entry, Add
            Incentive and Save Target buttons, so eight "primary" buttons could
            share one screen and none of them read as the important one. */}
        {resubmit ? (
          <button type="button" data-justify-resubmit className={INCENTIVE_BTN_PRIMARY}>
            <RotateCcw size={14} strokeWidth={2.4} aria-hidden />
            Justify &amp; Resubmit
          </button>
        ) : (
          <button type="button" className={INCENTIVE_BTN_PRIMARY}>
            <Award size={14} strokeWidth={2.6} aria-hidden />
            New request
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="wg-rise fixed left-1/2 top-1/2 z-[100] flex w-[calc(100vw-24px)] max-w-[980px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-surface-card max-h-[calc(100dvh-24px)]"
          style={{
            border: "1px solid var(--color-hairline-strong)",
            boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
          }}
        >
          {/* Brand accent bar */}
          <span
            aria-hidden
            className="block h-1 w-full shrink-0"
            style={{ background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-6 pb-4 pt-5 max-sm:px-4" style={hairline}>
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                  color: "var(--color-altus-red-deep)",
                }}
                aria-hidden
              >
                <Award size={20} strokeWidth={2.4} />
              </span>
              <div>
                <Dialog.Title
                  className="text-ink-strong"
                  style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}
                >
                  {resubmit ? "Justify & Resubmit" : "New Incentive Request"}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[14.5px] text-ink-muted" style={{ lineHeight: 1.5 }}>
                  {resubmit
                    ? `Everything you submitted is filled in. Fix what needs fixing, explain why, and resubmit — it goes back to ${INCENTIVE_REVIEWER_NAME}. Your earlier submission and the decision on it stay in the history.`
                    : `Pick the incentive type - the form adapts to what it needs. ${INCENTIVE_REVIEWER_NAME} reviews each request.`}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                disabled={pending}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-4">
              {resubmit && (
                <div className="mb-5 flex flex-col gap-4 border-b pb-5" style={hairline} data-resubmission-section>
                  <ResubmitDecision request={resubmit} />
                  <FieldShell
                    id={fieldId("justification")}
                    label={JUSTIFICATION_LABEL}
                    required
                    error={(submitted || justificationTouched) && justificationMissing ? JUSTIFICATION_REQUIRED_MESSAGE : null}
                  >
                    <NotesInput
                      id={fieldId("justification")}
                      label={JUSTIFICATION_LABEL}
                      value={justification}
                      invalid={(submitted || justificationTouched) && justificationMissing}
                      placeholder="What did you change or add, and why should this incentive be approved?"
                      max={NOTE_MAX}
                      rows={4}
                      onChange={setJustification}
                      onBlur={() => setJustificationTouched(true)}
                    />
                  </FieldShell>
                </div>
              )}
              <div className="grid gap-y-4 md:grid-cols-2">
                {/* ── LEFT: general + first group of the type's fields ── */}
                <section
                  aria-label="Request details"
                  data-pane="left"
                  className="flex min-w-0 flex-col gap-4 md:pr-7"
                >
                  <FieldShell id={fieldId("type")} label="Incentive Type" required error={null}>
                    <Select
                      id={fieldId("type")}
                      options={INCENTIVE_TYPES.map((t) => ({
                        value: t,
                        label: INCENTIVE_TYPE_LABELS[t],
                      }))}
                      value={type}
                      onValueChange={(v) => changeType(v as IncentiveType)}
                      placeholder="- Select incentive -"
                      ariaLabel="Incentive type"
                      // A resubmission revises THIS request; a different type is
                      // a new request. The server takes the stored type anyway.
                      disabled={!!resubmit}
                    />
                  </FieldShell>

                  <div className="flex items-center gap-2 text-[13.5px]">
                    <span
                      aria-hidden
                      className="inline-grid size-7 shrink-0 place-items-center rounded-full bg-surface-soft text-ink-muted"
                    >
                      <UserRound size={14} strokeWidth={2.3} />
                    </span>
                    <span className="text-ink-subtle">Requested by</span>
                    <span className="truncate font-semibold text-ink-strong">{me.name}</span>
                  </div>

                  {type && (
                    <div className="flex flex-col gap-4 border-t pt-4" style={hairline}>
                      {renderPane("left")}
                    </div>
                  )}
                </section>

                {/* ── RIGHT: remaining fields, date + split, summary ── */}
                <section
                  aria-label="More details"
                  data-pane="right"
                  className="flex min-w-0 flex-col gap-4 md:border-l md:pl-7 max-md:border-t max-md:pt-4"
                  style={hairline}
                >
                  {!type ? (
                    <div
                      className="flex min-h-[160px] flex-1 items-center justify-center rounded-xl border border-dashed px-6 text-center text-[14px] text-ink-subtle max-md:hidden"
                      style={{ borderColor: "var(--color-hairline-strong)" }}
                    >
                      Choose an incentive type — its details, the incentive date and
                      the split option appear here.
                    </div>
                  ) : (
                    <>
                      {renderPane("right")}

                      <div className="flex flex-col gap-4 border-t pt-4" style={hairline}>
                        {dateField && renderField(dateField)}
                        <SplitIncentive
                          me={me}
                          employees={employees}
                          on={splitOn}
                          onToggle={toggleSplit}
                          rows={splitRows}
                          onRowsChange={changeSplitRows}
                          equalMode={equalMode}
                          onEqual={splitEqually}
                          check={split}
                          showErrors={submitted}
                        />
                      </div>

                      {submitted && problems.length > 0 && (
                        <div
                          role="alert"
                          className="rounded-lg px-3.5 py-2.5 text-[13.5px]"
                          style={{
                            background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--color-altus-red) 28%, transparent)",
                            color: RED_DEEP,
                          }}
                        >
                          <p className="font-bold">
                            Fix {problems.length === 1 ? "this" : `these ${problems.length}`} before submitting:
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {problems.map((p) => (
                              <li key={p.key}>
                                <button
                                  type="button"
                                  onClick={() => focusField(p.key)}
                                  className="text-left font-medium underline-offset-2 hover:underline"
                                >
                                  {p.message.includes(p.label) ? p.message : `${p.label}: ${p.message}`}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {serverError && (
                        <div
                          role="alert"
                          className="rounded-lg px-3.5 py-2.5 text-[14px] font-semibold"
                          style={{
                            background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--color-altus-red) 28%, transparent)",
                            color: RED_DEEP,
                          }}
                        >
                          {serverError}
                        </div>
                      )}
                    </>
                  )}
                </section>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t px-6 py-3.5 max-sm:px-4" style={hairline}>
              <p className="text-[12.5px] text-ink-subtle max-sm:hidden">
                <span className="text-altus-red">*</span> Required
              </p>
              {submitted && problems.length > 0 && (
                <p className="text-[13px] font-semibold" style={{ color: RED_DEEP }}>
                  {problems.length} {problems.length === 1 ? "field needs" : "fields need"} attention
                </p>
              )}
              <div className="ml-auto flex gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="bg-surface-card rounded-pill px-4 py-2.5 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={pending || !type}
                  className="rounded-pill py-2.5 px-6 text-[15px] font-bold text-white shadow-sm transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  {pending
                    ? resubmit
                      ? "Resubmitting…"
                      : "Submitting…"
                    : resubmit
                      ? "Resubmit Incentive"
                      : "Submit Request"}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FieldControl({
  field,
  id,
  value,
  invalid,
  ctx,
  onChange,
  onCommit,
}: {
  field: IncentiveField;
  id: string;
  value: string;
  invalid: boolean;
  ctx: IncentiveValidationContext;
  onChange: (v: string) => void;
  /** The moment the field counts as visited: blur, or a choice being made. */
  onCommit: () => void;
}) {
  const describedBy = invalid ? `${id}-error` : undefined;

  // Yes / No with NO default — nothing is checked until the requester picks.
  if (field.control === "radio") {
    return (
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={field.required || undefined}
        className="flex flex-wrap gap-2"
      >
        {(field.options ?? []).map((o, i) => {
          const checked = value === o;
          return (
            <label
              key={o}
              className={cn(
                "inline-flex min-w-[96px] cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[15px] font-semibold transition-colors",
                checked
                  ? "border-altus-red text-ink-strong"
                  : invalid
                    ? "border-altus-red/60 text-ink-muted"
                    : "border-hairline-strong text-ink-muted hover:border-ink-subtle",
              )}
              style={{
                background: checked ? "color-mix(in srgb, var(--color-altus-red) 6%, white)" : "white",
              }}
            >
              <input
                type="radio"
                id={i === 0 ? id : undefined}
                name={id}
                value={o}
                checked={checked}
                onChange={() => {
                  onChange(o);
                  onCommit();
                }}
                className="size-4 accent-[var(--color-altus-red)]"
              />
              {o}
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === "select") {
    const options = optionsFor(field, ctx) ?? [];
    const noProducts = field.optionsFrom === "products" && options.length === 0;
    return (
      <div className={cn("rounded-xl", invalid && "ring-2 ring-altus-red/35")}>
        <Select
          id={id}
          options={options.map((o) => ({ value: o, label: o }))}
          value={value}
          onValueChange={(v) => {
            onChange(v);
            onCommit();
          }}
          placeholder={noProducts ? "No products in Admin → Products" : "- Select -"}
          ariaLabel={field.label}
          disabled={noProducts}
        />
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <NotesInput
        id={id}
        label={field.label}
        value={value}
        invalid={invalid}
        placeholder={field.placeholder}
        onChange={onChange}
        onBlur={onCommit}
      />
    );
  }

  if (field.type === "date") {
    return (
      <DateField
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(inputClass(invalid), "pr-10")}
      />
    );
  }

  return (
    <input
      id={id}
      type={field.type}
      inputMode={
        field.type === "tel" || field.type === "number" ? "numeric" : field.type === "email" ? "email" : undefined
      }
      autoComplete={field.type === "tel" ? "tel-national" : field.type === "email" ? "email" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      placeholder={field.placeholder}
      maxLength={1000}
      min={field.type === "number" ? 1 : undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={field.required || undefined}
      className={inputClass(invalid)}
    />
  );
}

/**
 * Notes with VOICE DICTATION — every Notes field in every incentive form.
 *
 * `useDictation` (components/ui/use-dictation.ts) is the app's one dictation
 * hook, already behind the leave reason, remote-work note and module forms. It
 * is the browser's Web Speech API: words become text in this same textarea,
 * nothing is recorded, uploaded or stored. Finalised phrases are APPENDED, so
 * dictating after typing extends the note, and the text stays editable.
 *
 * The mic sits beside the box rather than inside it. Where the browser has no
 * speech engine (Firefox) it stays visible but disabled, with the reason as its
 * tooltip — the brief asks for the option on every Notes field, and a silently
 * missing button reads as a bug.
 */
export function NotesInput({
  id,
  label,
  value,
  invalid,
  placeholder,
  onChange,
  onBlur,
  max = 1000,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  /** Character ceiling for typing AND dictation. 1000 for form Notes (what the
   *  server trims details to); the workflow's reasons and justifications pass
   *  their own. */
  max?: number;
  rows?: number;
}) {
  // The same ceiling typing is held to (and the server enforces).
  const dictation = useDictation({ value, onChange: (v) => onChange(v.slice(0, max)) });
  const hint = !dictation.supported
    ? "Voice dictation isn't available in this browser — use Chrome or Edge."
    : dictation.recording
      ? "Stop dictation"
      : "Dictate notes";

  return (
    <div>
      <div className="flex items-start gap-2">
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          maxLength={max}
          rows={rows}
          aria-invalid={invalid || undefined}
          className={cn(inputClass(invalid), "min-w-0 flex-1 resize-y")}
        />
        <button
          type="button"
          onClick={dictation.toggle}
          disabled={!dictation.supported}
          aria-pressed={dictation.recording}
          aria-label={dictation.recording ? `Stop dictating ${label}` : `Dictate ${label}`}
          title={hint}
          data-dictation={id}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
            dictation.recording
              ? "animate-pulse border-transparent text-white"
              : "border-hairline-strong bg-white text-ink-muted hover:border-altus-red hover:text-altus-red",
          )}
          style={dictation.recording ? { background: "var(--color-altus-red)" } : undefined}
        >
          <Mic size={17} strokeWidth={2.3} aria-hidden />
        </button>
      </div>
      {dictation.recording && (
        <p className="mt-1 text-[12px] font-bold text-altus-red" aria-live="polite">
          Listening… tap the mic again to stop.{" "}
          {dictation.interim && (
            <span className="font-normal italic text-ink-muted">“{dictation.interim}”</span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * SPLIT INCENTIVE — unchecked by default, and then the request is the existing
 * single-employee one. Checked: the requester plus up to four colleagues, each
 * with an individual percentage. Rules and messages: lib/incentive/split.ts.
 *
 * "Split Equally" is a MODE, not a one-off: while it is on, adding or removing
 * a person re-divides the shares (2 → 50/50, 3 → 33.34/33.33/33.33, 4 → 25s,
 * 5 → 20s). Typing any share switches to a custom split; pressing it again
 * restores equal shares.
 */
function SplitIncentive({
  me,
  employees,
  on,
  onToggle,
  rows,
  onRowsChange,
  equalMode,
  onEqual,
  check,
  showErrors,
}: {
  me: { id: string; name: string };
  employees: EmployeeOption[];
  on: boolean;
  onToggle: (on: boolean) => void;
  rows: SplitRow[];
  onRowsChange: (rows: SplitRow[], edit: "people" | "share") => void;
  equalMode: boolean;
  onEqual: () => void;
  check: SplitCheck | null;
  showErrors: boolean;
}) {
  const nameOf = (employeeId: string) =>
    employeeId === me.id ? me.name : employees.find((e) => e.id === employeeId)?.name;
  const totalOk = check?.totalBp === FULL_SPLIT_BP;
  const totalMessage = check ? splitTotalMessage(check.totalBp) : null;

  return (
    <div id={fieldId("split")} tabIndex={-1} className="outline-none">
      <label className="flex cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] font-bold text-ink-strong">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-4 accent-[var(--color-altus-red)]"
        />
        Split Incentive
        <span className="text-[12.5px] font-medium text-ink-subtle">
          share it with up to {MAX_SPLIT_PEOPLE - 1} colleagues
        </span>
      </label>

      {on && check && (
        <div
          className="mt-3 rounded-xl border p-3"
          style={{ borderColor: "var(--color-hairline-strong)" }}
          data-split-panel
        >
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            <span className="flex-1">Employee</span>
            <span className="w-[92px] text-right">Split</span>
            <span className="w-7" aria-hidden />
          </div>

          <ul className="space-y-2">
            {rows.map((r, i) => {
              const isMe = i === 0;
              const taken = new Set(rows.filter((_, j) => j !== i).map((x) => x.employeeId));
              const options = employees
                .filter((e) => e.id !== me.id && !taken.has(e.id))
                .map((e) => ({ value: e.id, label: e.name }));
              const who = nameOf(r.employeeId) ?? `person ${i + 1}`;
              return (
                <li key={i} className="flex items-center gap-2" data-split-row={i}>
                  <div className="min-w-0 flex-1">
                    {isMe ? (
                      <div
                        className="flex h-9.5 items-center gap-2 rounded-xl border bg-surface-soft px-3 text-sm font-semibold text-ink-strong"
                        style={{ borderColor: "var(--color-hairline)" }}
                      >
                        <span className="truncate">{me.name}</span>
                        <span className="ml-auto text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
                          You
                        </span>
                      </div>
                    ) : (
                      <Select
                        id={`inc-split-person-${i}`}
                        options={options}
                        value={r.employeeId}
                        onValueChange={(v) =>
                          onRowsChange(rows.map((x, j) => (j === i ? { ...x, employeeId: v } : x)), "people")
                        }
                        placeholder="- Select employee -"
                        ariaLabel={`Person ${i + 1} in the split`}
                      />
                    )}
                  </div>
                  <div className="relative w-[92px] shrink-0">
                    <input
                      inputMode="decimal"
                      value={r.pct}
                      onChange={(e) =>
                        onRowsChange(
                          rows.map((x, j) => (j === i ? { ...x, pct: sanitizePctTyping(e.target.value) } : x)),
                          "share",
                        )
                      }
                      aria-label={`Split percentage for ${who}`}
                      placeholder="0"
                      className="h-9.5 w-full rounded-xl border border-hairline-strong bg-white pl-3 pr-7 text-right text-sm font-semibold tabular-nums text-ink-strong outline-none focus:border-altus-red focus:ring-2 focus:ring-altus-red/15"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">
                      %
                    </span>
                  </div>
                  {isMe ? (
                    <span className="w-7 shrink-0" aria-hidden />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRowsChange(rows.filter((_, j) => j !== i), "people")}
                      aria-label={`Remove ${who} from the split`}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red"
                    >
                      <Trash2 size={14} strokeWidth={2.3} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={rows.length >= MAX_SPLIT_PEOPLE}
              onClick={() => onRowsChange([...rows, { employeeId: "", pct: "" }], "people")}
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} strokeWidth={2.4} aria-hidden />
              Add person
            </button>
            <button
              type="button"
              aria-pressed={equalMode}
              onClick={onEqual}
              className={cn(
                "rounded-pill border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                equalMode
                  ? "border-altus-red text-altus-red"
                  : "border-hairline-strong text-ink-muted hover:bg-surface-soft",
              )}
            >
              Split Equally
            </button>
            <span className="ml-auto text-[12px] text-ink-subtle">
              {rows.length} of {MAX_SPLIT_PEOPLE} people
            </span>
          </div>

          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5"
            style={{ borderColor: "var(--color-hairline)" }}
            aria-live="polite"
          >
            <span className="text-[14px] font-bold text-ink-strong" data-split-total>
              Total Split:{" "}
              <span className="tabular-nums" style={{ color: totalOk ? OK_GREEN : RED_DEEP }}>
                {formatPct(check.totalBp / 100)}%
              </span>
              {totalOk && (
                <Check
                  size={15}
                  strokeWidth={3}
                  className="ml-1 inline align-[-2px]"
                  style={{ color: OK_GREEN }}
                  aria-label="Split totals 100%"
                />
              )}
            </span>
            <span className="text-[12.5px] font-semibold tabular-nums text-ink-subtle" aria-label="Split ratio">
              {rows.map((r) => r.pct || "0").join(" : ")}
            </span>
          </div>
          {totalMessage && (
            <p className="mt-1 text-[12.5px] font-semibold" style={{ color: RED_DEEP }} data-split-message>
              {totalMessage}
            </p>
          )}
          {showErrors && !check.ok && check.error !== totalMessage && (
            <p className="mt-1 text-[12.5px] font-semibold" style={{ color: RED_DEEP }}>
              {check.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The decision a resubmission is answering — shown at the top of Justify &
 * Resubmit so the employee writes their justification with the reason in view.
 */
function ResubmitDecision({ request }: { request: IncentiveResubmitRequest }) {
  const notApproved = request.status === "rejected";
  const when = request.decidedAt ? new Date(request.decidedAt) : null;
  const whenText =
    when && !Number.isNaN(when.getTime())
      ? formatDateTimeInTz(when)
      : null;
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: notApproved ? "rgba(225,6,0,0.06)" : "rgba(245,158,11,0.08)",
        boxShadow: `inset 0 0 0 1px ${notApproved ? "rgba(225,6,0,0.22)" : "rgba(245,158,11,0.30)"}`,
      }}
    >
      <p className="text-[14px] font-bold text-ink-strong">
        {INCENTIVE_STATUS_LABELS[request.status] ?? request.status}
        <span className="font-medium text-ink-subtle">
          {" "}
          · Submission {request.submissionNo}
          {request.decidedByName ? ` · ${request.decidedByName}` : ""}
          {whenText ? ` · ${whenText}` : ""}
        </span>
      </p>
      {request.reason && (
        <div className="mt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            {notApproved ? "Reason" : "Revision note"}
          </span>
          <p className="text-[14px] text-ink-strong whitespace-pre-wrap break-words">{request.reason}</p>
        </div>
      )}
    </div>
  );
}

function FieldShell({
  id,
  label,
  required,
  error,
  group,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error: string | null;
  /** A radio group is labelled, not `for`-bound — a <label for> would pick
   *  the first option when the heading is clicked, which is a default answer. */
  group?: boolean;
  children: ReactNode;
}) {
  const text = (
    <>
      {label}
      {required && <span className="ml-0.5 text-altus-red">*</span>}
    </>
  );
  return (
    <div className="min-w-0">
      {group ? (
        <span id={`${id}-label`} className="mb-1.5 block text-[14px] font-bold text-ink-strong">
          {text}
        </span>
      ) : (
        <label id={`${id}-label`} htmlFor={id} className="mb-1.5 block text-[14px] font-bold text-ink-strong">
          {text}
        </label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[12.5px] font-semibold leading-snug" style={{ color: RED_DEEP }}>
          {error}
        </p>
      )}
    </div>
  );
}
