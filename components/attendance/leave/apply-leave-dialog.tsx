"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Check, Mic, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  LEAVE_KIND_LABELS,
  OFFICE_PHONE_AVAILABILITY_LABELS,
  type LeaveKind,
  type OfficePhoneAvailability,
} from "@/db/enums";
import { leaveDays } from "@/lib/attendance/leave-cycle";
import { requestLeave } from "@/app/(app)/attendance/leave/actions";
import { useDictation } from "@/components/ui/use-dictation";
import {
  LEAVE_INPUT_CLASS,
  LEAVE_INPUT_RING,
  LeaveField,
  dayCountLabel,
  prettyDate,
} from "./leave-ui";

/** The half of the day a boundary date carries. */
type Portion = "full" | "half";

const GREEN = "#15803d";
const RED = "#b91c1c";
const SLATE = "#475569";

/**
 * The office-phone answers, in the order the row shows them: NA first, then the
 * Yes / No pair the other two rows carry. Yes and No therefore sit in the same
 * two positions on all three rows, and only this row has anything to its left.
 *
 * "NA" is THIS form's wording. The review panel still spells out "Not
 * applicable" from the shared enum labels, where the reader is reading one
 * request rather than scanning a strip of buttons. The stored VALUES are the
 * OFFICE_PHONE_AVAILABILITY enum's, untouched — the annotation below makes a
 * typo in one a compile error rather than a row that silently stores nothing.
 */
const OFFICE_PHONE_OPTIONS: readonly { value: OfficePhoneAvailability; label: string }[] = [
  { value: "na", label: "NA" },
  { value: "yes", label: OFFICE_PHONE_AVAILABILITY_LABELS.yes },
  { value: "no", label: OFFICE_PHONE_AVAILABILITY_LABELS.no },
];

/**
 * The Leave Duration ground. A step darker than the `surface-soft` the rest of
 * the form uses, with the stronger hairline, so the block holding the Full /
 * Half decisions is findable at a glance instead of dissolving into the card.
 * Same radius and same padding — only the contrast moved.
 */
const DURATION_BOX = {
  background: "var(--color-surface-track)",
  border: "1px solid var(--color-hairline-strong)",
} as const;

export interface ApplyLeaveDialogProps {
  today: string;
  /**
   * The kinds THIS employee may request, resolved server-side from their worker
   * type (lib/attendance/leave-eligibility). One entry means the choice is not
   * a choice — the control collapses to a static line rather than a radio pair
   * with nothing to pick.
   */
  allowedKinds: readonly LeaveKind[];
  /** Remaining paid days, for the client-side over-request guard. */
  paidRemaining: number;
  /** Whether paid leave is an entitlement at all (drives the guard's message). */
  paidEligible: boolean;
  /** This period's entitlement and its name. Still accepted (the parent computes
   *  it and the leave-credit logic is unchanged) but no longer shown in the
   *  form — the standing balance lives on the Leave page, not inside every
   *  application. */
  allowance: number;
  cycleLabel: string;
  beforeProbation: boolean;
  /** The admin-editable dropdown (0208). Empty ⇒ the field is not rendered. */
  categories: readonly { id: string; name: string }[];
}

/**
 * APPLY FOR LEAVE (0208).
 *
 * ── TWO COLUMNS, ONE SCREEN ────────────────────────────────────────────────
 * Leave Details (what and when) on the left, Request Details (why and how to
 * reach you) on the right, so the form reads across rather than scrolls down.
 * The "available leave credit" bar was removed from here — it stated a standing
 * balance that belongs on the Leave page, not re-drawn inside every application,
 * and it cost a row of vertical space the two-column layout exists to reclaim.
 * The credit LOGIC is untouched: `paidRemaining` / `paidEligible` still drive
 * the over-request guard below.
 *
 * ── HALF DAYS SIT BESIDE THE DATE THEY BELONG TO ───────────────────────────
 * Each boundary date carries its own Full / Half picker, because the two halves
 * are not the same half: on the START date "half" means you work the morning and
 * leave at lunch; on the END date it means you are back after lunch. The leave
 * engine models a range with a half on the first and/or last day (intermediate
 * days are always full), so the middle dates show as Full — and every real case
 * this was asked for (out Tuesday lunchtime, back Friday lunchtime) is a boundary
 * half. The running total does the arithmetic out loud.
 */
export function ApplyLeaveDialog({
  today,
  allowedKinds,
  paidRemaining,
  paidEligible,
  categories,
}: ApplyLeaveDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LeaveKind>(allowedKinds[0] ?? "unpaid");
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startPortion, setStartPortion] = useState<Portion>("full");
  const [endPortion, setEndPortion] = useState<Portion>("full");
  const [reason, setReason] = useState("");
  const [personalPhone, setPersonalPhone] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [computer, setComputer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Voice typing for the reason box — the same Web Speech hook the rest of the
   * app dictates with. Finalised phrases are appended to `reason` as they are
   * spoken, so the textarea stays the single source of the text and typing and
   * dictating mix freely. Where the browser has no Speech API `supported` is
   * false, the mic is not rendered at all, and the field is exactly what it was.
   * The slice keeps a long dictation inside the same 1000-character limit the
   * textarea enforces on typing.
   */
  const dictation = useDictation({
    value: reason,
    onChange: (v) => setReason(v.slice(0, 1000)),
  });

  const singleDay = startDate === endDate;
  const startHalfDay = startPortion === "half";
  // On a one-day leave both pickers name the same day, so the END one is hidden
  // rather than left free to contradict the start. The DB CHECK refuses that
  // combination too; this is why it never has to.
  const endHalfDay = !singleDay && endPortion === "half";

  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && endDate >= startDate;
  const days = validRange ? leaveDays({ startDate, endDate, startHalfDay, endHalfDay }) : null;
  const dates = validRange ? eachDateInclusive(startDate, endDate) : [];

  // Over-request guard, mirrored from the server action so the employee is told
  // BEFORE submitting rather than after. The server is still the boundary.
  const overBalance = kind === "paid" && days != null && paidEligible && days > paidRemaining;

  function reset() {
    setKind(allowedKinds[0] ?? "unpaid");
    setCategoryId("");
    setStartDate(today);
    setEndDate(today);
    setStartPortion("full");
    setEndPortion("full");
    dictation.stop();
    setReason("");
    setPersonalPhone("");
    setOfficePhone("");
    setComputer("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (endDate < startDate) {
      setError("End date can't be before the start date.");
      return;
    }
    if (overBalance) {
      setError(
        `You have ${paidRemaining} paid ${paidRemaining === 1 ? "day" : "days"} left this period.`,
      );
      return;
    }
    startTransition(async () => {
      const res = await requestLeave({
        kind,
        categoryId: categoryId || null,
        startDate,
        endDate,
        startHalfDay,
        endHalfDay,
        reason: reason.trim() || undefined,
        // Unanswered stays NULL. The columns are nullable precisely so "didn't
        // say" and "said no" remain different facts.
        availPersonalPhone: personalPhone ? personalPhone === "yes" : null,
        availOfficePhone: (officePhone || null) as OfficePhoneAvailability | null,
        availComputer: computer ? computer === "yes" : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Leave request submitted.", type: "success" });
      reset();
      setOpen(false);
      router.refresh();
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
          className="wg-btn rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white"
          style={{
            background: "linear-gradient(135deg, #E10600, #A80400)",
            boxShadow: "0 3px 12px -6px rgba(225,6,0,0.55)",
          }}
        >
          + Apply Leave
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] max-w-[920px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] bg-surface-card p-5 max-md:p-4"
          style={{
            border: "1px solid var(--color-hairline)",
            boxShadow: "0 24px 60px -30px rgba(15,23,42,0.5)",
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: 19,
                  letterSpacing: "-0.02em",
                }}
              >
                Apply for Leave
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12.5px] text-ink-subtle">
                Your manager or an admin will review this request.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:text-ink-strong"
                style={{ border: "1px solid var(--color-hairline)" }}
              >
                <X size={14} strokeWidth={2.6} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
              {/* ── LEFT: Leave Details ─────────────────────────────────── */}
              <section className="space-y-3.5">
                <ColumnHeading>Leave Details</ColumnHeading>

                <LeaveField label="Leave Type">
                  {allowedKinds.length === 1 ? (
                    <div
                      className="rounded-lg px-3 py-2 text-[14px] font-medium text-ink-strong"
                      style={{
                        background: "var(--color-surface-soft)",
                        border: "1px solid var(--color-hairline)",
                      }}
                    >
                      {LEAVE_KIND_LABELS[allowedKinds[0]!]}
                      <span className="ml-1.5 text-[12px] font-normal text-ink-subtle">
                        (the only type available to you)
                      </span>
                    </div>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label="Leave type"
                      className="grid grid-cols-2 gap-1 rounded-lg p-1"
                      style={{
                        background: "var(--color-surface-soft)",
                        border: "1px solid var(--color-hairline)",
                      }}
                    >
                      {allowedKinds.map((k) => {
                        const active = kind === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setKind(k)}
                            className="rounded-md px-3 py-1.5 text-[13.5px] font-semibold transition-colors"
                            style={
                              active
                                ? {
                                    background: "var(--color-surface-card)",
                                    color: "var(--color-ink-strong)",
                                    boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
                                  }
                                : { background: "transparent", color: "var(--color-ink-subtle)" }
                            }
                          >
                            {LEAVE_KIND_LABELS[k]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </LeaveField>

                <div className="grid grid-cols-2 gap-3">
                  <LeaveField label="From Date" htmlFor="leave-start">
                    <input
                      id="leave-start"
                      required
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (endDate < e.target.value) setEndDate(e.target.value);
                      }}
                      className={`${LEAVE_INPUT_CLASS} tabular-nums`}
                      style={LEAVE_INPUT_RING}
                    />
                  </LeaveField>
                  <LeaveField label="To Date" htmlFor="leave-end">
                    <input
                      id="leave-end"
                      required
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`${LEAVE_INPUT_CLASS} tabular-nums`}
                      style={LEAVE_INPUT_RING}
                    />
                  </LeaveField>
                </div>

                <LeaveField label="Leave Duration">
                  <DurationByDate
                    dates={dates}
                    singleDay={singleDay}
                    startPortion={startPortion}
                    endPortion={endPortion}
                    setStartPortion={setStartPortion}
                    setEndPortion={setEndPortion}
                  />
                </LeaveField>

                <div
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{
                    background: "var(--color-surface-soft)",
                    border: "1px solid var(--color-hairline)",
                  }}
                >
                  <span className="text-[12.5px] font-semibold text-ink-soft">Total Days</span>
                  <span
                    className="text-[15px] font-bold tabular-nums text-ink-strong"
                    aria-live="polite"
                  >
                    {days == null ? "—" : dayCountLabel(days)}
                  </span>
                </div>
              </section>

              {/* ── RIGHT: Request Details ──────────────────────────────── */}
              <section className="space-y-3.5">
                <ColumnHeading>Request Details</ColumnHeading>

                {categories.length > 0 && (
                  <LeaveField label="Leave Category" htmlFor="leave-category">
                    <select
                      id="leave-category"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className={LEAVE_INPUT_CLASS}
                      style={LEAVE_INPUT_RING}
                    >
                      <option value="">Select a category…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </LeaveField>
                )}

                <LeaveField label="Leave Reason" hint="optional" htmlFor="leave-reason">
                  <div className="relative">
                    <textarea
                      id="leave-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="e.g. Family function in Surat"
                      /* pr-10 is the same 40px the app's other dictatable fields
                         reserve, so a long line never runs under the mic. */
                      className={`${LEAVE_INPUT_CLASS} resize-y pr-10`}
                      style={LEAVE_INPUT_RING}
                    />
                    {dictation.supported && (
                      <button
                        type="button"
                        onClick={dictation.toggle}
                        aria-pressed={dictation.recording}
                        aria-label={
                          dictation.recording ? "Stop dictation" : "Dictate the leave reason"
                        }
                        title={dictation.recording ? "Stop dictation" : "Dictate"}
                        /* Top-right, not bottom-right: the browser draws the
                           resize grip in the bottom corner, and this is where the
                           app's other dictatable textareas put their mic. */
                        className={`absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md transition-colors ${
                          dictation.recording
                            ? "animate-pulse text-white"
                            : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
                        }`}
                        style={
                          dictation.recording
                            ? { background: "var(--color-altus-red)" }
                            : undefined
                        }
                      >
                        <Mic size={14} strokeWidth={2.3} aria-hidden />
                      </button>
                    )}
                  </div>
                </LeaveField>

                <fieldset className="space-y-2.5">
                  <legend className="mb-1.5 text-[12px] font-semibold text-ink-soft">
                    While you&rsquo;re away
                  </legend>
                  <ChoiceRow
                    label="Available on personal phone"
                    value={personalPhone}
                    onChange={setPersonalPhone}
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                  />
                  <ChoiceRow
                    label="Available on office phone"
                    value={officePhone}
                    onChange={setOfficePhone}
                    options={OFFICE_PHONE_OPTIONS}
                  />
                  <ChoiceRow
                    label="Computer & internet access"
                    value={computer}
                    onChange={setComputer}
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                  />
                </fieldset>
              </section>

              {/* ── FOOTER (full width) ─────────────────────────────────── */}
              <div className="md:col-span-2">
                {(error || overBalance) && (
                  <div
                    role="alert"
                    className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] font-medium"
                    style={{
                      background: "rgba(225,6,0,0.06)",
                      color: "#A80400",
                      border: "1px solid rgba(225,6,0,0.22)",
                    }}
                  >
                    <AlertCircle size={14} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                    {error ??
                      `You have ${paidRemaining} paid ${paidRemaining === 1 ? "day" : "days"} left this period.`}
                  </div>
                )}
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-t pt-3.5"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <p className="max-w-[52ch] text-[12px] text-ink-subtle">
                    {kind === "unpaid"
                      ? "Approved unpaid leave marks these dates Absent and the applicable salary is deducted."
                      : ""}
                  </p>
                  <div className="ml-auto flex gap-2">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="wg-btn rounded-lg px-3.5 py-2 text-[13.5px] font-semibold text-ink-soft"
                        style={{ border: "1px solid var(--color-hairline)" }}
                      >
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="submit"
                      disabled={pending || overBalance}
                      className="wg-btn rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, #E10600, #A80400)",
                        boxShadow: "0 3px 12px -6px rgba(225,6,0,0.55)",
                      }}
                    >
                      {pending ? "Submitting…" : "Submit Leave Request"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Small uppercase section label heading a column. */
function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
      {children}
    </p>
  );
}

/** Every calendar date from `start` to `end` inclusive (YYYY-MM-DD), UTC so it
 *  never drifts across a DST boundary. Bounded so a mis-typed range can't spin. */
function eachDateInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  const cur = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 400; i++) {
    const iso = cur.toISOString().slice(0, 10);
    out.push(iso);
    if (iso >= end) break;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * The per-date duration list. A single day is one Full / Half toggle; a range
 * lists each date, with the FIRST and LAST selectable (they map to the leave's
 * start/end half-day). Intermediate dates are Full — the leave engine has no
 * per-day portion for them — and say so once, quietly, rather than looking
 * broken. A long range collapses its middle so the list never runs off-screen.
 */
function DurationByDate({
  dates,
  singleDay,
  startPortion,
  endPortion,
  setStartPortion,
  setEndPortion,
}: {
  dates: string[];
  singleDay: boolean;
  startPortion: Portion;
  endPortion: Portion;
  setStartPortion: (v: Portion) => void;
  setEndPortion: (v: Portion) => void;
}) {
  if (dates.length === 0) {
    return (
      <div
        className="rounded-lg px-3 py-2 text-[12.5px] text-ink-subtle"
        style={DURATION_BOX}
      >
        Pick a valid date range.
      </div>
    );
  }

  if (singleDay) {
    return (
      <FullHalfToggle
        value={startPortion}
        onChange={setStartPortion}
        halfLabel="Half Day"
        ariaLabel="Leave duration"
      />
    );
  }

  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const middle = dates.slice(1, -1);
  const collapse = middle.length > 12;

  return (
    <div
      /* A rule between the dates instead of a gap: the rows read as a list you
         scan down, and the block is no taller for it. */
      className="divide-y divide-[color:var(--color-hairline-strong)] rounded-lg p-1.5"
      style={DURATION_BOX}
    >
      <DateRow iso={first} editable portion={startPortion} onChange={setStartPortion} halfLabel="2nd half" />

      {collapse ? (
        <p className="px-1.5 py-1 text-[11.5px] text-ink-subtle">
          {middle.length} days in between · Full day
        </p>
      ) : (
        middle.map((iso) => <DateRow key={iso} iso={iso} editable={false} />)
      )}

      <DateRow iso={last} editable portion={endPortion} onChange={setEndPortion} halfLabel="1st half" />

      <p className="px-1.5 pt-1.5 text-[11px] text-ink-subtle">
        Half-days apply to the first and last day of the range.
      </p>
    </div>
  );
}

/** One date in the duration list: label + either a Full/Half toggle or a static
 *  "Full day" chip for the intermediate dates. */
function DateRow({
  iso,
  editable,
  portion,
  onChange,
  halfLabel,
}: {
  iso: string;
  editable: boolean;
  portion?: Portion;
  onChange?: (v: Portion) => void;
  halfLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1.5 py-1">
      <span className="text-[12.5px] font-medium tabular-nums text-ink-strong">
        {prettyDate(iso)}
      </span>
      {editable && portion && onChange ? (
        <FullHalfToggle
          value={portion}
          onChange={onChange}
          halfLabel={halfLabel ?? "Half day"}
          ariaLabel={`Duration for ${prettyDate(iso)}`}
          compact
        />
      ) : (
        <span
          className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-ink-subtle"
          style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline)" }}
        >
          Full day
        </span>
      )}
    </div>
  );
}

/** Full / Half segmented control. `compact` shrinks it for the per-date rows. */
function FullHalfToggle({
  value,
  onChange,
  halfLabel,
  ariaLabel,
  compact = false,
}: {
  value: Portion;
  onChange: (v: Portion) => void;
  halfLabel: string;
  ariaLabel: string;
  compact?: boolean;
}) {
  const options: { v: Portion; label: string }[] = [
    { v: "full", label: "Full Day" },
    { v: "half", label: halfLabel },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid grid-cols-2 gap-1 rounded-lg ${compact ? "p-0.5" : "p-1"}`}
      style={{
        background: "var(--color-surface-card)",
        // The standalone (single-day) toggle IS the Leave Duration box, so it
        // takes the same stronger hairline the range list's container does. The
        // compact ones sit INSIDE that box and stay quiet.
        border: `1px solid var(--color-hairline${compact ? "" : "-strong"})`,
        minWidth: compact ? 152 : undefined,
      }}
    >
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.v)}
            className={`rounded-md font-semibold transition-colors ${
              compact ? "px-2 py-1 text-[11.5px]" : "px-3 py-1.5 text-[13px]"
            }`}
            style={
              active
                ? {
                    background: "var(--color-surface-soft)",
                    color: "var(--color-ink-strong)",
                    boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
                  }
                : { background: "transparent", color: "var(--color-ink-subtle)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One reachability question, Yes = green / No = red, everything else neutral.
 *
 * The selected state is never colour ALONE: the chosen answer also gains a tick,
 * a solid tinted fill and a heavier border, so it reads for a colour-blind user
 * and in a screenshot. Answers are OPTIONAL and start UNSET — the columns are
 * nullable so "didn't say" stays distinct from "said no" — and clicking the
 * chosen answer again clears it, so one given by accident can be taken back.
 */
function ChoiceRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[12.5px] text-ink-soft">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          const tone = o.value === "yes" ? GREEN : o.value === "no" ? RED : SLATE;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active ? "" : o.value)}
              className="inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors"
              /* One width for every answer on every row, so Yes and No line up
                 down the three rows, and picking one — which adds a tick — does
                 not re-flow the strip under the cursor. */
              style={{
                minWidth: 58,
                ...(active
                  ? {
                      background: `color-mix(in srgb, ${tone} 13%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
                      color: tone,
                    }
                  : {
                      background: "var(--color-surface-soft)",
                      border: "1px solid var(--color-hairline)",
                      color: "var(--color-ink-subtle)",
                    }),
              }}
            >
              {active && <Check size={11} strokeWidth={3} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
