"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ChevronDown, CheckCircle2, AlertTriangle, Building2, Plus, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { BILLING_DOC_TYPES, BILLING_DOC_TYPE_LABELS } from "@/db/enums";
import { GST_STATES, stateByCode } from "@/lib/billing/states";
import {
  createBillingCompany,
  deleteBillingCompany,
  saveBillingEntityProfile,
  saveBillingSeriesDefault,
} from "@/app/(admin)/admin/billing-profiles/actions";

/**
 * ADMIN › BILLING PROFILES.
 *
 * One expandable card per issuing entity. Filling it in is the last time anyone
 * types that entity's PAN, GSTIN, bank or signatory — from then on every
 * quotation, proforma and tax invoice it raises fills its own company block.
 *
 * The readiness pill at the top of each card answers the only question that
 * actually blocks work: can this entity issue a TAX invoice yet? (It needs a
 * GSTIN. Without one it can still quote and raise proformas.)
 */

export interface ProfileValues {
  entityId: string;
  legalName: string;
  pan: string;
  gstin: string;
  stateCode: string;
  addressLine: string;
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  logoUrl: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  upiId: string;
  defaultSacCode: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatureImageUrl: string;
  defaultPaymentTermsId: string;
  interestClause: string;
  invoiceFooterNote: string;
}

export interface SeriesValues {
  docType: string;
  prefix: string;
  startSeq: string;
  padWidth: string;
  /** The live counter for the current financial year, when one exists. */
  liveNext: number | null;
  finYear: string;
}

export interface EntityCard {
  entityId: string;
  displayName: string;
  /** A saved profile exists for this entity (else: "Add profile"). */
  hasProfile: boolean;
  /** Added on this screen rather than one of the five in code. */
  isCustom: boolean;
  fallbackLogo: string | null;
  values: ProfileValues;
  series: SeriesValues[];
}

export function BillingProfileEditor({
  cards,
  paymentTerms,
  canEdit,
}: {
  cards: EntityCard[];
  paymentTerms: { id: string; label: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(cards[0]?.entityId ?? null);
  /** The one card being added / edited — every other card is read-only. */
  const [editing, setEditing] = React.useState<string | null>(null);
  const missing = cards.filter((c) => !c.hasProfile);

  /* ADD A COMPANY THAT IS NOT ON THE LIST AT ALL.
     The picker beside this only ever offered the five entities in code, so once
     each had a profile it was empty and disabled — correct, and a dead end
     ("here have already have company but if i want to add new profile then how
     can i do so", Manan, 2026-09-20). Typing a name here writes the company and
     opens its card in edit mode, where the PAN, GSTIN, bank and signatory are
     filled in by exactly the same editor the five use. */
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  async function createCompany() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await createBillingCompany({ name });
      if (!result.ok) {
        fireToast({ message: result.error, type: "error" });
        return;
      }
      fireToast({ message: `${name} added. Fill in its PAN, GSTIN and bank details.`, type: "success" });
      setNewName("");
      setAdding(false);
      if (result.entityId) {
        setOpen(result.entityId);
        setEditing(result.entityId);
      }
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {adding ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createCompany();
                  }
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                  }
                }}
                placeholder="Company's legal name"
                aria-label="New company's legal name"
                className="h-10 w-[260px] rounded-chip border border-hairline bg-surface-card px-3 text-[13px] text-ink-strong outline-none focus:border-altus-red"
              />
              <button
                type="button"
                disabled={creating || !newName.trim()}
                onClick={() => void createCompany()}
                className="inline-flex h-10 items-center gap-2 rounded-chip px-3 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add company
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                }}
                className="h-10 rounded-chip px-3 text-[13px] font-bold text-ink-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-10 items-center gap-2 rounded-chip bg-white px-3 text-[13px] font-bold text-ink-strong"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              title="Add a company that is not on this screen yet"
            >
              <Building2 size={15} /> New company
            </button>
          )}
          {/* ADD A PROFILE for one of the five companies that has none yet. */}
          <select
            value=""
            disabled={missing.length === 0}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              setOpen(id);
              setEditing(id);
            }}
            title={
              missing.length === 0
                ? "Every company already has a billing profile — use New company to add one"
                : undefined
            }
            className="h-10 rounded-chip px-3 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            <option value="">+ Add billing profile</option>
            {missing.map((c) => (
              <option key={c.entityId} value={c.entityId} style={{ color: "#111" }}>
                {c.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {cards.map((card) => (
        <ProfileCard
          key={card.entityId}
          card={card}
          paymentTerms={paymentTerms}
          canEdit={canEdit}
          open={open === card.entityId}
          editing={editing === card.entityId}
          onEdit={() => {
            setOpen(card.entityId);
            setEditing(card.entityId);
          }}
          onDoneEditing={() => setEditing(null)}
          onToggle={() => setOpen((cur) => (cur === card.entityId ? null : card.entityId))}
        />
      ))}
    </div>
  );
}

function ProfileCard({
  card,
  paymentTerms,
  canEdit,
  open,
  editing,
  onEdit,
  onDoneEditing,
  onToggle,
}: {
  card: EntityCard;
  paymentTerms: { id: string; label: string }[];
  canEdit: boolean;
  open: boolean;
  editing: boolean;
  onEdit: () => void;
  onDoneEditing: () => void;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<ProfileValues>(card.values);
  const [series, setSeries] = React.useState<SeriesValues[]>(card.series);
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const set = (k: keyof ProfileValues, v: string) => setValues((x) => ({ ...x, [k]: v }));

  async function removeCompany() {
    if (
      !window.confirm(
        `Delete ${card.displayName}? Its billing profile and number series go with it. ` +
          `This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteBillingCompany({ entityId: card.entityId });
      if (!result.ok) {
        fireToast({ message: result.error, type: "error" });
        return;
      }
      fireToast({ message: `${card.displayName} deleted.`, type: "success" });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const ready = Boolean(values.gstin.trim());
  const logo = values.logoUrl.trim() || card.fallbackLogo;

  async function save() {
    setBusy(true);
    try {
      const result = await saveBillingEntityProfile({
        ...values,
        stateName: stateByCode(values.stateCode)?.name ?? "",
      });
      if (!result.ok) {
        fireToast({ message: result.error, type: "error" });
        return;
      }
      fireToast({
        message: card.hasProfile
          ? `${card.displayName} billing profile saved.`
          : `${card.displayName} billing profile added.`,
        type: "success",
      });
      onDoneEditing();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveSeries(s: SeriesValues) {
    const result = await saveBillingSeriesDefault({
      entityId: card.entityId,
      docType: s.docType,
      prefix: s.prefix,
      startSeq: s.startSeq,
      padWidth: s.padWidth,
    });
    if (!result.ok) {
      fireToast({ message: result.error, type: "error" });
      return;
    }
    fireToast({ message: "Number series saved.", type: "success" });
    router.refresh();
  }

  return (
    <section
      className="rounded-[22px]"
      style={{
        background: "rgba(255,255,255,0.8)",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        {logo ? (
          <Image src={logo} alt="" width={64} height={32} className="h-8 w-auto object-contain" unoptimized />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black text-ink-strong">{card.displayName}</span>
          <span className="block text-[12px] text-ink-muted">
            {values.gstin || "No GSTIN"} · {values.pan || "No PAN"}
          </span>
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[11px] font-bold"
          style={
            ready
              ? { background: "#D1FAE5", color: "#022C22", boxShadow: "inset 0 0 0 1px #6EE7B7" }
              : { background: "#FFEDD5", color: "#431407", boxShadow: "inset 0 0 0 1px #FDBA74" }
          }
        >
          {ready ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {ready ? "Can issue tax invoices" : "Quotations & proformas only"}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t border-hairline px-5 py-5">
          {/* READ-ONLY until Edit / Add is pressed — a <fieldset disabled>
              locks every field inside it at once. */}
          <fieldset disabled={!editing} className="m-0 min-w-0 border-0 p-0 disabled:opacity-90">
          <Group title="Identity">
            <Text label="Legal name" value={values.legalName} onChange={(v) => set("legalName", v)} hint="Printed on the document. Defaults to the entity registry." />
            <Text label="PAN" value={values.pan} onChange={(v) => set("pan", v.toUpperCase())} placeholder="ABCDE1234F" />
            <Text label="GSTIN" value={values.gstin} onChange={(v) => set("gstin", v.toUpperCase())} placeholder="27ABCDE1234F1Z5" />
            <SelectField
              label="State"
              value={values.stateCode}
              onChange={(v) => set("stateCode", v)}
              options={GST_STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
              hint="Decides CGST+SGST versus IGST against the place of supply."
            />
            <Text label="Address" value={values.addressLine} onChange={(v) => set("addressLine", v)} wide />
            <Text label="Email" value={values.email} onChange={(v) => set("email", v)} />
            <Text label="Phone" value={values.phone} onChange={(v) => set("phone", v)} />
            <Text label="WhatsApp" value={values.whatsapp} onChange={(v) => set("whatsapp", v)} placeholder="+91…" />
            <Text label="Website" value={values.website} onChange={(v) => set("website", v)} />
            <Text
              label="Logo path"
              value={values.logoUrl}
              onChange={(v) => set("logoUrl", v)}
              placeholder="/logos/altus-corp.jpg"
              hint="A path under /public. Leave blank to use the entity's own logo."
            />
          </Group>

          <Group title="Bank">
            <Text label="Bank name" value={values.bankName} onChange={(v) => set("bankName", v)} />
            <Text label="Account name" value={values.bankAccountName} onChange={(v) => set("bankAccountName", v)} />
            <Text label="Account number" value={values.bankAccountNo} onChange={(v) => set("bankAccountNo", v)} />
            <Text label="IFSC" value={values.bankIfsc} onChange={(v) => set("bankIfsc", v.toUpperCase())} placeholder="KKBK0000646" />
            <Text label="Branch" value={values.bankBranch} onChange={(v) => set("bankBranch", v)} />
            <Text label="UPI ID" value={values.upiId} onChange={(v) => set("upiId", v)} />
          </Group>

          <Group title="Document defaults">
            <Text label="Default SAC code" value={values.defaultSacCode} onChange={(v) => set("defaultSacCode", v)} placeholder="998311" />
            <SelectField
              label="Default payment terms"
              value={values.defaultPaymentTermsId}
              onChange={(v) => set("defaultPaymentTermsId", v)}
              options={paymentTerms.map((t) => ({ value: t.id, label: t.label }))}
            />
            <Text label="Signatory name" value={values.signatoryName} onChange={(v) => set("signatoryName", v)} />
            <Text label="Signatory designation" value={values.signatoryDesignation} onChange={(v) => set("signatoryDesignation", v)} placeholder="Proprietor" />
            <Text
              label="Signature image path"
              value={values.signatureImageUrl}
              onChange={(v) => set("signatureImageUrl", v)}
              placeholder="/signatures/altus-corp.png"
              hint="A path under /public. Missing files degrade to a typed name."
            />
            <TextArea
              label="Interest clause"
              value={values.interestClause}
              onChange={(v) => set("interestClause", v)}
              placeholder="Interest will be charged at 24% p.a. at actuals for delay in payment after due date."
            />
            <TextArea label="Footer note" value={values.invoiceFooterNote} onChange={(v) => set("invoiceFooterNote", v)} />
          </Group>

          </fieldset>

          {canEdit ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={busy}
                    className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                    {card.hasProfile ? "Save changes" : "Add profile"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setValues(card.values);
                      onDoneEditing();
                    }}
                    disabled={busy}
                    className="inline-flex h-10 items-center rounded-chip px-4 text-[13px] font-bold text-ink-muted"
                    style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
                >
                  {card.hasProfile ? "Edit" : "+ Add profile"}
                </button>
              )}

              {/* DELETE — only a company ADDED on this screen. The five in code
                  have no delete: their card is drawn from the registry, so
                  "deleting" one would wipe its PAN, GSTIN and bank and then
                  redraw the same card empty. The server refuses them too, and
                  refuses any company that has already billed. */}
              {card.isCustom && !editing ? (
                <button
                  type="button"
                  onClick={() => void removeCompany()}
                  disabled={deleting}
                  className="ml-auto inline-flex h-10 items-center gap-2 rounded-chip px-3 text-[13px] font-bold disabled:opacity-50"
                  style={{ color: "#B91C1C", boxShadow: "inset 0 0 0 1px #FCA5A5" }}
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete company
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Number series ------------------------------------------- */}
          <div className="mt-6 border-t border-hairline pt-5">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Number series
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              The prefix, starting number and padding for each document type. A financial year
              already in progress keeps its own counter — changing a base here affects the next year
              that opens, never a series that has already issued numbers.
            </p>
            <div className="mt-3 space-y-2">
              {BILLING_DOC_TYPES.map((t) => {
                const s = series.find((x) => x.docType === t);
                if (!s) return null;
                const patch = (k: keyof SeriesValues, v: string) =>
                  setSeries((list) => list.map((x) => (x.docType === t ? { ...x, [k]: v } : x)));
                return (
                  <div
                    key={t}
                    className="flex flex-wrap items-end gap-3 rounded-[16px] p-3"
                    style={{
                      background: "rgba(248,250,252,0.9)",
                      boxShadow: "inset 0 0 0 1px var(--color-hairline)",
                    }}
                  >
                    <span className="min-w-[140px] text-[13px] font-bold">
                      {BILLING_DOC_TYPE_LABELS[t]}
                    </span>
                    <SmallField label="Prefix" value={s.prefix} onChange={(v) => patch("prefix", v)} />
                    <SmallField label="Starts at" value={s.startSeq} onChange={(v) => patch("startSeq", v)} />
                    <SmallField label="Pad width" value={s.padWidth} onChange={(v) => patch("padWidth", v)} />
                    <span className="text-[12px] text-ink-muted">
                      {s.liveNext !== null
                        ? `FY ${s.finYear}: next is ${s.liveNext}`
                        : `FY ${s.finYear}: not started`}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void saveSeries(s)}
                        className="h-9 rounded-chip px-3 text-[12.5px] font-bold text-ink-muted"
                        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                      >
                        Save
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const INPUT =
  "h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13px] outline-none focus:border-[color:var(--color-altus-red)]";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">{title}</h3>
      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">{children}</div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "col-span-2 max-md:col-span-1" : ""}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint ? <span className="mt-1 block text-[11.5px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="col-span-2 block max-md:col-span-1">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <textarea
        className="min-h-[68px] w-full rounded-chip border border-hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-altus-red)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-[11.5px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

function SmallField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block w-[110px]">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
