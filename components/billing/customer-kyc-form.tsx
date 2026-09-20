"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ExternalLink, FileText, Loader2, Plus, UserPlus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE } from "@/lib/billing/ui";
import { stateFromGstin } from "@/lib/billing/states";
import {
  removeCustomerDocumentAction,
  saveCustomerKycAction,
  uploadCustomerDocumentAction,
} from "@/app/(app)/billing/customers/kyc-actions";
import { DictateTextarea } from "@/components/billing/dictate-textarea";
import {
  CustomerDocumentsPicker,
  emptyStagedDocs,
  type StagedDocs,
} from "@/components/billing/customer-documents-picker";
import { introducerRows, openKycPrintView } from "@/lib/billing/kyc-print";
import type { CustomerDetail } from "@/lib/queries/billing-customers";
import type { CustomerIntroducer } from "@/db/schema";

/**
 * CREATE NEW CUSTOMER KYC.
 *
 * Six sections, in the order of the reference form: Identity, Registration &
 * Tax, Contact Person, Addresses, Commercial & Credit, Documents.
 *
 * EVERY DROPDOWN IS FED FROM `billing_lookups`, which falls back to the
 * registry defaults in `lib/billing/lookups.ts`. Nothing here holds a
 * hardcoded list. The in-room dropdown editor was retired on 2026-09-20 —
 * this form and the Customer Master are where a CUSTOMER's data lives, and
 * the issuing company's own details come from Admin › Billing Profiles.
 *
 * THE STATE IS DERIVED FROM THE GSTIN and not asked for separately. The first
 * two digits of a GSTIN are the state code; a form that asked again would let
 * the two disagree, and the invoice would then carry a place of supply that
 * contradicts the number printed beside it. Typing a GSTIN shows the state it
 * resolves to, which is also the cheapest possible check that it was typed
 * correctly.
 */

type Contact = {
  firstName: string; lastName: string; phone: string; whatsapp: string; email: string;
  designation: string; department: string; notes: string;
};
type Address = {
  kind: "billing" | "shipping";
  line1: string; line2: string; line3: string; line4: string;
  city: string; stateName: string; country: string; pincode: string;
};

const emptyContact = (): Contact => ({
  firstName: "", lastName: "", phone: "", whatsapp: "", email: "",
  designation: "", department: "", notes: "",
});
const emptyAddress = (kind: "billing" | "shipping"): Address => ({
  kind, line1: "", line2: "", line3: "", line4: "",
  city: "", stateName: "", country: "India", pincode: "",
});


export function CustomerKycForm({
  options,
  employees,
  nextCode,
  initial,
  productTypeOptions,
}: {
  options: Record<string, string[]>;
  employees: { id: string; name: string }[];
  nextCode: string;
  /** A saved client — the form opens filled in and saves as an EDIT. */
  initial?: CustomerDetail;
  /** Product names from the Admin Panel's product master. */
  productTypeOptions: string[];
}) {
  const editing = Boolean(initial);
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [f, setF] = React.useState(() => ({
    name: initial?.name ?? "",
    gstin: initial?.gstin ?? "",
    pan: initial?.pan ?? "",
    msmeNo: initial?.msmeNo ?? "",
    gstRegType: initial?.gstRegType ?? "Regular",
    currency: initial?.currency ?? "INR",
    country: initial?.country ?? "India",
    stateName: initial?.stateName ?? "",
    grade: initial?.grade ?? "",
    salesPersonId: initial?.salesPersonId ?? "",
    exportChoice: initial ? (initial.isExport ? "Yes" : "No") : "",
    tagText: initial?.tags.join(", ") ?? "",
    customerTypes: initial?.customerTypes ?? ([] as string[]),
    industryTypes: initial?.industryTypes ?? ([] as string[]),
    productTypes: initial?.productTypes ?? ([] as string[]),
    paymentTerms: initial?.paymentTerms ?? "",
    freightCharges: initial?.freightCharges ?? "",
    creditDays: initial?.creditDays ?? "",
    creditLimit: initial?.creditLimit ?? "",
    businessCategory: initial?.businessCategory ?? "",
    natureOfBusiness: initial?.natureOfBusiness ?? "",
    linkedinUrl: initial?.linkedinUrl ?? "",
    instagramHandle: initial?.instagramHandle ?? "",
    subscription: initial?.subscription ?? "",
    emi: initial?.emi ?? "",
    moduleWisePayment: initial?.moduleWisePayment ?? "",
    transporter: initial?.transporter ?? "",
    quantityDeviation: initial?.quantityDeviation ?? "",
    otherReferences: initial?.otherReferences ?? "",
    notes: initial?.notes ?? "",
  }));
  /** Per contact: WhatsApp follows the contact number. */
  const [sameWa, setSameWa] = React.useState<Record<number, boolean>>({});
  const [contacts, setContacts] = React.useState<Contact[]>(() =>
    initial?.contacts.length ? initial.contacts : [emptyContact()],
  );
  /* BILLING ONLY TO START WITH. The form used to open with an empty shipping
     block already on it, which asked every single client for a second address
     whether or not it had one — and most ship where they are billed. "Add
     address" puts a shipping block back for the ones that differ, with its
     "Copy from billing address" button, so nothing is lost but the assumption. */
  const [addresses, setAddresses] = React.useState<Address[]>(() =>
    // Always a billing block to fill in; any saved shipping ones ride along.
    initial?.addresses.some((a) => a.kind === "billing")
      ? initial.addresses
      : [emptyAddress("billing"), ...(initial?.addresses ?? [])],
  );

  const [docs, setDocs] = React.useState<StagedDocs>(emptyStagedDocs);
  /** The Introducer box — saved as one object on the customer. */
  const [intro, setIntroState] = React.useState<CustomerIntroducer>(() => initial?.introducer ?? {});
  const setIntro = <K extends keyof CustomerIntroducer>(k: K, v: CustomerIntroducer[K]) =>
    setIntroState((p) => ({ ...p, [k]: v }));
  /** Files already on this client (edit mode) — View opens, Remove deletes. */
  const [savedDocs, setSavedDocs] = React.useState(() => initial?.documents ?? []);
  async function removeSavedDoc(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from this client?`)) return;
    const r = await removeCustomerDocumentAction(id);
    if (!r.ok) {
      fireToast({ message: r.error, type: "error" });
      return;
    }
    setSavedDocs((list) => list.filter((d) => d.id !== id));
    fireToast({ message: `${name} removed.`, type: "success" });
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const gstState = stateFromGstin(f.gstin);

  async function save() {
    setError(null);
    // MANDATORY — everything New Document fetches from this KYC when the
    // client is picked in Bill To (the server checks the same list).
    const missing = kycMissing({
      name: f.name,
      paymentTerms: f.paymentTerms,
      contact: contacts[0],
      billing: addresses.find((a) => a.kind === "billing"),
    });
    if (missing) {
      setError(missing);
      fireToast({ message: missing, type: "error" });
      return;
    }
    setBusy(true);
    try {
      const r = await saveCustomerKycAction({
        ...f,
        id: initial?.id,
        introducer: intro,
        tags: f.tagText.split(",").map((t) => t.trim()).filter(Boolean),
        salesPersonId: f.salesPersonId,
        // "" (not answered) and "No" both mean domestic.
        isExport: f.exportChoice === "Yes",
        contacts,
        addresses,
      });
      if (!r.ok) {
        setError(r.error);
        fireToast({ message: r.error, type: "error" });
        return;
      }
      /* Files go up one at a time AFTER the save, against the id it returned.
         A failed file does not undo the client — it is reported by name. */
      const uploads: { slot: "front" | "back" | "brochure" | "video" | "other"; file: File }[] = [
        ...(docs.front ? [{ slot: "front" as const, file: docs.front }] : []),
        ...(docs.back ? [{ slot: "back" as const, file: docs.back }] : []),
        ...docs.brochure.map((file) => ({ slot: "brochure" as const, file })),
        ...docs.videos.map((file) => ({ slot: "video" as const, file })),
        ...docs.other.map((file) => ({ slot: "other" as const, file })),
      ];
      const failed: string[] = [];
      for (const u of uploads) {
        const fd = new FormData();
        fd.set("customerId", r.id);
        fd.set("slot", u.slot);
        fd.set("file", u.file);
        const up = await uploadCustomerDocumentAction(fd).catch(() => ({ ok: false as const, error: "" }));
        if (!up.ok) failed.push(u.file.name);
      }
      if (failed.length) {
        fireToast({
          message: `${f.name} was saved, but ${failed.length} file(s) did not upload: ${failed.join(", ")}.`,
          type: "error",
        });
      }
      fireToast({
        message: editing ? `${f.name} updated.` : `${f.name} onboarded as ${r.clientCode}.`,
        type: "success",
      });
      /* LAND ON THE NEW CLIENT, not just the page it is somewhere on. The
         Customer Master is sorted by name and paged twenty at a time, so a
         brand-new client is usually on a later page — landing on the bare list
         looked exactly like the onboarding had done nothing. `?new=` marks the
         row and raises the confirmation banner; `?q=` filters the table down
         to it. "Show all clients" on the banner puts the full list back. */
      router.push(
        editing
          ? (`/billing/customers/${r.id}` as Route)
          : (`/billing/customers?new=${r.id}&q=${encodeURIComponent(f.name.trim())}` as Route),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        // Ctrl/⌘+Enter saves from anywhere on the form.
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Billing</p>
      <h1
        className="mt-1 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(24px,2.8vw,34px)",
          letterSpacing: "-0.025em",
        }}
      >
        {editing ? "Edit Customer KYC" : "New Customer KYC"}
      </h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">
        {editing ? (
          <>
            Editing <span className="font-mono font-bold">{nextCode}</span> — the client code does not change.
          </>
        ) : (
          <>
            This client will be saved as <span className="font-mono font-bold">{nextCode}</span> and can
            be invoiced immediately.
          </>
        )}
      </p>

      {/* ── IDENTITY ─────────────────────────────────────────────── */}
      <Section title="Identity" hint="Who the client is — type, industry and the products they buy." accent="#E10600">
        <Grid cols={3}>
          <Field label="GSTIN" hint={gstState ? `Verified · ${gstState.name}` : undefined}>
            <input
              value={f.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              placeholder="27ACPPV1393L1ZQ"
              maxLength={15}
              className={INPUT + " font-mono"}
            />
          </Field>
          <Field label="Company name" required>
            <input
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Precision Tools Pvt Ltd"
              className={INPUT}
            />
          </Field>
          <Field label="Assign sales person">
            <Select value={f.salesPersonId} onChange={(v) => set("salesPersonId", v)} placeholder="Select an employee">
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </Field>
        </Grid>
        {/* EXPORT and GRADE are no longer asked (Manan, 2026-09-19). An existing
            client keeps whatever it had: the values ride along unchanged in
            the form state, so editing a client never resets them. */}
        <Grid cols={3}>
          <Field label="Tags">
            <input
              value={f.tagText}
              onChange={(e) => set("tagText", e.target.value)}
              placeholder="e.g. Mining, Defense"
              className={INPUT}
            />
          </Field>
          <Field label="Industry type">
            <MultiSelect
              values={f.industryTypes}
              onChange={(v) => set("industryTypes", v)}
              options={options.industry_type ?? ["Mining", "Pharma", "Petrochem", "Wire Ind.", "Automotive"]}
              placeholder="Select industry types…"
            />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Product type">
            <MultiSelect
              values={f.productTypes}
              onChange={(v) => set("productTypes", v)}
              options={productTypeOptions}
              placeholder="Select product types…"
              allOption
              emptyHint="Add products in Admin Panel › Billing Products"
            />
          </Field>
          <Field label="Business category">
            <Select
              value={f.businessCategory}
              onChange={(v) => set("businessCategory", v)}
              placeholder="Select a category…"
            >
              {(options.business_category ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nature of business (optional)">
            <input
              value={f.natureOfBusiness}
              onChange={(e) => set("natureOfBusiness", e.target.value)}
              placeholder="e.g. Manufactures carbide cutting tools"
              className={INPUT}
            />
          </Field>
        </Grid>
      </Section>

      {/* ── REGISTRATION & TAX ───────────────────────────────────── */}
      <Section
        title="Registration & Tax"
        hint="GST, PAN, MSME / Udyam registration and export / currency details."
        accent="#DC2626"
      >
        <Grid cols={3}>
          <Field label="PAN / IT No">
            <input
              value={f.pan}
              onChange={(e) => set("pan", e.target.value.toUpperCase())}
              placeholder="ACPPV1393L"
              maxLength={10}
              className={INPUT + " font-mono"}
            />
          </Field>
          <Field label="MSME / Udyam No">
            <input
              value={f.msmeNo}
              onChange={(e) => set("msmeNo", e.target.value)}
              placeholder="e.g. UDYAM-MH-00-0000000"
              className={INPUT}
            />
          </Field>
          <Field label="GST registration type">
            <Select value={f.gstRegType} onChange={(v) => set("gstRegType", v)} placeholder="Select">
              {["Regular", "Composition", "Unregistered", "SEZ", "Overseas"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Currency">
            <Select value={f.currency} onChange={(v) => set("currency", v)} placeholder="Select">
              {(options.currency ?? ["INR"]).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field label="Country">
            <Select value={f.country} onChange={(v) => set("country", v)} placeholder="Select">
              {(options.country ?? ["India"]).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="State"
            hint={gstState ? "Taken from the GSTIN — the first two digits are the state code." : undefined}
          >
            {gstState ? (
              <div className={READONLY_BOX}>{gstState.name}</div>
            ) : (
              <Select value={f.stateName} onChange={(v) => set("stateName", v)} placeholder="Select state">
                {(options.state ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
            )}
          </Field>
        </Grid>
      </Section>

      {/* ── CONTACT PERSON ───────────────────────────────────────── */}
      <Section
        title="Contact Person"
        hint="The first contact is saved as the client's primary — auto-fetched on enquiries."
        accent="#059669"
      >
        {contacts.map((c, i) => (
          <div key={i} className="mb-4 border-b border-hairline pb-4 last:mb-0 last:border-0 last:pb-0">
            <RowHead n={i + 1} label="Contact" onRemove={contacts.length > 1 ? () => setContacts((p) => p.filter((_, j) => j !== i)) : undefined} />
            <Grid cols={3}>
              <Field label="First name" required>
                <input value={c.firstName} onChange={(e) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, firstName: e.target.value } : x)))} className={INPUT} />
              </Field>
              <Field label="Last name">
                <input value={c.lastName} onChange={(e) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, lastName: e.target.value } : x)))} className={INPUT} />
              </Field>
              <Field label="Contact no" required>
                <input
                  value={c.phone}
                  onChange={(e) =>
                    setContacts((p) =>
                      p.map((x, j) =>
                        j === i
                          ? // Keep a "same as contact no" WhatsApp in step while typing.
                            { ...x, phone: e.target.value, whatsapp: sameWa[i] ? e.target.value : x.whatsapp }
                          : x,
                      ),
                    )
                  }
                  className={INPUT}
                />
              </Field>
            </Grid>
            <Grid cols={3}>
              <Field label="WhatsApp no">
                <input
                  value={c.whatsapp}
                  disabled={Boolean(sameWa[i])}
                  onChange={(e) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, whatsapp: e.target.value } : x)))}
                  placeholder="WhatsApp number"
                  className={INPUT + " disabled:bg-[rgba(15,23,42,0.03)]"}
                />
                <span className="mt-1.5 flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
                  <input
                    type="checkbox"
                    checked={Boolean(sameWa[i])}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSameWa((m) => ({ ...m, [i]: on }));
                      if (on) setContacts((p) => p.map((x, j) => (j === i ? { ...x, whatsapp: x.phone } : x)));
                    }}
                  />
                  Same As Contact No
                </span>
              </Field>
            </Grid>
            <Grid cols={3}>
              <Field label="Email" required>
                <input type="email" value={c.email} onChange={(e) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} className={INPUT} />
              </Field>
              <Field label="Designation">
                <Select value={c.designation} onChange={(v) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, designation: v } : x)))} placeholder="Select designation">
                  {(options.designation ?? []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Department">
                <DepartmentField
                  value={c.department}
                  options={options.department ?? DEPARTMENTS}
                  onChange={(v) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, department: v } : x)))}
                />
              </Field>
            </Grid>
            <Field label="Contact notes">
              <DictateTextarea rows={3} value={c.notes} onChange={(v) => setContacts((p) => p.map((x, j) => (j === i ? { ...x, notes: v } : x)))} placeholder="Anything worth remembering about this contact" className={INPUT + " h-auto py-2"} />
            </Field>
          </div>
        ))}
        <AddBtn onClick={() => setContacts((p) => [...p, emptyContact()])}>Add contact</AddBtn>
      </Section>

      {/* ── ADDRESSES ────────────────────────────────────────────── */}
      <Section
        title="Billing Address"
        hint="Where this client is billed."
        accent="#EA580C"
      >
        {/* BILLING ADDRESS ONLY (Manan, 2026-09-19). A shipping address saved
            earlier stays in the form state untouched — it is simply not shown —
            so editing a client never deletes it. */}
        {addresses.map((a, i) => a.kind !== "billing" ? null : (
          <div key={i} className="mb-4 border-b border-hairline pb-4 last:mb-0 last:border-0 last:pb-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <RowHead n={1} label="Billing address" />
            </div>
            <Grid cols={2}>
              <Field label="Address line 1" required>
                <input value={a.line1} placeholder="Unit No./Block No., Floor, Building Name" onChange={(e) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, line1: e.target.value } : x)))} className={INPUT} />
              </Field>
              <Field label="Address line 2">
                <input value={a.line2} placeholder="Street Name, Sector Name" onChange={(e) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, line2: e.target.value } : x)))} className={INPUT} />
              </Field>
              <Field label="Address line 3">
                <input value={a.line3} placeholder="Area" onChange={(e) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, line3: e.target.value } : x)))} className={INPUT} />
              </Field>
              <Field label="Address line 4">
                <input value={a.line4} placeholder="Nearby Landmark" onChange={(e) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, line4: e.target.value } : x)))} className={INPUT} />
              </Field>
            </Grid>
            <Grid cols={4}>
              <Field label="City" required>
                <input value={a.city} onChange={(e) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} className={INPUT} />
              </Field>
              <Field label="State" required>
                <Select value={a.stateName} onChange={(v) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, stateName: v } : x)))} placeholder="Select state">
                  {(options.state ?? []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Country">
                <Select value={a.country} onChange={(v) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, country: v } : x)))} placeholder="Select">
                  {(options.country ?? ["India"]).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Pin code" required>
                <input value={a.pincode} onChange={(e) => setAddresses((p) => p.map((x, j) => (j === i ? { ...x, pincode: e.target.value } : x)))} className={INPUT} />
              </Field>
            </Grid>
          </div>
        ))}
      </Section>

      {/* ── COMMERCIAL & CREDIT ──────────────────────────────────── */}
      <Section title="Commercial & Credit" hint="Payment terms and credit." accent="#2563EB">
        <Grid cols={3}>
          <Field label="Payment terms" required>
            <Select value={f.paymentTerms} onChange={(v) => set("paymentTerms", v)} placeholder="Select payment terms">
              {(options.payment_terms ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Credit days">
            <Select value={f.creditDays} onChange={(v) => set("creditDays", v)} placeholder="Select credit days">
              {(options.credit_days ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
        </Grid>
        {/* SUBSCRIPTION · EMI · MODULE WISE PAYMENT — part of the commercial
            terms (Manan, 2026-09-19), no longer a box of their own. */}
        <div className="mb-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <YesNoNa label="Subscription" value={f.subscription} onChange={(v) => set("subscription", v)} />
          <YesNoNa label="EMI" value={f.emi} onChange={(v) => set("emi", v)} />
          <YesNoNa
            label="Module Wise Payment"
            value={f.moduleWisePayment}
            onChange={(v) => set("moduleWisePayment", v)}
          />
        </div>
        {/* FREIGHT CHARGES, TRANSPORTER, QUANTITY DEVIATION and CREDIT LIMIT are
            no longer asked (Manan, 2026-09-19); a saved client keeps what it had. */}
        <Grid cols={2}>
          <Field label="Other references">
            <DictateTextarea rows={3} value={f.otherReferences} onChange={(v) => set("otherReferences", v)} placeholder="Any other references or notes relevant to this client" className={INPUT + " h-auto py-2"} />
          </Field>
          <Field label="Client notes">
            <DictateTextarea rows={3} value={f.notes} onChange={(v) => set("notes", v)} placeholder="Any general notes about this client" className={INPUT + " h-auto py-2"} />
          </Field>
        </Grid>
      </Section>

      {/* ── INTRODUCER ───────────────────────────────────────────── */}
      <Section title="Introducer" hint="Who introduced this client to us." accent="#B45309">
        <Grid cols={3}>
          <Field label="Website">
            <LinkInput
              value={intro.website ?? ""}
              onChange={(v) => setIntro("website", v)}
              placeholder="www.company.com"
              href={linkedinHref(intro.website ?? "")}
            />
          </Field>
          <Field label="Introducer first name">
            <input value={intro.firstName ?? ""} onChange={(e) => setIntro("firstName", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Introducer last name">
            <input value={intro.lastName ?? ""} onChange={(e) => setIntro("lastName", e.target.value)} className={INPUT} />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Social media">
            <Select value={intro.socialMedia ?? ""} onChange={(v) => setIntro("socialMedia", v as "Yes" | "No" | "")} placeholder="Select">
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </Select>
          </Field>
          <Field label="City">
            <input value={intro.city ?? ""} onChange={(e) => setIntro("city", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Email">
            <input type="email" value={intro.email ?? ""} onChange={(e) => setIntro("email", e.target.value)} className={INPUT} />
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="WhatsApp number">
            <input value={intro.whatsapp ?? ""} onChange={(e) => setIntro("whatsapp", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Company / organisation">
            <input value={intro.company ?? ""} onChange={(e) => setIntro("company", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Designation / role">
            <Select value={intro.designation ?? ""} onChange={(v) => setIntro("designation", v)} placeholder="Select designation">
              {(options.designation ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Nature of business / work">
            <input value={intro.natureOfWork ?? ""} onChange={(e) => setIntro("natureOfWork", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Business category">
            <Select value={intro.businessCategory ?? ""} onChange={(v) => setIntro("businessCategory", v)} placeholder="Select a category…">
              {(options.business_category ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field label="Did you come to know about us through Social Media Post?">
            <Select value={intro.cameThrough ?? ""} onChange={(v) => setIntro("cameThrough", v)} placeholder="Select">
              {["Yes", "No", "Through WhatsApp", "Friend / Colleague", "Other"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Name of the person who introduced you">
            <input value={intro.introducedBy ?? ""} onChange={(e) => setIntro("introducedBy", e.target.value)} className={INPUT} />
          </Field>
        </Grid>
      </Section>

      {/* ── DOCUMENTS ────────────────────────────────────────────── */}
      <Section
        title="Documents"
        hint="Attach any document, image, audio, or video to this client record - plus scans of the contact's business card."
        accent="#E10600"
      >
        <p className="mb-4 text-[13px] text-ink-muted">
          Pick the files now — they upload the moment the client is saved.
        </p>
        {savedDocs.length > 0 ? (
          <div className="mb-4">
            <p className="mb-1.5 text-[12px] font-bold text-ink-strong">Already Attached</p>
            <ul className="flex flex-wrap gap-2">
              {savedDocs.map((d) => (
                <li
                  key={d.id}
                  className="inline-flex items-center gap-2 rounded-chip py-1 pl-3 pr-1 text-[12.5px]"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                >
                  <span className="font-semibold text-ink-strong">
                    {d.slot === "front" ? "Card front · " : d.slot === "back" ? "Card back · " : d.slot === "brochure" ? "Brochure · " : d.slot === "video" ? "Video · " : ""}
                    {d.fileName}
                  </span>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="rounded-chip px-2 py-1 font-bold" style={{ color: BILLING_PURPLE_DEEP }}>
                      View
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void removeSavedDoc(d.id, d.fileName)}
                    className="rounded-chip px-2 py-1 font-bold text-[#B91C1C]"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11.5px] text-ink-muted">Files picked below are added to these.</p>
          </div>
        ) : null}
        <CustomerDocumentsPicker value={docs} onChange={setDocs} />
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="LinkedIn address">
            <LinkInput
              value={f.linkedinUrl}
              onChange={(v) => set("linkedinUrl", v)}
              placeholder="https://www.linkedin.com/company/…"
              href={linkedinHref(f.linkedinUrl)}
            />
          </Field>
          <Field label="Instagram handle">
            <LinkInput
              value={f.instagramHandle}
              onChange={(v) => set("instagramHandle", v)}
              placeholder="@handle"
              href={instagramHref(f.instagramHandle)}
            />
          </Field>
        </div>
      </Section>

      {error ? (
        <p
          className="mt-4 rounded-[14px] px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "#FFEDD5", color: "#431407", boxShadow: "inset 0 0 0 1px #FDBA74" }}
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <span className="text-[12px] text-ink-muted">Ctrl / ⌘ + Enter to save</span>
        <button
          type="button"
          onClick={() =>
            openKycPrintView({
              name: f.name,
              clientCode: nextCode,
              gstin: f.gstin,
              salesPerson: employees.find((e) => e.id === f.salesPersonId)?.name ?? "",
              exportLabel: f.exportChoice,
              grade: f.grade,
              tags: f.tagText,
              customerTypes: f.customerTypes.join(", "),
              industryTypes: f.industryTypes.join(", "),
              productTypes: f.productTypes.join(", "),
              businessCategory: f.businessCategory,
              natureOfBusiness: f.natureOfBusiness,
              linkedinUrl: f.linkedinUrl,
              instagramHandle: f.instagramHandle,
              subscription: f.subscription,
              emi: f.emi,
              moduleWisePayment: f.moduleWisePayment,
              introducer: introducerRows(intro),
              pan: f.pan,
              msmeNo: f.msmeNo,
              gstRegType: f.gstRegType,
              currency: f.currency,
              country: f.country,
              stateName: gstState?.name ?? f.stateName,
              paymentTerms: f.paymentTerms,
              freightCharges: f.freightCharges,
              creditDays: f.creditDays,
              creditLimit: f.creditLimit,
              transporter: f.transporter,
              quantityDeviation: f.quantityDeviation,
              otherReferences: f.otherReferences,
              notes: f.notes,
              contacts,
              addresses,
              documents: [
                ...(initial?.documents.map((d) => d.fileName) ?? []),
                ...(docs.front ? [`Business card (front): ${docs.front.name}`] : []),
                ...(docs.back ? [`Business card (back): ${docs.back.name}`] : []),
                ...docs.brochure.map((d) => `Brochure: ${d.name}`),
                ...docs.videos.map((d) => `Video: ${d.name}`),
                ...docs.other.map((d) => d.name),
              ],
            })
          }
          className="inline-flex h-11 items-center gap-2 rounded-chip bg-white px-4 text-[13.5px] font-bold"
          style={{ boxShadow: "inset 0 0 0 1px #FCA5A5", color: "#B91C1C" }}
        >
          <FileText size={16} /> View in PDF Format
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-chip px-5 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {editing ? "Save changes" : "Onboard Client"}
        </button>
      </div>
    </form>
  );
}

/* ───────────────────────────── pieces ──────────────────────────────────── */

/**
 * The first mandatory KYC field left empty, as a sentence — or null when all
 * are there. Mandatory = what New Document fetches from the KYC: company name,
 * the (first) contact person's name, contact no and email, the billing
 * address (line 1, city, state, pin code) and payment terms. GSTIN is NOT
 * mandatory — an unregistered customer is a real case.
 */
function kycMissing(k: {
  name: string;
  paymentTerms: string;
  contact: Contact | undefined;
  billing: Address | undefined;
}): string | null {
  if (!k.name.trim()) return "Company Name is required.";
  if (!k.contact?.firstName.trim()) return "Contact person's First Name is required.";
  if (!k.contact.phone.trim()) return "Contact No is required.";
  if (!k.contact.email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.contact.email.trim())) return "That Email is not a valid address.";
  if (!k.billing?.line1.trim()) return "Billing Address Line 1 is required.";
  if (!k.billing.city.trim()) return "Billing address City is required.";
  if (!k.billing.stateName.trim()) return "Billing address State is required.";
  if (!k.billing.pincode.trim()) return "Billing address Pin Code is required.";
  if (!k.paymentTerms.trim()) return "Payment Terms is required.";
  return null;
}

const DEPARTMENTS = [
  "Management", "Finance", "Accounts", "Production", "HR", "IT", "Admin", "Purchase", "QC",
  "Others",
];
const OTHERS = "Others";

/**
 * Department — a dropdown from the Department lookup list. Picking
 * "Others" opens a box to type it; what is typed is what is
 * saved. A saved department that is not on the list opens in that box too.
 */
function DepartmentField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  // Any "Other…" entry in the saved list (an older "Others - pls specify"
  // included) is folded into the one "Others" at the end.
  const listed = options.filter((o) => !isOtherOption(o));
  const [other, setOther] = React.useState(false);
  const custom = Boolean(value) && !listed.includes(value) ? value : null;
  const confirm = () => {
    if (value.trim()) {
      onChange(value.trim());
      setOther(false);
    }
  };
  return (
    <div>
      <select
        value={other ? OTHERS : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHERS) {
            setOther(true);
            onChange("");
          } else {
            setOther(false);
            onChange(v);
          }
        }}
        className={INPUT}
      >
        <option value="">Select department</option>
        {listed.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        {custom && !other ? <option value={custom}>{custom}</option> : null}
        <option value={OTHERS}>{OTHERS}</option>
      </select>
      {other ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              confirm();
            }
          }}
          onBlur={confirm}
          placeholder="Please specify the department, then press Enter"
          className={INPUT + " mt-1.5"}
          autoFocus
        />
      ) : null}
    </div>
  );
}

const INPUT =
  "h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13.5px] outline-none focus:border-[color:var(--color-altus-red)]";
const READONLY_BOX =
  "flex h-10 w-full items-center rounded-chip px-3 text-[13.5px] text-ink-muted";

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mt-4 rounded-[22px] p-5 max-md:p-4"
      style={{ ...CARD_STYLE, borderLeft: `3px solid ${accent}` }}
    >
      <h2 className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: accent }}>
        {title}
      </h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-ink-muted">{hint}</p>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  const cls = cols === 2 ? "md:grid-cols-2" : cols === 3 ? "md:grid-cols-3" : "md:grid-cols-4";
  return <div className={`mb-2 grid grid-cols-1 gap-3 ${cls}`}>{children}</div>;
}

/**
 * Every word of a label starts with a capital ("Assign Sales Person", "Nature
 * Of Business (Optional)") — Manan, 2026-09-19. Only the first letter of each
 * word is touched, so GSTIN, PAN / IT No, MSME and WhatsApp keep their own
 * casing.
 */
function titleCase(label: string): string {
  return label.replace(/(^|[\s(/-])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-ink-strong">
        {titleCase(label)}
        {required ? <span style={{ color: "#DC2626" }}> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11.5px] font-semibold" style={{ color: "#15803D" }}>
          ✓ {hint}
        </span>
      ) : null}
    </label>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  /* "OTHER" → TYPE IT (Manan, 2026-09-19: wherever a dropdown offers Other,
     give a box to write it in). If the list has an option starting "Other",
     picking it opens a text box; Enter (or leaving the box) confirms the typed
     value, which then shows in the dropdown in place of "Other" — the value
     saved. Enter never submits the form from here. */
  const optionValues = React.Children.toArray(children).flatMap((c) =>
    React.isValidElement<{ value?: unknown }>(c) && c.props.value !== undefined ? [String(c.props.value)] : [],
  );
  const otherOption = optionValues.find((o) => isOtherOption(o));
  const [otherMode, setOtherMode] = React.useState(false);
  // A typed ("other") value, shown as its own selected option.
  const custom = Boolean(value) && !optionValues.includes(value) ? value : null;
  const confirm = () => {
    if (value.trim()) {
      onChange(value.trim());
      setOtherMode(false);
    }
  };
  return (
    <div>
      <select
        value={otherMode && otherOption ? otherOption : value}
        onChange={(e) => {
          const v = e.target.value;
          if (otherOption && v === otherOption) {
            setOtherMode(true);
            onChange("");
          } else {
            setOtherMode(false);
            onChange(v);
          }
        }}
        className={INPUT}
      >
        <option value="">{placeholder}</option>
        {children}
        {custom && !otherMode ? <option value={custom}>{custom}</option> : null}
      </select>
      {otherMode ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              confirm();
            }
          }}
          onBlur={confirm}
          placeholder="Please specify, then press Enter"
          className={INPUT + " mt-1.5"}
          autoFocus
        />
      ) : null}
    </div>
  );
}

/** A text box with a View button that opens the link it holds in a new tab. */
function LinkInput({
  value,
  onChange,
  placeholder,
  href,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  href: string | null;
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT + " pr-24"}
      />
      <a
        href={href ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!href}
        onClick={(e) => {
          if (!href) e.preventDefault();
        }}
        className={`absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded-chip px-2.5 text-[12px] font-bold ${
          href ? "" : "pointer-events-none opacity-40"
        }`}
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: BILLING_PURPLE_DEEP }}
      >
        <ExternalLink size={12} /> View
      </a>
    </div>
  );
}

/** A LinkedIn address as typed ("linkedin.com/in/x", "www…", "https://…") → a URL. */
function linkedinHref(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
}

/** An Instagram handle ("@name", "name") or a pasted profile URL → the profile URL. */
function instagramHref(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/instagram\.com\//i.test(t)) return `https://${t.replace(/^\/+/, "")}`;
  const handle = t.replace(/^@+/, "").replace(/\/+$/, "");
  return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : null;
}

/** Yes / No / Not Applicable as three buttons; pressing the chosen one clears it. */
function YesNoNa({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[12px] font-bold text-ink-strong">{titleCase(label)}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {["Yes", "No", "Not Applicable"].map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? "" : o)}
              className="inline-flex h-9 items-center rounded-chip px-3.5 text-[12.5px] font-bold transition"
              style={
                on
                  ? { background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})`, color: "#fff" }
                  : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "var(--color-ink-muted)" }
              }
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Other", "Others", "Others - pls specify", "Other (specify)"… */
function isOtherOption(o: string): boolean {
  // Plain string tests, no regex escapes: "other", "others", and either
  // followed by a space, dash or bracket ("Others - pls specify").
  const t = o.trim().toLowerCase();
  if (t === "other" || t === "others") return true;
  return ["other ", "others ", "other-", "others-", "other(", "others("].some((p) => t.startsWith(p));
}

/** Pick several. The chosen ones show as chips that can be taken off again.
 *  With `allOption`, the list starts with "All", which picks every option. */
function MultiSelect({
  values,
  onChange,
  options,
  placeholder,
  allOption,
  emptyHint = "No options configured for this list yet",
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder: string;
  allOption?: boolean;
  emptyHint?: string;
}) {
  const ALL_VALUE = "__all__";
  // Picking an "Other" option opens a box; what is typed is added as its own
  // chip, rather than the word "Other" itself.
  const [otherText, setOtherText] = React.useState<string | null>(null);
  const remaining = options.filter((o) => !values.includes(o));
  const allPicked = options.length > 0 && remaining.length === 0;
  return (
    <div>
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v === ALL_VALUE) onChange([...options.filter((o) => !isOtherOption(o))]);
          else if (isOtherOption(v)) setOtherText("");
          else onChange([...values, v]);
        }}
        className={INPUT}
        disabled={allPicked}
      >
        <option value="">
          {options.length === 0 ? emptyHint : allPicked ? "All selected" : placeholder}
        </option>
        {allOption && remaining.length > 0 ? <option value={ALL_VALUE}>All</option> : null}
        {remaining.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {otherText !== null ? (
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const t = otherText.trim();
                if (t && !values.includes(t)) onChange([...values, t]);
                setOtherText(null);
              }
            }}
            placeholder="Please specify, then Add"
            className={INPUT}
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              const t = otherText.trim();
              if (t && !values.includes(t)) onChange([...values, t]);
              setOtherText(null);
            }}
            className="h-10 shrink-0 rounded-chip px-3 text-[12.5px] font-bold text-white"
            style={{ background: BILLING_PURPLE }}
          >
            Add
          </button>
        </div>
      ) : null}
      {values.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {allPicked && allOption && options.length > 1 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
              style={{ background: "rgba(225,6,0,0.12)", color: BILLING_PURPLE_DEEP }}
            >
              All ({options.length}) <X size={11} />
            </button>
          ) : (
            values.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
                style={{ background: "rgba(225,6,0,0.12)", color: BILLING_PURPLE_DEEP }}
              >
                {v} <X size={11} />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function RowHead({ n, label, onRemove }: { n: number; label: string; onRemove?: () => void }) {
  return (
    <div className="mb-2 flex flex-1 items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white"
        style={{ background: "#0F172A" }}
      >
        {n}
      </span>
      <span className="text-[13px] font-bold text-ink-strong">{label}</span>
      <span className="h-px flex-1 bg-hairline" />
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 items-center gap-1 rounded-chip px-2 text-[12px] font-bold text-ink-muted"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <X size={12} /> Remove
        </button>
      ) : null}
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[12.5px] font-bold"
      style={{ boxShadow: `inset 0 0 0 1px ${BILLING_PURPLE}`, color: BILLING_PURPLE }}
    >
      <Plus size={13} /> {children}
    </button>
  );
}
