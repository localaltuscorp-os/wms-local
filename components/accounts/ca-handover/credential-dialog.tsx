"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Eye, EyeOff } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect } from "@/components/ui/lookup-select";
import {
  CA_PORTAL_TYPES,
  CA_PORTAL_LABELS,
  type CaCredentialRow,
} from "@/lib/accounts/ca-constants";
import {
  createCredential,
  updateCredential,
} from "@/app/(app)/accounts/ca-handover/actions";

type CaPortalType = (typeof CA_PORTAL_TYPES)[number];

const PORTAL_OPTIONS = CA_PORTAL_TYPES.map((t) => ({ id: t, name: CA_PORTAL_LABELS[t] ?? t }));

interface Draft {
  portalType: CaPortalType;
  entityName: string;
  username: string;
  password: string; // write-only; blank on edit means "keep existing"
  phone: string;
  defaultEmail: string;
  websiteLink: string;
  emailUpdated: boolean;
  passwordReset: boolean;
  primaryPhoneUpdated: boolean;
  secondaryPhoneUpdated: boolean;
  note: string;
  sortOrder: string;
}

function toDraft(r: CaCredentialRow | null, fallbackPortal: string | null): Draft {
  const portal = (CA_PORTAL_TYPES as readonly string[]).includes(r?.portalType ?? fallbackPortal ?? "")
    ? ((r?.portalType ?? fallbackPortal) as CaPortalType)
    : "income_tax";
  return {
    portalType: portal,
    entityName: r?.entityName ?? "",
    username: r?.username ?? "",
    password: "", // never prefill — write-only
    phone: r?.phone ?? "",
    defaultEmail: r?.defaultEmail ?? "",
    websiteLink: r?.websiteLink ?? "",
    emailUpdated: r?.emailUpdated ?? false,
    passwordReset: r?.passwordReset ?? false,
    primaryPhoneUpdated: r?.primaryPhoneUpdated ?? false,
    secondaryPhoneUpdated: r?.secondaryPhoneUpdated ?? false,
    note: r?.note ?? "",
    sortOrder: r?.sortOrder != null ? String(r.sortOrder) : "100",
  };
}

const field =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14.5px] text-ink-strong outline-none focus:border-altus-red";

export function CredentialDialog({
  row,
  defaultPortalType,
  onClose,
}: {
  row: CaCredentialRow | null;
  defaultPortalType: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(row);
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(row, defaultPortalType));
  const [saving, setSaving] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);

  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  React.useEffect(() => {
    // Autofocus the first text field for keyboard-first entry.
    const t = setTimeout(() => firstRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  function save() {
    if (!draft.entityName.trim()) {
      return fireToast({ message: "Entity name is required.", type: "error" });
    }
    const sortOrder = Number(draft.sortOrder.trim());
    const payload = {
      ...(isEdit && row ? { id: row.id } : {}),
      portalType: draft.portalType,
      entityName: draft.entityName.trim(),
      username: draft.username.trim() || null,
      // Send password ONLY when typed; blank → omitted so edit keeps existing.
      ...(draft.password.length > 0 ? { password: draft.password } : {}),
      phone: draft.phone.trim() || null,
      defaultEmail: draft.defaultEmail.trim() || null,
      websiteLink: draft.websiteLink.trim() || null,
      emailUpdated: draft.emailUpdated,
      passwordReset: draft.passwordReset,
      primaryPhoneUpdated: draft.primaryPhoneUpdated,
      secondaryPhoneUpdated: draft.secondaryPhoneUpdated,
      note: draft.note.trim() || null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
    };
    setSaving(true);
    const run = isEdit ? updateCredential(payload) : createCredential(payload);
    run
      .then((res) => {
        setSaving(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: isEdit ? "Login updated." : "Login added." });
        router.refresh();
        onClose();
      })
      .catch((e) => {
        setSaving(false);
        fireToast({ message: e instanceof Error ? e.message : "Failed.", type: "error" });
      });
  }

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[130] -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[640px] max-h-[88vh] flex flex-col rounded-2xl border border-hairline bg-surface-card shadow-2xl overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-hairline">
            <div>
              <Dialog.Title className="font-serif italic text-ink-strong" style={{ fontSize: 22, fontWeight: 600 }}>
                {isEdit ? "Edit Login" : "Add Login"}
              </Dialog.Title>
              <Dialog.Description className="text-ink-subtle font-medium" style={{ fontSize: 13 }}>
                Credential is stored encrypted at rest{isEdit ? " · leave password blank to keep the current one" : ""}.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="rounded-lg p-2 text-ink-subtle hover:bg-black/[0.05] cursor-pointer">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto p-6"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
            }}
          >
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Portal Type</span>
                <LookupSelect
                  label="portal"
                  value={draft.portalType}
                  onChange={(id) => set({ portalType: (id as CaPortalType) ?? "income_tax" })}
                  options={PORTAL_OPTIONS}
                  className={field + " min-h-[42px]"}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Entity Name</span>
                <input ref={firstRef} value={draft.entityName} onChange={(e) => set({ entityName: e.target.value })} placeholder="e.g. Altus Corp Pvt Ltd" className={field} />
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Username / ID</span>
                <input value={draft.username} onChange={(e) => set({ username: e.target.value })} placeholder="Login ID" className={field} autoComplete="off" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">
                  Password {isEdit && <span className="font-medium text-ink-subtle">(blank = unchanged)</span>}
                </span>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={draft.password}
                    onChange={(e) => set({ password: e.target.value })}
                    placeholder={isEdit ? "•••••••• (unchanged)" : "Enter password"}
                    className={field + " pr-10 font-mono"}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-altus-red cursor-pointer">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Phone No.</span>
                <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Registered mobile" className={field} inputMode="tel" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Default Email</span>
                <input value={draft.defaultEmail} onChange={(e) => set({ defaultEmail: e.target.value })} placeholder="Registered email" className={field} inputMode="email" autoComplete="off" />
              </label>

              <label className="block col-span-2 max-md:col-span-1">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Website Link</span>
                <input value={draft.websiteLink} onChange={(e) => set({ websiteLink: e.target.value })} placeholder="https://…" className={field} inputMode="url" />
              </label>

              <label className="block col-span-2 max-md:col-span-1">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Note</span>
                <textarea value={draft.note} onChange={(e) => set({ note: e.target.value })} rows={2} placeholder="Anything the CA should know" className={field + " resize-y"} />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-hairline p-4">
              <p className="mb-2 text-[12px] font-bold text-ink-soft uppercase tracking-[0.06em]">Handover status</p>
              <div className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
                <Toggle label="Email Updated" checked={draft.emailUpdated} onChange={(v) => set({ emailUpdated: v })} />
                <Toggle label="Password Reset" checked={draft.passwordReset} onChange={(v) => set({ passwordReset: v })} />
                <Toggle label="Primary Phone Updated" checked={draft.primaryPhoneUpdated} onChange={(v) => set({ primaryPhoneUpdated: v })} />
                <Toggle label="Secondary Phone Updated" checked={draft.secondaryPhoneUpdated} onChange={(v) => set({ secondaryPhoneUpdated: v })} />
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-hairline">
            <button type="button" onClick={onClose} disabled={saving} className="cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-bold text-ink-soft hover:text-ink-strong">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="wg-btn wg-sheen cursor-pointer inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13.5px] font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />}
              {isEdit ? "Save Changes" : "Add Login"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-soft cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-altus-red)]" />
      {label}
    </label>
  );
}
