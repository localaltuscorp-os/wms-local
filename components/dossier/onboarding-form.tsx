"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Loader2, Send, Save, Paperclip, Eye, Check, ChevronLeft, Plus, Trash2, Link2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fireToast } from "@/lib/toast";
import {
  ONBOARDING_SECTIONS, ONB_FILE_KEYS, ONB_ALL_FIELDS, PERM_TO_CURR, ONB_WIDTH_PX, ONB_ACCEPT,
  parseRepeaterRows, isRepeaterRowComplete, isOnbFieldRequired, isOnbFieldHidden, ONB_FIELD_BY_KEY, ONB_PROOF_AADHAAR, ONB_PROOF_ELECTRIC, ONB_PROOF_OTHER, type OnbField, type OnbSection,
} from "@/lib/dossier/onboarding-schema";
import type { OnboardingView } from "@/lib/queries/onboarding";
import { submitOnboarding, createOnboardingUploadUrl } from "@/app/(app)/dossier/onboarding/actions";
import { submitOnboardingAsCandidate, createOnboardingUploadUrlAsCandidate } from "@/app/c/onboarding/actions";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { useAutosave } from "@/components/hr/forms/use-autosave";
import { SaveIndicator } from "@/components/hr/forms/save-indicator";
import { SectionIndex } from "@/components/ui/section-index";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

/**
 * ROW LAYOUT for the sections HR arranged line by line (2026-09).
 *
 * Each row is a grid. `cols` as a number = that many EQUAL columns; as a string
 * it is a CSS grid-template — "auto minmax(0,1fr)" keeps the Have / Don't have
 * buttons at their own size and gives the attachment the rest of the line. A
 * `span: 2` cell stretches across two columns so it lines up with the row above.
 * Sections without an entry keep the free-wrapping layout; every row stacks to a
 * single column on small screens.
 */
type OnbLayoutCell = string | { key: string; span: 2 };
type OnbLayoutRow = { cols: number | string; cells: OnbLayoutCell[] };
const cellKey = (c: OnbLayoutCell) => (typeof c === "string" ? c : c.key);
const BUTTONS_THEN_FILE = "auto minmax(0,1fr)";
const addressRows = (p: "perm" | "curr"): OnbLayoutRow[] => [
  { cols: 1, cells: [`${p}Addr1`] },
  { cols: 2, cells: [`${p}Addr2`, `${p}Addr3`] },
  { cols: 4, cells: [`${p}City`, `${p}State`, `${p}Pincode`, `${p}Landmark`] },
];
const ONB_LAYOUT: Record<string, OnbLayoutRow[]> = {
  personal: [
    { cols: 3, cells: ["firstName", "middleName", "lastName"] },
    // Three equal columns: phone, selfie and the optional CV share the row.
    { cols: 3, cells: ["phone", "selfie", "cv"] },
  ],
  permanent: addressRows("perm"),
  current: addressRows("curr"),
  native: [
    { cols: 1, cells: ["nativeAddr"] },
    { cols: 3, cells: ["nativeCity", "nativeState", "nativePincode"] },
  ],
  identification: [
    { cols: 2, cells: ["latestSelfie", "signaturePhoto"] },
    { cols: 2, cells: ["aadharNo", "aadharCopy"] },
    { cols: 2, cells: ["panNo", "panCopy"] },
    { cols: BUTTONS_THEN_FILE, cells: ["addressProofType", "addressProof"] },
    { cols: BUTTONS_THEN_FILE, cells: ["passportStatus", "passportCopy"] },
    { cols: BUTTONS_THEN_FILE, cells: ["dlStatus", "dlCopy"] },
  ],
  bank: [
    { cols: 4, cells: ["bankAccountName", "bankAccountNo", "ifsCode", "micrCode"] },
    { cols: 4, cells: [{ key: "branchAddress", span: 2 }, "branchCity", "branchPincode"] },
    { cols: 2, cells: ["cancelledCheque", "paymentQr"] },
  ],
};
/** Drawn outside a grid cell: in the Current Address title bar, and inside the Address Proof buttons. */
const ONB_INLINE_KEYS = ["sameAsPermanent", "addressProofOther"];

export function OnboardingForm({
  initial,
  backHref,
  mode = "employee",
}: {
  initial: OnboardingView;
  backHref: string | null;
  /**
   * "employee" — the signed-in form (self, or HR on someone's behalf).
   * "candidate" — the no-login form on an emailed link (/c/onboarding): the
   * server derives WHOSE record from the link, never from the posted id.
   */
  mode?: "employee" | "candidate";
}) {
  const router = useRouter();
  const employeeId = initial.employee.id;
  const submitAction = mode === "candidate" ? submitOnboardingAsCandidate : submitOnboarding;
  const uploadUrlAction = mode === "candidate" ? createOnboardingUploadUrlAsCandidate : createOnboardingUploadUrl;
  const [busy, setBusy] = React.useState<null | "draft" | "submitted">(null);
  const [values, setValues] = React.useState<Record<string, string>>(() => ({ ...initial.fields }));
  const [picked, setPicked] = React.useState<Record<string, File>>({});
  /**
   * PICKED FILES UPLOAD STRAIGHT AWAY. They used to wait for Save Draft /
   * Submit, so anyone who picked their documents and then left the tab (to find
   * the next scan) lost them all when the idle timer signed them out. Each pick
   * now goes to storage at once; its ref joins the autosave payload below, which
   * records it against the form. `pendingUploads` lets an explicit save wait for
   * an upload still running instead of sending the same file twice.
   */
  type UploadedRef = { path: string; fileName: string; mime: string | null; size: number };
  const [uploaded, setUploaded] = React.useState<Record<string, { file: File; ref: UploadedRef }>>({});
  const pendingUploads = React.useRef(new Map<string, Promise<UploadedRef | null>>());

  function uploadPicked(key: string, file: File): Promise<UploadedRef | null> {
    const run = (async (): Promise<UploadedRef | null> => {
      const signed = await uploadUrlAction({ employeeId, key, fileName: file.name, mime: file.type || null, size: file.size });
      if (!signed.ok) throw new Error(signed.error);
      const { error } = await getSupabaseClient()
        .storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw new Error(`Upload failed (${file.name}): ${error.message}`);
      return { path: signed.path, fileName: file.name, mime: file.type || null, size: file.size };
    })()
      .then((ref) => {
        // A slower upload of an earlier pick must not replace a newer one.
        if (ref && pendingUploads.current.get(key) === run) setUploaded((u) => ({ ...u, [key]: { file, ref } }));
        return ref;
      })
      .catch(() => null) // Save Draft / Submit retries it and reports the error
      .finally(() => {
        if (pendingUploads.current.get(key) === run) pendingUploads.current.delete(key);
      });
    pendingUploads.current.set(key, run);
    return run;
  }

  function pickFile(key: string, file: File) {
    setPicked((p) => ({ ...p, [key]: file }));
    void uploadPicked(key, file);
  }

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

  /** The attachment standing in for this one right now (Address Proof → Aadhaar Card), else null. */
  function usesOtherAttachment(key: string): string | null {
    const s = ONB_FIELD_BY_KEY.get(key)?.satisfiedBy;
    return s && values[s.whenKey] === s.equals ? s.fileKey : null;
  }

  function renderField(f: OnbField, sectionKey: string, opts: { inGrid?: boolean; compact?: boolean } = {}) {
    if (f.type === "repeater") {
      return (
        <RepeaterField
          key={f.key}
          field={f}
          rows={repeaters[f.key] ?? []}
          onCell={(rowIdx, colKey, v) => setRepeaterCell(f.key, rowIdx, colKey, v)}
          onAdd={() => addRepeaterRow(f)}
          onRemove={(rowIdx) => removeRepeaterRow(f, rowIdx)}
        />
      );
    }
    if (f.key === "addressProofType") {
      const other = ONB_FIELD_BY_KEY.get("addressProofOther")!;
      return (
        <AddressProofChoice
          key={f.key}
          field={{ ...f, required: isOnbFieldRequired(f, values) }}
          otherField={other}
          value={values[f.key] ?? ""}
          otherValue={values[other.key] ?? ""}
          onChange={(v) => setVal(f.key, v)}
          onOtherChange={(v) => setVal(other.key, v)}
        />
      );
    }
    const via = f.type === "file" ? usesOtherAttachment(f.key) : null;
    if (via) {
      return (
        <LinkedFileNote
          key={f.key}
          field={f}
          sourceLabel={ONB_FIELD_BY_KEY.get(via)?.label ?? "attachment"}
          source={initial.files[via] ?? null}
          picked={picked[via] ?? null}
        />
      );
    }
    return (
      <Field
        key={f.key}
        field={{ ...f, required: isOnbFieldRequired(f, values) }}
        value={values[f.key] ?? ""}
        onChange={(v) => setVal(f.key, v)}
        existingFile={initial.files[f.key] ?? null}
        pickedFile={picked[f.key] ?? null}
        onPick={(file) => pickFile(f.key, file)}
        disabled={sectionKey === "current" && f.key !== "sameAsPermanent" && sameAsPerm}
        inGrid={opts.inGrid}
        compact={opts.compact}
      />
    );
  }

  function renderSectionBody(s: OnbSection) {
    const visible = (f: OnbField) => !isOnbFieldHidden(f, values);
    const layout = ONB_LAYOUT[s.key];
    if (!layout) {
      return <div className="flex flex-wrap gap-x-3 gap-y-3">{s.fields.filter(visible).map((f) => renderField(f, s.key))}</div>;
    }
    const placed = new Set<string>(ONB_INLINE_KEYS);
    for (const row of layout) for (const c of row.cells) placed.add(cellKey(c));
    // Safety net: a field added to the schema but not to the layout still shows.
    const rest = s.fields.filter((f) => !placed.has(f.key) && visible(f));
    return (
      <div className="flex flex-col gap-3">
        {layout.map((row, ri) => {
          const cells = row.cells.flatMap((c) => {
            const f = ONB_FIELD_BY_KEY.get(cellKey(c));
            return f && visible(f) ? [{ f, span: typeof c === "string" ? undefined : c.span }] : [];
          });
          if (cells.length === 0) return null;
          const template = typeof row.cols === "number" ? `repeat(${row.cols}, minmax(0, 1fr))` : row.cols;
          return (
            <div
              key={ri}
              className="grid gap-3 [grid-template-columns:var(--onb-cols)] max-md:[grid-template-columns:minmax(0,1fr)]"
              style={{ "--onb-cols": template } as React.CSSProperties}
            >
              {cells.map(({ f, span }) => (
                <div key={f.key} className={span === 2 ? "min-w-0 md:col-span-2" : "min-w-0"}>
                  {renderField(f, s.key, { inGrid: true, compact: typeof row.cols === "string" })}
                </div>
              ))}
            </div>
          );
        })}
        {rest.length > 0 ? <div className="flex flex-wrap gap-x-3 gap-y-3">{rest.map((f) => renderField(f, s.key))}</div> : null}
      </div>
    );
  }

  /** Refs of picked files that have finished uploading and are still the current pick. */
  const uploadedRefs = React.useMemo(() => {
    const out: Record<string, UploadedRef> = {};
    for (const key of ONB_FILE_KEYS) {
      const u = uploaded[key];
      if (u && picked[key] === u.file && !usesOtherAttachment(key)) out[key] = u.ref;
    }
    return out;
    // usesOtherAttachment reads `values`
  }, [uploaded, picked, values]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * AUTOSAVE PAYLOAD - text answers, repeater rows, and the storage refs of
   * picked files that have already uploaded (see uploadPicked). The raw `File`
   * handles never go in: they don't serialise into the change signature, and
   * re-posting one on every debounce would re-upload it each time. Only the
   * small ref does, so a finished upload is recorded within seconds.
   * `submitOnboarding` merges onto the files already stored, so a save carrying
   * no attachment keeps every attachment saved before.
   */
  const draft = React.useMemo(
    () => ({ values, repeaters, files: uploadedRefs }),
    [values, repeaters, uploadedRefs],
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
      for (const [key, ref] of Object.entries(d.files)) fd.set(`${key}__uploaded`, JSON.stringify(ref));
      const res = await submitAction(fd);
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
      // Required text + attachments. An attachment is satisfied by a newly
      // picked file OR one already stored from a previous save - including a
      // link pasted before links were removed, which is still a stored file
      // reference and must not suddenly make an old form incomplete.
      for (const f of ONB_ALL_FIELDS) {
        if (!isOnbFieldRequired(f, values)) continue;
        if (f.type === "repeater") continue; // handled above
        if (f.type === "file") {
          const attached = (key: string) => !!picked[key] || !!initial.files[key]?.signedUrl || !!initial.files[key]?.fileName;
          // Address Proof = "Aadhaar Card" is met by the Aadhaar attachment itself.
          const via = usesOtherAttachment(f.key);
          if (!attached(via ?? f.key)) {
            fireToast({ message: via ? `Attach your ${ONB_FIELD_BY_KEY.get(via)?.label ?? "document"} - it is used as your ${f.label}.` : `“${f.label}” is required - attach a file.`, type: "error" });
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

    // Let a running autosave land first, so this write and that one never race
    // on the same row (the intake wizard does the same before submitting).
    await autosave.flush().catch(() => false);
    setBusy(status);

    // try/finally: `busy` used to be cleared only on the paths that RETURNED an
    // error. Anything that THREW (a dropped connection, a session that expired
    // mid-request) left it set - the spinner turned forever and Save Draft and
    // Submit both stayed disabled.
    try {
      // Every picked file must be in storage before the form row points at it.
      // Most already are (uploadPicked runs on pick); wait for any still going,
      // and retry here the ones that failed - this time reporting the error.
      const refs: Record<string, UploadedRef> = {};
      // A file standing in via another attachment (Address Proof → Aadhaar) is not uploaded separately.
      const pickedKeys = ONB_FILE_KEYS.filter((k) => picked[k] && !usesOtherAttachment(k));
      for (const key of pickedKeys) {
        const file = picked[key]!;
        // Already uploaded on pick, or still uploading (the pending entry is always the latest pick).
        let earlier = uploaded[key]?.file === file ? uploaded[key]!.ref : null;
        const pending = pendingUploads.current.get(key);
        if (!earlier && pending) earlier = await pending;
        if (earlier) { refs[key] = earlier; continue; }
        const signed = await uploadUrlAction({ employeeId, key, fileName: file.name, mime: file.type || null, size: file.size });
        if (!signed.ok) { fireToast({ message: signed.error, type: "error" }); return; }
        const { error } = await getSupabaseClient()
          .storage.from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "application/octet-stream" });
        if (error) { fireToast({ message: `Upload failed (${file.name}): ${error.message}`, type: "error" }); return; }
        refs[key] = { path: signed.path, fileName: file.name, mime: file.type || null, size: file.size };
      }

      const fd = new FormData();
      fd.set("employeeId", employeeId);
      fd.set("status", status);
      for (const [k, v] of Object.entries(values)) fd.set(k, v ?? "");
      if (values.sameAsPermanent === "YES") for (const [p, c] of PERM_TO_CURR) fd.set(c, values[p] ?? "");
      for (const f of repeaterFields) fd.set(f.key, JSON.stringify(repeaters[f.key] ?? []));
      for (const [key, ref] of Object.entries(refs)) fd.set(`${key}__uploaded`, JSON.stringify(ref));
      const res = await submitAction(fd);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      // Stored now - drop the local picks so the fields show the saved "View" link
      // from the refreshed server data rather than the transient picked name.
      if (Object.keys(refs).length) { setPicked({}); setUploaded({}); }
      fireToast({ message: status === "draft" ? "Draft saved" : "Onboarding submitted", type: "success" });
      router.refresh();
    } catch (e) {
      fireToast({ message: e instanceof Error ? e.message : "Could not save - please try again.", type: "error" });
    } finally {
      setBusy(null);
    }
  }

  /**
   * THE ACTION BAR SPANS THE CONTENT PANE, NOT THE WINDOW.
   *
   * The bar is fixed to the bottom of the screen so Save / Submit are always
   * reachable. With `inset-x-0` it ran the full width of the window, so its band
   * lay across the global sidebar and covered the signed-in user's name and
   * avatar at the foot of it.
   *
   * It is not made `sticky` instead: the form sits in a column capped at 1400px
   * and centred, so a sticky bar would stop short of the pane on a wide screen.
   * So the pane that actually scrolls (the HR shell's scroll box, or whichever
   * ancestor scrolls) is measured and the bar's left and right edges are set to
   * it - starting where the sidebar ends and stopping before the pane's own
   * scrollbar. A ResizeObserver on that pane follows a sidebar collapse, which
   * changes the pane's width without resizing the window. Measured before
   * paint, so the full-width band never flashes over the sidebar.
   */
  const barRef = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let pane: HTMLElement | null = bar.parentElement;
    while (pane && pane !== document.body) {
      const oy = getComputedStyle(pane).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      pane = pane.parentElement;
    }
    if (!pane || pane === document.body) return; // the window scrolls: full width is right
    const box = pane;
    const place = () => {
      const r = box.getBoundingClientRect();
      bar.style.left = `${r.left}px`;
      // clientWidth excludes the pane's scrollbar, so the bar stops beside it.
      bar.style.right = `${Math.max(0, window.innerWidth - (r.left + box.clientWidth))}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(box);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* header */}
      <div className="wg-rise flex flex-wrap items-center gap-4 rounded-[22px] bg-surface-card p-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 12px 40px -28px rgba(15,23,42,0.35)" }}>
        {backHref && <Link href={backHref as Route} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-ink-muted hover:text-ink-strong" aria-label="Back"><ChevronLeft size={18} strokeWidth={2.4} /></Link>}
        <Avatar name={initial.employee.name} avatarUrl={initial.employee.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 900, fontSize: "clamp(18px,2vw,24px)", letterSpacing: "-0.02em" }}>Onboarding · {initial.employee.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-semibold text-ink-muted">
            <span>{initial.status === "submitted" ? "Submitted - update any answer below." : initial.status === "draft" ? "Draft saved - finish and submit." : "Fields marked * are required. Type NA where it doesn't apply."}</span>
            <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} />
          </div>
        </div>
      </div>

      {/* Small screens keep the pill strip: the two-pane index needs the width
          of a desktop, and a stacked index would push every section down. */}
      <div className="sticky top-2 z-10 flex flex-wrap gap-1 rounded-pill bg-surface-card/90 p-1.5 backdrop-blur lg:hidden" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        {ONBOARDING_SECTIONS.map((s, i) => (
          <a key={s.key} href={`#sec-${s.key}`} className="rounded-pill px-2.5 py-1.5 text-[11.5px] font-bold text-ink-muted transition hover:bg-surface-soft hover:text-ink-strong"><span className="tabular-nums text-ink-subtle">{i + 1}</span> {s.title}</a>
        ))}
      </div>

      {/* ── INDEX + SECTIONS ─────────────────────────────────────────────
          The nine sections as a numbered index down the left, the same
          control Management Assessment uses (components/ui/section-index.tsx),
          marking whichever section is on screen. It replaces a wrapping strip
          of nine pills across the top that took two rows and never showed where
          you were. */}
      {/* No items-start: the aside must STRETCH to the full height of the
          sections column. A sticky element can only stick while its parent
          still has room, and an aside sized to the index alone scrolled away
          with the first screen - leaving an empty left column below it. */}
      <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-5 max-lg:grid-cols-1">
        <aside className="max-lg:hidden">
          <SectionIndex
            items={ONBOARDING_SECTIONS.map((sec) => ({ id: `sec-${sec.key}`, label: sec.title }))}
            offset={16}
            stickyTop={16}
          />
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
      {ONBOARDING_SECTIONS.map((s, i) => (
        <section key={s.key} id={`sec-${s.key}`} className="wg-rise scroll-mt-20 rounded-[20px] bg-surface-card p-5 max-md:p-4" style={{ animationDelay: `${i * 25}ms`, boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 8px 30px -24px rgba(15,23,42,0.3)" }}>
          <div className="mb-3.5 flex flex-wrap items-start gap-x-2.5 gap-y-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black text-white tabular-nums" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>{i + 1}</span>
            <div className="min-w-0 flex-1"><h2 className="text-[16.5px] font-black text-ink-strong">{s.title}</h2>{s.hint && <p className="text-[12px] font-medium text-ink-subtle">{s.hint}</p>}</div>
            {/* "Same as Permanent?" lives in the Current Address title bar, YES / NO to its right. */}
            {s.key === "current" ? (
              <SameAsPermanentChoice
                field={ONB_FIELD_BY_KEY.get("sameAsPermanent")!}
                value={values.sameAsPermanent ?? ""}
                onChange={(v) => setVal("sameAsPermanent", v)}
              />
            ) : null}
          </div>
          {renderSectionBody(s)}
        </section>
      ))}
        </div>
      </div>

      {/* sticky action bar - left/right set to the content pane above */}
      <div ref={barRef} className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface-card/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-end gap-2">
          <button type="button" disabled={!!busy} onClick={() => save("draft")} className="bg-surface-card inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold text-ink-muted hover:text-ink-strong disabled:opacity-50">{busy === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.3} />} Save Draft</button>
          <button type="button" disabled={!!busy} onClick={() => save("submitted")} className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-6 py-2.5 text-[14px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -10px ${RED_DEEP}` }}>{busy === "submitted" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.4} />} Submit Onboarding</button>
        </div>
      </div>
    </div>
  );
}

function Field({
  field, value, onChange, existingFile, pickedFile, onPick, disabled, inGrid, compact,
}: {
  field: OnbField;
  value: string;
  onChange: (v: string) => void;
  existingFile: OnboardingView["files"][string] | null;
  pickedFile: File | null;
  onPick: (f: File) => void;
  disabled?: boolean;
  /** In a layout row: fills its cell, hint on its own line, control pinned to the row's bottom edge. */
  inGrid?: boolean;
  /** Choice buttons keep their own width instead of stretching across the cell. */
  compact?: boolean;
}) {
  const wpx = ONB_WIDTH_PX[field.w];
  const wrapStyle: React.CSSProperties | undefined = inGrid
    ? undefined
    : { flexGrow: 1, flexBasis: wpx.basis, maxWidth: wpx.max ?? undefined, minWidth: Math.min(wpx.basis, 130) };
  const wrapClass = inGrid ? "flex h-full min-w-0 flex-col gap-1" : "flex flex-col gap-1";
  // Controls sit at the bottom of a grid cell, so boxes in one row line up even
  // when one label carries a two-line hint and its neighbour has none.
  const push = inGrid ? " mt-auto" : "";
  const label = inGrid ? (
    <GridLabel label={field.label} required={field.required} hint={field.hint} />
  ) : (
    <span className="text-[11.5px] font-bold text-ink-soft">{field.label}{field.required && <span className="text-[color:var(--color-altus-red)]"> *</span>}{field.hint ? <span className="font-medium normal-case text-ink-subtle"> · {field.hint}</span> : null}</span>
  );

  if (field.type === "select") {
    return (
      <div className={wrapClass} style={wrapStyle}>
        {label}
        <div className={`flex gap-1.5${push}`}>
          {(field.options ?? []).map((opt) => (
            <ChoiceButton key={opt} label={opt} on={value === opt} onClick={() => onChange(opt)} className={compact ? "w-[124px] shrink-0" : "flex-1"} />
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "file") {
    const hasPicked = !!pickedFile;
    const hasExisting = !hasPicked && !!existingFile && (!!existingFile.signedUrl || !!existingFile.fileName);
    return (
      <label className={wrapClass} style={wrapStyle}>
        {label}
        <div className={`relative flex items-center gap-1.5 rounded-lg border border-solid border-hairline-strong bg-surface-soft px-2.5 py-2${push}`}>
          <Paperclip size={13} className="shrink-0 text-ink-subtle" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-muted">{hasPicked ? pickedFile!.name : hasExisting ? (existingFile!.isLink ? "Linked" : existingFile!.fileName) : "Choose file…"}</span>
          {/* Says the photo came from the interview form rather than letting it
              look like something already attached here - and the file input is
              still live underneath, so it can be replaced. */}
          {!hasPicked && hasExisting && existingFile!.carriedOver && (
            <span className="relative z-10 shrink-0 rounded-pill bg-white px-2 py-0.5 text-[10.5px] font-bold" style={{ color: "#15803d" }}>From interview form</span>
          )}
          {hasExisting && existingFile!.signedUrl && (
            <a href={existingFile!.signedUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="relative z-10 inline-flex items-center gap-1 rounded-pill bg-white px-2 py-0.5 text-[10.5px] font-bold text-ink-soft hover:text-ink-strong"><Eye size={11} /> View</a>
          )}
          <input type="file" accept={ONB_ACCEPT} onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} className="absolute inset-0 cursor-pointer opacity-0" />
        </div>
        {/* NO "or paste Drive / URL link" here any more.
            A Drive link is not an attachment: it can be moved, unshared or
            deleted by whoever owns it, and it is not readable at all from
            outside that Google account - so a document "collected" as a link
            could be gone by the time HR opens the record. Every attachment is
            now an uploaded file, which lives in our own storage.
            Links stored before this change still render above as "Linked" —
            nothing was deleted, it simply cannot be set from here. */}
      </label>
    );
  }

  return (
    <label className={wrapClass} style={wrapStyle}>
      {label}
      <input
        type={field.type === "tel" ? "tel" : "text"}
        inputMode={field.type === "tel" ? "tel" : field.type === "number" ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? "= permanent" : ""}
        maxLength={2000}
        className={`rounded-lg border border-hairline bg-surface-soft px-2.5 py-2 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] disabled:opacity-50${push}`}
      />
    </label>
  );
}

/** Label for a layout-row field: name + required star, the hint on its own line beneath. */
function GridLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[11.5px] font-bold text-ink-soft">
        {label}
        {required && <span className="text-[color:var(--color-altus-red)]"> *</span>}
      </span>
      {hint ? <span className="text-[11px] font-medium leading-snug text-ink-subtle">{hint}</span> : null}
    </span>
  );
}

function ChoiceButton({ label, on, onClick, className = "" }: { label: string; on: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg px-2 py-2 text-[12.5px] font-bold transition ${className}`}
      style={{ background: on ? `color-mix(in srgb, ${RED} 12%, transparent)` : "var(--color-surface-soft)", color: on ? RED : "var(--color-ink-muted)", boxShadow: on ? `inset 0 0 0 1.5px ${RED}` : "inset 0 0 0 1px var(--color-hairline)" }}
    >
      {on && <Check size={12} className="mr-0.5 inline" strokeWidth={3} />}
      {label}
    </button>
  );
}

/** "Same as Permanent?" + YES / NO, drawn in the Current Address title bar. */
function SameAsPermanentChoice({ field, value, onChange }: { field: OnbField; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2.5 self-center">
      <span className="text-[12.5px] font-bold text-ink-soft">
        {field.label}
        <span className="text-[color:var(--color-altus-red)]"> *</span>
      </span>
      <div className="flex gap-1.5">
        {(field.options ?? []).map((opt) => (
          <ChoiceButton key={opt} label={opt} on={value === opt} onClick={() => onChange(opt)} className="w-[76px] shrink-0" />
        ))}
      </div>
    </div>
  );
}

/**
 * Address Proof: Aadhaar Card / Electric Bill / Other. Choosing "Other" turns
 * that button into a text box for what is being attached.
 */
function AddressProofChoice({
  field, otherField, value, otherValue, onChange, onOtherChange,
}: {
  field: OnbField;
  otherField: OnbField;
  value: string;
  otherValue: string;
  onChange: (v: string) => void;
  onOtherChange: (v: string) => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-1">
      <GridLabel label={field.label} required={field.required} />
      <div className="mt-auto flex gap-1.5">
        {[ONB_PROOF_AADHAAR, ONB_PROOF_ELECTRIC].map((opt) => (
          <ChoiceButton key={opt} label={opt} on={value === opt} onClick={() => onChange(opt)} className="w-[124px] shrink-0" />
        ))}
        {value === ONB_PROOF_OTHER ? (
          <input
            autoFocus
            value={otherValue}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder={otherField.label}
            aria-label={otherField.label}
            maxLength={200}
            className="w-[180px] shrink-0 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-ink-strong outline-none"
            style={{ background: `color-mix(in srgb, ${RED} 6%, white)`, boxShadow: `inset 0 0 0 1.5px ${RED}` }}
          />
        ) : (
          <ChoiceButton label={ONB_PROOF_OTHER} on={false} onClick={() => onChange(ONB_PROOF_OTHER)} className="w-[124px] shrink-0" />
        )}
      </div>
    </div>
  );
}

/** An attachment met by another one (Address Proof → the Aadhaar Card attachment above). */
function LinkedFileNote({
  field, sourceLabel, source, picked,
}: {
  field: OnbField;
  sourceLabel: string;
  source: OnboardingView["files"][string] | null;
  picked: File | null;
}) {
  const sourceName = picked?.name ?? source?.fileName ?? "";
  const has = !!picked || !!source?.signedUrl || !!source?.fileName;
  return (
    <div className="flex h-full min-w-0 flex-col gap-1">
      <GridLabel label={field.label} required />
      <div className="mt-auto flex items-center gap-1.5 rounded-lg border border-dashed border-hairline-strong bg-surface-soft px-2.5 py-2">
        <Link2 size={13} className="shrink-0 text-ink-subtle" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: has ? "#15803d" : "var(--color-ink-muted)" }}>
          {has ? `Using your ${sourceLabel} attachment${sourceName ? ` (${sourceName})` : ""}` : `Attach your ${sourceLabel} above - it will be used here`}
        </span>
        {!picked && source?.signedUrl ? (
          <a href={source.signedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-pill bg-white px-2 py-0.5 text-[10.5px] font-bold text-ink-soft hover:text-ink-strong"><Eye size={11} /> View</a>
        ) : null}
      </div>
    </div>
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
