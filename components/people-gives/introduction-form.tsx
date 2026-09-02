"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { ManagedSelect } from "./managed-select";
import { createIntroduction } from "@/app/(app)/people-gives/actions";
import type { PgLookups } from "@/lib/queries/people-gives";

const FIELD =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-[color:var(--color-altus-red)] focus-visible:border-[color:var(--color-altus-red)]";

const LABEL =
  "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

function Field({
  label,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
        {required && <span style={{ color: "var(--color-altus-red)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-section border border-hairline bg-surface-card p-6 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div className="mb-4">
        <h2 className="font-bold text-ink-strong" style={{ fontSize: 17, letterSpacing: "-0.01em" }}>
          {title}
        </h2>
        {hint && (
          <p className="mt-0.5 text-[13px] font-medium text-ink-subtle">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function IntroductionForm({
  lookups,
  todayLabel,
}: {
  lookups: PgLookups;
  todayLabel: string;
}) {
  const router = useRouter();

  const [referenceSourceId, setReferenceSourceId] = React.useState<string | null>(null);
  const [introFirst, setIntroFirst] = React.useState("");
  const [introLast, setIntroLast] = React.useState("");
  const [introCell, setIntroCell] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [prospectFirst, setProspectFirst] = React.useState("");
  const [prospectLast, setProspectLast] = React.useState("");
  const [designationId, setDesignationId] = React.useState<string | null>(null);
  const [businessCategoryId, setBusinessCategoryId] = React.useState<string | null>(null);
  const [nature, setNature] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [reminder, setReminder] = React.useState("");
  const [salesPersonId, setSalesPersonId] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const firstInvalidId =
      !introFirst.trim() ? "introFirst"
      : !introLast.trim() ? "introLast"
      : !company.trim() ? "company"
      : !prospectFirst.trim() ? "pFirst"
      : !prospectLast.trim() ? "pLast"
      : !nature.trim() ? "nature"
      : null;
    if (firstInvalidId) {
      // Keyboard-first: jump the caret to the first empty required field.
      document.getElementById(firstInvalidId)?.focus();
      setError("Please fill every required field (marked *). Type “NA” if a value is genuinely unavailable.");
      return;
    }
    setSubmitting(true);
    const res = await createIntroduction({
      referenceSourceId,
      introducerFirstName: introFirst,
      introducerLastName: introLast,
      introducerCell: introCell,
      prospectCompany: company,
      prospectFirstName: prospectFirst,
      prospectLastName: prospectLast,
      designationId,
      businessCategoryId,
      natureOfBusiness: nature,
      notes,
      nextReminderDate: reminder || null,
      salesPersonId,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Introduction saved.", type: "success" });
    router.push("/people-gives" as Route);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Section title="Introduction" hint="When and where this introduction came from.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Received On">
            <div
              className={FIELD + " flex items-center"}
              style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-muted)", cursor: "not-allowed" }}
              aria-readonly
            >
              {todayLabel}
            </div>
          </Field>
          <Field label="Reference Source">
            <ManagedSelect
              kind="reference_source"
              label="reference source"
              value={referenceSourceId}
              onChange={setReferenceSourceId}
              options={lookups.referenceSources}
              className={FIELD}
            />
          </Field>
        </div>
      </Section>

      <Section title="Introducer" hint="The person who can make the introduction.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="First Name" required htmlFor="introFirst">
            <input id="introFirst" autoFocus className={FIELD} value={introFirst} maxLength={120} onChange={(e) => setIntroFirst(e.target.value)} placeholder="First name" />
          </Field>
          <Field label="Last Name" required htmlFor="introLast">
            <input id="introLast" className={FIELD} value={introLast} maxLength={120} onChange={(e) => setIntroLast(e.target.value)} placeholder="Last name" />
          </Field>
          <Field label="Cell Number" htmlFor="introCell" className="col-span-2 max-md:col-span-1">
            <input id="introCell" className={FIELD} value={introCell} maxLength={40} onChange={(e) => setIntroCell(e.target.value)} placeholder="Optional" inputMode="tel" />
          </Field>
        </div>
      </Section>

      <Section title="Prospect" hint="Who they can connect us to.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Company" required htmlFor="company" className="col-span-2 max-md:col-span-1">
            <input id="company" className={FIELD} value={company} maxLength={200} onChange={(e) => setCompany(e.target.value)} placeholder="Prospect company" />
          </Field>
          <Field label="First Name" required htmlFor="pFirst">
            <input id="pFirst" className={FIELD} value={prospectFirst} maxLength={120} onChange={(e) => setProspectFirst(e.target.value)} placeholder="First name" />
          </Field>
          <Field label="Last Name" required htmlFor="pLast">
            <input id="pLast" className={FIELD} value={prospectLast} maxLength={120} onChange={(e) => setProspectLast(e.target.value)} placeholder="Last name" />
          </Field>
          <Field label="Designation">
            <ManagedSelect kind="designation" label="designation" value={designationId} onChange={setDesignationId} options={lookups.designations} className={FIELD} />
          </Field>
          <Field label="Business Category">
            <ManagedSelect kind="business_category" label="business category" value={businessCategoryId} onChange={setBusinessCategoryId} options={lookups.businessCategories} className={FIELD} />
          </Field>
          <Field label="Nature of Business" required htmlFor="nature" className="col-span-2 max-md:col-span-1">
            <textarea id="nature" className={FIELD + " min-h-[88px] resize-y"} value={nature} maxLength={2000} onChange={(e) => setNature(e.target.value)} placeholder="What the prospect's business is" />
          </Field>
        </div>
      </Section>

      <Section title="Follow-up" hint="Routing and reminders.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Next Reminder Date" htmlFor="reminder">
            <input id="reminder" type="date" className={FIELD} value={reminder} onChange={(e) => setReminder(e.target.value)} />
          </Field>
          <Field label="Assign Salesperson">
            <ManagedSelect kind="sales_person" label="salesperson" value={salesPersonId} onChange={setSalesPersonId} options={lookups.salesPeople} className={FIELD} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="col-span-2 max-md:col-span-1">
            <textarea id="notes" className={FIELD + " min-h-[72px] resize-y"} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context" />
          </Field>
        </div>
      </Section>

      {error && (
        <div
          role="alert"
          className="rounded-lg px-4 py-3 text-[14px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }}
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        <button
          type="button"
          onClick={() => router.push("/people-gives" as Route)}
          className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-[15px] font-bold text-ink-strong transition-colors hover:border-hairline-strong"
        >
          <ArrowLeft size={16} strokeWidth={2.4} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl py-3 px-7 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}
        >
          {submitting ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={2.4} />}
          Save Introduction
        </button>
      </div>
    </form>
  );
}
