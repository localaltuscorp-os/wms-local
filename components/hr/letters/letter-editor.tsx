"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Send,
  Loader2,
  Printer,
  Check,
  Building2,
  UserRound,
  SquarePen,
  ArrowLeft,
  Save,
  Undo2,
  ShieldCheck,
  Eye,
  EyeOff,
  Mail,
  X,
  Calculator,
} from "lucide-react";
import { Letterhead } from "@/components/hr/letterhead/letterhead";
import { FitToWidth } from "./fit-to-width";
import { ENTITY_LIST, getEntity, type EntityId } from "@/lib/hr/entities";
import {
  type LetterTemplate,
  type Block,
  type Span,
  type LetterSignature,
  type LetterSignatory,
  collectFields,
  hasBodyDateField,
  initialValues,
  signatoryOf,
  tableRowVisible,
} from "@/lib/hr/letters/types";
import { templateToRichHtml } from "@/lib/hr/letters/rich";
import { applyPronouns, normalizeGender, type Gender } from "@/lib/hr/pronouns";
import { applyFirm, HR_SIGNATORY } from "@/lib/hr/firm";
import { formatDateHr } from "@/lib/format";
import {
  readCtcLetterPrefill,
  clearCtcLetterPrefill,
  ctcComponentsToLetterValues,
} from "@/lib/hr/ctc/local-store";
import {
  CTC_LETTER_COMPONENTS,
  CTC_LETTER_TOTALS,
  CTC_LETTER_DEDUCTIONS,
} from "@/lib/hr/letters/templates/ctc-breakup";
import { formatINR, num } from "@/lib/hr/ctc/model";
import { fireToast } from "@/lib/toast";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * The "Edit freely" (Google-Docs) TipTap editor is a "use client" leaf that
 * imports the whole @tiptap graph. It is loaded ONLY through next/dynamic with
 * ssr:false so that graph never enters this module's server-render path — the
 * documented webpack-compile-hang guard. Never import it statically.
 */
const RichLetterEditor = dynamic(
  () => import("@/components/hr/letters/rich-letter-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="alw-rich-loading">
        <Loader2 size={20} className="alw-spin" />
        <span>Opening the free-edit editor…</span>
      </div>
    ),
  },
);

/** The signing-model options offered for a rich ("Edit freely") letter. */
const SIGNING_MODELS: { value: LetterSignature; label: string }[] = [
  { value: "none", label: "No signature" },
  { value: "acknowledge", label: "Acknowledge" },
  { value: "esign", label: "E-Sign (DigiLocker)" },
];

export interface LetterRosterOption {
  id: string;
  name: string;
  designation: string;
  /** Their email on file — pre-fills the "Send Email" composer's To field. */
  email?: string;
  /** The employee's paying entity (from their salary profile) as an EntityId —
   *  picking them auto-selects the matching letterhead. Null → keep the default. */
  payingEntity?: EntityId | null;
}

/** A submitted candidate the editor can quick-pick to seed the recipient name +
 *  pronoun gender (his/her, Mr./Ms., …). `gender` is the raw stored value. */
export interface LetterCandidateOption {
  id: string;
  name: string;
  gender: string;
}

/**
 * The interactive letter page body. Renders the template on the shared
 * <Letterhead>, lets HR swap the paying entity (which swaps the logo + footer),
 * edit ONLY the red/editable fields inline (floating-label inputs), export a PDF,
 * or issue + archive the letter via the document flow. Keyboard-first: the first
 * field autofocuses; Tab walks the fields; the toolbar buttons are reachable and
 * carry their own shortcuts. NO framer-motion — CSS transitions only.
 */
export function LetterEditor({
  template,
  roster,
  candidates = [],
  departments = [],
  isAdmin,
  initialCandidateId,
  initialEmployeeId,
}: {
  template: LetterTemplate;
  roster: LetterRosterOption[];
  candidates?: LetterCandidateOption[];
  /** The admin Departments master — populates the `optionsKey:"departments"`
   *  field dropdowns (e.g. the Selection letter's Department term). */
  departments?: string[];
  isAdmin: boolean;
  /** Pre-seed the recipient from a candidate (e.g. `?candidate=<id>`). */
  initialCandidateId?: string;
  /**
   * Pre-select the Attach-employee (e.g. `?employee=<id>` from the CTC Workbench).
   * Also fills the name + designation fields and, for the CTC letter, the ₹
   * component figures from the Workbench pre-fill dropped in localStorage.
   */
  initialEmployeeId?: string;
}) {
  const fields = useMemo(() => collectFields(template), [template]);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(template));
  const [entity, setEntity] = useState<EntityId>(template.entityDefault ?? "altus-corp");
  const [employeeId, setEmployeeId] = useState<string>("");
  // Candidate gender → resolves gendered tokens ({title}/{he}/{his}/…) live.
  const [gender, setGender] = useState<Gender>("neutral");
  const [candidateId, setCandidateId] = useState<string>("");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);
  const [emailing, setEmailing] = useState(false);
  // The "Send Email" composer (toolbar → modal). `null` = closed; otherwise the
  // editable To / Subject / Message the sender is about to dispatch.
  const [compose, setCompose] = useState<null | { to: string; subject: string; message: string }>(null);
  const [sending, setSending] = useState(false);
  // The mandatory Print-Preview gate. "issue" or "email" → the confirm button in
  // the modal runs the matching action; null → the modal is closed.
  const [previewMode, setPreviewMode] = useState<null | "issue" | "email">(null);
  // "Hide boxes" — preview the FINISHED letter (no editable input chrome, empty
  // rows/fields dropped). Default OFF so every box is visible + fillable.
  const [clean, setClean] = useState(false);
  // An uploaded scanned-signature image (data URL) for the sign-off; when set it
  // replaces the baked/Director signature. Falls back gracefully when null.
  const [sigImage, setSigImage] = useState<string | null>(null);
  const sigInputRef = useRef<HTMLInputElement | null>(null);

  // Who signs this letter (Director vs HR desk) + whether it's the CTC letter
  // (which gets the percentage calculator panel).
  const signatory = useMemo(() => signatoryOf(template), [template]);
  // The percentage calculator drives the structured CTC table — shown for every
  // letter that embeds it: CTC Breakup + Appraisal/Promotion revised-CTC.
  const isCtc =
    template.key === "ctc-breakup" ||
    template.key === "appraisal-revised-ctc" ||
    template.key === "promotion-revised-ctc";

  // ── "Edit freely" (rich / Google-Docs) mode ──────────────────────
  const [richMode, setRichMode] = useState(false);
  // The frozen seed the TipTap editor loads. Kept stable while in rich mode so
  // swapping the paying entity re-brands the letterhead WITHOUT reseeding (and
  // thus wiping) the user's body edits.
  const [richSeed, setRichSeed] = useState<string>("");
  const richHtmlRef = useRef<string>("");
  const richGetHtmlRef = useRef<(() => string) | null>(null);
  const [richDirty, setRichDirty] = useState(false);
  // SAVED free-edit override for THIS letter instance. When set, it is the
  // content used in the preview + on export/issue, and re-entering "Edit freely"
  // resumes from it (instead of regenerating from the fields). It is a per-letter
  // override only — the shared template / MAIN content is never modified. Lives
  // for the editing session; "Discard" clears it back to the field-driven letter.
  const [savedRichHtml, setSavedRichHtml] = useState<string | null>(null);
  // The content the free-edit is "clean" against (updated on Save) — drives the
  // unsaved-changes warning.
  const richSavedRef = useRef<string>("");
  const [signingModel, setSigningModel] = useState<LetterSignature>(
    () => template.signature ?? "none",
  );

  const firstFieldId = fields[0]?.id;

  // The field a picked candidate's name seeds: prefer "candidateName", then
  // "name", else the first field in the template.
  const nameFieldId = useMemo(() => {
    const byId = (id: string) => fields.find((fld) => fld.id === id)?.id;
    return byId("candidateName") ?? byId("name") ?? fields[0]?.id;
  }, [fields]);

  const setValue = useCallback((id: string, v: string) => {
    setValues((prev) => (prev[id] === v ? prev : { ...prev, [id]: v }));
    setIssued(false);
  }, []);

  /** Write several field values at once (used by the CTC calculator). No-ops
   *  when nothing actually changed, so it is safe to call from an effect. */
  const setManyValues = useCallback((updates: Record<string, string>) => {
    setValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(updates)) {
        if (next[k] !== v) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  /** Read an uploaded signature image file into a data URL (graceful on error). */
  const onSignatureFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      fireToast({ message: "Please choose an image file for the signature.", type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      if (url) {
        setSigImage(url);
        setIssued(false);
        fireToast({ message: "Signature added to the sign-off." });
      }
    };
    reader.onerror = () => fireToast({ message: "Could not read that image.", type: "error" });
    reader.readAsDataURL(file);
  }, []);

  /** Quick-pick a candidate: seed the recipient-name field + derive the pronoun
   *  gender (Mr./Ms., his/her, …) PURELY from their candidate-master record. When
   *  the record has no gender, normalizeGender falls back to "neutral" → the
   *  inclusive "Mr./Ms." forms. There is no manual gender override. */
  const onPickCandidate = useCallback(
    (id: string) => {
      setCandidateId(id);
      const cand = candidates.find((c) => c.id === id);
      if (!cand) return;
      if (nameFieldId) setValue(nameFieldId, cand.name);
      setGender(normalizeGender(cand.gender));
    },
    [candidates, nameFieldId, setValue],
  );

  // Pre-seed from `?candidate=<id>` exactly once, when that candidate is loaded.
  // Runs the same quick-pick as the manual picker (name + pronoun gender).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !initialCandidateId) return;
    if (!candidates.some((c) => c.id === initialCandidateId)) return;
    seededRef.current = true;
    onPickCandidate(initialCandidateId);
  }, [initialCandidateId, candidates, onPickCandidate]);

  /** Attach an employee (from `?employee=<id>`): select them, fill the name +
   *  designation fields, and — for the CTC letter — merge the ₹ component figures
   *  the Workbench dropped in localStorage (mapped to the letter's field ids,
   *  zero components skipped). One-shot: the pre-fill is consumed + cleared. */
  const onSeedEmployee = useCallback(
    (id: string) => {
      const emp = roster.find((r) => r.id === id);
      if (!emp) return;
      setEmployeeId(id);
      const nameId =
        fields.find((fl) => fl.id === "employeeName")?.id ??
        fields.find((fl) => fl.id === "name")?.id ??
        fields.find((fl) => fl.id === "candidateName")?.id;
      const hasDesignation = fields.some((fl) => fl.id === "designation");
      const prefill = readCtcLetterPrefill();
      const applyPrefill = prefill && prefill.employeeId === id;
      const compValues = applyPrefill ? ctcComponentsToLetterValues(prefill.components) : {};
      setValues((prev) => {
        const next = { ...prev };
        if (nameId && emp.name) next[nameId] = emp.name;
        if (hasDesignation && emp.designation) next.designation = emp.designation;
        for (const [k, v] of Object.entries(compValues)) {
          if (fields.some((fl) => fl.id === k)) next[k] = v;
        }
        return next;
      });
      // Auto-select the letterhead from the employee's paying entity (set on
      // their salary profile). A CTC-letter prefill, if present, overrides below.
      if (emp.payingEntity) setEntity(emp.payingEntity);
      if (applyPrefill && prefill) {
        setEntity(prefill.entity);
        clearCtcLetterPrefill();
      }
      setIssued(false);
    },
    [roster, fields],
  );

  // Pre-select from `?employee=<id>` exactly once, when the roster is loaded.
  const seededEmpRef = useRef(false);
  useEffect(() => {
    if (seededEmpRef.current || !initialEmployeeId) return;
    if (!roster.some((r) => r.id === initialEmployeeId)) return;
    seededEmpRef.current = true;
    onSeedEmployee(initialEmployeeId);
  }, [initialEmployeeId, roster, onSeedEmployee]);

  /** The EFFECTIVE rich HTML for preview / export / issue: the live editor HTML
   *  in rich mode, else the saved free-edit override (empty when neither). */
  const currentRichHtml = useCallback(() => {
    if (richMode) return richGetHtmlRef.current?.() ?? richHtmlRef.current;
    return savedRichHtml ?? "";
  }, [richMode, savedRichHtml]);

  /** True when the letter should render/export from rich HTML rather than the
   *  structured fields: either we're actively free-editing, or a saved override
   *  exists for this letter instance. */
  const usingRich = richMode || savedRichHtml != null;

  /** Enter "Edit freely": resume from the saved override if there is one, else
   *  seed the TipTap editor fresh from the current fields. */
  const enterRichMode = useCallback(() => {
    const seed = savedRichHtml ?? templateToRichHtml(template, values, entity, gender);
    setRichSeed(seed);
    richHtmlRef.current = seed;
    richSavedRef.current = seed;
    richGetHtmlRef.current = null;
    setRichDirty(false);
    setSigningModel(template.signature ?? "none");
    setIssued(false);
    setRichMode(true);
  }, [template, values, entity, gender, savedRichHtml]);

  /** Save the current free-edit as this letter's override (does NOT touch the
   *  shared template / main content). Keeps you in the editor. */
  const saveRichEdits = useCallback(() => {
    const html = currentRichHtml();
    setSavedRichHtml(html);
    richSavedRef.current = html;
    setRichDirty(false);
    setIssued(false);
    fireToast({ message: "Free-edit changes saved to this letter." });
  }, [currentRichHtml]);

  /** Return to the structured field view — warn only when there are UNSAVED
   *  free edits (a saved override is kept and shown in the field view). */
  const backToFields = useCallback(() => {
    if (
      richDirty &&
      !window.confirm("You have unsaved free-edit changes. Leave without saving? (Click Save first to keep them.)")
    ) {
      return;
    }
    setRichMode(false);
    setRichDirty(false);
    setIssued(false);
  }, [richDirty]);

  /** Drop the saved free-edit override → the letter reverts to the field-driven
   *  MAIN content. */
  const discardFreeEdit = useCallback(() => {
    if (!window.confirm("Discard the saved free-edit and go back to the field version of this letter?")) return;
    setSavedRichHtml(null);
    richSavedRef.current = "";
    richHtmlRef.current = "";
    setRichDirty(false);
    setIssued(false);
    fireToast({ message: "Free-edit discarded - using the field version." });
  }, []);

  const onRichChange = useCallback((html: string) => {
    richHtmlRef.current = html;
    setIssued(false);
    setRichDirty(html !== richSavedRef.current);
  }, []);

  const onRichReady = useCallback((getHtml: () => string) => {
    richGetHtmlRef.current = getHtml;
  }, []);

  const today = useMemo(() => formatDateHr(new Date()), []);

  // Letters that carry their own editable `Date:` row in the body (Intern
  // Appointment, Confirmation, F&F…) must NOT also get the chrome's top-right
  // date stamp — it rendered the date twice. The body field stays the single,
  // editable source of the letter's date.
  const showHeaderDate = useMemo(() => !hasBodyDateField(template), [template]);

  const recipientName = (values.candidateName ?? values.name ?? "").trim();
  const recipientEmail = (values.candidateEmail ?? values.email ?? "").trim();

  /** Open the mandatory Print-Preview before ISSUING (validates recipient first). */
  function requestIssue() {
    if (!isAdmin) return;
    if (!employeeId && !recipientName) {
      fireToast({ message: "Fill the recipient's name, or attach an employee.", type: "error" });
      return;
    }
    setPreviewMode("issue");
  }

  /** The confirmed ISSUE — the existing render + archive POST. */
  async function runIssue() {
    if (!isAdmin) return;
    setIssuing(true);
    try {
      const url = usingRich ? "/api/hr/letters/issue-rich" : "/api/hr/letters/issue";
      const payload = usingRich
        ? {
            key: template.key,
            entity,
            gender,
            bodyHtml: currentRichHtml(),
            signingModel,
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
            candidateEmail: employeeId ? undefined : recipientEmail || undefined,
          }
        : {
            key: template.key,
            entity,
            gender,
            values,
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
            candidateEmail: employeeId ? undefined : recipientEmail || undefined,
            signatureImage: sigImage ?? undefined,
          };
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const res = (await r.json().catch(() => ({ ok: false }))) as
        | { ok: true; emailed?: boolean; emailedTo?: string | null }
        | { ok: false; error?: string };
      if (!res.ok) {
        fireToast({ message: res.error ?? "Could not issue the letter.", type: "error" });
        return;
      }
      setIssued(true);
      setPreviewMode(null);
      if (res.emailed && res.emailedTo) {
        fireToast({ message: `Letter issued, archived & emailed to ${res.emailedTo}.` });
      } else {
        fireToast({
          message:
            "Letter issued & archived - but it was NOT emailed. Add a recipient email (or attach an employee with an email on file), then use “Export & Email PDF”.",
          type: "error",
        });
      }
    } catch {
      fireToast({ message: "Could not issue the letter.", type: "error" });
    } finally {
      setIssuing(false);
    }
  }

  /** The confirmed EXPORT & EMAIL — render the PDF server-side and email it to the
   *  candidate (BCC the HR desk) in one shot. */
  async function runEmailPdf() {
    setEmailing(true);
    try {
      const payload = usingRich
        ? {
            key: template.key,
            entity,
            gender,
            contentKind: "rich" as const,
            bodyHtml: currentRichHtml(),
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
            candidateEmail: employeeId ? undefined : recipientEmail || undefined,
          }
        : {
            key: template.key,
            entity,
            gender,
            values,
            date: today,
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
            candidateEmail: employeeId ? undefined : recipientEmail || undefined,
            signatureImage: sigImage ?? undefined,
          };
      const r = await fetch("/api/hr/letters/email-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const res = (await r.json().catch(() => ({ ok: false }))) as
        | { ok: true; to?: string }
        | { ok: false; error?: string };
      if (!res.ok) {
        fireToast({ message: res.error ?? "Could not email the PDF.", type: "error" });
        return;
      }
      setPreviewMode(null);
      fireToast({
        message: res.to ? `PDF emailed to ${res.to} (HR copied).` : "PDF emailed to the candidate (HR copied).",
      });
    } catch {
      fireToast({ message: "Could not email the PDF.", type: "error" });
    } finally {
      setEmailing(false);
    }
  }

  /** Toolbar → "Send Email": open the composer, pre-filled from the letter. The
   *  To is the attached employee's email on file, else the candidate email typed
   *  on the letter; the subject follows "<Letter title> - <Recipient>". */
  function openCompose() {
    if (!isAdmin) return;
    const attached = employeeId ? roster.find((r) => r.id === employeeId) : undefined;
    const name = (attached?.name ?? recipientName).trim();
    setCompose({
      to: (attached?.email ?? recipientEmail).trim(),
      subject: name ? `${template.title} - ${name}` : template.title,
      message: "",
    });
  }

  /** Send the composed email: render the letter server-side and dispatch it as a
   *  PDF attachment to the typed recipient. */
  async function sendComposedEmail() {
    if (!compose) return;
    const to = compose.to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      fireToast({ message: "Enter a valid recipient email address.", type: "error" });
      return;
    }
    if (!compose.subject.trim()) {
      fireToast({ message: "Add a subject line.", type: "error" });
      return;
    }
    setSending(true);
    try {
      const payload = usingRich
        ? {
            key: template.key,
            entity,
            gender,
            contentKind: "rich" as const,
            bodyHtml: currentRichHtml(),
            to,
            subject: compose.subject.trim(),
            message: compose.message.trim() || undefined,
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
          }
        : {
            key: template.key,
            entity,
            gender,
            values,
            date: today,
            to,
            subject: compose.subject.trim(),
            message: compose.message.trim() || undefined,
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
            signatureImage: sigImage ?? undefined,
          };
      const r = await fetch("/api/hr/send-letter-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const res = (await r.json().catch(() => ({ ok: false }))) as
        | { ok: true; to?: string }
        | { ok: false; error?: string };
      if (!res.ok) {
        fireToast({ message: res.error ?? "Could not send the email.", type: "error" });
        return;
      }
      setCompose(null);
      fireToast({ message: `Letter emailed to ${res.to ?? to} (HR copied).` });
    } catch {
      fireToast({ message: "Could not send the email.", type: "error" });
    } finally {
      setSending(false);
    }
  }

  // Live option lists for `optionsKey` fields (Department / Reporting Manager on
  // the Selection letter). Managers = the active-employee roster, labelled with
  // their designation so two same-named people are distinguishable.
  const optionLists = useMemo(
    () => ({
      departments,
      // Just the name — it prints verbatim on the letter's "Reporting Manager" row.
      managers: Array.from(new Set(roster.map((r) => r.name).filter(Boolean))),
    }),
    [departments, roster],
  );

  const ctx: RenderCtx = {
    values,
    setValue,
    firstFieldId,
    entity,
    today,
    gender,
    clean,
    signatory,
    signatureImage: sigImage,
    optionLists,
  };

  return (
    <div className="alw-wrap">
      {/* Self-hosted letter-font library — loaded here too so the read-only
          rich previews (.alw-rich-preview) show the chosen fonts even when the
          RichLetterEditor itself isn't mounted. React 19 dedupes the link. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/letter-fonts/letter-fonts.css" />
      <style>{EDITOR_CSS}</style>

      {/* ── Toolbar (does not print) ─────────────────────────────── */}
      <div className="alw-toolbar no-print">
        <label className="alw-pick">
          <Building2 size={15} strokeWidth={2.2} aria-hidden />
          <span className="alw-pick-label">Paying Entity</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as EntityId)}
            aria-label="Paying entity"
          >
            {ENTITY_LIST.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
        </label>

        {/* Recipient picker — OUR employee list (roster). Quick-fills the name +
            designation (and CTC ₹ figures for CTC letters) and attaches the
            letter to that employee. Replaces the old Candidate + Attach-Employee
            dropdowns. */}
        {isAdmin && roster.length > 0 && (
          <label className="alw-pick">
            <UserRound size={15} strokeWidth={2.2} aria-hidden />
            <span className="alw-pick-label">Employee</span>
            <select
              value={employeeId}
              onChange={(e) => {
                const id = e.target.value;
                if (id) onSeedEmployee(id);
                else {
                  setEmployeeId("");
                  setIssued(false);
                }
              }}
              aria-label="Pick the employee this letter is for"
            >
              <option value="">- pick an employee -</option>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.designation ? ` · ${r.designation}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {richMode && isAdmin && (
          <label className="alw-pick">
            <ShieldCheck size={15} strokeWidth={2.2} aria-hidden />
            <span className="alw-pick-label">Signing</span>
            <select
              value={signingModel}
              onChange={(e) => {
                setSigningModel(e.target.value as LetterSignature);
                setIssued(false);
              }}
              aria-label="Signing model"
            >
              {SIGNING_MODELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="alw-actions">
          {!usingRich && (
            <button
              type="button"
              className={`alw-btn alw-btn-ghost${clean ? " alw-btn-on" : ""}`}
              onClick={() => setClean((c) => !c)}
              aria-pressed={clean}
              title={clean ? "Show the editable boxes" : "Hide boxes - preview the finished letter"}
            >
              {clean ? <Eye size={15} strokeWidth={2.2} /> : <EyeOff size={15} strokeWidth={2.2} />}
              {clean ? "Show boxes" : "Hide boxes"}
            </button>
          )}
          {richMode ? (
            <>
              <button
                type="button"
                className="alw-btn alw-btn-edit"
                onClick={saveRichEdits}
                disabled={!richDirty}
                title={richDirty ? "Save your free-edit changes to this letter" : "No unsaved changes"}
              >
                <Save size={15} strokeWidth={2.2} /> {richDirty ? "Save" : "Saved"}
              </button>
              <button type="button" className="alw-btn alw-btn-ghost" onClick={backToFields}>
                <ArrowLeft size={15} strokeWidth={2.2} /> Back to fields
              </button>
            </>
          ) : (
            <>
              <button type="button" className="alw-btn alw-btn-edit" onClick={enterRichMode}>
                <SquarePen size={15} strokeWidth={2.2} /> {savedRichHtml ? "Resume free edit" : "Edit freely"}
              </button>
              {savedRichHtml && (
                <button type="button" className="alw-btn alw-btn-ghost" onClick={discardFreeEdit} title="Revert to the field version of this letter">
                  <Undo2 size={15} strokeWidth={2.2} /> Discard free edit
                </button>
              )}
            </>
          )}
          <button type="button" className="alw-btn alw-btn-ghost" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={2.2} /> Print
          </button>
          {isAdmin && (
            <button
              type="button"
              className="alw-btn alw-btn-primary"
              onClick={openCompose}
              disabled={sending}
              title="Email this letter as a PDF attachment"
            >
              {sending ? <Loader2 size={15} className="alw-spin" /> : <Mail size={15} strokeWidth={2.2} />}
              {sending ? "Sending…" : "Send Email"}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="alw-btn alw-btn-primary"
              onClick={requestIssue}
              disabled={issuing || issued}
            >
              {issued ? (
                <Check size={15} strokeWidth={2.6} />
              ) : issuing ? (
                <Loader2 size={15} className="alw-spin" />
              ) : (
                <Send size={15} strokeWidth={2.2} />
              )}
              {issued ? "Issued" : issuing ? "Issuing…" : "Issue letter"}
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input for the scanned-signature upload. */}
      <input
        ref={sigInputRef}
        type="file"
        accept="image/*"
        onChange={onSignatureFile}
        className="no-print"
        style={{ display: "none" }}
      />

      {/* ── CTC percentage calculator (CTC letter, structured mode) ── */}
      {isCtc && !usingRich && (
        <CtcCalculator values={values} setManyValues={setManyValues} />
      )}

      {/* ── The letter on its letterhead ─────────────────────────── */}
      {richMode ? (
        // "Edit freely" — the Google-Docs TipTap editor inside the frozen
        // letterhead. `entity` is live (re-brands the letterhead) while
        // `initialHtml` stays the frozen seed so the body edits survive an
        // entity swap.
        <RichLetterEditor
          entity={entity}
          initialHtml={richSeed}
          onChange={onRichChange}
          onReady={onRichReady}
        />
      ) : savedRichHtml ? (
        // A saved free-edit override exists — show it (read-only) so the changes
        // are visible in the field view. The MAIN field-driven content is kept
        // intact underneath; "Discard free edit" reverts to it. The notice sits
        // ABOVE the stage (not inside it) — `.alw-stage` is a flex ROW, so a
        // sibling there rendered the notice and the letter side-by-side, leaving
        // a big empty half.
        <>
          <div
            className="no-print"
            style={{
              margin: "0 auto 12px",
              maxWidth: 794,
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--color-altus-red-deep)",
              background: "color-mix(in srgb, var(--color-altus-red) 6%, white)",
              border: "1px solid color-mix(in srgb, var(--color-altus-red) 25%, transparent)",
              borderRadius: 10,
              padding: "8px 12px",
            }}
          >
            ✎ Showing your saved free-edit for this letter. The field version (main content) is untouched - use
            &ldquo;Resume free edit&rdquo; to keep editing, or &ldquo;Discard free edit&rdquo; to revert.
          </div>
          <FitToWidth className="alw-stage">
            <Letterhead entity={entity}>
              {showHeaderDate && <div className="alw-date">{today}</div>}
              <div className="alw-rich-preview" dangerouslySetInnerHTML={{ __html: savedRichHtml }} />
            </Letterhead>
          </FitToWidth>
        </>
      ) : (
        <FitToWidth className="alw-stage">
          <Letterhead entity={entity}>
            {showHeaderDate && <div className="alw-date">{today}</div>}
            {renderBlocks(template.blocks, ctx)}
          </Letterhead>
        </FitToWidth>
      )}

      {/* ── "Send Email" composer ────────────────────────────────────── */}
      {compose && (
        <SendEmailModal
          draft={compose}
          onChange={(patch) => setCompose((c) => (c ? { ...c, ...patch } : c))}
          busy={sending}
          onCancel={() => setCompose(null)}
          onSend={sendComposedEmail}
        />
      )}

      {/* ── Mandatory Print-Preview gate (Issue / Email) ─────────────── */}
      {previewMode && (
        <PrintPreviewModal
          mode={previewMode}
          busy={previewMode === "issue" ? issuing : emailing}
          onCancel={() => setPreviewMode(null)}
          onConfirm={previewMode === "issue" ? runIssue : runEmailPdf}
          recipientEmail={employeeId ? undefined : recipientEmail || undefined}
          attachedEmployee={Boolean(employeeId)}
        >
          <Letterhead entity={entity}>
            {showHeaderDate && <div className="alw-date">{today}</div>}
            {usingRich ? (
              <div
                className="alw-rich-preview"
                // The current "Edit freely" HTML, rendered read-only as it will print.
                dangerouslySetInnerHTML={{ __html: currentRichHtml() }}
              />
            ) : (
              renderBlocks(template.blocks, { ...ctx, clean: true })
            )}
          </Letterhead>
        </PrintPreviewModal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CTC percentage calculator — drives the CTC-letter ₹ fields            */
/* ------------------------------------------------------------------ */

/**
 * The percentage-based CTC calculator shown above the CTC Breakup letter. HR
 * enters the TOTAL CTC (per annum) and a percentage for each earning component
 * (defaults Basic 40, HRA 10, Medical 10, Conveyance 20, Uniform 20 → 100). The
 * panel auto-computes every line's per-month + per-annum ₹ (annual = CTC×%,
 * monthly = annual/12), the Professional Tax (₹2,500/yr → ₹200/month Mar–Jan,
 * ₹300 in February) and the Gross / Total-Deductions / Net-take-home summary
 * rows, writing them straight into the letter's fields. All money math is done
 * in integer rupees (paise-safe rounding). It only writes once a positive Total
 * CTC is entered, so a Compensation-Workbench pre-fill is left untouched until
 * HR chooses to recompute here.
 */
function CtcCalculator({
  values,
  setManyValues,
}: {
  values: Record<string, string>;
  setManyValues: (updates: Record<string, string>) => void;
}) {
  const [totalCtc, setTotalCtc] = useState("");
  const [pct, setPct] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const c of CTC_LETTER_COMPONENTS) if (c.pctId) init[c.pctId] = c.pctDefault ?? "0";
    return init;
  });

  const ctc = num(totalCtc);
  const pctSum = CTC_LETTER_COMPONENTS.reduce(
    (s, c) => s + (c.pctId ? num(pct[c.pctId]) : 0),
    0,
  );
  const balanced = Math.round(pctSum) === 100;

  useEffect(() => {
    if (ctc <= 0) return;
    const updates: Record<string, string> = {};
    let grossAnnual = 0;
    for (const c of CTC_LETTER_COMPONENTS) {
      const p = c.pctId ? num(pct[c.pctId]) : 0;
      const annual = Math.round((ctc * p) / 100);
      const monthly = Math.round(annual / 12);
      grossAnnual += annual;
      updates[c.pmId] = annual > 0 ? formatINR(monthly) : "";
      updates[c.paId] = annual > 0 ? formatINR(annual) : "";
      if (c.pctId) updates[c.pctId] = p > 0 ? String(p) : "";
    }
    const grossMonthly = Math.round(grossAnnual / 12);
    updates[CTC_LETTER_TOTALS.subtotalPm] = grossAnnual > 0 ? formatINR(grossMonthly) : "";
    updates[CTC_LETTER_TOTALS.subtotalPa] = grossAnnual > 0 ? formatINR(grossAnnual) : "";
    // Professional Tax — ₹2,500/yr = ₹200 × 11 (Mar–Jan) + ₹300 (Feb).
    const ptAnnual = grossAnnual > 0 ? 2500 : 0;
    const ptMonthly = 200;
    updates[CTC_LETTER_DEDUCTIONS.ptPm] = ptAnnual > 0 ? formatINR(ptMonthly) : "";
    updates[CTC_LETTER_DEDUCTIONS.ptPa] = ptAnnual > 0 ? formatINR(ptAnnual) : "";
    updates[CTC_LETTER_DEDUCTIONS.totalDedPm] = ptAnnual > 0 ? formatINR(ptMonthly) : "";
    updates[CTC_LETTER_DEDUCTIONS.totalDedPa] = ptAnnual > 0 ? formatINR(ptAnnual) : "";
    const netAnnual = grossAnnual > 0 ? grossAnnual - ptAnnual : 0;
    const netMonthly = grossMonthly > 0 ? grossMonthly - ptMonthly : 0;
    updates[CTC_LETTER_TOTALS.netPm] = netAnnual > 0 ? formatINR(netMonthly) : "";
    updates[CTC_LETTER_TOTALS.netPa] = netAnnual > 0 ? formatINR(netAnnual) : "";
    setManyValues(updates);
  }, [ctc, pct, setManyValues]);

  const grossPa = values[CTC_LETTER_TOTALS.subtotalPa] || "-";
  const netPm = values[CTC_LETTER_TOTALS.netPm] || "-";

  return (
    <div className="alw-calc no-print">
      <div className="alw-calc-head">
        <Calculator size={16} strokeWidth={2.2} aria-hidden />
        <span className="alw-calc-title">CTC Calculator</span>
        <span className="alw-calc-hint">
          Enter the annual CTC + each component&rsquo;s %; the table fills automatically.
        </span>
      </div>

      <div className="alw-calc-body">
        <div className="alw-calc-inputs">
        <label className="alw-calc-total">
          <span className="alw-calc-lbl">Total CTC (per annum)</span>
          <div className="alw-calc-rupee">
            <span aria-hidden>₹</span>
            <input
              type="text"
              inputMode="numeric"
              value={totalCtc}
              onChange={(e) => setTotalCtc(e.target.value)}
              placeholder="e.g. 600000"
              aria-label="Total CTC per annum"
            />
          </div>
          {ctc > 0 && <span className="alw-calc-echo">{formatINR(ctc)} / year</span>}
        </label>

        <div className="alw-calc-pcts">
          {CTC_LETTER_COMPONENTS.map((c) =>
            c.pctId ? (
              <label key={c.pctId} className="alw-calc-pct">
                <span className="alw-calc-lbl">{c.label}</span>
                <div className="alw-calc-pctbox">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pct[c.pctId] ?? ""}
                    onChange={(e) =>
                      setPct((prev) => ({ ...prev, [c.pctId as string]: e.target.value }))
                    }
                    aria-label={`${c.label} percentage of CTC`}
                  />
                  <span aria-hidden>%</span>
                </div>
              </label>
            ) : null,
          )}
        </div>
        </div>

        <div className="alw-calc-foot">
          <span className={`alw-calc-sum${balanced ? " ok" : " warn"}`}>
            {balanced ? (
              <Check size={14} strokeWidth={2.6} />
            ) : (
              <span aria-hidden>!</span>
            )}
            Total: {Math.round(pctSum)}%
            {balanced ? " - balanced" : " - must equal 100%"}
          </span>
          {ctc > 0 && (
            <span className="alw-calc-preview">
              Gross <b>{grossPa}</b> / yr &nbsp;·&nbsp; Net take-home <b>{netPm}</b> / mo
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Send Email" composer — recipient / subject / optional message        */
/* ------------------------------------------------------------------ */

/**
 * The toolbar's Send Email popover. Pre-filled by the caller from the letter
 * (recipient's email on file, "<Letter title> - <Recipient>" subject); every
 * field stays editable. Confirming renders the letter server-side and mails it
 * as a PDF attachment. Esc cancels, the backdrop click cancels, the To field
 * autofocuses, and body scroll is locked while it's open — same behaviour as the
 * print-preview gate below.
 */
function SendEmailModal({
  draft,
  onChange,
  busy,
  onSend,
  onCancel,
}: {
  draft: { to: string; subject: string; message: string };
  onChange: (patch: Partial<{ to: string; subject: string; message: string }>) => void;
  busy: boolean;
  onSend: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const toRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    toRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onCancel]);

  return (
    <div
      className="alw-modal-backdrop no-print"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        className="alw-modal alw-modal-compose"
        role="dialog"
        aria-modal="true"
        aria-label="Send this letter by email"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void onSend();
        }}
      >
        <div className="alw-modal-head">
          <div>
            <p className="alw-modal-title">Send this letter by email</p>
            <p className="alw-modal-sub">
              The letter is attached as a PDF, exactly as it exports. The HR desk is copied.
            </p>
          </div>
          <button
            type="button"
            className="alw-modal-x"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close the email composer"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="alw-modal-body alw-compose-body">
          <label className="alw-compose-field">
            <span>To</span>
            <input
              ref={toRef}
              type="email"
              required
              value={draft.to}
              onChange={(e) => onChange({ to: e.target.value })}
              placeholder="name@example.com"
              disabled={busy}
            />
          </label>
          <label className="alw-compose-field">
            <span>Subject</span>
            <input
              type="text"
              required
              value={draft.subject}
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="Subject line"
              disabled={busy}
            />
          </label>
          <label className="alw-compose-field">
            <span>Message (optional)</span>
            <textarea
              rows={5}
              value={draft.message}
              onChange={(e) => onChange({ message: e.target.value })}
              placeholder="A short note to go above the standard email body. Leave blank to send the standard text."
              disabled={busy}
            />
          </label>
        </div>

        <div className="alw-modal-foot">
          <button type="button" className="alw-btn alw-btn-ghost" onClick={onCancel} disabled={busy}>
            <ArrowLeft size={15} strokeWidth={2.2} /> Cancel
          </button>
          <button type="submit" className="alw-btn alw-btn-primary" disabled={busy}>
            {busy ? <Loader2 size={15} className="alw-spin" /> : <Mail size={15} strokeWidth={2.2} />}
            {busy ? "Sending…" : "Send email"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Print-Preview modal — the mandatory confirm gate before Issue/Email   */
/* ------------------------------------------------------------------ */

/**
 * A compulsory, keyboard-accessible preview shown BEFORE a letter is issued or
 * emailed. Renders the letter on its letterhead exactly as it will print, with a
 * "Looks good" confirm and a "Back / Edit" cancel. Esc cancels; the confirm
 * button autofocuses; the backdrop click cancels. Body scroll is locked while open.
 */
function PrintPreviewModal({
  mode,
  busy,
  onConfirm,
  onCancel,
  recipientEmail,
  attachedEmployee,
  children,
}: {
  mode: "issue" | "email";
  busy: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  recipientEmail?: string;
  attachedEmployee: boolean;
  children: React.ReactNode;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the confirm button on open (keyboard-first).
    confirmRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onCancel]);

  const isIssue = mode === "issue";
  const title = isIssue ? "Preview before issuing" : "Preview before emailing";
  const sub = isIssue
    ? "This is exactly how the letter will print and be archived."
    : attachedEmployee
      ? "This PDF will be emailed to the attached employee, with a copy to the HR desk."
      : recipientEmail
        ? `This PDF will be emailed to ${recipientEmail}, with a copy to the HR desk.`
        : "This PDF will be emailed to the candidate, with a copy to the HR desk.";
  const confirmLabel = busy
    ? isIssue
      ? "Issuing…"
      : "Emailing…"
    : isIssue
      ? "Looks good - Issue"
      : "Looks good - Email PDF";

  return (
    <div
      className="alw-modal-backdrop no-print"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="alw-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="alw-modal-head">
          <div>
            <p className="alw-modal-title">{title}</p>
            <p className="alw-modal-sub">{sub}</p>
          </div>
          <button
            type="button"
            className="alw-modal-x"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close preview"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="alw-modal-body">
          <div className="alw-modal-stage">{children}</div>
        </div>

        <div className="alw-modal-foot">
          <button type="button" className="alw-btn alw-btn-ghost" onClick={onCancel} disabled={busy}>
            <ArrowLeft size={15} strokeWidth={2.2} /> Back / Edit
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="alw-btn alw-btn-primary"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 size={15} className="alw-spin" />
            ) : isIssue ? (
              <Send size={15} strokeWidth={2.2} />
            ) : (
              <Mail size={15} strokeWidth={2.2} />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Block + span rendering (mirrors the PDF renderer's structure)        */
/* ------------------------------------------------------------------ */

interface RenderCtx {
  values: Record<string, string>;
  setValue: (id: string, v: string) => void;
  firstFieldId?: string;
  entity: EntityId;
  today: string;
  gender: Gender;
  /** "Hide boxes" preview: render the finished letter, not the editable form. */
  clean: boolean;
  /** Who signs — drives the signature block (Director vs HR desk). */
  signatory: LetterSignatory;
  /** Optional uploaded scanned-signature image (data URL), else null. */
  signatureImage: string | null;
  /** Live lists for `optionsKey` field dropdowns (Department / Reporting Manager). */
  optionLists: { departments: string[]; managers: string[] };
}

/**
 * Render the block stream, grouping consecutive `term` blocks into ONE aligned
 * <table> (Label : value) so every colon lines up in a clean table structure.
 */
function renderBlocks(blocks: Block[], ctx: RenderCtx): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.kind === "term") {
      const run: Extract<Block, { kind: "term" }>[] = [];
      let j = i;
      while (j < blocks.length && blocks[j]!.kind === "term") {
        run.push(blocks[j] as Extract<Block, { kind: "term" }>);
        j += 1;
      }
      out.push(<TermTable key={`term-${i}`} terms={run} ctx={ctx} />);
      i = j;
    } else {
      out.push(<BlockView key={i} block={b} ctx={ctx} />);
      i += 1;
    }
  }
  return out;
}

/** A run of term rows as a real 2-column table: Label : value, colons aligned. */
function TermTable({ terms, ctx }: { terms: Extract<Block, { kind: "term" }>[]; ctx: RenderCtx }) {
  return (
    <table className="alw-termtable">
      <tbody>
        {terms.map((t, i) => (
          <tr key={i}>
            <th className="alw-tt-label">{applyFirm(applyPronouns(t.label, ctx.gender), ctx.entity)}</th>
            <td className="alw-tt-val">
              <Spans spans={t.value} ctx={ctx} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlockView({ block, ctx }: { block: Block; ctx: RenderCtx }) {
  switch (block.kind) {
    case "spacer":
      return <div style={{ height: block.size === "lg" ? 22 : block.size === "sm" ? 6 : 12 }} />;
    case "heading": {
      const size = block.level === 1 ? 20 : block.level === 3 ? 14 : 16;
      return (
        <p
          className="alw-heading"
          style={{ fontSize: size }}
        >
          {applyFirm(applyPronouns(block.text, ctx.gender), ctx.entity)}
        </p>
      );
    }
    case "paragraph":
      return (
        <p
          className="alw-p"
          style={{
            textAlign:
              block.align === "center" ? "center" : block.align === "right" ? "right" : "left",
          }}
        >
          <Spans spans={block.spans} ctx={ctx} />
        </p>
      );
    case "term":
      return (
        <p className="alw-p alw-term">
          <span className="alw-term-label">{applyFirm(applyPronouns(block.label, ctx.gender), ctx.entity)}</span>
          <span className="alw-term-value">
            <span className="alw-term-colon">:</span>
            <Spans spans={block.value} ctx={ctx} />
          </span>
        </p>
      );
    case "bullets":
      return (
        <ul className="alw-ul">
          {block.items.map((item, i) => (
            <li key={i}>
              <Spans spans={item} ctx={ctx} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return <TableView block={block} ctx={ctx} />;
    case "signature":
      return <SignatureView block={block} ctx={ctx} />;
  }
}

/**
 * A bordered table. While editing (boxes visible) it shows ALL rows so every
 * component is fillable; in "Hide boxes" preview mode it drops component rows
 * whose per-month amount is blank/zero — the finished document. Group rows span
 * all columns; total/grand rows carry their own weight. A <colgroup> pins the
 * column widths so the numeric columns stay aligned. Fields inside cells stay
 * fully editable via the shared <Spans>.
 */
function TableView({
  block,
  ctx,
}: {
  block: Extract<Block, { kind: "table" }>;
  ctx: RenderCtx;
}) {
  const rows = ctx.clean
    ? block.rows.filter((r) => tableRowVisible(r, ctx.values))
    : block.rows;
  const cols = block.columns.length;
  // First column takes the bulk; the remaining (numeric) columns split evenly.
  const firstW = cols >= 3 ? 52 : cols === 2 ? 58 : 100;
  const restW = cols > 1 ? (100 - firstW) / (cols - 1) : 0;
  return (
    <div className="alw-tablewrap">
      <table className="alw-table">
        <colgroup>
          {block.columns.map((_, i) => (
            <col key={i} style={{ width: `${i === 0 ? firstW : restW}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {block.columns.map((c, i) => (
              <th key={i} className={i === 0 ? "alw-th-left" : "alw-th-num"}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const kind = row.kind ?? "normal";
            if (kind === "group") {
              return (
                <tr key={ri} className="alw-tr-group">
                  <td colSpan={cols}>
                    <Spans spans={row.cells[0] ?? []} ctx={ctx} />
                  </td>
                </tr>
              );
            }
            const cls =
              kind === "grand" ? "alw-tr-grand" : kind === "total" ? "alw-tr-total" : "alw-tr";
            return (
              <tr key={ri} className={cls}>
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className={ci === 0 ? "alw-td-left" : "alw-td-num"}>
                    <Spans spans={row.cells[ci] ?? []} ctx={ctx} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SignatureView({
  block,
  ctx,
}: {
  block: Extract<Block, { kind: "signature" }>;
  ctx: RenderCtx;
}) {
  const e = getEntity(ctx.entity);
  const isHr = ctx.signatory === "hr";
  // A block that carries its OWN baked signature (e.g. the Selection letter's
  // founder sign-off) prints its own name + designation, never the HR-desk block.
  const baked = block.imageSrc;
  const ownSignatory = Boolean(baked) || !isHr;
  return (
    <div className="alw-sign">
      {block.forEntity && <p className="alw-sign-for">For {e.displayName}</p>}
      {/* Signature image: an uploaded scanned signature wins; else a per-letter
          baked signature; else the proprietor signature for Director letters. HR
          letters with none leave a blank signing space. */}
      {ctx.signatureImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="alw-sign-img" src={ctx.signatureImage} alt="Signature" />
      ) : baked ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="alw-sign-img" src={baked} alt="Signature" />
      ) : !isHr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="alw-sign-img" src="/signatures/proprietor-signature.jpg" alt="Signature" />
      ) : (
        <div className="alw-sign-space" aria-hidden />
      )}
      <p className="alw-sign-name">
        {ownSignatory ? <Spans spans={block.name} ctx={ctx} /> : HR_SIGNATORY.name}
      </p>
      <p className="alw-sign-desig">
        {baked ? (
          <Spans spans={block.designation ?? []} ctx={ctx} />
        ) : isHr ? (
          HR_SIGNATORY.designation
        ) : (
          "Proprietor"
        )}
      </p>
      {block.showDate && <p className="alw-sign-meta">Date: {ctx.today}</p>}
      {block.place && (
        <p className="alw-sign-meta">
          Place: <Spans spans={block.place} ctx={ctx} />
        </p>
      )}
      {/* HR desk contact (email + HR Manager) already appears in the red
          letterhead footer — no greyed duplicate under the sign-off. */}
    </div>
  );
}

function Spans({ spans, ctx }: { spans: Span[]; ctx: RenderCtx }) {
  return (
    <>
      {/* Keyed by POSITION, including the fields. A field id is deliberately
          NOT unique within a block: a template may name the same value twice
          in one paragraph — the recommendation letter reads "...for
          {employeeName}... Having worked with {employeeName}..." — and both
          spans must resolve to the same ctx.values entry. Keying on span.id
          therefore collided (React: "two children with the same key"), which
          lets React drop or duplicate one of the inputs. These arrays come
          straight from a static template and never reorder or filter, so the
          index is a stable identity for every span. */}
      {spans.map((span, i) =>
        span.t === "text" ? (
          <span key={i}>{applyFirm(applyPronouns(span.text, ctx.gender), ctx.entity)}</span>
        ) : (
          <Field key={i} spec={span} ctx={ctx} />
        ),
      )}
    </>
  );
}

/** One inline editable field. Shows a light-grey placeholder (the term to fill)
 *  when empty and normal black text once filled — NO overlaying label, never red.
 *  The red in the reference docs only marked "fill this in".
 *
 *  In "Hide boxes" (clean) mode it renders as plain document text: the value with
 *  no input chrome, and an empty field simply disappears — the finished letter. */
/** ISO "2026-08-15" → "15 August 2026" (what the letter body shows). */
function isoToDisplayDate(iso: string): string {
  return formatDateHr(iso); // canonical "07 AUG 2026" — stored + printed on the letter
}

/** "15 August 2026" (or any parseable date) → ISO "2026-08-15" for <input type=date>. */
function displayDateToIso(display: string): string {
  if (!display.trim()) return "";
  const d = new Date(display);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Ref callback that focuses the first editable field WITHOUT scrolling to it.
 *
 * React's declarative `autoFocus` maps onto the DOM autofocus behaviour, and a
 * browser focusing an element ALWAYS scrolls it into view. Each template puts
 * its first editable value at a different depth, so on the letters whose first
 * field sits below the fold the page opened already scrolled past the
 * letterhead — measured at 80px down for the minor-intern undertaking (its
 * first field is the "Date:" line, ~840px in) and ~2,950px down for Free
 * Training, whose first field is most of a page further on.
 *
 * `preventScroll` keeps the keyboard-first behaviour (the caret is still in the
 * first field, Tab still walks from there) and drops the jump. The data-flag
 * makes it fire once: a ref callback re-runs on re-render, and without the
 * guard every keystroke would steal focus back to the first field.
 */
function focusWithoutScroll(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null,
): void {
  if (!el || el.dataset.alwAutofocused) return;
  el.dataset.alwAutofocused = "1";
  el.focus({ preventScroll: true });
}

function Field({
  spec,
  ctx,
}: {
  spec: Extract<Span, { t: "field" }>;
  ctx: RenderCtx;
}) {
  const value = ctx.values[spec.id] ?? "";
  const filled = value.trim().length > 0;

  // ── Clean / preview render ────────────────────────────────────────
  if (ctx.clean) {
    if (!filled) return null;
    const cleanCls = `alw-clean${spec.multiline ? " alw-clean-multi" : ""}${spec.bold ? " alw-bold" : ""}`;
    return <span className={cleanCls}>{value}</span>;
  }

  const autoFocus = spec.id === ctx.firstFieldId;
  const common = {
    value,
    placeholder: spec.label,
    "aria-label": spec.label,
    "data-filled": filled || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      ctx.setValue(spec.id, e.target.value),
  };
  // Multiline fields (Notes, Growth Journey) flow full-width and WRAP — never
  // grow to their content length (that overflowed the A4 page + clipped). Single-
  // line fields size to their content with a small floor. A `bold` field (e.g.
  // the Subject line) renders its input in bold via the .alw-bold modifier.
  const boldCls = spec.bold ? " alw-bold" : "";
  // Dropdown field (Department / Reporting Manager) — a LIVE list resolved from
  // the page data (admin Departments master / employee roster). Renders as a
  // compact inline <select>; the stored value prints verbatim on the letter.
  if (spec.optionsKey) {
    const opts = ctx.optionLists[spec.optionsKey] ?? [];
    return (
      <select
        ref={autoFocus ? focusWithoutScroll : undefined}
        aria-label={spec.label}
        data-filled={filled || undefined}
        value={value}
        onChange={(e) => ctx.setValue(spec.id, e.target.value)}
        className={`alw-input alw-input-select${boldCls}`}
        style={{ maxWidth: "100%" }}
      >
        <option value="">{spec.label}</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {/* A previously-stored value not in the current list stays selectable. */}
        {value && !opts.includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  }
  // Numeric field (salary amounts) — digits + ₹ / commas / spaces only; any other
  // character is stripped on entry so an amount line never carries stray prose.
  if (spec.numeric) {
    return (
      <input
        type="text"
        inputMode="numeric"
        value={value}
        ref={autoFocus ? focusWithoutScroll : undefined}
        placeholder={spec.label}
        aria-label={spec.label}
        data-filled={filled || undefined}
        onChange={(e) => ctx.setValue(spec.id, e.target.value.replace(/[^0-9₹,.\s]/g, ""))}
        className={`alw-input${boldCls}`}
        style={{ minWidth: filled ? 0 : `${Math.max(spec.label.length, 2)}ch`, maxWidth: "100%" }}
      />
    );
  }
  // Date field → native calendar. Stored value is the human date ("15 August
  // 2026"); the picker shows/edits it via an ISO shadow.
  if (spec.date) {
    return (
      <input
        type="date"
        ref={autoFocus ? focusWithoutScroll : undefined}
        aria-label={spec.label}
        data-filled={filled || undefined}
        value={displayDateToIso(value)}
        onChange={(e) => ctx.setValue(spec.id, e.target.value ? isoToDisplayDate(e.target.value) : "")}
        className={`alw-input alw-input-date${boldCls}`}
        style={{ maxWidth: "100%" }}
      />
    );
  }
  return spec.multiline ? (
    <textarea
      rows={1}
      {...common}
      ref={autoFocus ? focusWithoutScroll : undefined}
      className={`alw-input alw-input-multi${boldCls}`}
    />
  ) : (
    <input
      type="text"
      {...common}
      ref={autoFocus ? focusWithoutScroll : undefined}
      className={`alw-input${boldCls}`}
      // A FILLED field sizes purely to its content (`field-sizing:content`) — the
      // old `value.length ch` floor padded every value with dead space, because
      // `ch` is the width of "0" and most prose glyphs are narrower: that's what
      // left a gap before the following comma and stretched the dashed underlines
      // in the CTC table. Only an EMPTY field reserves room for its label.
      style={{ minWidth: filled ? 0 : `${Math.max(spec.label.length, 2)}ch`, maxWidth: "100%" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const EDITOR_CSS = `
.alw-wrap{width:100%;}
/* Toolbar */
.alw-toolbar{
  /* top:0, NOT 60px. The 60px cleared a sticky TITLE BAND that used to pin at
     the top of this same scroll container; that band is gone (its title moved
     into the global top bar), so the offset became a 60px dead lane the letter
     scrolled up into - the sheet's red letterhead appeared ABOVE the bar and
     read as overlapping it. Pinned flush, nothing passes over the bar, and at
     rest the toolbar sits 60px higher. If a pinned strip is ever added back
     inside .hr-shell-scroll, this has to match its height again. */
  position:sticky;top:0;z-index:20;
  display:flex;flex-wrap:nowrap;overflow-x:auto;align-items:center;justify-content:safe center;gap:5px 7px;
  padding:9px 12px;margin-bottom:20px;
  background:color-mix(in srgb, var(--color-surface-soft, #f8fafc) 92%, transparent);
  backdrop-filter:blur(8px);
  border:1px solid var(--color-hairline, #e2e8f0);
  border-radius:16px;
}
.alw-pick{display:flex;flex-direction:column;gap:3px;position:relative;padding-left:17px;flex-shrink:1;min-width:0;}
.alw-pick svg{position:absolute;left:0;top:22px;width:13px;height:13px;color:${RED_DEEP};}
.alw-pick-label{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:9.5px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
}
.alw-pick select{
  appearance:none;-webkit-appearance:none;
  min-width:150px;max-width:280px;width:100%;
  text-overflow:ellipsis;
  padding:6px 22px 6px 9px;
  font-size:12px;font-weight:600;color:var(--color-ink-strong, #0f172a);
  background:#fff;border:1px solid var(--color-hairline-strong, #cbd5e1);border-radius:8px;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.4'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 6px center;
  cursor:pointer;
}
.alw-pick select:focus{outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.14);}
.alw-actions{margin-left:8px;display:flex;flex-wrap:nowrap;flex-shrink:0;gap:5px;align-items:center;}
.alw-btn{
  display:inline-flex;align-items:center;gap:4px;white-space:nowrap;
  padding:6px 8px;border-radius:9px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11.5px;font-weight:700;cursor:pointer;
  border:1px solid transparent;transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease;
}
.alw-btn svg{width:13px;height:13px;flex-shrink:0;}
.alw-btn:disabled{opacity:.55;cursor:default;}
.alw-btn-ghost{background:#fff;color:var(--color-ink-strong, #0f172a);border-color:var(--color-hairline-strong, #cbd5e1);}
.alw-btn-ghost:not(:disabled):hover{border-color:var(--color-ink-muted, #94a3b8);transform:translateY(-1px);}
.alw-btn-primary{color:#fff;background:linear-gradient(135deg, ${RED}, ${RED_DEEP});box-shadow:0 10px 22px -12px rgba(168,4,0,.8);}
.alw-btn-primary:not(:disabled):hover{transform:translateY(-1px);}
.alw-btn-edit{
  color:${RED_DEEP};background:#fff;
  border-color:color-mix(in srgb, ${RED} 40%, #cbd5e1);
  box-shadow:0 6px 16px -12px rgba(168,4,0,.7);
}
.alw-btn-edit:not(:disabled):hover{border-color:${RED};transform:translateY(-1px);}
.alw-spin{animation:alw-spin 1s linear infinite;}
@keyframes alw-spin{to{transform:rotate(360deg);}}

/* "Edit freely" editor loading state */
.alw-rich-loading{
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  min-height:420px;color:var(--color-ink-muted,#64748b);
  font-family:var(--font-display, system-ui, sans-serif);font-size:14px;font-weight:600;
}
.alw-rich-loading svg{color:${RED};}

/* Stage - centres the A4 page */
/* The measuring host for <FitToWidth>. BLOCK, not a centring flex row: the
   sheet now fills this box exactly, and a flex row would let the scaled
   child influence the width we measure. */
.alw-stage{display:block;padding-bottom:40px;}
.alw-fit{transform-origin:top left;}

/* Body typography inside the letterhead */
.alw-date{
  text-align:right;font-size:13px;font-weight:600;
  color:var(--color-ink-muted, #475569);margin-bottom:18px;
}
.alw-p{margin:0 0 14px;font-size:15px;line-height:1.95;color:var(--color-ink-strong, #0f172a);}
.alw-heading{
  margin:16px 0 8px;font-weight:800;letter-spacing:-.01em;
  font-family:var(--font-display, Georgia, serif);color:var(--color-ink-strong, #0f172a);
}
/* Term rows → aligned label / value grid so every colon lines up vertically. */
.alw-term{display:grid;grid-template-columns:200px 1fr;column-gap:8px;align-items:baseline;margin:0 0 8px;}
.alw-term-label{font-weight:700;}
.alw-term-value{min-width:0;}
.alw-term-colon{font-weight:700;margin-right:6px;}
@media (max-width:640px){.alw-term{grid-template-columns:130px 1fr;}}
/* Grouped term rows as a real table - colons aligned in a shared column. */
.alw-termtable{border-collapse:collapse;margin:8px 0 18px;width:100%;font-variant-numeric:tabular-nums;border:1px solid #d4d4d8;}
.alw-termtable th.alw-tt-label{text-align:left;vertical-align:top;font-weight:700;padding:7px 12px;width:38%;white-space:normal;background:#f6f5f7;border:1px solid #d4d4d8;color:var(--color-ink-strong,#0f172a);}
.alw-termtable td.alw-tt-val{vertical-align:top;padding:7px 12px;border:1px solid #d4d4d8;color:var(--color-ink-strong,#0f172a);overflow-wrap:break-word;}
@media (max-width:640px){.alw-termtable th.alw-tt-label{width:44%;}}
.alw-ul{margin:0 0 14px;padding-left:4px;list-style:none;}
.alw-ul li{position:relative;padding-left:20px;margin-bottom:7px;font-size:15px;line-height:1.9;color:var(--color-ink-strong,#0f172a);}
.alw-ul li::before{content:"";position:absolute;left:2px;top:.72em;width:6px;height:6px;border-radius:9999px;background:${RED};}

/* Table block (e.g. the CTC break-up) */
.alw-tablewrap{margin:6px 0 16px;overflow-x:auto;}
.alw-table{
  width:100%;border-collapse:collapse;table-layout:fixed;
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  /* Flat document table - no rounded corners on the letter surface. */
  border-radius:0;overflow:hidden;font-variant-numeric:tabular-nums;
}
.alw-table thead th{
  padding:10px 14px;background:linear-gradient(180deg,#fbfbfd,#f2f3f6);
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
  border-bottom:1px solid var(--color-hairline-strong, #cbd5e1);
}
.alw-th-left{text-align:left;}
.alw-th-num{text-align:right;}
.alw-table td{
  padding:7px 14px;font-size:14px;color:var(--color-ink-strong, #0f172a);
  border-bottom:1px solid var(--color-hairline, #eef0f4);vertical-align:middle;
  overflow-wrap:break-word;
}
.alw-td-left{text-align:left;font-weight:600;}
.alw-td-num{text-align:right;white-space:nowrap;}
.alw-tr:hover{background:color-mix(in srgb, ${RED} 3%, transparent);}
.alw-tr-group td{
  padding:9px 14px;background:#0f172a08;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:12.5px;font-weight:900;letter-spacing:.02em;color:${RED_DEEP};text-transform:uppercase;
}
.alw-tr-total td{
  background:color-mix(in srgb, ${RED} 5%, #fff);font-weight:800;
  border-top:1px solid var(--color-hairline-strong, #cbd5e1);
}
.alw-tr-grand td{
  background:linear-gradient(120deg, ${RED}, ${RED_DEEP});color:#fff;font-weight:900;font-size:14.5px;
}
.alw-tr-grand .alw-input{color:#fff;border-bottom-color:rgba(255,255,255,.5);}
.alw-tr-grand .alw-input::placeholder{color:rgba(255,255,255,.7);}
.alw-tr-grand .alw-input:focus{background:rgba(255,255,255,.14);border-bottom-color:#fff;}

/* Signature block */
.alw-sign{margin-top:26px;line-height:1.6;}
.alw-sign-for{margin:0 0 2px;font-weight:800;color:${RED_DEEP};font-size:15px;}
.alw-sign-img{display:block;height:66px;width:auto;max-width:230px;margin:6px 0 2px;object-fit:contain;}
.alw-sign-esign{margin:0 0 14px;font-size:12.5px;letter-spacing:.06em;color:var(--color-ink-muted,#94a3b8);}
.alw-sign-name{margin:0;font-weight:800;font-size:15px;color:var(--color-ink-strong,#0f172a);}
.alw-sign-desig{margin:2px 0 0;font-size:13.5px;color:var(--color-ink-muted,#475569);}
.alw-sign-meta{margin:2px 0 0;font-size:13px;color:var(--color-ink-muted,#475569);}
/* Blank signing space on HR letters with no uploaded signature. */
.alw-sign-space{height:44px;}
/* HR desk contact block under an HR-signed sign-off. */
.alw-sign-hr{margin-top:10px;padding-top:8px;border-top:1px dashed var(--color-hairline,#e2e8f0);}

/* ── CTC percentage calculator ───────────────────────────────────── */
.alw-calc{
  max-width:794px;margin:0 auto 20px;
  background:var(--color-surface, #fff);
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  border-radius:0;
  box-shadow:0 18px 44px -30px rgba(15,23,42,.4);
  overflow:hidden;
}
.alw-calc-head{
  display:flex;align-items:center;gap:9px;flex-wrap:wrap;
  padding:12px 16px;border-bottom:1px solid var(--color-hairline,#e2e8f0);
  background:color-mix(in srgb, ${RED} 4%, #fff);
}
.alw-calc-head svg{color:${RED_DEEP};}
.alw-calc-title{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:14px;font-weight:800;color:var(--color-ink-strong,#0f172a);
}
.alw-calc-hint{font-size:12px;color:var(--color-ink-muted,#64748b);}
.alw-calc-body{padding:14px 16px;display:flex;flex-direction:column;gap:14px;}
.alw-calc-lbl{
  display:block;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--color-ink-muted,#64748b);margin-bottom:5px;
}
.alw-calc-inputs{display:flex;align-items:stretch;gap:12px;flex-wrap:nowrap;}
.alw-calc-total{display:flex;flex-direction:column;justify-content:flex-end;flex:0 0 180px;min-width:150px;}
.alw-calc-total .alw-calc-rupee{max-width:none;width:100%;}
.alw-calc-inputs .alw-calc-pcts{flex:1 1 0;min-width:0;}
.alw-calc-pct{display:flex;flex-direction:column;justify-content:flex-end;}
@media (max-width:820px){.alw-calc-inputs{flex-wrap:wrap;}.alw-calc-total{flex:1 1 100%;}}
.alw-calc-rupee{
  display:inline-flex;align-items:center;gap:6px;max-width:280px;
  padding:9px 12px;border:1px solid var(--color-hairline-strong,#cbd5e1);border-radius:10px;background:#fff;
}
.alw-calc-rupee span{font-weight:800;color:var(--color-ink-muted,#64748b);}
.alw-calc-rupee input{flex:1;min-width:0;border:none;outline:none;font-size:16px;font-weight:700;color:var(--color-ink-strong,#0f172a);background:transparent;}
.alw-calc-echo{margin-top:5px;font-size:12px;font-weight:700;color:${RED_DEEP};}
.alw-calc-pcts{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:10px 12px;}
@media (max-width:760px){.alw-calc-pcts{grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr));}}
.alw-calc-pctbox{
  display:inline-flex;align-items:center;gap:4px;
  padding:8px 11px;border:1px solid var(--color-hairline-strong,#cbd5e1);border-radius:10px;background:#fff;
}
.alw-calc-pctbox input{width:100%;min-width:0;border:none;outline:none;font-size:15px;font-weight:700;color:var(--color-ink-strong,#0f172a);background:transparent;text-align:right;}
.alw-calc-pctbox span{font-weight:700;color:var(--color-ink-muted,#64748b);}
.alw-calc-rupee:focus-within,.alw-calc-pctbox:focus-within{border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.12);}
.alw-calc-foot{
  display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 14px;
  padding-top:4px;
}
.alw-calc-sum{
  display:inline-flex;align-items:center;gap:6px;
  font-size:13px;font-weight:800;padding:6px 11px;border-radius:9px;
}
.alw-calc-sum.ok{color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;}
.alw-calc-sum.warn{color:${RED_DEEP};background:rgba(225,6,0,.06);border:1px solid color-mix(in srgb,${RED} 30%,#fff);}
.alw-calc-preview{font-size:13px;color:var(--color-ink-muted,#475569);}
.alw-calc-preview b{color:var(--color-ink-strong,#0f172a);font-weight:800;}

/* Inline editable field - grey placeholder when empty, black text when filled */
.alw-input{
  font:inherit;color:var(--color-ink-strong,#0f172a);font-weight:600;
  background:transparent;border:none;outline:none;
  border-bottom:1px dashed #c7cdd6;
  padding:0 3px 1px;margin:0 1px;
  field-sizing:content;box-sizing:content-box;vertical-align:baseline;
  transition:border-color .15s ease, background .15s ease;
}
.alw-input::placeholder{color:#9aa4b2;font-weight:500;opacity:1;}
.alw-input:hover{border-bottom-color:#9aa4b2;}
.alw-input:focus{
  border-bottom-color:${RED};border-bottom-style:solid;
  background:rgba(225,6,0,.05);
}
/* Multiline fields flow full-width + WRAP (never stretch to content width). */
.alw-input-multi{
  display:block;width:100%;min-width:0;max-width:100%;
  resize:none;overflow:hidden;line-height:inherit;white-space:pre-wrap;vertical-align:top;
}
/* Inline dropdown fields (Department / Reporting Manager) - same underline
   language as a text field, with a small caret so it reads as a picker. */
.alw-input-select{
  appearance:none;-webkit-appearance:none;
  padding-right:18px;cursor:pointer;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A80400' stroke-width='2.6'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 1px center;background-size:13px;
}

/* "Hide boxes" clean render - the field's value as plain document text. */
.alw-clean{font:inherit;color:var(--color-ink-strong,#0f172a);font-weight:600;}
.alw-clean-multi{display:block;white-space:pre-wrap;}
/* Bold field modifier - the Subject line renders in bold, editor + preview. */
.alw-bold{font-weight:800 !important;color:var(--color-ink-strong,#0f172a);}
.alw-tr-grand .alw-clean{color:#fff;}
/* Active state for the Hide-boxes toggle */
.alw-btn-on{border-color:${RED} !important;color:${RED_DEEP};background:rgba(225,6,0,.05);}

@media (max-width:900px){
  .alw-pick select{min-width:112px;}
}

/* ── Print-Preview modal ─────────────────────────────────────────── */
.alw-modal-backdrop{
  position:fixed;inset:0;z-index:120;
  display:flex;align-items:center;justify-content:center;padding:24px;
  background:rgba(15,23,42,.55);backdrop-filter:blur(3px);
  animation:alw-fade .14s ease;
}
@keyframes alw-fade{from{opacity:0;}to{opacity:1;}}
.alw-modal{
  display:flex;flex-direction:column;
  width:min(920px,100%);max-height:92vh;
  background:var(--color-surface, #fff);
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  /* Flat preview surface - minimal corner rounding. */
  border-radius:4px;overflow:hidden;
  box-shadow:0 40px 90px -30px rgba(15,23,42,.55);
  animation:alw-pop .16s ease;
}
@keyframes alw-pop{from{transform:translateY(8px) scale(.99);opacity:0;}to{transform:none;opacity:1;}}
.alw-modal-head{
  display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
  padding:16px 20px;border-bottom:1px solid var(--color-hairline, #e2e8f0);
}
.alw-modal-title{
  margin:0;font-family:var(--font-display, system-ui, sans-serif);
  font-size:16px;font-weight:800;color:var(--color-ink-strong, #0f172a);
}
.alw-modal-sub{margin:3px 0 0;font-size:12.5px;font-weight:500;color:var(--color-ink-muted, #64748b);}
.alw-modal-x{
  flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;
  width:34px;height:34px;border-radius:10px;cursor:pointer;
  background:#fff;color:var(--color-ink-muted, #64748b);
  border:1px solid var(--color-hairline-strong, #cbd5e1);
}
.alw-modal-x:not(:disabled):hover{border-color:${RED};color:${RED_DEEP};}
.alw-modal-x:disabled{opacity:.5;cursor:default;}
.alw-modal-body{
  overflow:auto;padding:22px;background:var(--color-surface-soft, #f8fafc);
}
.alw-modal-stage{display:flex;justify-content:center;}
/* Shrink the A4 page a touch so it fits comfortably inside the modal. */
.alw-modal-stage .alh-page{transform:scale(.92);transform-origin:top center;}
.alw-modal-foot{
  display:flex;align-items:center;justify-content:flex-end;gap:10px;
  padding:14px 20px;border-top:1px solid var(--color-hairline, #e2e8f0);
  background:var(--color-surface, #fff);
}

/* ── "Send Email" composer (narrower than the A4 preview modal) ──── */
.alw-modal-compose{width:min(560px,100%);}
.alw-compose-body{display:flex;flex-direction:column;gap:14px;background:var(--color-surface, #fff);}
.alw-compose-field{display:flex;flex-direction:column;gap:6px;}
.alw-compose-field>span{
  font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
}
.alw-compose-field input,.alw-compose-field textarea{
  width:100%;padding:9px 11px;border-radius:8px;
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  background:#fff;color:var(--color-ink-strong, #0f172a);
  font:inherit;font-size:14px;line-height:1.5;outline:none;
}
.alw-compose-field textarea{resize:vertical;min-height:96px;}
.alw-compose-field input:focus,.alw-compose-field textarea:focus{border-color:${RED};}
.alw-compose-field input:disabled,.alw-compose-field textarea:disabled{opacity:.6;}

/* "Edit freely" HTML rendered read-only inside the preview modal. */
.alw-rich-preview{font-size:15px;line-height:1.72;color:var(--color-ink-strong,#0f172a);}
/* Lists - restore the markers Tailwind v4 preflight blanks app-wide
 * ("ol, ul, menu { list-style: none }"). Without this the preview drops the
 * bullets the editor just showed; see the note at .rle-prose ul in
 * components/hr/letters/rich-letter-editor.tsx. */
.alw-rich-preview ul,.alw-rich-preview ol{margin:0 0 14px;padding-left:26px;}
.alw-rich-preview ul{list-style:disc outside;}
.alw-rich-preview ul ul{list-style-type:circle;}
.alw-rich-preview ul ul ul{list-style-type:square;}
.alw-rich-preview ol{list-style:decimal outside;}
.alw-rich-preview ol ol{list-style-type:lower-alpha;}
.alw-rich-preview ol ol ol{list-style-type:lower-roman;}
.alw-rich-preview li{margin:0 0 4px;}
.alw-rich-preview li p{margin:0;}
.alw-rich-preview li>ul,.alw-rich-preview li>ol{margin:4px 0 0;}
.alw-rich-preview table{border-collapse:collapse;width:100%;margin:12px 0;font-variant-numeric:tabular-nums;}
.alw-rich-preview th,.alw-rich-preview td{border:1px solid #cbd5e1;padding:7px 11px;text-align:left;vertical-align:top;}
.alw-rich-preview th{background:#f2f3f6;font-weight:700;color:#334155;}
.alw-rich-preview hr{border:none;border-top:1px solid var(--color-hairline,#e2e8f0);margin:16px 0;}
.alw-rich-preview sub,.alw-rich-preview sup{font-size:.72em;line-height:0;}
.alw-rich-preview blockquote{margin:0 0 14px;padding-left:14px;border-left:3px solid color-mix(in srgb, var(--color-altus-red,#E10600) 55%, transparent);color:#374151;}
.alw-rich-preview .letter-field-empty{
  color:#A80400;background:#FCE9E8;border-radius:3px;padding:0 3px;white-space:nowrap;
}

/* Print - only the paper */
@media print{
  .no-print{display:none !important;}
  .alw-stage{padding:0;}
  /* A true A4 page on paper, whatever the screen was scaled to. */
  .alw-fit{zoom:1 !important;}
  .alw-input{border-bottom:none;background:transparent;color:var(--color-ink-strong,#0f172a);}
  /* Never print the grey "fill this in" placeholders - an unfilled field is blank. */
  .alw-input::placeholder{color:transparent !important;}
  .alw-tablewrap{overflow:visible;}
  /* Keep the coloured group/total/grand rows in the printout + PDF. */
  .alw-tr-group td,.alw-tr-total td,.alw-tr-grand td{
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  /* Don't split a table row across a page break. */
  .alw-table tr{break-inside:avoid;}
}
`;

export default LetterEditor;
