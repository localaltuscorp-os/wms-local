"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { CaReturnRow } from "@/lib/accounts/ca-constants";
import { createReturn, updateReturn } from "@/app/(app)/accounts/ca-handover/actions";
import { IT_DOC_FIELDS, GST_DOC_FIELDS } from "./returns-archive";

type LinkKey = keyof CaReturnRow;

const LINK_KEYS: LinkKey[] = [...IT_DOC_FIELDS, ...GST_DOC_FIELDS].map((f) => f.key);

interface Draft {
  fy: string;
  entityName: string;
  note: string;
  links: Record<string, string>;
}

function toDraft(r: CaReturnRow | null): Draft {
  const links: Record<string, string> = {};
  for (const k of LINK_KEYS) links[k as string] = (r?.[k] as string | null) ?? "";
  return {
    fy: r?.fy ?? "",
    entityName: r?.entityName ?? "",
    note: r?.note ?? "",
    links,
  };
}

const field =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red";

export function ReturnDialog({ row, onClose }: { row: CaReturnRow | null; onClose: () => void }) {
  const router = useRouter();
  const isEdit = Boolean(row);
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(row));
  const [saving, setSaving] = React.useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => firstRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const setLink = (key: string, v: string) =>
    setDraft((d) => ({ ...d, links: { ...d.links, [key]: v } }));

  function save() {
    if (!draft.fy.trim()) return fireToast({ message: "Financial year is required.", type: "error" });
    if (!draft.entityName.trim()) return fireToast({ message: "Entity name is required.", type: "error" });

    const linkPayload: Record<string, string | null> = {};
    for (const k of LINK_KEYS) {
      const v = (draft.links[k as string] ?? "").trim();
      linkPayload[k as string] = v.length ? v : null;
    }

    const payload = {
      ...(isEdit && row ? { id: row.id } : {}),
      fy: draft.fy.trim(),
      entityName: draft.entityName.trim(),
      note: draft.note.trim() || null,
      ...linkPayload,
    } as Parameters<typeof createReturn>[0];

    setSaving(true);
    const run = isEdit ? updateReturn(payload) : createReturn(payload);
    run
      .then((res) => {
        setSaving(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: isEdit ? "Record updated." : "Record added." });
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
          className="fixed left-1/2 top-1/2 z-[130] -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[820px] max-h-[90vh] flex flex-col rounded-2xl border border-hairline bg-surface-card shadow-2xl overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-hairline">
            <div>
              <Dialog.Title className="font-serif italic text-ink-strong" style={{ fontSize: 22, fontWeight: 600 }}>
                {isEdit ? "Edit FY Record" : "Add FY Record"}
              </Dialog.Title>
              <Dialog.Description className="text-ink-subtle font-medium" style={{ fontSize: 13 }}>
                Paste a document link for each filed return. Blank fields are left out.
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
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Financial Year</span>
                <input ref={firstRef} value={draft.fy} onChange={(e) => setDraft((d) => ({ ...d, fy: e.target.value }))} placeholder="e.g. 2024-25" className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Entity Name</span>
                <input value={draft.entityName} onChange={(e) => setDraft((d) => ({ ...d, entityName: e.target.value }))} placeholder="e.g. Altus Corp Pvt Ltd" className={field} />
              </label>
            </div>

            <LinkSection title="Income Tax documents" fields={IT_DOC_FIELDS} links={draft.links} setLink={setLink} />
            <LinkSection title="GST returns" fields={GST_DOC_FIELDS} links={draft.links} setLink={setLink} />

            <label className="mt-5 block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Note</span>
              <textarea value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} rows={2} placeholder="Anything else for this FY + entity" className={field + " resize-y"} />
            </label>
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
              {isEdit ? "Save Changes" : "Add Record"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LinkSection({
  title,
  fields,
  links,
  setLink,
}: {
  title: string;
  fields: { key: keyof CaReturnRow; label: string }[];
  links: Record<string, string>;
  setLink: (key: string, v: string) => void;
}) {
  const field =
    "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13.5px] text-ink-strong outline-none focus:border-altus-red";
  return (
    <div className="mt-5 rounded-xl border border-hairline p-4">
      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">{title}</p>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {fields.map((f) => (
          <label key={String(f.key)} className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-soft">{f.label}</span>
            <input
              value={links[f.key as string] ?? ""}
              onChange={(e) => setLink(f.key as string, e.target.value)}
              placeholder="https://… link"
              className={field}
              inputMode="url"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
