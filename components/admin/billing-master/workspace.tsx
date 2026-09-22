"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  fetchBillingEntityDetail,
  updateBillingEntity,
  uploadBillingEntityFile,
  removeBillingEntityFile,
  deleteBillingEntity,
  billingEntityDeleteImpact,
} from "@/app/(admin)/admin/billing-master/actions";
import type {
  BillingEntityAccess,
  BillingEntityDetail,
  BillingEntityFileView,
} from "@/lib/queries/billing-entities";
import {
  ENTITY_FILE_KIND_LABELS,
  type EntityFileKind,
} from "@/lib/billing/entity-master";
/**
 * The Aura stylesheet, imported from the Employee Master rather than copied.
 *
 * Every rule in it is scoped to `.aura`, and it already carries exactly the
 * tokens and components this workspace needs — glass panes, the drifting field,
 * `.ctl`, `.label`, `.readout`, the chrome bar and rail. Duplicating eighteen
 * kilobytes of it here would give the two workspaces a shared look with no
 * shared definition, which is how they come to drift apart.
 *
 * It is imported in place rather than hoisted to a shared folder so that
 * nothing about the existing Employee Master has to change.
 */
import "../employee-master/aura.css";
import { formatDate } from "@/lib/format";

/**
 * THE BILLING ENTITY WORKSPACE.
 *
 * A large overlay — 94% of the viewport, like the Employee Master's — and the
 * SAME surface for reading and writing. The brief rules out a separate view
 * mode and edit mode, and that is the right call for a reason beyond taste:
 * two screens for one record is how a read screen and a write screen come to
 * disagree about what the record says.
 *
 * A viewer without Entity Edit sees this exact workspace with the inputs
 * read-only and no Save control. Nothing is hidden from them that they are
 * allowed to see; nothing is editable that they are not allowed to change. The
 * actions re-check both regardless — every field here is behind
 * `updateBillingEntity`, which calls `requireModuleEdit` for itself.
 *
 * ── SAVING IS A SPARSE PATCH ───────────────────────────────────────────────
 * Each field starts from the loaded record and is tracked in a DIRTY SET; Save
 * sends only what changed, and changing a value back removes it from the patch.
 * That is a safety property rather than an optimisation: a field this form did
 * not render must reach the server as `undefined` so the action leaves it
 * alone. On this record, sending the whole form would let a section that failed
 * to load blank a bank account.
 *
 * ── CLOSING ────────────────────────────────────────────────────────────────
 * ESC and X close; an outside click does not. Unsaved changes prompt first.
 */

type SectionKey = "basic" | "contact" | "tax" | "banking" | "files";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "basic", label: "Basic" },
  { key: "contact", label: "Contact" },
  { key: "tax", label: "Tax & Billing" },
  { key: "banking", label: "Banking Details" },
  { key: "files", label: "Files & Documents" },
];

/** The fields this workspace can patch. Mirrors BillingEntityFieldsSchema. */
interface Draft {
  name?: string;
  isActive?: boolean;
  proprietorName?: string | null;
  proprietorDesignation?: string | null;
  address?: string | null;
  cellNo?: string | null;
  email?: string | null;
  website?: string | null;
  panNo?: string | null;
  gstNo?: string | null;
  sacCodes?: string[];
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  branch?: string | null;
}

export function BillingEntityWorkspace({
  entityId,
  access,
  canDelete,
  onClose,
  onDeleted,
}: {
  entityId: string;
  access: BillingEntityAccess;
  canDelete: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<BillingEntityDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<SectionKey>("basic");
  const [draft, setDraft] = React.useState<Draft>({});
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const dirty = Object.keys(draft).length > 0;
  const editable = access.entityEdit;

  // No `setLoading(true)` — the table mounts this with `key={entityId}`, so a
  // different entity is a fresh mount rather than a prop change.
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetchBillingEntityDetail(entityId);
      if (!alive) return;
      if (res.ok) setDetail(res.detail);
      else setLoadError(res.error);
    })();
    return () => {
      alive = false;
    };
  }, [entityId]);

  const requestClose = React.useCallback(() => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }, [dirty, onClose]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // A nested confirmation owns its own Escape — closing the workspace out
      // from under it would discard the record along with the dialog.
      if (confirmDelete) return;
      e.stopPropagation();
      requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose, confirmDelete]);

  /** Set a field, removing it from the patch when it returns to its loaded value. */
  function set<K extends keyof Draft>(key: K, value: Draft[K], original: Draft[K]) {
    setMessage(null);
    setDraft((prev) => {
      const next = { ...prev };
      const same =
        Array.isArray(value) && Array.isArray(original)
          ? value.length === original.length && value.every((v, i) => v === original[i])
          : value === original;
      if (same) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function save() {
    if (!detail || !dirty) return;
    setSaving(true);
    setMessage(null);
    const res = await updateBillingEntity(entityId, draft);
    setSaving(false);
    if (!res.ok) {
      setMessage({ tone: "err", text: res.error });
      return;
    }
    setDraft({});
    setMessage({ tone: "ok", text: "Saved." });
    const fresh = await fetchBillingEntityDetail(entityId);
    if (fresh.ok) setDetail(fresh.detail);
    router.refresh();
  }

  /** Re-read after a file change, so the list of files and its URLs are current. */
  const reloadFiles = React.useCallback(async () => {
    const fresh = await fetchBillingEntityDetail(entityId);
    if (fresh.ok) setDetail(fresh.detail);
    router.refresh();
  }, [entityId, router]);

  /** The pointer-tracked sheen — one delegated listener, written as CSS custom
   *  properties rather than state, so moving the mouse never re-renders the
   *  form underneath. */
  function trackSheen(e: React.PointerEvent<HTMLDivElement>) {
    const pane = (e.target as HTMLElement).closest<HTMLElement>(".glass.interactive");
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    pane.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    pane.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  }

  /**
   * Rendered into `document.body`.
   *
   * `position: fixed` resolves against the nearest ancestor carrying a
   * `transform`, `filter` or `contain` — and the admin shell has one. Left in
   * the tree this overlay lays out inside the content column, offset by the
   * sidebar and clipped at the bottom. Mounted behind a flag so the first
   * client render matches the server's, which has no `document`.
   */
  const [mounted, setMounted] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []); // the SSR guard above

  if (!mounted) return null;

  const d = detail;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-[3vh_3vw]"
      style={{ background: "rgba(8, 11, 26, 0.46)", backdropFilter: "blur(3px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Billing entity"
    >
      <div
        className="aura flex h-[94vh] w-[94vw] max-w-[1500px] flex-col overflow-hidden rounded-[20px]"
        style={{
          boxShadow: "0 60px 140px -40px rgba(8,11,26,0.7), 0 0 0 1px rgba(255,255,255,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={trackSheen}
      >
        {/* The field the glass refracts, and the grain that makes it read as
            material rather than white plastic. */}
        <div className="aura-field" aria-hidden>
          <div className="aura-blob b1" />
          <div className="aura-blob b2" />
          <div className="aura-blob b3" />
        </div>
        <div className="aura-grain" aria-hidden />

        {/* ── Sticky header ──────────────────────────────────────────────── */}
        <header className="chrome-bar z-[2] flex shrink-0 items-center gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            {!d ? (
              <div className="muted text-[14px]">{loadError ?? "Loading…"}</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="display truncate text-[23px] leading-none">
                    {draft.name ?? d.name}
                  </h2>
                  {!d.isActive && <span className="pill state idle">Inactive</span>}
                  {!editable && <span className="pill state idle">View only</span>}
                </div>
                <div className="quiet mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                  <span>{d.proprietorName || "No proprietor recorded"}</span>
                  <span aria-hidden>·</span>
                  <span className="muted">
                    {d.gstNo ? `GST ${d.gstNo}` : "No GST No."}
                  </span>
                  {d.employeeCount > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="muted">
                        {d.employeeCount} employee{d.employeeCount === 1 ? "" : "s"} paid through it
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {dirty && !message && <span className="pill state warn">Unsaved</span>}
            {message && (
              <span className={`pill state ${message.tone === "ok" ? "ok" : "hot"}`}>
                {message.text}
              </span>
            )}
            {/* Delete lives in the header, beside Save, because it acts on the
                whole record. Rendered only for whoever may actually do it —
                and the action checks again regardless. */}
            {canDelete && d && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="btn-quiet"
                style={{ color: "var(--accent)" }}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            {editable && (
              <button type="button" onClick={save} disabled={!dirty || saving} className="btn">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save Changes
              </button>
            )}
            <button type="button" onClick={requestClose} aria-label="Close" className="icon-btn">
              <X size={17} />
            </button>
          </div>
        </header>

        {/* ── Rail + body ────────────────────────────────────────────────── */}
        <div className="z-[2] flex min-h-0 flex-1">
          <nav className="chrome-rail scroll w-[22%] min-w-[184px] max-w-[248px] shrink-0 overflow-y-auto px-3 py-4 max-md:hidden">
            {SECTIONS.map((s) => {
              // The files section is absent, not empty, for somebody without
              // File View — an empty pane would read as "this entity has no
              // logo", which is a different and misleading statement.
              if (s.key === "files" && !access.fileView) return null;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-current={section === s.key}
                  onClick={() => setSection(s.key)}
                  className="nav-item"
                >
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div className="md:hidden">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as SectionKey)}
              aria-label="Section"
              className="ctl m-3 w-auto"
            >
              {SECTIONS.filter((s) => s.key !== "files" || access.fileView).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <main className="scroll min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {!d ? (
              <Empty>{loadError ?? "Loading the entity…"}</Empty>
            ) : (
              <Body
                d={d}
                draft={draft}
                set={set}
                section={section}
                editable={editable}
                access={access}
                onFilesChanged={reloadFiles}
              />
            )}
          </main>
        </div>
      </div>

      {confirmDelete && d && (
        <DeleteConfirm
          entityId={entityId}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={() => {
            setConfirmDelete(false);
            fireToast({ message: `${d.name} deleted.` });
            onDeleted();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTIONS
   ════════════════════════════════════════════════════════════════════════════ */

function Body({
  d,
  draft,
  set,
  section,
  editable,
  access,
  onFilesChanged,
}: {
  d: BillingEntityDetail;
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K], o: Draft[K]) => void;
  section: SectionKey;
  editable: boolean;
  access: BillingEntityAccess;
  onFilesChanged: () => Promise<void>;
}) {
  /** Current value of a text field: the draft if touched, else the record. */
  const txt = (k: keyof Draft, original: string | null): string =>
    (draft[k] as string | null | undefined) ?? original ?? "";

  const field = (k: keyof Draft, label: string, original: string | null) => (
    <Text
      label={label}
      value={txt(k, original)}
      readOnly={!editable}
      onChange={(v) => set(k, v, original ?? "")}
    />
  );

  if (section === "basic") {
    return (
      <Stack>
        <Panes>
          <Pane title="Entity">
            <Rows>
              {field("name", "Entity Name", d.name)}
              <Field label="Status">
                {editable ? (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.isActive ?? d.isActive}
                      onChange={(e) => set("isActive", e.target.checked, d.isActive)}
                    />
                    {(draft.isActive ?? d.isActive) ? "Active" : "Inactive"}
                  </label>
                ) : (
                  <Readout>{d.isActive ? "Active" : "Inactive"}</Readout>
                )}
              </Field>
            </Rows>
            <Note>
              Deactivating keeps every past record intact and removes the entity
              from new selections — the safe alternative to deleting one that has
              already been billed from.
            </Note>
          </Pane>

          <Pane title="Proprietor">
            <Rows>
              {field("proprietorName", "Proprietor Name", d.proprietorName)}
              {field("proprietorDesignation", "Designation", d.proprietorDesignation)}
            </Rows>
          </Pane>
        </Panes>

        <Panes>
          <Pane title="Usage">
            <Rows>
              <Field label="Employees paid through it">
                <Readout>{String(d.employeeCount)}</Readout>
              </Field>
              <Field label="Last changed">
                <Readout>
                  {d.updatedAt.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {d.updatedByName ? ` · ${d.updatedByName}` : ""}
                </Readout>
              </Field>
            </Rows>
          </Pane>
        </Panes>
      </Stack>
    );
  }

  if (section === "contact") {
    return (
      <Stack>
        <Panes>
          <Pane title="Address">
            <Field label="Address">
              {editable ? (
                <textarea
                  value={txt("address", d.address)}
                  onChange={(e) => set("address", e.target.value, d.address ?? "")}
                  rows={4}
                  maxLength={500}
                  className="ctl"
                  style={{ resize: "vertical" }}
                />
              ) : (
                <Readout className="whitespace-pre-wrap leading-relaxed">
                  {d.address || "Not recorded."}
                </Readout>
              )}
            </Field>
          </Pane>

          <Pane title="Reach">
            <Rows>
              {field("cellNo", "Cell No.", d.cellNo)}
              {field("email", "Email", d.email)}
              {field("website", "Website", d.website)}
            </Rows>
          </Pane>
        </Panes>
      </Stack>
    );
  }

  if (section === "tax") {
    return (
      <Stack>
        <Panes>
          <Pane title="Tax Identifiers">
            <Rows>
              {field("panNo", "PAN No.", d.panNo)}
              {field("gstNo", "GST No.", d.gstNo)}
            </Rows>
            <Note>
              Stored in upper case with spaces removed. A GST No. carries its
              holder&rsquo;s PAN in characters 3&ndash;12; if the two disagree,
              saving will say so rather than print a mismatched pair on an
              invoice.
            </Note>
          </Pane>

          <Pane title="SAC Codes">
            <SacEditor
              value={draft.sacCodes ?? d.sacCodes}
              original={d.sacCodes}
              readOnly={!editable}
              onChange={(next) => set("sacCodes", next, d.sacCodes)}
            />
          </Pane>
        </Panes>
      </Stack>
    );
  }

  if (section === "banking") {
    return (
      <Stack>
        <Panes>
          <Pane title="Account">
            <Rows>
              {field("bankName", "Bank Name", d.bankName)}
              {field("accountName", "Account Name", d.accountName)}
              {field("accountNumber", "Account Number", d.accountNumber)}
            </Rows>
          </Pane>
          <Pane title="Branch">
            <Rows>
              {field("ifsc", "IFSC", d.ifsc)}
              {field("branch", "Branch", d.branch)}
            </Rows>
          </Pane>
        </Panes>
      </Stack>
    );
  }

  return (
    <FilesSection
      entityId={d.id}
      files={d.files}
      canManage={access.fileManage}
      onChanged={onFilesChanged}
    />
  );
}

/* ── SAC codes ────────────────────────────────────────────────────────────── */

/**
 * Multiple SAC codes, as chips.
 *
 * A chip list rather than a comma-separated text field: the codes are separate
 * values and an invoice may print them individually, so storing them as one
 * string would push the splitting onto every reader — and each reader would
 * guess differently about spaces and trailing commas.
 */
function SacEditor({
  value,
  original,
  readOnly,
  onChange,
}: {
  value: string[];
  original: string[];
  readOnly: boolean;
  onChange: (next: string[]) => void;
}) {
  const [entry, setEntry] = React.useState("");

  function add() {
    const v = entry.replace(/\s+/g, "");
    if (!v) return;
    if (value.includes(v)) {
      setEntry("");
      return;
    }
    onChange([...value, v]);
    setEntry("");
  }

  if (readOnly) {
    return value.length === 0 ? (
      <Empty>No SAC codes recorded.</Empty>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {value.map((c) => (
          <span key={c} className="pill num">
            {c}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {value.length === 0 && <span className="quiet text-[12.5px]">None yet.</span>}
        {value.map((c) => (
          <span key={c} className="pill num inline-flex items-center gap-1">
            {c}
            <button
              type="button"
              aria-label={`Remove ${c}`}
              onClick={() => onChange(value.filter((x) => x !== c))}
              className="opacity-60 hover:opacity-100"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the code rather than submitting anything — there is no
            // form here, and the reflex is to press it.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          inputMode="numeric"
          maxLength={8}
          placeholder="e.g. 998313"
          aria-label="Add a SAC code"
          className="ctl num"
        />
        <button type="button" onClick={add} disabled={!entry.trim()} className="btn-quiet">
          <Plus size={14} /> Add
        </button>
      </div>
      <Note>
        4, 6 or 8 digits. {original.length > 0 && `Saved: ${original.join(", ")}.`}
      </Note>
    </div>
  );
}

/* ── Files ────────────────────────────────────────────────────────────────── */

function FilesSection({
  entityId,
  files,
  canManage,
  onChanged,
}: {
  entityId: string;
  files: BillingEntityFileView[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const logo = files.find((f) => f.kind === "logo") ?? null;
  const signature = files.find((f) => f.kind === "signature") ?? null;
  const documents = files.filter((f) => f.kind === "document");

  return (
    <Stack>
      <Panes>
        <SingleFilePane
          entityId={entityId}
          kind="logo"
          file={logo}
          canManage={canManage}
          onChanged={onChanged}
          hint="PNG, JPEG or WebP. Printed on the invoice masthead."
        />
        <SingleFilePane
          entityId={entityId}
          kind="signature"
          file={signature}
          canManage={canManage}
          onChanged={onChanged}
          hint="PNG, JPEG or WebP. A transparent PNG sits best on paper."
        />
      </Panes>

      <section className="glass px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="label">Billing Documents</h3>
          {canManage && (
            <FilePicker entityId={entityId} kind="document" onChanged={onChanged} label="Add document" />
          )}
        </div>

        {documents.length === 0 ? (
          <Empty>No documents attached.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Uploaded</th>
                  <th>By</th>
                  {canManage && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {documents.map((f) => (
                  <tr key={f.id}>
                    <td className="strong">
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {f.fileName}
                        </a>
                      ) : (
                        f.fileName
                      )}
                    </td>
                    <td>{prettyType(f.mimeType)}</td>
                    <td className="num">{fmtDate(f.uploadedAt)}</td>
                    <td>{f.uploadedByName ?? "—"}</td>
                    {canManage && (
                      <td>
                        <RemoveFileButton fileId={f.id} name={f.fileName} onChanged={onChanged} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!canManage && (
          <Note>
            You can see these files but not change them &mdash; uploading,
            replacing and removing need File Manage, which is granted separately
            from entity editing.
          </Note>
        )}
      </section>
    </Stack>
  );
}

/** The logo and the signature: one file each, so Upload becomes Replace. */
function SingleFilePane({
  entityId,
  kind,
  file,
  canManage,
  onChanged,
  hint,
}: {
  entityId: string;
  kind: EntityFileKind;
  file: BillingEntityFileView | null;
  canManage: boolean;
  onChanged: () => Promise<void>;
  hint: string;
}) {
  return (
    <Pane title={ENTITY_FILE_KIND_LABELS[kind]}>
      {file ? (
        <div className="flex flex-col gap-3">
          {file.url ? (
            <a href={file.url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.url}
                alt={ENTITY_FILE_KIND_LABELS[kind]}
                className="max-h-[120px] w-auto rounded-[10px] bg-white/70 p-2"
                style={{ objectFit: "contain" }}
              />
            </a>
          ) : (
            <Empty>Stored, but the preview could not be loaded.</Empty>
          )}
          <div className="quiet text-[12px] leading-relaxed">
            <div className="strong" style={{ color: "var(--ink)" }}>
              {file.fileName}
            </div>
            {prettyType(file.mimeType)} · {fmtDate(file.uploadedAt)}
            {file.uploadedByName ? ` · ${file.uploadedByName}` : ""}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <FilePicker entityId={entityId} kind={kind} onChanged={onChanged} label="Replace" />
              <RemoveFileButton fileId={file.id} name={file.fileName} onChanged={onChanged} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Empty>Not uploaded.</Empty>
          {canManage && (
            <FilePicker entityId={entityId} kind={kind} onChanged={onChanged} label="Upload" />
          )}
        </div>
      )}
      <Note>{hint}</Note>
    </Pane>
  );
}

/**
 * A file input dressed as a button.
 *
 * The native input is kept in the DOM and clicked through a ref rather than
 * rebuilt on demand, so the browser's own file dialog and its accessibility
 * behaviour are untouched.
 */
function FilePicker({
  entityId,
  kind,
  onChanged,
  label,
}: {
  entityId: string;
  kind: EntityFileKind;
  onChanged: () => Promise<void>;
  label: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately, so picking the same file twice in a row still fires.
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    const form = new FormData();
    form.set("entityId", entityId);
    form.set("kind", kind);
    form.set("file", file);
    const res = await uploadBillingEntityFile(form);
    setBusy(false);

    if (!res.ok) {
      fireToast({ message: res.error });
      return;
    }
    fireToast({ message: `${file.name} uploaded.` });
    await onChanged();
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        hidden
        accept={kind === "document" ? undefined : "image/png,image/jpeg,image/webp"}
        onChange={pick}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="btn-quiet"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {busy ? "Uploading…" : label}
      </button>
    </>
  );
}

function RemoveFileButton({
  fileId,
  name,
  onChanged,
}: {
  fileId: string;
  name: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!window.confirm(`Remove “${name}”? The stored file is deleted.`)) return;
    setBusy(true);
    const res = await removeBillingEntityFile(fileId);
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error });
      return;
    }
    fireToast({ message: "File removed." });
    await onChanged();
  }

  return (
    <button type="button" onClick={remove} disabled={busy} className="btn-quiet">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      Remove
    </button>
  );
}

/* ── Delete ───────────────────────────────────────────────────────────────── */

/**
 * THE STRONG CONFIRMATION.
 *
 * It names the entity, states exactly what is destroyed, and requires the name
 * to be typed — which the server also checks, so the deliberateness is a
 * property of the request rather than of this dialog.
 *
 * It says plainly that billing records reference the entity and that deleting
 * it does not remove them. The brief is explicit that invoice references must
 * NOT block the deletion, so this warns instead of refusing. It also names the
 * consequence the database will apply silently: employees assigned to this
 * entity for payroll have that assignment cleared, because the foreign key is
 * ON DELETE SET NULL and nothing will stop it.
 */
function DeleteConfirm({
  entityId,
  onCancel,
  onDeleted,
}: {
  entityId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = React.useState<{
    name: string;
    employeeCount: number;
    fileCount: number;
    /**
     * The server's own answer, re-asked when the dialog opens.
     *
     * The Delete control only rendered because the page said so, but that
     * decision was made when the page was rendered and this dialog asks again
     * — so a permission that changed in between is reported before somebody
     * types an entity name, rather than after.
     */
    mayDelete: boolean;
  } | null>(null);
  const [typed, setTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await billingEntityDeleteImpact(entityId);
      if (!alive) return;
      if (res.ok)
        setImpact({
          name: res.name,
          employeeCount: res.employeeCount,
          fileCount: res.fileCount,
          mayDelete: res.mayDelete,
        });
      else setError(res.error);
    })();
    return () => {
      alive = false;
    };
  }, [entityId]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /**
   * Ready to delete: the server said this viewer may, AND the typed name
   * matches. Both halves, because the control rendering is not the permission —
   * the page decided that when it rendered, and `billingEntityDeleteImpact`
   * re-asks now.
   */
  const matches =
    impact != null &&
    impact.mayDelete &&
    typed.replace(/\s+/g, " ").trim().toLowerCase() === impact.name.toLowerCase();

  async function confirm() {
    if (!impact || !matches) return;
    setBusy(true);
    setError(null);
    const res = await deleteBillingEntity(entityId, typed);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDeleted();
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete entity"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-2xl">
        <h2 className="font-serif text-xl text-[#0F172A]">Delete this entity?</h2>

        {!impact ? (
          <p className="mt-3 text-[14px] text-[#64748B]">{error ?? "Checking…"}</p>
        ) : (
          <>
            <p className="mt-2 text-[15px] text-[#0F172A]">
              <strong>{impact.name}</strong>
            </p>

            <ul className="mt-3 space-y-1.5 text-[13.5px] text-[#475569]">
              <li>
                The entity and all of its stored information are permanently
                removed — proprietor, address, GST and PAN, SAC codes and bank
                details.
              </li>
              {impact.fileCount > 0 && (
                <li>
                  <strong>
                    {impact.fileCount} file{impact.fileCount === 1 ? "" : "s"}
                  </strong>{" "}
                  — the logo, signature and documents — are deleted from storage.
                </li>
              )}
              <li>
                <strong>Existing billing records reference this entity.</strong>{" "}
                They are matched by entity name and are not deleted, but they
                will no longer resolve to a Billing Master record, so no invoice
                can be re-rendered from it.
              </li>
              {impact.employeeCount > 0 && (
                <li>
                  <strong>
                    {impact.employeeCount} employee
                    {impact.employeeCount === 1 ? "" : "s"}
                  </strong>{" "}
                  are paid through this entity for payroll. Their entity
                  assignment will be cleared.
                </li>
              )}
              <li>
                The change history is kept, so what past invoices were issued
                under can still be read back.
              </li>
            </ul>

            {impact.mayDelete ? (
              <p className="mt-4 text-[13.5px] text-[#475569]">
                Deactivating the entity instead keeps all of this and removes it
                from new selections. To delete it, type{" "}
                <strong>{impact.name}</strong> below.
              </p>
            ) : (
              <p
                role="alert"
                className="mt-4 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13.5px] text-[#A80400]"
              >
                You are not authorized to delete a billing entity. Deactivating
                it instead keeps every record and removes it from new selections.
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="mt-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}

            {impact.mayDelete && (
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label="Type the entity name to confirm"
                placeholder={impact.name}
                className="mt-3 w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            )}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#CBD5E1] px-4 py-2.5 text-[14px] font-semibold text-ink-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            hidden={impact != null && !impact.mayDelete}
            disabled={!matches || busy}
            className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-45"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Deleting…" : "Delete entity"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PRIMITIVES — the Employee Master workspace's, so the two read identically.
   ════════════════════════════════════════════════════════════════════════════ */

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 pb-2">{children}</div>;
}

/** Panes rebalance instead of orphaning — `auto-fit` with a 300px floor. */
function Panes({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}
    >
      {children}
    </div>
  );
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass px-5 py-4">
      <h3 className="label mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 min-[520px]:grid-cols-2">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="label mb-1.5 block">{label}</span>
      {children}
    </div>
  );
}

function Readout({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`readout ${className}`}>{children}</div>;
}

/**
 * A text field that is the SAME element whether or not it is editable.
 *
 * `readOnly` rather than swapping in a different component, so the layout does
 * not shift between a viewer's screen and an editor's and the value is
 * selectable and copyable either way — which is most of what somebody with view
 * access came to do with a GST number.
 */
function Text({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <Field label={label}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        aria-readonly={readOnly}
        className="ctl"
        style={readOnly ? { opacity: 0.85, cursor: "default" } : undefined}
      />
    </Field>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="quiet mt-3 text-[12px] leading-relaxed">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="quiet rounded-[12px] border border-dashed px-3 py-5 text-center text-[12.5px]"
      style={{ borderColor: "rgba(10,15,34,0.16)" }}
    >
      {children}
    </div>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

/* The app-wide DD-MMM-YYYY, not a second opinion. This used to emit
   "28 Aug 2026" via toLocaleDateString. */
function fmtDate(d: Date): string {
  return formatDate(d);
}

/** A readable file type, from the MIME type the upload recorded. */
function prettyType(mime: string | null): string {
  if (!mime) return "File";
  const map: Record<string, string> = {
    "image/png": "PNG image",
    "image/jpeg": "JPEG image",
    "image/webp": "WebP image",
    "application/pdf": "PDF",
    "application/msword": "Word document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
    "application/vnd.ms-excel": "Excel sheet",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel sheet",
    "text/csv": "CSV",
    "text/plain": "Text",
  };
  return map[mime] ?? mime;
}
