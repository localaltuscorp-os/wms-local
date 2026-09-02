"use client";

import * as React from "react";
import {
  Loader2,
  ShieldAlert,
  Type,
  AlignLeft,
  CalendarDays,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  List,
  Pilcrow,
  Heading,
  Lock,
  History,
  Users2,
  UploadCloud,
  KeyRound,
  CheckCircle2,
  X,
  Blocks,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import {
  loadPolicyEditor,
  publishPolicy,
  setAdminPinAction,
  adminPinStatus,
} from "@/app/(app)/hr/policy-cms-actions";
import type { PolicyEditorData } from "@/app/(app)/hr/policy-cms-actions-types";
import { PolicyDocument } from "@/components/hr/policies/policy-document";
import { getPolicy } from "@/lib/hr/policies/registry";
import { declaration, type PolicyDoc, type PolicyNode, type PolicySection } from "@/lib/hr/policies/types";
import { DEFAULT_ADDRESS_LINE, type EntityId } from "@/lib/hr/entities";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/** Node kinds this editor renders as read-only "preserved" blocks. */
const ADVANCED_KINDS = new Set<PolicyNode["kind"]>(["table", "committee", "workflow", "legend"]);
const isAdvanced = (n: PolicyNode) => ADVANCED_KINDS.has(n.kind);

const ADVANCED_LABEL: Record<string, string> = {
  table: "Table",
  committee: "Committee roster",
  workflow: "Workflow",
  legend: "Legend / key",
};

/** Immutably swap items i and i+dir; returns the same array when out of range. */
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}

type Phase = "loading" | "error" | "ready";

/**
 * Admin Policy-CMS editor. Loads the current published version, edits the title,
 * summary, effective date and the body sections (paragraphs / bullet lists /
 * sub-headings — advanced blocks are preserved read-only), shows a live preview
 * on the letterhead, and publishes a new version behind the Admin PIN (which
 * requests a fresh re-sign from every active employee). Load-neutral: CSS only,
 * no framer-motion.
 */
export function PolicyEditor({ policyKey, isSuperAdmin }: { policyKey: string; isSuperAdmin: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [data, setData] = React.useState<PolicyEditorData | null>(null);

  // Editable fields
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const [sections, setSections] = React.useState<PolicySection[]>([]);

  // PIN + publish
  const [hasPin, setHasPin] = React.useState<boolean | null>(null);
  const [pinOpen, setPinOpen] = React.useState(false);
  const [pinValue, setPinValue] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [publishedMsg, setPublishedMsg] = React.useState<string | null>(null);

  // Super-admin: set-PIN inline control
  const [pinSetOpen, setPinSetOpen] = React.useState(false);
  const [newPin, setNewPin] = React.useState("");
  const [settingPin, setSettingPin] = React.useState(false);
  const [setPinError, setSetPinError] = React.useState<string | null>(null);

  const baselineRef = React.useRef<string>("");

  React.useEffect(() => {
    let alive = true;
    setPhase("loading");
    (async () => {
      const [ed, pin] = await Promise.all([loadPolicyEditor(policyKey), adminPinStatus()]);
      if (!alive) return;
      if (!ed.ok) {
        setErrorMsg(ed.error);
        setPhase("error");
        return;
      }
      setData(ed.data);
      setTitle(ed.data.title);
      setSummary(ed.data.summary);
      setEffectiveDate(ed.data.effectiveDate);
      const secs = (ed.data.sections as unknown as PolicySection[]) ?? [];
      setSections(secs);
      baselineRef.current = JSON.stringify({
        title: ed.data.title,
        summary: ed.data.summary,
        effectiveDate: ed.data.effectiveDate,
        sections: secs,
      });
      setHasPin(pin.ok ? pin.hasPin : false);
      setPhase("ready");
    })();
    return () => {
      alive = false;
    };
  }, [policyKey]);

  const dirty = React.useMemo(
    () => JSON.stringify({ title, summary, effectiveDate, sections }) !== baselineRef.current,
    [title, summary, effectiveDate, sections],
  );

  /* ── Preview doc: editable fields over the code registry's letterhead meta ── */
  const previewDoc = React.useMemo<PolicyDoc>(() => {
    const base = getPolicy(policyKey);
    const entityDefault = (base?.entityDefault ?? "altus-corp") as EntityId;
    return {
      key: policyKey,
      title: title || "Untitled policy",
      docCode: data?.docCode || base?.docCode || "",
      effectiveDate,
      version: String((data?.currentVersion ?? 1) + (dirty ? 1 : 0)),
      owner: base?.owner ?? "Human Resources",
      registeredOffice: base?.registeredOffice ?? DEFAULT_ADDRESS_LINE,
      hrEmail: base?.hrEmail ?? "hr@altuscorp.in",
      entityDefault,
      summary,
      sections,
      declaration: base?.declaration ?? declaration(),
    };
  }, [policyKey, title, summary, effectiveDate, sections, data, dirty]);

  /* ── Section / node mutations ─────────────────────────────────────────── */
  const mutateSection = React.useCallback((si: number, fn: (s: PolicySection) => PolicySection) => {
    setSections((prev) => prev.map((s, i) => (i === si ? fn(s) : s)));
  }, []);
  const mutateNodes = React.useCallback(
    (si: number, fn: (nodes: PolicyNode[]) => PolicyNode[]) => {
      mutateSection(si, (s) => ({ ...s, nodes: fn(s.nodes) }));
    },
    [mutateSection],
  );

  const addSection = () =>
    setSections((prev) => [...prev, { heading: "New section", nodes: [{ kind: "p", text: "" }] }]);
  const deleteSection = (si: number) => setSections((prev) => prev.filter((_, i) => i !== si));
  const moveSection = (si: number, dir: -1 | 1) => setSections((prev) => move(prev, si, dir));

  const addNode = (si: number, kind: "p" | "ul" | "sub") =>
    mutateNodes(si, (nodes) => [
      ...nodes,
      kind === "ul" ? { kind: "ul", items: [""] } : kind === "sub" ? { kind: "sub", text: "" } : { kind: "p", text: "" },
    ]);
  const deleteNode = (si: number, ni: number) => mutateNodes(si, (nodes) => nodes.filter((_, i) => i !== ni));
  const moveNode = (si: number, ni: number, dir: -1 | 1) => mutateNodes(si, (nodes) => move(nodes, ni, dir));

  /* ── Publish ──────────────────────────────────────────────────────────── */
  async function doPublish() {
    if (publishing) return;
    setPublishError(null);
    if (!title.trim()) {
      setPublishError("Title is required.");
      return;
    }
    setPublishing(true);
    const res = await publishPolicy({ key: policyKey, title, summary, effectiveDate, sections, pin: pinValue });
    setPublishing(false);
    if (!res.ok) {
      setPublishError(res.error);
      return;
    }
    setPinOpen(false);
    setPinValue("");
    setPublishedMsg(`Published v${res.version} — re-sign requested for all active employees.`);
    fireToast({ message: `Published version ${res.version}.`, type: "success" });
    // Refresh version list + compliance from the server; re-baseline (clears dirty).
    const ed = await loadPolicyEditor(policyKey);
    if (ed.ok) {
      setData(ed.data);
      setTitle(ed.data.title);
      setSummary(ed.data.summary);
      setEffectiveDate(ed.data.effectiveDate);
      const secs = (ed.data.sections as unknown as PolicySection[]) ?? [];
      setSections(secs);
      baselineRef.current = JSON.stringify({
        title: ed.data.title,
        summary: ed.data.summary,
        effectiveDate: ed.data.effectiveDate,
        sections: secs,
      });
    }
  }

  function openPublish() {
    setPublishError(null);
    setPublishedMsg(null);
    if (hasPin === false) {
      fireToast({ message: "No Admin PIN is set yet.", type: "error" });
      return;
    }
    setPinOpen(true);
  }

  async function doSetPin() {
    setSetPinError(null);
    if (!/^\d{4,8}$/.test(newPin)) {
      setSetPinError("PIN must be 4–8 digits.");
      return;
    }
    setSettingPin(true);
    const res = await setAdminPinAction(newPin);
    setSettingPin(false);
    if (!res.ok) {
      setSetPinError(res.error);
      return;
    }
    setHasPin(true);
    setPinSetOpen(false);
    setNewPin("");
    fireToast({ message: "Admin PIN set.", type: "success" });
  }

  /* ── Render states ────────────────────────────────────────────────────── */
  if (phase === "loading") {
    return (
      <div className="grid place-items-center rounded-2xl border border-hairline bg-white px-6 py-24">
        <Loader2 className="animate-spin" style={{ color: RED }} size={30} />
        <p className="mt-3 text-[14px] font-semibold text-ink-muted">Loading the policy…</p>
      </div>
    );
  }
  if (phase === "error" || !data) {
    const adminsOnly = /admin/i.test(errorMsg);
    return (
      <div className="mx-auto mt-6 grid max-w-[560px] place-items-center rounded-2xl border border-solid border-hairline-strong bg-white px-8 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "#E106001a", color: RED_DEEP }}>
          <ShieldAlert size={26} strokeWidth={2.1} />
        </span>
        <h2 className="mt-4 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20 }}>
          {adminsOnly ? "Admins only" : "Couldn’t open this policy"}
        </h2>
        <p className="mt-1.5 max-w-[46ch] text-[14px] font-medium text-ink-muted">{errorMsg}</p>
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>

      {/* ── Publish toolbar ──────────────────────────────────────────────── */}
      <div className="pce-bar">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip>{data.docCode || policyKey}</Chip>
          <Chip tone="red">v{data.currentVersion} live</Chip>
          <Chip tone={data.status === "published" ? "green" : "muted"}>{data.status}</Chip>
          {dirty && (
            <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, #d97706 14%, white)", color: "#b45309" }}>
              Unsaved edits
            </span>
          )}
        </div>
        <button
          type="button"
          className="pce-publish"
          onClick={openPublish}
          disabled={publishing}
        >
          {publishing ? <Loader2 size={16} className="pce-spin" /> : <UploadCloud size={16} strokeWidth={2.4} />}
          Publish new version
        </button>
      </div>

      {publishedMsg && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border px-4 py-3" style={{ borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 7%, white)" }}>
          <CheckCircle2 size={18} strokeWidth={2.4} style={{ color: "#15803d" }} className="mt-0.5 shrink-0" />
          <p className="text-[13.5px] font-semibold text-ink-strong">{publishedMsg}</p>
        </div>
      )}

      {hasPin === false && (
        <PinNotice isSuperAdmin={isSuperAdmin} onOpenSet={() => { setSetPinError(null); setPinSetOpen(true); }} />
      )}

      {/* ── Two-column: editor + live preview ────────────────────────────── */}
      <div className="pce-grid">
        <div className="pce-left">
          {/* Identity fields */}
          <Card icon={<Type size={18} />} title="Policy Identity" sub="Shown at the top of the document and on the card.">
            <Field label="Title" icon={<Type size={13} strokeWidth={2.4} />}>
              <input className="pce-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Policy title" />
            </Field>
            <Field label="Summary" icon={<AlignLeft size={13} strokeWidth={2.4} />}>
              <textarea className="pce-input pce-area" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="A short intro shown under the title." />
            </Field>
            <Field label="Effective date" icon={<CalendarDays size={13} strokeWidth={2.4} />}>
              <input className="pce-input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} placeholder="e.g. 1 August 2026" />
            </Field>
          </Card>

          {/* Version history + compliance */}
          <Card icon={<History size={18} />} title="Versions & Compliance" sub="Each publish mints a new version and requests a fresh re-sign.">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <ComplianceDial signed={data.compliance.signed} total={data.compliance.total} />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  <Users2 size={13} strokeWidth={2.4} className="text-altus-red" /> Compliance
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Chip tone="green">{data.compliance.signed} signed</Chip>
                  <Chip tone="red">{data.compliance.pending} pending</Chip>
                  <Chip tone="muted">{data.compliance.total} total</Chip>
                </div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  <History size={13} strokeWidth={2.4} className="text-altus-red" /> Version history
                </div>
                {data.versions.length === 0 ? (
                  <p className="text-[13px] text-ink-subtle">No versions yet.</p>
                ) : (
                  <ul className="pce-versions">
                    {data.versions.map((v) => (
                      <li key={v.version} className={v.version === data.currentVersion ? "is-current" : ""}>
                        <span className="pce-vnum">v{v.version}</span>
                        <span className="min-w-0 flex-1 truncate">{v.title}</span>
                        <span className="pce-vdate">{formatDate(v.publishedAt)}</span>
                        {v.version === data.currentVersion && <span className="pce-vlive">live</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* Sections editor */}
          <Card icon={<Blocks size={18} />} title="Body Sections" sub="Edit, reorder, add or remove sections and their content.">
            <div className="flex flex-col gap-4">
              {sections.length === 0 && (
                <p className="rounded-xl border border-solid border-hairline-strong bg-surface-soft px-4 py-6 text-center text-[13.5px] font-medium text-ink-subtle">
                  No sections yet — add the first one below.
                </p>
              )}
              {sections.map((section, si) => (
                <SectionEditor
                  key={si}
                  index={si}
                  count={sections.length}
                  section={section}
                  onHeading={(h) => mutateSection(si, (s) => ({ ...s, heading: h }))}
                  onMove={(dir) => moveSection(si, dir)}
                  onDelete={() => deleteSection(si)}
                  onAddNode={(kind) => addNode(si, kind)}
                  onNodeChange={(ni, node) => mutateNodes(si, (nodes) => nodes.map((n, i) => (i === ni ? node : n)))}
                  onNodeMove={(ni, dir) => moveNode(si, ni, dir)}
                  onNodeDelete={(ni) => deleteNode(si, ni)}
                />
              ))}
              <button type="button" className="pce-addsection" onClick={addSection}>
                <Plus size={16} strokeWidth={2.6} /> Add section
              </button>
            </div>
          </Card>
        </div>

        {/* Live preview */}
        <aside className="pce-preview">
          <div className="pce-preview-inner">
            <div className="pce-preview-head">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-ink-soft">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: RED }} /> Live preview
              </span>
            </div>
            <div className="pce-preview-stage">
              <PolicyDocument doc={previewDoc} />
            </div>
          </div>
        </aside>
      </div>

      {/* ── PIN modal ────────────────────────────────────────────────────── */}
      {pinOpen && (
        <Modal onClose={() => setPinOpen(false)} title="Confirm with Admin PIN" icon={<KeyRound size={18} />}>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            Publishing mints <strong className="text-ink-strong">version {data.currentVersion + 1}</strong> and marks every active
            employee <strong className="text-ink-strong">pending</strong> — a fresh re-sign request. Enter the secondary Admin PIN to continue.
          </p>
          <input
            className="pce-input pce-pin mt-4"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pinValue}
            maxLength={8}
            onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, "")); setPublishError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") void doPublish(); }}
            placeholder="••••"
            aria-label="Admin PIN"
          />
          {publishError && <p className="mt-2 text-[13px] font-semibold" style={{ color: RED_DEEP }}>{publishError}</p>}
          <div className="mt-5 flex justify-end gap-2.5">
            <button type="button" className="pce-btn-ghost" onClick={() => setPinOpen(false)} disabled={publishing}>Cancel</button>
            <button type="button" className="pce-publish" onClick={() => void doPublish()} disabled={publishing || pinValue.length < 4}>
              {publishing ? <Loader2 size={16} className="pce-spin" /> : <UploadCloud size={16} strokeWidth={2.4} />}
              Publish v{data.currentVersion + 1}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Set-PIN modal (super-admin) ──────────────────────────────────── */}
      {pinSetOpen && (
        <Modal onClose={() => setPinSetOpen(false)} title="Set the Admin PIN" icon={<Lock size={18} />}>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            The Admin PIN is the secondary confirmation required to publish any policy. Choose a 4–8 digit PIN.
          </p>
          <input
            className="pce-input pce-pin mt-4"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={newPin}
            maxLength={8}
            onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, "")); setSetPinError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") void doSetPin(); }}
            placeholder="••••"
            aria-label="New Admin PIN"
          />
          {setPinError && <p className="mt-2 text-[13px] font-semibold" style={{ color: RED_DEEP }}>{setPinError}</p>}
          <div className="mt-5 flex justify-end gap-2.5">
            <button type="button" className="pce-btn-ghost" onClick={() => setPinSetOpen(false)} disabled={settingPin}>Cancel</button>
            <button type="button" className="pce-publish" onClick={() => void doSetPin()} disabled={settingPin || newPin.length < 4}>
              {settingPin ? <Loader2 size={16} className="pce-spin" /> : <Lock size={16} strokeWidth={2.4} />}
              Set PIN
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Section editor                                                       */
/* ------------------------------------------------------------------ */

function SectionEditor({
  index,
  count,
  section,
  onHeading,
  onMove,
  onDelete,
  onAddNode,
  onNodeChange,
  onNodeMove,
  onNodeDelete,
}: {
  index: number;
  count: number;
  section: PolicySection;
  onHeading: (h: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddNode: (kind: "p" | "ul" | "sub") => void;
  onNodeChange: (ni: number, node: PolicyNode) => void;
  onNodeMove: (ni: number, dir: -1 | 1) => void;
  onNodeDelete: (ni: number) => void;
}) {
  return (
    <div className="pce-section">
      <div className="pce-section-head">
        <span className="pce-section-num">{index + 1}</span>
        <input
          className="pce-input pce-heading"
          value={section.heading}
          onChange={(e) => onHeading(e.target.value)}
          placeholder="Section heading"
          aria-label={`Section ${index + 1} heading`}
        />
        <div className="pce-tools">
          <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp size={15} strokeWidth={2.6} /></IconBtn>
          <IconBtn label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><ChevronDown size={15} strokeWidth={2.6} /></IconBtn>
          <IconBtn label="Delete section" danger onClick={onDelete}><Trash2 size={15} strokeWidth={2.4} /></IconBtn>
        </div>
      </div>

      <div className="pce-nodes">
        {section.nodes.map((node, ni) => (
          <NodeEditor
            key={ni}
            node={node}
            index={ni}
            count={section.nodes.length}
            onChange={(n) => onNodeChange(ni, n)}
            onMove={(dir) => onNodeMove(ni, dir)}
            onDelete={() => onNodeDelete(ni)}
          />
        ))}
      </div>

      <div className="pce-addnode">
        <span className="pce-addnode-label">Add</span>
        <button type="button" className="pce-chipbtn" onClick={() => onAddNode("p")}><Pilcrow size={13} strokeWidth={2.4} /> Paragraph</button>
        <button type="button" className="pce-chipbtn" onClick={() => onAddNode("ul")}><List size={13} strokeWidth={2.4} /> Bullet List</button>
        <button type="button" className="pce-chipbtn" onClick={() => onAddNode("sub")}><Heading size={13} strokeWidth={2.4} /> Sub-heading</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Node editor                                                          */
/* ------------------------------------------------------------------ */

function NodeEditor({
  node,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: {
  node: PolicyNode;
  index: number;
  count: number;
  onChange: (n: PolicyNode) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const advanced = isAdvanced(node);

  return (
    <div className={`pce-node${advanced ? " is-advanced" : ""}`}>
      <div className="pce-node-rail">
        <GripVertical size={14} className="text-ink-soft" aria-hidden />
        <IconBtn label="Move up" small disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp size={14} strokeWidth={2.6} /></IconBtn>
        <IconBtn label="Move down" small disabled={index === count - 1} onClick={() => onMove(1)}><ChevronDown size={14} strokeWidth={2.6} /></IconBtn>
        {!advanced && (
          <IconBtn label="Delete block" small danger onClick={onDelete}><Trash2 size={14} strokeWidth={2.4} /></IconBtn>
        )}
      </div>

      <div className="pce-node-body">
        {node.kind === "p" && (
          <>
            <NodeTag>Paragraph</NodeTag>
            <input
              className="pce-input pce-mini mb-2"
              value={node.lead ?? ""}
              onChange={(e) => onChange({ ...node, lead: e.target.value || undefined })}
              placeholder="Bold lead-in (optional)"
              aria-label="Paragraph lead-in"
            />
            <textarea
              className="pce-input pce-area"
              value={node.text}
              onChange={(e) => onChange({ ...node, text: e.target.value })}
              rows={3}
              placeholder="Paragraph text"
              aria-label="Paragraph text"
            />
          </>
        )}

        {node.kind === "sub" && (
          <>
            <NodeTag>Sub-heading</NodeTag>
            <input
              className="pce-input"
              value={node.text}
              onChange={(e) => onChange({ ...node, text: e.target.value })}
              placeholder="Sub-heading"
              aria-label="Sub-heading"
            />
          </>
        )}

        {node.kind === "ul" && (
          <>
            <NodeTag>Bullet list</NodeTag>
            <div className="flex flex-col gap-2">
              {node.items.map((item, ii) => (
                <div key={ii} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RED }} />
                  <input
                    className="pce-input pce-mini"
                    value={item}
                    onChange={(e) => onChange({ ...node, items: node.items.map((x, i) => (i === ii ? e.target.value : x)) })}
                    placeholder={`Bullet ${ii + 1}`}
                    aria-label={`Bullet ${ii + 1}`}
                  />
                  <IconBtn label="Remove bullet" small danger disabled={node.items.length <= 1} onClick={() => onChange({ ...node, items: node.items.filter((_, i) => i !== ii) })}>
                    <X size={14} strokeWidth={2.6} />
                  </IconBtn>
                </div>
              ))}
              <button type="button" className="pce-chipbtn self-start" onClick={() => onChange({ ...node, items: [...node.items, ""] })}>
                <Plus size={13} strokeWidth={2.6} /> Add bullet
              </button>
            </div>
          </>
        )}

        {advanced && (
          <div className="pce-advanced">
            <span className="pce-advanced-badge"><Lock size={12} strokeWidth={2.6} /> Advanced block — preserved</span>
            <p className="pce-advanced-note">
              {ADVANCED_LABEL[node.kind] ?? node.kind} — kept exactly as-is and republished unchanged. Reorder it above; edit it in code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                                */
/* ------------------------------------------------------------------ */

function NodeTag({ children }: { children: React.ReactNode }) {
  return <span className="pce-nodetag">{children}</span>;
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
  small,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`pce-iconbtn${small ? " is-small" : ""}${danger ? " is-danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "red" | "green" }) {
  const style =
    tone === "red"
      ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }
      : tone === "green"
        ? { background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }
        : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold capitalize" style={style}>
      {children}
    </span>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="mb-3 block last:mb-0">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        <span className="text-altus-red">{icon}</span> {label}
      </span>
      {children}
    </label>
  );
}

function Card({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] font-medium leading-snug text-ink-muted">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ComplianceDial({ signed, total }: { signed: number; total: number }) {
  const pct = total > 0 ? signed / total : 0;
  const allDone = total > 0 && signed === total;
  const R = 42;
  const C = 2 * Math.PI * R;
  const dash = C * pct;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: 108, height: 108 }}>
      <svg width={108} height={108} viewBox="0 0 108 108">
        <circle cx={54} cy={54} r={R} fill="none" stroke="var(--color-hairline)" strokeWidth={9} />
        <circle
          cx={54} cy={54} r={R} fill="none"
          stroke={allDone ? "#15803d" : RED}
          strokeWidth={9} strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          transform="rotate(-90 54 54)"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="text-[24px] font-black leading-none tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
          {signed}
          <span className="text-[14px] font-bold text-ink-subtle">/{total}</span>
        </span>
        <span className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Signed</span>
      </div>
    </div>
  );
}

function PinNotice({ isSuperAdmin, onOpenSet }: { isSuperAdmin: boolean; onOpenSet: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3.5" style={{ borderColor: "color-mix(in srgb, #d97706 34%, white)", background: "color-mix(in srgb, #d97706 8%, white)" }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, #d97706 18%, white)", color: "#b45309" }}>
        <Lock size={17} strokeWidth={2.3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-ink-strong">No Admin PIN is set yet</p>
        <p className="text-[12.5px] font-medium text-ink-muted">
          {isSuperAdmin
            ? "Set the secondary Admin PIN before you can publish any policy."
            : "A super-admin must set the secondary Admin PIN before policies can be published."}
        </p>
      </div>
      {isSuperAdmin && (
        <button type="button" className="pce-btn-ghost shrink-0" onClick={onOpenSet}>
          <KeyRound size={14} strokeWidth={2.4} /> Set Admin PIN
        </button>
      )}
    </div>
  );
}

function Modal({ children, title, icon, onClose }: { children: React.ReactNode; title: string; icon: React.ReactNode; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pce-overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className="pce-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
            {icon}
          </span>
          <h3 className="text-[16px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{title}</h3>
          <button type="button" className="pce-iconbtn ml-auto" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={2.6} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const CSS = `
.pce-bar{
  position:sticky;top:64px;z-index:20;
  display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 16px;
  background:color-mix(in srgb, #ffffff 88%, transparent);
  backdrop-filter:blur(8px);
  border:1px solid var(--color-hairline, #e2e8f0);border-radius:16px;
}
.pce-publish{
  display:inline-flex;align-items:center;gap:8px;
  padding:10px 18px;border-radius:12px;border:1px solid transparent;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13.5px;font-weight:800;color:#fff;cursor:pointer;
  background:linear-gradient(135deg, ${RED}, ${RED_DEEP});
  box-shadow:0 12px 26px -14px rgba(168,4,0,.85);
  transition:transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.pce-publish:not(:disabled):hover{transform:translateY(-1px);}
.pce-publish:disabled{opacity:.55;cursor:default;}
.pce-btn-ghost{
  display:inline-flex;align-items:center;gap:7px;
  padding:9px 15px;border-radius:11px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13px;font-weight:700;cursor:pointer;
  background:#fff;color:var(--color-ink-strong, #0f172a);
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  transition:transform .12s ease, border-color .12s ease;
}
.pce-btn-ghost:not(:disabled):hover{transform:translateY(-1px);border-color:var(--color-ink-muted, #94a3b8);}
.pce-btn-ghost:disabled{opacity:.55;cursor:default;}
.pce-spin{animation:pce-spin 1s linear infinite;}
@keyframes pce-spin{to{transform:rotate(360deg);}}

.pce-grid{display:grid;grid-template-columns:1fr;gap:18px;margin-top:18px;}
@media (min-width:1100px){ .pce-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;} }
.pce-left{display:flex;flex-direction:column;gap:16px;min-width:0;}

.pce-preview{min-width:0;}
.pce-preview-inner{position:sticky;top:132px;}
.pce-preview-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:0 2px 10px;
}
.pce-preview-stage{
  max-height:calc(100dvh - 168px);overflow:auto;
  border-radius:18px;border:1px solid var(--color-hairline, #e2e8f0);
  background:#faf9fb;padding:16px;
  box-shadow:inset 0 2px 24px -18px rgba(24,24,27,.5);
}
@media (max-width:1099px){ .pce-preview-inner{position:static;} .pce-preview-stage{max-height:none;} }

/* Inputs */
.pce-input{
  width:100%;box-sizing:border-box;
  padding:9px 12px;border-radius:10px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:14px;font-weight:600;color:var(--color-ink-strong, #0f172a);
  background:#fff;border:1px solid var(--color-hairline-strong, #cbd5e1);
  transition:border-color .12s ease, box-shadow .12s ease;
}
.pce-input::placeholder{color:var(--color-ink-subtle, #94a3b8);font-weight:500;}
.pce-input:focus{outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.14);}
.pce-area{resize:vertical;line-height:1.6;min-height:64px;}
.pce-mini{font-size:13.5px;padding:7px 11px;}
.pce-heading{font-weight:800;font-size:15px;}
.pce-pin{letter-spacing:.4em;font-size:20px;font-weight:800;text-align:center;padding:12px;}

/* Section */
.pce-section{
  border:1px solid var(--color-hairline, #e2e8f0);border-radius:16px;
  background:linear-gradient(180deg,#fff, var(--color-surface-soft, #f8fafc));
  padding:14px;
}
.pce-section-head{display:flex;align-items:center;gap:10px;}
.pce-section-num{
  flex:0 0 auto;width:26px;height:26px;border-radius:8px;
  display:inline-flex;align-items:center;justify-content:center;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:12px;font-weight:900;color:#fff;
  background:linear-gradient(135deg, ${RED}, ${RED_DEEP});
}
.pce-tools{display:flex;gap:4px;margin-left:auto;flex:0 0 auto;}
.pce-nodes{display:flex;flex-direction:column;gap:10px;margin:12px 0;}

.pce-node{
  display:flex;gap:10px;
  border:1px solid var(--color-hairline, #e2e8f0);border-radius:12px;
  background:#fff;padding:10px 12px;
}
.pce-node.is-advanced{background:var(--color-surface-soft, #f8fafc);border-style:dashed;}
.pce-node-rail{display:flex;flex-direction:column;align-items:center;gap:4px;flex:0 0 auto;padding-top:2px;}
.pce-node-body{min-width:0;flex:1;}
.pce-nodetag{
  display:inline-block;margin-bottom:6px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--color-ink-soft, #94a3b8);
}
.pce-advanced{display:flex;flex-direction:column;gap:5px;}
.pce-advanced-badge{
  display:inline-flex;align-items:center;gap:6px;align-self:flex-start;
  padding:4px 9px;border-radius:9999px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11.5px;font-weight:800;color:${RED_DEEP};
  background:color-mix(in srgb, ${RED} 10%, white);
}
.pce-advanced-note{font-size:12.5px;line-height:1.5;font-weight:500;color:var(--color-ink-muted, #64748b);margin:0;}

.pce-addnode{display:flex;flex-wrap:wrap;align-items:center;gap:7px;}
.pce-addnode-label{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--color-ink-soft, #94a3b8);
}
.pce-chipbtn{
  display:inline-flex;align-items:center;gap:5px;
  padding:5px 11px;border-radius:9999px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:12.5px;font-weight:700;cursor:pointer;
  color:var(--color-ink-strong, #0f172a);background:#fff;
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  transition:border-color .12s ease, color .12s ease, transform .12s ease;
}
.pce-chipbtn:hover{border-color:${RED};color:${RED_DEEP};transform:translateY(-1px);}

.pce-addsection{
  display:inline-flex;align-items:center;justify-content:center;gap:7px;
  padding:11px 16px;border-radius:12px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13.5px;font-weight:800;cursor:pointer;
  color:${RED_DEEP};background:color-mix(in srgb, ${RED} 6%, white);
  border:1.4px dashed color-mix(in srgb, ${RED} 40%, white);
  transition:background .12s ease, transform .12s ease;
}
.pce-addsection:hover{background:color-mix(in srgb, ${RED} 11%, white);transform:translateY(-1px);}

.pce-iconbtn{
  display:inline-grid;place-items:center;
  width:28px;height:28px;border-radius:8px;cursor:pointer;
  color:var(--color-ink-muted, #64748b);background:#fff;
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  transition:border-color .12s ease, color .12s ease, background .12s ease;
}
.pce-iconbtn.is-small{width:24px;height:24px;border-radius:7px;}
.pce-iconbtn:not(:disabled):hover{border-color:${RED};color:${RED_DEEP};}
.pce-iconbtn.is-danger:not(:disabled):hover{border-color:${RED};color:#fff;background:${RED};}
.pce-iconbtn:disabled{opacity:.4;cursor:default;}

.pce-versions{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;}
.pce-versions li{
  display:flex;align-items:center;gap:9px;
  padding:7px 10px;border-radius:10px;
  font-size:13px;font-weight:600;color:var(--color-ink-strong, #0f172a);
  background:var(--color-surface-soft, #f8fafc);
  border:1px solid var(--color-hairline, #e2e8f0);
}
.pce-versions li.is-current{border-color:color-mix(in srgb, ${RED} 34%, white);background:color-mix(in srgb, ${RED} 5%, white);}
.pce-vnum{
  flex:0 0 auto;font-family:var(--font-display, system-ui, sans-serif);
  font-weight:900;color:${RED_DEEP};font-size:12.5px;
}
.pce-vdate{flex:0 0 auto;font-size:11.5px;font-weight:700;color:var(--color-ink-subtle, #94a3b8);}
.pce-vlive{
  flex:0 0 auto;padding:2px 8px;border-radius:9999px;
  font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#fff;
  background:linear-gradient(135deg, ${RED}, ${RED_DEEP});
}

/* Modal */
.pce-overlay{
  position:fixed;inset:0;z-index:60;
  display:grid;place-items:center;padding:20px;
  background:rgba(15,23,42,.5);backdrop-filter:blur(3px);
  animation:pce-fade .15s ease both;
}
.pce-modal{
  width:100%;max-width:420px;
  background:#fff;border-radius:20px;padding:22px;
  border:1px solid var(--color-hairline, #e2e8f0);
  box-shadow:0 40px 80px -32px rgba(15,23,42,.6);
  animation:pce-pop .18s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes pce-fade{from{opacity:0;}to{opacity:1;}}
@keyframes pce-pop{from{opacity:0;transform:translateY(10px) scale(.98);}to{opacity:1;transform:translateY(0) scale(1);}}
@media (prefers-reduced-motion: reduce){
  .pce-overlay,.pce-modal,.pce-spin{animation:none !important;}
}
`;

export default PolicyEditor;
