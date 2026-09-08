"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Loader2, Send, Save, Paperclip, Eye, Check, ChevronLeft, Link2, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fireToast } from "@/lib/toast";
import {
  ONBOARDING_SECTIONS, ONB_FILE_KEYS, ONB_ALL_FIELDS, PERM_TO_CURR, ONB_WIDTH_PX, ONB_ACCEPT,
  parseRepeaterRows, isRepeaterRowComplete, type OnbField,
} from "@/lib/dossier/onboarding-schema";
import type { OnboardingView } from "@/lib/queries/onboarding";
import { submitOnboarding, createOnboardingUploadUrl } from "@/app/(app)/dossier/onboarding/actions";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { useAutosave } from "@/components/hr/forms/use-autosave";
import { SaveIndicator } from "@/components/hr/forms/save-indicator";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

export function OnboardingForm({ initial, backHref }: { initial: OnboardingView; backHref: string | null }) {
  const router = useRouter();
  const employeeId = initial.employee.id;
  const [busy, setBusy] = React.useState<null | "draft" | "submitted">(null);
  const [values, setValues] = React.useState<Record<string, string>>(() => ({ ...initial.fields }));
  const [picked, setPicked] = React.useState<Record<string, File>>({});
  const [links, setLinks] = React.useState<Record<string, string>>({});

  // Repeater rows (e.g. Emergency Contacts) - seeded from saved JSON, else N empty rows.
  const repeaterFields = React.useMemo(() => ONB_ALL_FIELDS.filter((f) => f.type === "repeater"), []);
  const [repeaters, setRepeaters] = React.useState<Record<string, Record<string, string>[]>>(() => {
    const out: Record<string, Record<string, string>[]> = {};
    for (const f of repeaterFields) {
      const saved = parseRepeaterRows(initial.fields[f.key]);
      const seed = f.seed ?? f.min ?? 1;
      const rows = saved.length ? saved : [];
      while (rows.length < seed) rows.push({});
      out[f.key] = rows.map((r) => ({ ...r }));
    }
    return out;
  });

  function emptyRow(f: OnbField): Record<string, string> {
    const o: Record<string, string> = {};
    for (const s of f.sub ?? []) o[s.key] = "";
    return o;
  }
  function setRepeaterCell(fieldKey: string, rowIdx: number, colKey: string, v: string) {
    setRepeaters((prev) => {
      const rows = (prev[fieldKey] ?? []).map((r, i) => (i === rowIdx ? { ...r, [colKey]: v } : r));
      return { ...prev, [fieldKey]: rows };
    });
  }
  function addRepeaterRow(f: OnbField) {
    setRepeaters((prev) => {
      const rows = prev[f.key] ?? [];
      if (rows.length >= (f.max ?? 20)) return prev;
      return { ...prev, [f.key]: [...rows, emptyRow(f)] };
    });
  }
  function removeRepeaterRow(f: OnbField, rowIdx: number) {
    setRepeaters((prev) => {
      const rows = prev[f.key] ?? [];
      if (rows.length <= (f.min ?? 1)) return prev; // keep the minimum number of rows
      return { ...prev, [f.key]: rows.filter((_, i) => i !== rowIdx) };
    });
  }

  const sameAsPerm = values.sameAsPermanent === "YES";

  function setVal(key: string, v: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      if (key === "sameAsPermanent" && v === "YES") for (const [p, c] of PERM_TO_CURR) next[c] = prev[p] ?? "";
      return next;
    });
  }

  /**
   * AUTOSAVE PAYLOAD - text answers, repeater rows and pasted links only.
   *
   * Picked FILES are deliberately excluded. They are `File` handles, they do not
   * serialise into the change signature, and re-posting one on every debounce
   * would re-upload the whole attachment to storage each time. Leaving them out
   * is safe because `submitOnboarding` seeds its `files` map from the row that
   * already exists (see "merge onto whatever already exists"), so a save that
   * carries no attachment keeps every attachment previously stored. Files land
   * on the next explicit Save Draft or Submit.
   */
  const draft = React.useMemo(
    () => ({ values, repeaters, links }),
    [values, repeaters, links],
  );

  const autosave = useAutosave({
    data: draft,
    // Never while an explicit Save Draft / Submit is mid-flight: that click is
    // writing the same row, attachments included, and is strictly more complete.
    enabled: busy === null,
    save: async (d) => {
      const fd = new FormData();
      fd.set("employeeId", employeeId);
      // ALWAYS "draft". The server refuses to demote an already-submitted form,
      // so this is a no-op on status for a submitted record and simply updates
      // the answers - an autosave must never submit on the user's behalf.
      fd.set("status", "draft");
      for (const [k, v] of Object.entries(d.values)) fd.set(k, v ?? "");
      if (d.values.sameAsPermanent === "YES") {
        for (const [p, c] of PERM_TO_CURR) fd.set(c, d.values[p] ?? "");
      }
      for (const f of repeaterFields) fd.set(f.key, JSON.stringify(d.repeaters[f.key] ?? []));
      for (const key of ONB_FILE_KEYS) {
        const link = d.links[key]?.trim();
        if (link) fd.set(`${key}__link`, link);
      }
      const res = await submitOnboarding(fd);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
  });

  async function save(status: "draft" | "submitted") {
    if (busy) return;

    // Client-side gate, mirroring the server's submit rules. Run BEFORE any file
    // upload so we never push bytes to storage for a form the server will reject.
    if (status === "submitted") {
      for (const f of repeaterFields) {
        const complete = (repeaters[f.key] ?? []).filter((row) => isRepeaterRowComplete(f, row)).length;
        const need = f.min ?? 1;
        if (complete < need) {
          fireToast({ message: `Add at least ${need} complete ${f.itemLabel ?? f.label} (Name, Relation & Mobile each).`, type: "error" });
          document.getElementById("sec-emergency")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      // Required text + attachments. An attachment is satisfied by a newly picked
      // file, a pasted link, OR a file already stored from a previous save.
      for (const f of ONB_ALL_FIELDS) {
        if (!f.required) continue;
        if (f.type === "repeater") continue; // handled above
        if (f.type === "file") {
          const has = !!picked[f.key] || !!links[f.key]?.trim() || !!initial.files[f.key]?.signedUrl || !!initial.files[f.key]?.fileName;
          if (!has) {
            fireToast({ message: `“${f.label}” is required (attach a file or paste a link).`, type: "error" });
            return;
          }
          continue;
        }
        // sameAsPermanent auto-fills the current-address fields - treat them as
        // present when the toggle is on.
        const autofilled = sameAsPerm && PERM_TO_CURR.some(([, c]) => c === f.key);
        if (!autofilled && !String(values[f.key] ?? "").trim()) {
          fireToast({ message: `“${f.label}” is required.`, type: "error" });
          return;
        }
      }
    }

    setBusy(status);

    // Upload any newly PICKED files DIRECTLY to Supabase Storage (signed URL),
    // then post back only their storage refs. This keeps the Server Action body
    // tiny so large scans/photos submit at all - see createOnboardingUploadUrl.
    const uploadedRefs: Record<string, { path: string; fileName: string; mime: string | null; size: number }> = {};
    const pickedKeys = ONB_FILE_KEYS.filter((k) => picked[k]);
    if (pickedKeys.length) {
      const supa = getSupabaseClient();
      for (const key of pickedKeys) {
        const file = picked[key]!;
        const signed = await createOnboardingUploadUrl({ employeeId, key, fileName: file.name, mime: file.type || null, size: file.size });
        if (!signed.ok) { setBusy(null); fireToast({ message: signed.error, type: "error" }); return; }
        const { error } = await supa.storage
          .from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
        if (error) { setBusy(null); fireToast({ message: `Upload failed (${file.name}): ${error.message}`, type: "error" }); return; }
        uploadedRefs[key] = { path: signed.path, fileName: file.name, mime: file.type || null, size: file.size };
      }
    }

    const fd = new FormData();
    fd.set("employeeId", employeeId);
    fd.set("status", status);
    for (const [k, v] of Object.entries(values)) fd.set(k, v ?? "");
    if (values.sameAsPermanent === "YES") for (const [p, c] of PERM_TO_CURR) fd.set(c, values[p] ?? "");
    for (const f of repeaterFields) fd.set(f.key, JSON.stringify(repeaters[f.key] ?? []));
    for (const key of ONB_FILE_KEYS) {
      if (uploadedRefs[key]) fd.set(`${key}__uploaded`, JSON.stringify(uploadedRefs[key]));
      else if (links[key]?.trim()) fd.set(`${key}__link`, links[key]!.trim());
    }
    const res = await submitOnboarding(fd);
    setBusy(null);
    if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
    // Stored now - drop the local picks so the fields show the saved "View" link
    // from the refreshed server data rather than the transient picked name.
    if (Object.keys(uploadedRefs).length) setPicked({});
    fireToast({ message: status === "draft" ? "Draft saved" : "Onboarding submitted", type: "success" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* header */}
      <div className="wg-rise flex flex-wrap items-center gap-4 rounded-[22px] bg-surface-card p-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 12px 40px -28px rgba(15,23,42,0.35)" }}>
        {backHref && <Link href={backHref as Route} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-ink-muted hover:text-ink-strong" aria-label="Back"><ChevronLeft size={18} strokeWidth={2.4} /></Link>}
        <Avatar name={initial.employee.name} avatarUrl={initial.employee.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 900, fontSize: "clamp(18px,2vw,24px)", letterSpacing: "-0.02em" }}>Onboarding · {initial.employee.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-semibold text-ink-muted">
            <span>{initial.status === "submitted" ? "Submitted - update any answer below." : initial.status === "draft" ? "Draft saved - finish and submit." : "Every field is required. Type NA where it doesn't apply."}</span>
            <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} />
          </div>
        </div>
      </div>

      {/* sticky section nav */}
      <div className="sticky top-2 z-10 flex flex-wrap gap-1 rounded-pill bg-surface-card/90 p-1.5 backdrop-blur" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        {ONBOARDING_SECTIONS.map((s, i) => (
          <a key={s.key} href={`#sec-${s.key}`} className="rounded-pill px-2.5 py-1.5 text-[11.5px] font-bold text-ink-muted transition hover:bg-surface-soft hover:text-ink-strong"><span className="tabular-nums text-ink-subtle">{i + 1}</span> {s.title}</a>
        ))}
      </div>

      {/* sections */}
      {ONBOARDING_SECTIONS.map((s, i) => (
        <section key={s.key} id={`sec-${s.key}`} className="wg-rise scroll-mt-20 rounded-[20px] bg-surface-card p-5 max-md:p-4" style={{ animationDelay: `${i * 25}ms`, boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 8px 30px -24px rgba(15,23,42,0.3)" }}>
          <div className="mb-3.5 flex items-baseline gap-2.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-black text-white tabular-nums" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>{i + 1}</span>
            <div><h2 className="text-[16.5px] font-black text-ink-strong">{s.title}</h2>{s.hint && <p className="text-[12px] font-medium text-ink-subtle">{s.hint}</p>}</div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-3">
            {s.fields.map((f) =>
              f.type === "repeater" ? (
                <RepeaterField
                  key={f.key}
                  field={f}
                  rows={repeaters[f.key] ?? []}
                  onCell={(rowIdx, colKey, v) => setRepeaterCell(f.key, rowIdx, colKey, v)}
                  onAdd={() => addRepeaterRow(f)}
                  onRemove={(rowIdx) => removeRepeaterRow(f, rowIdx)}
                />
              ) : (
                <Field
                  key={f.key}
                  field={f}
                  value={values[f.key] ?? ""}
                  onChange={(v) => setVal(f.key, v)}
                  existingFile={initial.files[f.key] ?? null}
                  pickedFile={picked[f.key] ?? null}
                  onPick={(file) => setPicked((p) => ({ ...p, [f.key]: file }))}
                  linkVal={links[f.key] ?? ""}
                  onLink={(v) => setLinks((p) => ({ ...p, [f.key]: v }))}
                  disabled={s.key === "current" && f.key !== "sameAsPermanent" && sameAsPerm}
                />
              ),
            )}
          </div>
        </section>
      ))}

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface-card/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-end gap-2">
          <button type="button" disabled={!!busy} onClick={() => save("draft")} className="bg-surface-card inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold text-ink-muted hover:text-ink-strong disabled:opacity-50">{busy === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.3} />} Save Draft</button>
          <button type="button" disabled={!!busy} onClick={() => save("submitted")} className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-6 py-2.5 text-[14px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -10px ${RED_DEEP}` }}>{busy === "submitted" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.4} />} Submit Onboarding</button>
        </div>
      </div>
    </div>
  );
}

function Field({
  field, value, onChange, existingFile, pickedFile, onPick, linkVal, onLink, disabled,
}: {
  field: OnbField;
  value: string;
  onChange: (v: string) => void;
  existingFile: OnboardingView["files"][string] | null;
  pickedFile: File | null;
  onPick: (f: File) => void;
  linkVal: string;
  onLink: (v: string) => void;
  disabled?: boolean;
}) {
  const wpx = ONB_WIDTH_PX[field.w];
  const wrapStyle: React.CSSProperties = { flexGrow: 1, flexBasis: wpx.basis, maxWidth: wpx.max ?? undefined, minWidth: Math.min(wpx.basis, 130) };
  const label = (
    <span className="text-[11.5px] font-bold text-ink-soft">{field.label}{field.required && <span className="text-[color:var(--color-altus-red)]"> *</span>}{field.hint ? <span className="font-medium normal-case text-ink-subtle"> · {field.hint}</span> : null}</span>
  );

  if (field.type === "select") {
    return (
      <label className="flex flex-col gap-1" style={wrapStyle}>
        {label}
        <div className="flex gap-1.5">
          {(field.options ?? []).map((opt) => {
            const on = value === opt;
            return (
              <button key={opt} type="button" onClick={() => onChange(opt)} className="flex-1 rounded-lg px-2 py-2 text-[12.5px] font-bold transition" style={{ background: on ? `color-mix(in srgb, ${RED} 12%, transparent)` : "var(--color-surface-soft)", color: on ? RED : "var(--color-ink-muted)", boxShadow: on ? `inset 0 0 0 1.5px ${RED}` : "inset 0 0 0 1px var(--color-hairline)" }}>{on && <Check size={12} className="mr-0.5 inline" strokeWidth={3} />}{opt}</button>
            );
          })}
        </div>
      </label>
    );
  }

  if (field.type === "file") {
    const hasPicked = !!pickedFile;
    const hasExisting = !hasPicked && !!existingFile && (!!existingFile.signedUrl || !!existingFile.fileName);
    return (
      <label className="flex flex-col gap-1" style={wrapStyle}>
        {label}
        <div className="relative flex items-center gap-1.5 rounded-lg border border-solid border-hairline-strong bg-surface-soft px-2.5 py-2">
          <Paperclip size={13} className="shrink-0 text-ink-subtle" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-muted">{hasPicked ? pickedFile!.name : hasExisting ? (existingFile!.isLink ? "Linked" : existingFile!.fileName) : "Choose file…"}</span>
          {hasExisting && existingFile!.signedUrl && (
            <a href={existingFile!.signedUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="relative z-10 inline-flex items-center gap-1 rounded-pill bg-white px-2 py-0.5 text-[10.5px] font-bold text-ink-soft hover:text-ink-strong"><Eye size={11} /> View</a>
          )}
          <input type="file" accept={ONB_ACCEPT} onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} className="absolute inset-0 cursor-pointer opacity-0" />
        </div>
        {/* or paste a Drive / URL link */}
        <div className="flex items-center gap-1.5 rounded-lg bg-surface-soft px-2.5 py-1.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <Link2 size={12} className="shrink-0 text-ink-subtle" />
          <input type="url" value={linkVal} onChange={(e) => onLink(e.target.value)} placeholder="or paste Drive / URL link" className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle" />
        </div>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1" style={wrapStyle}>
      {label}
      <input
        type={field.type === "tel" ? "tel" : "text"}
        inputMode={field.type === "tel" ? "tel" : field.type === "number" ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? "= permanent" : ""}
        maxLength={2000}
        className="rounded-lg border border-hairline bg-surface-soft px-2.5 py-2 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] disabled:opacity-50"
      />
    </label>
  );
}

function RepeaterField({
  field, rows, onCell, onAdd, onRemove,
}: {
  field: OnbField;
  rows: Record<string, string>[];
  onCell: (rowIdx: number, colKey: string, v: string) => void;
  onAdd: () => void;
  onRemove: (rowIdx: number) => void;
}) {
  const min = field.min ?? 1;
  const max = field.max ?? 20;
  const complete = rows.filter((r) => (field.sub ?? []).every((s) => String(r?.[s.key] ?? "").trim().length > 0)).length;
  const enough = complete >= min;
  return (
    <div className="flex w-full flex-col gap-2" style={{ flexBasis: "100%" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-bold text-ink-soft">
          {field.label}
          {field.required && <span className="text-[color:var(--color-altus-red)]"> *</span>}
          <span className="font-medium normal-case text-ink-subtle"> · at least {min} required</span>
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-bold"
          style={
            enough
              ? { background: "color-mix(in srgb, #16a34a 12%, transparent)", color: "#15803d" }
              : { background: `color-mix(in srgb, ${RED} 12%, transparent)`, color: RED }
          }
        >
          {enough ? <Check size={11} strokeWidth={3} /> : null}
          {complete}/{min} complete
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-soft p-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
            <span className="mb-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-ink-soft tabular-nums" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>{rowIdx + 1}</span>
            {(field.sub ?? []).map((s) => {
              const wpx = ONB_WIDTH_PX[s.w];
              return (
                <label key={s.key} className="flex min-w-[130px] flex-1 flex-col gap-1" style={{ flexBasis: wpx.basis, maxWidth: wpx.max ?? undefined }}>
                  <span className="text-[11px] font-bold text-ink-soft">{s.label}<span className="text-[color:var(--color-altus-red)]"> *</span></span>
                  <input
                    type={s.type === "tel" ? "tel" : "text"}
                    inputMode={s.type === "tel" ? "tel" : undefined}
                    value={row[s.key] ?? ""}
                    onChange={(e) => onCell(rowIdx, s.key, e.target.value)}
                    maxLength={200}
                    className="rounded-lg border border-hairline bg-white px-2.5 py-2 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
                  />
                </label>
              );
            })}
            <button
              type="button"
              onClick={() => onRemove(rowIdx)}
              disabled={rows.length <= min}
              aria-label={`Remove ${field.itemLabel ?? "row"} ${rowIdx + 1}`}
              className="mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-subtle hover:bg-white hover:text-[color:var(--color-altus-red)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={15} strokeWidth={2.2} />
            </button>
          </div>
        ))}
      </div>
      {rows.length < max && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-surface-soft px-3 py-1.5 text-[12.5px] font-bold text-ink-muted hover:text-ink-strong"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <Plus size={13} strokeWidth={2.6} /> Add {field.itemLabel ?? "row"}
        </button>
      )}
    </div>
  );
}
