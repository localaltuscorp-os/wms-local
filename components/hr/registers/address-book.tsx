"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Search, Trash2, UserCheck, UserX } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { CONTACT_SERVICES } from "@/lib/hr/registers";
import type { ContactRow, EmployeeContactRow } from "@/lib/hr/registers-server";
import { saveContact, setContactActive, deleteContact } from "@/app/(app)/hr/address-book/actions";
import { FILTER, Field, INPUT, Modal, NativeSelect, PASS_VERTICAL_SCROLL, RED, TD, TH, Tabs, WhatsAppButton } from "./register-ui";

type Draft = {
  id?: string;
  companyName: string;
  personName: string;
  cellNo: string;
  alternateNo: string;
  email: string;
  service: string;
  notes: string;
};

const EMPTY: Draft = { companyName: "", personName: "", cellNo: "", alternateNo: "", email: "", service: "", notes: "" };
const EMPLOYEE_SERVICE = "Employee";

/**
 * HR → Address Book of Resources.
 *
 * Two kinds of row, kept visibly apart:
 *   · Resources — vendors / service people, added and edited here by Ruchita,
 *     Rutvisha and Manan.
 *   · Employees — read live from their HR forms (personal cell + email). Not
 *     editable here: the HR form is the one place those details change.
 *
 * Active and Inactive are separate tabs, never mixed in one list.
 */
export function AddressBook({
  contacts,
  employees,
  canEdit,
}: {
  contacts: ContactRow[];
  employees: EmployeeContactRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"active" | "inactive">("active");
  const [q, setQ] = React.useState("");
  const [service, setService] = React.useState("all");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const matches = (vals: (string | null)[]) => !needle || vals.some((v) => (v ?? "").toLowerCase().includes(needle));
  const wantActive = tab === "active";

  const resourceRows = contacts
    .filter((c) => c.isActive === wantActive)
    .filter((c) => service === "all" || c.service === service)
    .filter((c) => matches([c.companyName, c.personName, c.cellNo, c.alternateNo, c.email, c.service, c.notes]));
  const employeeRows = employees
    .filter((e) => e.isActive === wantActive)
    .filter(() => service === "all" || service === EMPLOYEE_SERVICE)
    .filter((e) => matches([e.name, e.designation, e.cell, e.email]));

  const services = Array.from(new Set([...CONTACT_SERVICES, ...contacts.map((c) => c.service)])).sort();
  const activeCount = contacts.filter((c) => c.isActive).length + employees.filter((e) => e.isActive).length;
  const inactiveCount = contacts.length + employees.length - activeCount;

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
    const ok = await run("save", () => saveContact(draft), draft.id ? "Contact updated" : "Contact added");
    if (ok) setDraft(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "active", label: "Active", count: activeCount },
            { value: "inactive", label: "Inactive", count: inactiveCount },
          ]}
        />
        <div className="relative w-[260px] max-w-full">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, number…" aria-label="Search the address book" className={`${INPUT} pl-9`} />
        </div>
        <NativeSelect value={service} onChange={(e) => setService(e.target.value)} aria-label="Filter by service" className={FILTER}>
          <option value="all">All services</option>
          <option value={EMPLOYEE_SERVICE}>Employees</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setDraft({ ...EMPTY })}
            className="ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
          >
            <Plus size={16} strokeWidth={2.6} /> Add contact
          </button>
        ) : (
          <span className="ml-auto text-[12.5px] font-semibold text-ink-muted">View only — Ruchita, Rutvisha and Manan can make changes.</span>
        )}
      </div>

      {/* ── Resources ─────────────────────────────────────────────── */}
      {service !== EMPLOYEE_SERVICE ? (
        <section className="rounded-2xl border border-hairline-strong bg-white">
          <h2 className="border-b border-hairline px-4 py-3 text-[14px] font-black text-ink-strong">
            {wantActive ? "Resources" : "Inactive resources"} <span className="font-semibold text-ink-muted">({resourceRows.length})</span>
          </h2>
          {/* INLINE overscroll style, on purpose: globals.css gives every
              overflow-x-auto box `overscroll-behavior: contain` in an UNLAYERED
              rule, which swallows the VERTICAL wheel — over a table the page
              wouldn't scroll. A Tailwind class can't undo it (utilities live in
              a layer, and unlayered CSS always wins); an inline style does. */}
          <div className="overflow-x-auto" style={PASS_VERTICAL_SCROLL}>
            <table className="w-full border-collapse">
              <thead className="bg-surface-soft">
                <tr>
                  <th className={TH}>Sr. No.</th>
                  <th className={TH}>Company Name</th>
                  <th className={TH}>Person Name</th>
                  <th className={TH}>Service</th>
                  <th className={TH}>Cell No</th>
                  <th className={TH}>Alternate No</th>
                  <th className={TH}>Email</th>
                  <th className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {resourceRows.map((c, i) => (
                  <tr key={c.id} className="border-t border-hairline">
                    <td className={`${TD} tabular-nums text-ink-muted`}>{i + 1}</td>
                    <td className={TD}>{c.companyName ?? "—"}</td>
                    <td className={`${TD} font-bold`}>
                      {c.personName}
                      {c.notes ? <span className="mt-0.5 block text-[12px] font-medium text-ink-muted">{c.notes}</span> : null}
                    </td>
                    <td className={TD}>
                      <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[12px] font-bold">{c.service}</span>
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{c.cellNo ? <a href={`tel:${c.cellNo}`} className="hover:underline">{c.cellNo}</a> : "—"}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{c.alternateNo ? <a href={`tel:${c.alternateNo}`} className="hover:underline">{c.alternateNo}</a> : "—"}</td>
                    <td className={TD}>{c.email ? <a href={`mailto:${c.email}`} className="break-all hover:underline">{c.email}</a> : "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <WhatsAppButton phone={c.cellNo ?? c.alternateNo} name={c.personName} />
                        {canEdit ? (
                          <>
                            <IconBtn label="Edit" onClick={() => setDraft({ id: c.id, companyName: c.companyName ?? "", personName: c.personName, cellNo: c.cellNo ?? "", alternateNo: c.alternateNo ?? "", email: c.email ?? "", service: c.service, notes: c.notes ?? "" })}>
                              <Pencil size={14} />
                            </IconBtn>
                            <IconBtn
                              label={c.isActive ? "Mark inactive" : "Mark active"}
                              busy={busy === `act-${c.id}`}
                              onClick={() => run(`act-${c.id}`, () => setContactActive(c.id, !c.isActive), c.isActive ? `${c.personName} marked inactive` : `${c.personName} marked active`)}
                            >
                              {c.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                            </IconBtn>
                            <IconBtn
                              label="Delete"
                              danger
                              busy={busy === `del-${c.id}`}
                              onClick={() => {
                                if (window.confirm(`Delete ${c.personName} from the Address Book? This can't be undone.`)) {
                                  void run(`del-${c.id}`, () => deleteContact(c.id), "Contact deleted");
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
                ))}
              </tbody>
            </table>
            {resourceRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13.5px] text-ink-muted">
                {wantActive ? "No resources yet." : "No inactive resources."}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Employees (from HR forms) ─────────────────────────────── */}
      {service === "all" || service === EMPLOYEE_SERVICE ? (
        <section className="rounded-2xl border border-hairline-strong bg-white">
          <h2 className="border-b border-hairline px-4 py-3 text-[14px] font-black text-ink-strong">
            {wantActive ? "Employees" : "Inactive employees"} <span className="font-semibold text-ink-muted">({employeeRows.length})</span>
            <span className="ml-2 text-[12px] font-semibold text-ink-muted">Personal details from their HR forms</span>
          </h2>
          {/* INLINE overscroll style, on purpose: globals.css gives every
              overflow-x-auto box `overscroll-behavior: contain` in an UNLAYERED
              rule, which swallows the VERTICAL wheel — over a table the page
              wouldn't scroll. A Tailwind class can't undo it (utilities live in
              a layer, and unlayered CSS always wins); an inline style does. */}
          <div className="overflow-x-auto" style={PASS_VERTICAL_SCROLL}>
            <table className="w-full border-collapse">
              <thead className="bg-surface-soft">
                <tr>
                  <th className={TH}>Sr. No.</th>
                  <th className={TH}>Name</th>
                  <th className={TH}>Designation</th>
                  <th className={TH}>Personal Cell No</th>
                  <th className={TH}>Personal Email</th>
                  <th className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {employeeRows.map((e, i) => (
                  <tr key={e.id} className="border-t border-hairline">
                    <td className={`${TD} tabular-nums text-ink-muted`}>{i + 1}</td>
                    <td className={`${TD} font-bold`}>{e.name}</td>
                    <td className={TD}>{e.designation ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{e.cell ? <a href={`tel:${e.cell}`} className="hover:underline">{e.cell}</a> : "—"}</td>
                    <td className={TD}>{e.email ? <a href={`mailto:${e.email}`} className="break-all hover:underline">{e.email}</a> : "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <div className="flex justify-end">
                        <WhatsAppButton phone={e.cell} name={e.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {employeeRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13.5px] text-ink-muted">
                {wantActive ? "No employees match." : "No inactive employees."}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {draft ? (
        <Modal title={draft.id ? "Edit contact" : "Add contact"} onClose={() => setDraft(null)}>
          <form onSubmit={save} className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Company Name" className="col-span-2 max-sm:col-span-1">
              <input value={draft.companyName} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} className={INPUT} autoFocus />
            </Field>
            <Field label="Person Name" required>
              <input value={draft.personName} onChange={(e) => setDraft({ ...draft, personName: e.target.value })} required className={INPUT} />
            </Field>
            <Field label="Service" required>
              <input
                value={draft.service}
                onChange={(e) => setDraft({ ...draft, service: e.target.value })}
                required
                list="hr-contact-services"
                placeholder="AC, Electrician…"
                className={INPUT}
              />
              <datalist id="hr-contact-services">
                {services.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Cell No">
              <input value={draft.cellNo} onChange={(e) => setDraft({ ...draft, cellNo: e.target.value })} type="tel" inputMode="tel" className={INPUT} />
            </Field>
            <Field label="Alternate No">
              <input value={draft.alternateNo} onChange={(e) => setDraft({ ...draft, alternateNo: e.target.value })} type="tel" inputMode="tel" className={INPUT} />
            </Field>
            <Field label="Email" className="col-span-2 max-sm:col-span-1">
              <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} type="email" className={INPUT} />
            </Field>
            <Field label="Service Description / Notes" className="col-span-2 max-sm:col-span-1">
              <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} className={INPUT} />
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
