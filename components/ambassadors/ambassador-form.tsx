"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect } from "@/components/ui/lookup-select";
import {
  createAmbassador,
  updateAmbassador,
  addProduct,
  softDeleteProduct,
} from "@/app/(app)/ambassadors/actions";

const FIELD =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-[color:var(--color-altus-red)] focus-visible:border-[color:var(--color-altus-red)]";

const LABEL =
  "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

type Status = "active" | "paused" | "archived";
type PayoutType = "percent" | "flat";

export interface AmbassadorFormInitial {
  id?: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  ownerId?: string | null;
  status?: string | null;
  payoutType?: string | null;
  payoutValue?: number | string | null;
  payoutTermsNotes?: string | null;
  monthlyTarget?: number | string | null;
  monthlyTargetCount?: number | string | null;
  joinedOn?: string | null;
  source?: string | null;
  productIds?: string[];
}

interface Props {
  mode: "create" | "edit";
  initial?: AmbassadorFormInitial;
  products: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}

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
        {hint && <p className="mt-0.5 text-[13px] font-medium text-ink-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A segmented (radio-style) control. Keyboard-first: arrows move, Enter does nothing destructive. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next =
      e.key === "ArrowRight"
        ? options[(i + 1) % options.length]
        : options[(i - 1 + options.length) % options.length];
    if (next) onChange(next.value);
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="inline-flex w-full items-stretch rounded-lg border border-hairline-strong bg-white p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className="flex-1 rounded-md px-3 py-2 text-[14px] font-bold transition-colors"
            style={
              active
                ? {
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    color: "#fff",
                    boxShadow: "0 8px 18px -10px rgba(225,6,0,0.6)",
                  }
                : { color: "var(--color-ink-soft)", background: "transparent" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const numToStr = (v: number | string | null | undefined): string =>
  v == null || v === "" ? "" : String(v);

export function AmbassadorForm({ mode, initial, products, employees }: Props) {
  const router = useRouter();

  const [name, setName] = React.useState(initial?.name ?? "");
  const [company, setCompany] = React.useState(initial?.company ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? "");
  const [phone, setPhone] = React.useState(initial?.phone ?? "");
  const [ownerId, setOwnerId] = React.useState<string | null>(initial?.ownerId ?? null);
  const [status, setStatus] = React.useState<Status>(
    (initial?.status as Status) && ["active", "paused", "archived"].includes(initial!.status as string)
      ? (initial!.status as Status)
      : "active",
  );
  const [payoutType, setPayoutType] = React.useState<PayoutType>(
    initial?.payoutType === "flat" ? "flat" : "percent",
  );
  const [payoutValue, setPayoutValue] = React.useState(numToStr(initial?.payoutValue));
  const [payoutTermsNotes, setPayoutTermsNotes] = React.useState(initial?.payoutTermsNotes ?? "");
  const [monthlyTarget, setMonthlyTarget] = React.useState(numToStr(initial?.monthlyTarget));
  const [monthlyTargetCount, setMonthlyTargetCount] = React.useState(
    numToStr(initial?.monthlyTargetCount),
  );
  const [joinedOn, setJoinedOn] = React.useState(initial?.joinedOn ?? "");
  const [source, setSource] = React.useState(initial?.source ?? "");
  const [productIds, setProductIds] = React.useState<string[]>(initial?.productIds ?? []);

  // Products may grow via the LookupSelect's inline add — keep a local mirror.
  const [productList, setProductList] = React.useState(products);
  React.useEffect(() => setProductList(products), [products]);
  const [pickProduct, setPickProduct] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function toggleProduct(id: string) {
    setProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function onAddProduct(nm: string) {
    const res = await addProduct(nm);
    if (res.ok) {
      setProductList((prev) =>
        prev.some((p) => p.id === res.id) ? prev : [...prev, { id: res.id, name: res.name }],
      );
      setProductIds((prev) => (prev.includes(res.id) ? prev : [...prev, res.id]));
      return { ok: true as const, option: { id: res.id, name: res.name } };
    }
    return { ok: false as const, error: res.error };
  }

  async function onDeleteProduct(id: string) {
    const res = await softDeleteProduct(id);
    if (res.ok) {
      setProductList((prev) => prev.filter((p) => p.id !== id));
      setProductIds((prev) => prev.filter((p) => p !== id));
    }
    return res;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      document.getElementById("name")?.focus();
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    const input = {
      name,
      company,
      email,
      phone,
      photoUrl: initial?.photoUrl ?? null,
      ownerId,
      status,
      payoutType,
      payoutValue,
      payoutTermsNotes,
      monthlyTarget,
      monthlyTargetCount,
      joinedOn: joinedOn || null,
      source,
      productIds,
    };
    const res =
      mode === "create"
        ? await createAmbassador(input)
        : await updateAmbassador(initial!.id!, input);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({
      message: mode === "create" ? "Ambassador added." : "Ambassador updated.",
      type: "success",
    });
    router.push(`/ambassadors/${res.id}` as Route);
    router.refresh();
  }

  function onCancel() {
    if (mode === "edit" && initial?.id) router.push(`/ambassadors/${initial.id}` as Route);
    else router.push("/ambassadors/directory" as Route);
  }

  const valueAdorn = payoutType === "percent" ? "%" : "₹";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Section title="Partner" hint="Who the ambassador is.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Name" required htmlFor="name">
            <input
              id="name"
              autoFocus
              className={FIELD}
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
              placeholder="Partner full name"
            />
          </Field>
          <Field label="Company" htmlFor="company">
            <input
              id="company"
              className={FIELD}
              value={company}
              maxLength={200}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company"
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              className={FIELD}
              value={email}
              maxLength={200}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              inputMode="email"
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <input
              id="phone"
              className={FIELD}
              value={phone}
              maxLength={40}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              inputMode="tel"
            />
          </Field>
        </div>
      </Section>

      <Section title="Relationship" hint="Who manages this partner, and where they came from.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Relationship Owner">
            <LookupSelect
              label="owner"
              value={ownerId}
              onChange={setOwnerId}
              options={employees}
              className={FIELD}
              placeholder="Assign a salesperson…"
            />
          </Field>
          <Field label="Status">
            <Segmented<Status>
              ariaLabel="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "archived", label: "Archived" },
              ]}
            />
          </Field>
          <Field label="Joined On" htmlFor="joinedOn">
            <input
              id="joinedOn"
              type="date"
              className={FIELD}
              value={joinedOn}
              onChange={(e) => setJoinedOn(e.target.value)}
            />
          </Field>
          <Field label="Source" htmlFor="source">
            <input
              id="source"
              className={FIELD}
              value={source}
              maxLength={200}
              onChange={(e) => setSource(e.target.value)}
              placeholder="How they were acquired"
            />
          </Field>
        </div>
      </Section>

      <Section title="Commission Terms" hint="What this partner earns on a won referral.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Payout Type">
            <Segmented<PayoutType>
              ariaLabel="Payout type"
              value={payoutType}
              onChange={setPayoutType}
              options={[
                { value: "percent", label: "Percent" },
                { value: "flat", label: "Flat ₹" },
              ]}
            />
          </Field>
          <Field
            label={payoutType === "percent" ? "Payout Value (%)" : "Payout Value (₹)"}
            htmlFor="payoutValue"
          >
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-ink-subtle"
                aria-hidden
              >
                {valueAdorn}
              </span>
              <input
                id="payoutValue"
                className={FIELD + " pl-8 tabular-nums"}
                value={payoutValue}
                onChange={(e) => setPayoutValue(e.target.value)}
                placeholder={payoutType === "percent" ? "10" : "5000"}
                inputMode="decimal"
              />
            </div>
          </Field>
          <Field label="Payout Terms Notes" htmlFor="payoutTermsNotes" className="col-span-2 max-md:col-span-1">
            <textarea
              id="payoutTermsNotes"
              className={FIELD + " min-h-[72px] resize-y"}
              value={payoutTermsNotes}
              maxLength={2000}
              onChange={(e) => setPayoutTermsNotes(e.target.value)}
              placeholder="Any special terms, slabs, or caveats"
            />
          </Field>
        </div>
      </Section>

      <Section title="Monthly Target" hint="What you expect from this partner each month.">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Revenue Target (₹)" htmlFor="monthlyTarget">
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-ink-subtle"
                aria-hidden
              >
                ₹
              </span>
              <input
                id="monthlyTarget"
                className={FIELD + " pl-8 tabular-nums"}
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(e.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
            </div>
          </Field>
          <Field label="Referrals / Month (#)" htmlFor="monthlyTargetCount">
            <input
              id="monthlyTargetCount"
              className={FIELD + " tabular-nums"}
              value={monthlyTargetCount}
              onChange={(e) => setMonthlyTargetCount(e.target.value)}
              placeholder="0"
              inputMode="numeric"
            />
          </Field>
        </div>
      </Section>

      <Section title="Products to Pitch" hint="What this partner refers us for.">
        {productList.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {productList.map((p) => {
              const on = productIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  aria-pressed={on}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-bold transition-colors"
                  style={
                    on
                      ? {
                          background:
                            "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                          color: "var(--color-altus-red-deep)",
                          boxShadow:
                            "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
                        }
                      : {
                          background: "var(--color-surface-soft)",
                          color: "var(--color-ink-soft)",
                          boxShadow: "inset 0 0 0 1px var(--color-hairline)",
                        }
                  }
                >
                  {on && <Check size={14} strokeWidth={2.8} />}
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="max-w-[420px]">
          <span className={LABEL}>Add a Product</span>
          <LookupSelect
            label="product"
            value={pickProduct}
            onChange={(id) => {
              if (id) {
                toggleProduct(id);
                setPickProduct(null);
              }
            }}
            options={productList}
            onAdd={onAddProduct}
            onDelete={onDeleteProduct}
            className={FIELD}
            placeholder="Pick or create a product…"
          />
        </div>
      </Section>

      {error && (
        <div
          role="alert"
          className="rounded-lg px-4 py-3 text-[14px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
            color: "var(--color-altus-red-deep)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-[15px] font-bold text-ink-strong transition-colors hover:border-hairline-strong"
        >
          <ArrowLeft size={16} strokeWidth={2.4} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl py-3 px-7 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)",
          }}
        >
          {submitting ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={2.4} />}
          {mode === "create" ? "Add Ambassador" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
