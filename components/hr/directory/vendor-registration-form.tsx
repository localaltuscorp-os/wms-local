"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { createPublicVendorUpload, submitPublicVendorRegistration } from "@/app/vendor-registration/[token]/actions";

type ContactInitial = {
  firstName?: string | null; lastName?: string | null; cellNo?: string | null; category?: string | null; utility?: string | null; amcOnCall?: string | null; companyName?: string | null; email?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; addressLine3?: string | null; addressLine4?: string | null; pincode?: string | null; gstNo?: string | null; panNo?: string | null; gstName?: string | null;
  bankDetails?: unknown; contact1Name?: string | null; contact1CellNo?: string | null; contact1Email?: string | null; contact2Name?: string | null; contact2CellNo?: string | null; contact2Email?: string | null;
};
type UploadRef = { path: string; fileName: string; mime: string | null; size: number };
type AttachmentKey = "gstCertificate" | "panCard" | "cancelledCheque" | "upiScanner";

const FIELDS: ReadonlyArray<{ key: keyof Values; label: string; required?: boolean; type?: string; full?: boolean; placeholder?: string }> = [
  { key: "firstName", label: "First Name", required: true }, { key: "lastName", label: "Last Name", required: true },
  { key: "cellNo", label: "Cell No.", required: true, type: "tel" }, { key: "category", label: "Category", required: true },
  { key: "utility", label: "Utility" }, { key: "amcOnCall", label: "AMC / On-call", required: true, placeholder: "AMC or On-call" },
  { key: "companyName", label: "Company Name" }, { key: "email", label: "Email", type: "email" },
  { key: "addressLine1", label: "Address line 1", full: true }, { key: "addressLine2", label: "Address line 2", full: true },
  { key: "addressLine3", label: "Address line 3", full: true }, { key: "addressLine4", label: "Address line 4", full: true },
  { key: "pincode", label: "Address PIN code" }, { key: "gstNo", label: "GST No." }, { key: "panNo", label: "PAN No." }, { key: "gstName", label: "GST Name" },
  { key: "accountName", label: "Account Name" }, { key: "accountNo", label: "Account No." }, { key: "accountType", label: "Account Type" },
  { key: "micrCode", label: "MICR Code" }, { key: "branchAddress", label: "Branch Address", full: true }, { key: "bankPincode", label: "Bank PIN Code" },
  { key: "contact1Name", label: "Alternate Person 1 Name" }, { key: "contact1CellNo", label: "Alternate Person 1 Cell No.", type: "tel" }, { key: "contact1Email", label: "Alternate Person 1 Email", type: "email" },
  { key: "contact2Name", label: "Alternate Person 2 Name" }, { key: "contact2CellNo", label: "Alternate Person 2 Cell No.", type: "tel" }, { key: "contact2Email", label: "Alternate Person 2 Email", type: "email" },
];

type Values = {
  firstName: string; lastName: string; cellNo: string; category: string; utility: string; amcOnCall: string; companyName: string; email: string;
  addressLine1: string; addressLine2: string; addressLine3: string; addressLine4: string; pincode: string; gstNo: string; panNo: string; gstName: string;
  accountName: string; accountNo: string; accountType: string; micrCode: string; branchAddress: string; bankPincode: string;
  contact1Name: string; contact1CellNo: string; contact1Email: string; contact2Name: string; contact2CellNo: string; contact2Email: string;
};

function initialValues(contact: ContactInitial): Values {
  const bank = contact.bankDetails && typeof contact.bankDetails === "object" ? contact.bankDetails as Record<string, string> : {};
  return {
    firstName: contact.firstName ?? "", lastName: contact.lastName ?? "", cellNo: contact.cellNo ?? "", category: contact.category ?? "", utility: contact.utility ?? "", amcOnCall: contact.amcOnCall ?? "", companyName: contact.companyName ?? "", email: contact.email ?? "",
    addressLine1: contact.addressLine1 ?? "", addressLine2: contact.addressLine2 ?? "", addressLine3: contact.addressLine3 ?? "", addressLine4: contact.addressLine4 ?? "", pincode: contact.pincode ?? "", gstNo: contact.gstNo ?? "", panNo: contact.panNo ?? "", gstName: contact.gstName ?? "",
    accountName: bank.accountName ?? "", accountNo: bank.accountNo ?? "", accountType: bank.accountType ?? "", micrCode: bank.micrCode ?? "", branchAddress: bank.branchAddress ?? "", bankPincode: bank.pincode ?? "",
    contact1Name: contact.contact1Name ?? "", contact1CellNo: contact.contact1CellNo ?? "", contact1Email: contact.contact1Email ?? "", contact2Name: contact.contact2Name ?? "", contact2CellNo: contact.contact2CellNo ?? "", contact2Email: contact.contact2Email ?? "",
  };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-base font-extrabold text-slate-900">{title}</h2><div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">{children}</div></section>; }

export function VendorRegistrationForm({ token, contact, preview = false }: { token: string; contact: ContactInitial; preview?: boolean }) {
  const [values, setValues] = React.useState<Values>(() => initialValues(contact));
  const [files, setFiles] = React.useState<Partial<Record<AttachmentKey, UploadRef>>>({});
  const [busy, setBusy] = React.useState<AttachmentKey | "submit" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const set = (key: keyof Values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function upload(key: AttachmentKey, file: File | undefined) {
    if (!file) return;
    setError(null); setBusy(key);
    try {
      if (preview) {
        setFiles((current) => ({ ...current, [key]: { path: `preview/${key}`, fileName: file.name, mime: file.type || null, size: file.size } }));
        return;
      }
      const signed = await createPublicVendorUpload(token, { key, fileName: file.name, mime: file.type || null, size: file.size });
      if (!signed.ok) throw new Error(signed.error);
      const { error: uploadError } = await getSupabaseClient().storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw new Error(uploadError.message);
      setFiles((current) => ({ ...current, [key]: { path: signed.path, fileName: file.name, mime: file.type || null, size: file.size } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not upload this document."); } finally { setBusy(null); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy("submit");
    if (preview) { setBusy(null); setSubmitted(true); return; }
    const result = await submitPublicVendorRegistration(token, { ...values, attachments: files }).catch(() => ({ ok: false as const, error: "Could not submit the form." }));
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    setSubmitted(true);
  }

  if (submitted) return <main className="mx-auto grid min-h-dvh max-w-2xl place-items-center p-6"><div className="w-full rounded-3xl bg-white p-10 text-center shadow-xl"><CheckCircle2 className="mx-auto mb-4 text-emerald-600" size={48} /><h1 className="text-2xl font-black text-slate-950">Registration submitted</h1><p className="mt-2 text-slate-600">Thank you. Your details have been saved to the Altus vendor directory.</p></div></main>;

  return <main className="min-h-dvh bg-slate-50 px-4 py-10"><form onSubmit={submit} className="mx-auto max-w-4xl space-y-5"><header className="rounded-3xl bg-[#e10600] p-7 text-white shadow-lg"><p className="text-sm font-bold uppercase tracking-[0.18em] text-white/80">Altus Corp</p><h1 className="mt-1 text-3xl font-black">Vendor registration form</h1><p className="mt-2 text-sm text-white/90">Fields marked * are required. Your submitted details go directly to the vendor directory.</p>{preview ? <p className="mt-3 inline-block rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold">Preview mode — no data will be saved</p> : null}</header>
    <Group title="Vendor details">{FIELDS.slice(0, 8).map((field) => <label key={field.key} className={field.full ? "col-span-2 max-sm:col-span-1" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{field.label}{field.required ? <b className="text-red-700"> *</b> : null}</span><input value={values[field.key]} onChange={(event) => set(field.key, field.type === "tel" ? event.target.value.replace(/\D/g, "").slice(0, 10) : event.target.value)} type={field.type ?? "text"} required={field.required} inputMode={field.type === "tel" ? "numeric" : undefined} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100" placeholder={field.placeholder} /></label>)}</Group>
    <Group title="Address">{FIELDS.slice(8, 14).map((field) => <label key={field.key} className={field.full ? "col-span-2 max-sm:col-span-1" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{field.label}</span><input value={values[field.key]} onChange={(event) => set(field.key, event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100" /></label>)}</Group>
    <Group title="GST details">{FIELDS.slice(14, 17).map((field) => <label key={field.key}><span className="mb-1.5 block text-sm font-bold text-slate-700">{field.label}</span><input value={values[field.key]} onChange={(event) => set(field.key, event.target.value.toUpperCase())} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 uppercase outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100" /></label>)}</Group>
    <Group title="Bank details">{FIELDS.slice(17, 23).map((field) => <label key={field.key} className={field.full ? "col-span-2 max-sm:col-span-1" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{field.label}</span><input value={values[field.key]} onChange={(event) => set(field.key, event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100" /></label>)}</Group>
    <Group title="Alternate contacts">{FIELDS.slice(23).map((field) => <label key={field.key}><span className="mb-1.5 block text-sm font-bold text-slate-700">{field.label}</span><input value={values[field.key]} onChange={(event) => set(field.key, field.type === "tel" ? event.target.value.replace(/\D/g, "").slice(0, 10) : event.target.value)} type={field.type ?? "text"} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100" /></label>)}</Group>
    <Group title="Attachments">{([['gstCertificate', 'GST Certificate'], ['panCard', 'PAN Card'], ['cancelledCheque', 'Cancelled Cheque Copy'], ['upiScanner', 'UPI Scanner']] as const).map(([key, label]) => <label key={key} className="rounded-xl border border-dashed border-slate-300 p-3"><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span><span className="flex items-center gap-2 text-xs text-slate-500"><Upload size={14} /><input type="file" className="max-w-full" disabled={busy !== null} onChange={(event) => void upload(key, event.target.files?.[0])} /></span>{busy === key ? <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700"><Loader2 size={12} className="animate-spin" /> Uploading…</span> : files[key] ? <span className="mt-2 block text-xs font-semibold text-emerald-700">{files[key]?.fileName} attached</span> : null}</label>)}</Group>
    {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p> : null}
    <button type="submit" disabled={busy !== null} className="ml-auto flex items-center gap-2 rounded-xl bg-[#e10600] px-6 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-red-800 disabled:opacity-60">{busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : null}Submit registration</button>
  </form></main>;
}
