"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Pencil, Plus, Search, Trash2, Upload, UserCheck, UserX, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  EMPTY_VENDOR,
  VENDOR_CATEGORIES,
  vendorFullName,
  type VendorFields,
} from "@/lib/operations/directory";
import type { VendorRow } from "@/lib/queries/ops-vendors";
import { deleteVendor, saveVendor, setVendorActive } from "@/app/(app)/operations/directory/actions";
import {
  FILTER,
  Field,
  INPUT,
  Modal,
  NativeSelect,
  PASS_VERTICAL_SCROLL,
  RED,
  TD,
  TH,
  Tabs,
  WhatsAppButton,
} from "@/components/hr/registers/register-ui";
import { CategoryInput } from "./vendor-bulk-grid";
import { VendorBulkEntry } from "./vendor-bulk-entry";

type Draft = VendorFields & { id?: string };

function toDraft(v: VendorRow): Draft {
  return {
    id: v.id,
    category: v.category,
    firstName: v.firstName,
    lastName: v.lastName ?? "",
    cellNo: v.cellNo ?? "",
    email: v.email ?? "",
    addressLine1: v.addressLine1 ?? "",
    addressLine2: v.addressLine2 ?? "",
    addressLine3: v.addressLine3 ?? "",
    addressLine4: v.addressLine4 ?? "",
    landmark: v.landmark ?? "",
    city: v.city ?? "",
    state: v.state ?? "",
    pincode: v.pincode ?? "",
    website: v.website ?? "",
    amc: v.amc,
    notes: v.notes ?? "",
  };
}

/**
 * Operations → Directory. Active and Inactive vendors in separate tabs, search
 * and a category filter, an Add/Edit form with every field, and the bulk upload
 * (grid → review → create). Editing is Ruchita, Rutvisha and Manan only; the
 * server actions enforce it, this only hides the controls.
 */
export function VendorDirectory({ vendors, canEdit }: { vendors: VendorRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"active" | "inactive">("active");
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const categories = React.useMemo(
    () => Array.from(new Set([...VENDOR_CATEGORIES, ...vendors.map((v) => v.category)])).sort((a, b) => a.localeCompare(b)),
    [vendors],
  );

  const needle = q.trim().toLowerCase();
  const wantActive = tab === "active";
  const rows = vendors
    .filter((v) => v.isActive === wantActive)
    .filter((v) => category === "all" || v.category === category)
    .filter(
      (v) =>
        !needle ||
        [v.category, v.firstName, v.lastName, v.cellNo, v.email, v.addressLine1, v.addressLine2, v.addressLine3, v.addressLine4, v.landmark, v.city, v.state, v.pincode, v.website, v.notes]
          .some((s) => (s ?? "").toLowerCase().includes(needle)),
    );
  const activeCount = vendors.filter((v) => v.isActive).length;

  async function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setBusy(key);
    const res = await fn().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong." }));
    setBusy(null);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return false;
    }
    fireToast({ message: done, type: "success" });
    router.refresh();
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const ok = await run("save", () => saveVendor(draft), draft.id ? "Vendor updated" : "Vendor added");
    if (ok) setDraft(null);
  }

  const set = (patch: Partial<VendorFields>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "active", label: "Active", count: activeCount },
            { value: "inactive", label: "Inactive", count: vendors.length - activeCount },
          ]}
        />
        <div className="relative w-[280px] max-w-full">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, category, city, number…"
            aria-label="Search the directory"
            className={`${INPUT} pl-9`}
          />
        </div>
        <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className={FILTER}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        {canEdit ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-strong hover:bg-surface-soft"
            >
              <Upload size={16} strokeWidth={2.4} /> Bulk upload
            </button>
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY_VENDOR })}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
            >
              <Plus size={16} strokeWidth={2.6} /> Add vendor
            </button>
          </div>
        ) : (
          <span className="ml-auto text-[12.5px] font-semibold text-ink-muted">View only - Ruchita, Rutvisha and Manan can make changes.</span>
        )}
      </div>

      <section className="rounded-2xl border border-hairline-strong bg-white">
        <h2 className="border-b border-hairline px-4 py-3 text-[14px] font-black text-ink-strong">
          {wantActive ? "Vendors" : "Inactive vendors"} <span className="font-semibold text-ink-muted">({rows.length})</span>
        </h2>
        {/* Inline overscroll style: see PASS_VERTICAL_SCROLL in register-ui. */}
        <div className="overflow-x-auto" style={PASS_VERTICAL_SCROLL}>
          {/* min-w: 16 columns in a 1120px shell squeezed Email down to one
              character per line ("cool.a / ir@ex / ampl / e.inva / lid").
              A floor makes the box scroll sideways instead of crushing cells. */}
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className="bg-surface-soft">
              <tr>
                <th className={TH}>Sr. No.</th>
                <th className={TH}>Category</th>
                <th className={TH}>Name</th>
                <th className={TH}>Cell No</th>
                <th className={TH}>Email</th>
                <th className={TH}>Postal Address</th>
                <th className={TH}>City / State</th>
                <th className={TH}>Website</th>
                <th className={TH}>AMC</th>
                <th className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => {
                const name = vendorFullName(v);
                const address = [v.addressLine1, v.addressLine2, v.addressLine3, v.addressLine4].filter(Boolean);
                return (
                  <tr key={v.id} className="border-t border-hairline">
                    <td className={`${TD} tabular-nums text-ink-muted`}>{i + 1}</td>
                    <td className={TD}>
                      <span className="whitespace-nowrap rounded-pill bg-surface-soft px-2 py-0.5 text-[12px] font-bold">{v.category}</span>
                    </td>
                    <td className={`${TD} min-w-[160px] font-bold`}>
                      {name}
                      {v.notes ? <span className="mt-0.5 block text-[12px] font-medium text-ink-muted">{v.notes}</span> : null}
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>
                      {v.cellNo ? <a href={`tel:${v.cellNo}`} className="hover:underline">{v.cellNo}</a> : "-"}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{v.email ? <a href={`mailto:${v.email}`} className="hover:underline">{v.email}</a> : "-"}</td>
                    <td className={`${TD} min-w-[220px] text-[13px]`}>
                      {address.length ? address.map((l, n) => <span key={n} className="block">{l}</span>) : "-"}
                      {v.landmark ? <span className="mt-0.5 block text-[12px] text-ink-muted">Near {v.landmark}</span> : null}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-[13px]`}>
                      {[v.city, v.state].filter(Boolean).join(", ") || "-"}
                      {v.pincode ? <span className="block tabular-nums text-ink-muted">{v.pincode}</span> : null}
                    </td>
                    <td className={`${TD} max-w-[220px]`}>
                      {v.website ? (
                        <a
                          href={v.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={v.website}
                          className="inline-flex max-w-full items-center gap-1 font-semibold hover:underline"
                        >
                          <span className="min-w-0 truncate">
                            {v.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
                          </span>
                          <ExternalLink size={12} className="shrink-0" />
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={TD}>
                      <span
                        className="rounded-pill px-2 py-0.5 text-[12px] font-bold"
                        style={v.amc ? { background: "var(--color-green-bg)", color: "var(--color-green-deep)" } : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
                      >
                        {v.amc ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <WhatsAppButton phone={v.cellNo} name={name} />
                        {canEdit ? (
                          <>
                            <IconBtn label="Edit" onClick={() => setDraft(toDraft(v))}>
                              <Pencil size={14} />
                            </IconBtn>
                            <IconBtn
                              label={v.isActive ? "Mark inactive" : "Mark active"}
                              busy={busy === `act-${v.id}`}
                              onClick={() =>
                                void run(`act-${v.id}`, () => setVendorActive(v.id, !v.isActive), v.isActive ? `${name} marked inactive` : `${name} marked active`)
                              }
                            >
                              {v.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                            </IconBtn>
                            <IconBtn
                              label="Delete"
                              danger
                              busy={busy === `del-${v.id}`}
                              onClick={() => {
                                if (window.confirm(`Delete ${name} from the Directory? This can't be undone.`)) {
                                  void run(`del-${v.id}`, () => deleteVendor(v.id), "Vendor deleted");
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </IconBtn>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13.5px] text-ink-muted">
              {vendors.length === 0 ? "No vendors yet." : wantActive ? "No vendors match." : "No inactive vendors."}
            </p>
          ) : null}
        </div>
      </section>

      {draft ? (
        <Modal title={draft.id ? "Edit vendor" : "Add vendor"} onClose={() => setDraft(null)} wide>
          <form onSubmit={save} className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Category" required>
              <CategoryInput value={draft.category} onChange={(v) => set({ category: v })} options={categories} placeholder="AC, Electrician…" className={INPUT} required />
            </Field>
            <Field label="AMC">
              <div className="flex gap-2">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    aria-pressed={draft.amc === val}
                    onClick={() => set({ amc: val })}
                    className="flex-1 rounded-lg border px-3 py-2 text-[14px] font-bold transition-colors"
                    style={
                      draft.amc === val
                        ? { borderColor: RED, background: "color-mix(in srgb, var(--color-altus-red) 8%, white)", color: "var(--color-altus-red-deep)" }
                        : { borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-muted)" }
                    }
                  >
                    {val ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="First Name" required>
              <input value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} required className={INPUT} autoFocus />
            </Field>
            <Field label="Last Name">
              <input value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Cell No">
              <input value={draft.cellNo} onChange={(e) => set({ cellNo: e.target.value })} type="tel" inputMode="tel" className={INPUT} />
            </Field>
            <Field label="Email Address">
              <input value={draft.email} onChange={(e) => set({ email: e.target.value })} type="email" className={INPUT} />
            </Field>
            <Field label="Address Line 1">
              <input value={draft.addressLine1} onChange={(e) => set({ addressLine1: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Address Line 2">
              <input value={draft.addressLine2} onChange={(e) => set({ addressLine2: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Address Line 3">
              <input value={draft.addressLine3} onChange={(e) => set({ addressLine3: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Address Line 4">
              <input value={draft.addressLine4} onChange={(e) => set({ addressLine4: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Nearby Landmark">
              <input value={draft.landmark} onChange={(e) => set({ landmark: e.target.value })} className={INPUT} />
            </Field>
            <Field label="City">
              <input value={draft.city} onChange={(e) => set({ city: e.target.value })} className={INPUT} />
            </Field>
            <Field label="State">
              <input value={draft.state} onChange={(e) => set({ state: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Pincode">
              <input value={draft.pincode} onChange={(e) => set({ pincode: e.target.value })} inputMode="numeric" maxLength={7} className={INPUT} />
            </Field>
            <Field label="Website" className="col-span-2 max-sm:col-span-1">
              <input value={draft.website} onChange={(e) => set({ website: e.target.value })} placeholder="www.example.com" className={INPUT} />
            </Field>
            <Field label="Notes" className="col-span-2 max-sm:col-span-1">
              <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} className={INPUT} />
            </Field>
            <div className="col-span-2 flex justify-end gap-2 max-sm:col-span-1">
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-hairline-strong px-4 py-2 text-[13.5px] font-bold text-ink-strong">
                Cancel
              </button>
              <button type="submit" disabled={busy === "save"} className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: RED }}>
                {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : null} Save
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {bulkOpen ? (
        // Its own overlay rather than <Modal>: the grid has 16 columns and needs
        // far more width than Modal's 760px, and Modal closes on Escape and on a
        // backdrop click, either of which would throw away a half-typed grid.
        <div className="fixed inset-0 z-[130] grid place-items-center bg-[rgba(15,23,42,0.45)] p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bulk upload vendors"
            className="max-h-[92vh] w-[1240px] max-w-[96vw] overflow-y-auto rounded-2xl border border-hairline-strong bg-surface-card p-5 shadow-[0_40px_100px_rgba(15,23,42,0.35)]"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-black text-ink-strong">Bulk upload vendors</h2>
                <p className="text-[12.5px] font-medium text-ink-muted">First Name and Category are required. Everything else is optional.</p>
              </div>
              <button type="button" onClick={() => setBulkOpen(false)} aria-label="Close" className="text-ink-muted hover:text-ink-strong">
                <X size={18} />
              </button>
            </div>
            <VendorBulkEntry categories={categories} existing={vendors} onSuccess={() => setBulkOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  busy,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-muted transition hover:text-ink-strong disabled:opacity-50 ${danger ? "hover:!text-[color:var(--color-altus-red)]" : ""}`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}
