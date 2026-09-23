"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowRight, Loader2, X } from "lucide-react";
import type { EmployeeMasterDetail, MasterOptions } from "@/lib/employees/master-query";
import { editEmployee } from "@/app/(admin)/admin/employees/actions";
import {
  applyCodeMove,
  fetchEmployeeDetail,
  saveCtcBreakup,
  savePayrollScalars,
  syncEmployeeCode,
  type CodeSyncOutcome,
} from "@/app/(admin)/admin/employee-master/actions";
import { CodePanel } from "./code-panel";
import {
  EMPLOYEE_KIND_OPTIONS,
  type EmployeeTypeCode,
} from "@/lib/employees/employee-type";
import {
  asWorkerType,
  payBasisFor,
  EMPLOYEE_TYPE_OPTIONS,
  WORKER_TYPE_LABELS,
  type WorkerType,
} from "@/lib/attendance/worker-type";
import { formatDate } from "@/lib/format";
import "./aura.css";

/**
 * THE EMPLOYEE MASTER WORKSPACE.
 *
 * A large overlay — 94% of the viewport in both directions (§5) — not a modal.
 * The distinction is the point: this is where an employee record is READ AND
 * WRITTEN, with no separate edit mode (§4), so it needs room for a real grid
 * rather than a column of stacked fields.
 *
 * ── AURA ───────────────────────────────────────────────────────────────────
 * Presentation follows the Aura liquid-glass language (see ./aura.css, which
 * carries every token and is scoped to `.aura` so none of it reaches the rest
 * of the app). Three layers: a drifting colour field, grain, then glass panes.
 * Fields are grouped INTO those panes rather than poured into one flat grid,
 * because Aura separates with whitespace instead of rules — a pane per subject
 * is what makes that legible.
 *
 * Nothing about the data flow changed in that redesign. Same draft, same sparse
 * patch, same actions, same guards.
 *
 * ── HOW SAVING WORKS, AND WHY IT IS SPARSE ─────────────────────────────────
 * Every field starts from the loaded record and is tracked as a DIRTY SET. Save
 * sends only what changed. That is not an optimisation — it is the same safety
 * property the bulk editor has: a field this workspace does not render, or
 * renders but the admin never touched, must arrive at the server as `undefined`
 * so the existing action leaves it alone. Sending the whole form would let a
 * section that failed to load blank the fields it was supposed to show.
 *
 * ── IT WRITES THROUGH THE EXISTING ACTIONS ─────────────────────────────────
 * Identity, entity, designation, function, dates and the two mails all go to
 * `editEmployee` — the action the Employees screen has always used, now with
 * the Employee Master keys added to its schema. Only CTC and the payroll
 * scalars have actions of their own, because they had none. There is one write
 * path per fact.
 *
 * ── CLOSING ────────────────────────────────────────────────────────────────
 * ESC and X close. An outside click does NOT (§5) — half an hour of typing is
 * not something a stray click should discard, and the app has no global
 * click-outside convention that would make it expected. Unsaved changes prompt
 * before closing either way.
 */

/**
 * FIVE SECTIONS.
 *
 * `employment` and `family` are gone, and both removals were merges rather
 * than deletions of anything:
 *
 *   · EMPLOYMENT restated Overview. Its Role pane (type, designation,
 *     entity), its Reporting pane (manager, function, team lead, train pass)
 *     and its Dates pane were all already on Overview — two screens for one
 *     set of fields, which is how a record comes to read differently
 *     depending on which tab you opened. Its one unique field, the daily task
 *     quota, moved to Work & Attendance where the rest of the attendance
 *     configuration lives.
 *
 *   · FAMILY folded into CONTACT DETAILS. Family members and emergency
 *     contacts answer the same question as the address block — "how do we
 *     reach this person, and who do we call" — and both come from the same
 *     onboarding submission.
 */
type SectionKey =
  | "overview" | "payroll" | "contact" | "documents" | "work" | "other";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "payroll", label: "Payroll" },
  { key: "contact", label: "Contact Details" },
  { key: "documents", label: "Documents" },
  { key: "work", label: "Work & Attendance" },
  // OTHER (0228) — the employee-level schedule settings. It sits after Work &
  // Attendance rather than inside it because that section is deliberately
  // READ-ONLY (§13: "this is the CONFIGURATION, not the record"), and these
  // five settings are written here. Folding editable controls into a section
  // whose whole contract is "look, don't touch" is how a screen stops being
  // trustworthy about which of its fields do something.
  { key: "other", label: "Other" },
];

/** The employee fields this workspace can patch, mirroring EditEmployeeSchema. */
interface Draft {
  name?: string;
  functionId?: string | null;
  shiftTypeId?: string | null;
  /**
   * The value the UI now labels SHIFT TYPE.
   *
   * It was read-only before, which is why it is only now in the draft. It is
   * editable because it is the one of the two overlapping fields that
   * actually carries data — but see the warning where it is rendered: it also
   * decides pay basis.
   */
  workerType?: WorkerType;
  payingEntityId?: string | null;
  designationId?: string | null;
  managerId?: string | null;
  isTeamLead?: boolean;
  trainPass?: boolean;
  joinedAt?: string | null;
  probationEnd?: string | null;
  /* 0244 — internship start (the END date is generated by the database, so
     there is deliberately no draft key for it) and the employee-type override,
     where `null` means "follow the designation". */
  internshipStart?: string | null;
  employeeType?: EmployeeTypeCode | null;
  lastWorkingDay?: string | null;
  officialEmail?: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  // ── Employee schedule settings (0228), the "Other" section ──────────────
  // They ride the SAME draft and the same `editEmployee` call as everything
  // else, which is what keeps one write path per fact. A key only appears here
  // once the admin actually changes it, so opening Other and closing it again
  // sends nothing.
  attendanceApplicable?: boolean;
  sat1Working?: boolean;
  sat2Working?: boolean;
  sat3Working?: boolean;
  sat4Working?: boolean;
  sat5Working?: boolean;
  /** Monday–Friday. The existing attendance columns, not a second pair. */
  attOfficialStart?: string | null;
  attOfficialEnd?: string | null;
  /** Saturday. Empty means "same as Monday–Friday". */
  satOfficialStart?: string | null;
  satOfficialEnd?: string | null;
  wfhFullTimeAllowed?: boolean;
  wfhPartTimeAllowed?: boolean;
}

export function EmployeeWorkspace({
  employeeId,
  options,
  canSeePay,
  canDelete,
  currentUserId,
  onClose,
}: {
  employeeId: string;
  options: MasterOptions;
  canSeePay: boolean;
  canDelete: boolean;
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<EmployeeMasterDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [section, setSection] = React.useState<SectionKey>("overview");
  const [draft, setDraft] = React.useState<Draft>({});
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);
  /** A proposed code move, awaiting a yes. Never applied on its own. */
  const [codeMove, setCodeMove] = React.useState<
    Extract<CodeSyncOutcome, { status: "needs_move" }> | null
  >(null);

  const dirty = Object.keys(draft).length > 0;

  // NO `setLoading(true)` here: `loading` already starts true, and the table
  // mounts this component with `key={employeeId}` so a different employee is a
  // fresh mount rather than a prop change. Resetting state synchronously inside
  // an effect is a cascading render for a case that cannot arise.
  React.useEffect(() => {
    let alive = true;
    fetchEmployeeDetail(employeeId)
      .then((d) => { if (alive) { setDetail(d); setLoading(false); } })
      .catch(() => { if (alive) { setLoading(false); setMessage({ tone: "err", text: "Could not load this employee." }); } });
    return () => { alive = false; };
  }, [employeeId]);

  /** ESC closes, and asks first when there is unsaved work. */
  const requestClose = React.useCallback(() => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  }, [dirty, onClose]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Only when nothing NESTED is open — a confirm inside the workspace owns
      // its own Escape, and closing the whole workspace out from under it would
      // discard the record along with the dialog.
      e.stopPropagation();
      requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  function set<K extends keyof Draft>(key: K, value: Draft[K], original: Draft[K]) {
    setDraft((prev) => {
      const next = { ...prev };
      // Returning a field to its loaded value REMOVES it from the patch, so a
      // change-and-change-back sends nothing at all.
      if (value === original) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function save() {
    if (!detail || !dirty) return;
    setSaving(true);
    setMessage(null);
    // Whether this save could change which code series they belong to. Read
    // BEFORE the draft is cleared.
    const touchedCode =
      "payingEntityId" in draft || "designationId" in draft;
    const res = await editEmployee(employeeId, draft);
    setSaving(false);
    if (!res.ok) {
      setMessage({ tone: "err", text: res.error ?? "Could not save." });
      return;
    }
    setDraft({});
    setMessage({ tone: "ok", text: "Saved." });

    /**
     * THE CODE FOLLOWS THE ENTITY — automatically, with one stop.
     *
     * Asked for only when the save actually touched the entity or designation,
     * so an unrelated edit does not go looking for code work to do.
     *
     * The server decides and reports back: it ISSUES a code outright for
     * somebody who has none, and merely PROPOSES a move for somebody who
     * already holds one — because issuing retires the old number permanently
     * and a retired number is never reissued. `setCodeMove` puts that proposal
     * in front of the administrator instead of acting on it.
     */
    if (touchedCode) {
      const sync = await syncEmployeeCode(employeeId);
      if (sync.ok && sync.data) {
        if (sync.data.status === "issued") {
          setMessage({ tone: "ok", text: `Saved — code ${sync.data.code} issued.` });
        } else if (sync.data.status === "needs_move") {
          setCodeMove(sync.data);
        } else if (sync.data.status === "no_prefix") {
          setMessage({
            tone: "ok",
            text: "Saved. That entity has no code letter assigned, so no code was issued.",
          });
        }
      }
    }

    const fresh = await fetchEmployeeDetail(employeeId);
    setDetail(fresh);
    router.refresh();
  }

  /** Accept the proposed move. Retires the old code permanently. */
  async function acceptCodeMove() {
    if (!codeMove) return;
    setSaving(true);
    const res = await applyCodeMove(employeeId);
    setSaving(false);
    setCodeMove(null);
    if (!res.ok) {
      setMessage({ tone: "err", text: res.error });
      return;
    }
    setMessage({ tone: "ok", text: `Code ${res.data?.code} issued.` });
    setDetail(await fetchEmployeeDetail(employeeId));
    router.refresh();
  }

  /**
   * HR RECORDS (§14) — close, then navigate, carrying the employee.
   *
   * NOT another tab reimplementing HR. The HR module keeps its own record and
   * this hands it the employee id so nobody has to search for the person they
   * were already looking at.
   */
  function openHrRecords() {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    onClose();
    router.push(`/dossier/${employeeId}` as Route);
  }

  /**
   * The sheen (§2) — a highlight that tracks the pointer across a clickable
   * pane. One delegated listener on the shell rather than a handler per pane,
   * and it writes CSS custom properties rather than setting state, so moving
   * the mouse never re-renders the form underneath.
   */
  function trackSheen(e: React.PointerEvent<HTMLDivElement>) {
    const pane = (e.target as HTMLElement).closest<HTMLElement>(".glass.interactive");
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    pane.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    pane.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  }

  const row = detail?.row;

/**
 * RENDERED INTO `document.body`, not in place.
 *
 * `position: fixed` is relative to the nearest ancestor with a `transform`,
 * `filter`, `perspective` or `contain` — and the admin shell has one. Left in
 * the tree, this overlay was laid out inside the content column: offset by the
 * sidebar, clipped at the bottom, and nowhere near the 94% of the VIEWPORT the
 * brief asks for (§5). A portal is the only reliable fix; widening the element
 * would just make a wrongly-positioned box bigger.
 *
 * Mounted behind a flag so the first client render matches the server's — the
 * server has no `document`, and calling `createPortal` during SSR throws.
 */
  const [mounted, setMounted] = React.useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);  // the SSR guard above

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-[3vh_3vw]"
      style={{ background: "rgba(8, 11, 26, 0.46)", backdropFilter: "blur(3px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Employee Master"
    >
      <div
        // 94% of the viewport, both axes (§5). `max-h`/`max-w` rather than fixed
        // so a small laptop gets the whole screen instead of an overlay taller
        // than its window.
        className="aura flex h-[94vh] w-[94vw] max-w-[1800px] flex-col overflow-hidden rounded-[20px]"
        style={{ boxShadow: "0 60px 140px -40px rgba(8,11,26,0.7), 0 0 0 1px rgba(255,255,255,0.4)" }}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={trackSheen}
      >
        {/* Layer 1 + 2 — the field the glass refracts, and the grain that makes
            it read as material rather than white plastic (§1). */}
        <div className="aura-field" aria-hidden>
          <div className="aura-blob b1" />
          <div className="aura-blob b2" />
          <div className="aura-blob b3" />
        </div>
        <div className="aura-grain" aria-hidden />

        {/* Layer 3 — everything below is glass over that. */}
        <header className="chrome-bar z-[2] flex shrink-0 items-center gap-4 px-6 py-4">
          {loading || !row ? (
            <div className="muted text-[14px]">Loading…</div>
          ) : (
            <>
              <div className="avatar" aria-hidden>
                {initials(row.name)}
                <span className="status" style={{ background: statusColour(row.status) }} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="display truncate text-[23px] leading-none">{row.name}</h2>
                  {row.employeeCode ? (
                    <span className="pill num">{row.employeeCode}</span>
                  ) : (
                    <span className="pill state idle">No code</span>
                  )}
                  {row.onProbation && <span className="pill state warn">Probation</span>}
                </div>
                <div className="quiet mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                  <span>{row.officeEmail}</span>
                  <span aria-hidden>·</span>
                  <span className="muted">
                    {[row.designationName, row.departmentName, row.entityName].filter(Boolean).join(" · ") || "No designation set"}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="flex shrink-0 items-center gap-2.5">
            {dirty && !message && (
              <span className="pill state warn">Unsaved</span>
            )}
            {message && (
              <span className={`pill state ${message.tone === "ok" ? "ok" : "hot"}`}>{message.text}</span>
            )}
            <button type="button" onClick={save} disabled={!dirty || saving} className="btn">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
            <button type="button" onClick={requestClose} aria-label="Close" className="icon-btn">
              <X size={17} />
            </button>
          </div>
        </header>

        {/* ── A PROPOSED CODE MOVE ───────────────────────────────────────────
            Shown, never applied, when a saved entity or designation change
            would put this person in a different code series.

            It asks because the move is irreversible in a way nothing else on
            this screen is: issuing the new code retires the old one, and a
            retired number is never reissued to anybody. Somebody who changed
            the Entity dropdown by accident gets to say no. */}
        {codeMove && (
          <div
            role="alert"
            className="z-[3] flex shrink-0 flex-wrap items-center gap-3 px-6 py-3"
            style={{
              background: "color-mix(in srgb, var(--accent) 9%, transparent)",
              borderTop: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
            }}
          >
            <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              This change moves them to the {codeMove.toPrefix} series.
            </span>
            <span className="quiet text-[12.5px]">
              {codeMove.from} would be retired <strong>permanently</strong> and{" "}
              {codeMove.proposedCode ?? `the next ${codeMove.toPrefix} number`} issued. No number is
              ever reused.
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCodeMove(null)}
                disabled={saving}
                className="btn-quiet"
              >
                Keep {codeMove.from}
              </button>
              <button type="button" onClick={acceptCodeMove} disabled={saving} className="btn">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Issue {codeMove.proposedCode ?? "a new code"}
              </button>
            </div>
          </div>
        )}

        {/* ── Two columns (§6) ──────────────────────────────────────────── */}
        <div className="z-[2] flex min-h-0 flex-1">
          <nav className="chrome-rail scroll w-[23%] min-w-[196px] max-w-[264px] shrink-0 overflow-y-auto px-3 py-4 max-md:hidden">
            {SECTIONS.map((s) => {
              if (s.key === "payroll" && !canSeePay) return null;
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

            {/* Separated action, not a section (§14). */}
            <div className="mt-5">
              <button type="button" onClick={openHrRecords} className="glass interactive block w-full px-4 py-3.5 text-left">
                <span className="display flex items-center gap-1.5 text-[12px] uppercase tracking-[0.09em]" style={{ color: "var(--accent)" }}>
                  HR Records <ArrowRight size={13} />
                </span>
                <span className="quiet mt-1 block text-[11.5px] leading-snug">
                  Complete HR profile, forms, letters and employee records
                </span>
              </button>
            </div>
          </nav>

          {/* Mobile section picker — the rail is hidden below md. */}
          <div className="md:hidden">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as SectionKey)}
              aria-label="Section"
              className="ctl m-3 w-auto"
            >
              {SECTIONS.filter((s) => s.key !== "payroll" || canSeePay).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <main className="scroll min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {loading && (
              <div className="muted flex h-40 items-center justify-center text-[13px]">
                <Loader2 size={16} className="mr-2 animate-spin" /> Loading employee…
              </div>
            )}
            {!loading && !detail && (
              <div className="muted py-10 text-center text-[13px]">
                This employee could not be loaded.
              </div>
            )}
            {!loading && detail && (
              <Section
                section={section}
                detail={detail}
                options={options}
                draft={draft}
                set={set}
                canSeePay={canSeePay}
                canDelete={canDelete}
                currentUserId={currentUserId}
                onRefresh={async () => setDetail(await fetchEmployeeDetail(employeeId))}
              />
            )}
          </main>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Header helpers ───────────────────────────────────────────────────────── */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase();
}

function statusColour(status: string): string {
  return status === "active" ? "var(--ok)" : status === "probation" ? "var(--warn)" : "#9098b4";
}

/** Whole months between a start date and today, for the tenure stat. */
function tenure(from: Date | string | null): { value: string; unit: string } {
  if (!from) return { value: "—", unit: "not recorded" };
  const start = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return { value: "—", unit: "not recorded" };
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return { value: "—", unit: "joins later" };
  if (months < 12) return { value: String(months), unit: months === 1 ? "month" : "months" };
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return { value: rest === 0 ? String(years) : `${years}.${Math.round((rest / 12) * 10)}`, unit: years === 1 && rest === 0 ? "year" : "years" };
}

/* ── Sections ─────────────────────────────────────────────────────────────── */

function Section(props: {
  section: SectionKey;
  detail: EmployeeMasterDetail;
  options: MasterOptions;
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K], original: Draft[K]) => void;
  canSeePay: boolean;
  canDelete: boolean;
  currentUserId: string;
  onRefresh: () => Promise<void>;
}) {
  const { section, detail, options, draft, set, canSeePay, onRefresh } = props;
  const r = detail.row;
  const v = <K extends keyof Draft>(k: K, original: Draft[K]): Draft[K] =>
    (k in draft ? draft[k] : original) as Draft[K];

  const dateStr = (d: Date | string | null) =>
    !d ? "" : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);

  switch (section) {
    case "overview": {
      const t = tenure(r.joinedAt);
      const docs = detail.documents.filter((d) => !d.archived).length;
      return (
        <Stack>
          {/* Numbers are the loudest thing on an Aura screen (§4), so the three
              facts worth reading at a glance lead the section. */}
          <Pane title="At a glance">
            <div className="grid gap-5 sm:grid-cols-3">
              <Stat label="Tenure" value={t.value} unit={t.unit} />
              {canSeePay && (
                <Stat
                  label="Monthly CTC"
                  value={r.monthlyCtc == null ? "—" : `₹${Math.round(r.monthlyCtc).toLocaleString("en-IN")}`}
                  unit={r.monthlyCtc == null ? "not set" : "per month"}
                />
              )}
              <Stat label="Documents" value={String(docs)} unit={docs === 1 ? "on record" : "on record"} />
            </div>
          </Pane>

          <Panes>
            <Pane title="Identity">
              <Rows>
                <Field label="Employee Code"><Readout>{r.employeeCode ?? "Not issued"}</Readout></Field>
                <Text label="Employee Name" value={v("name", r.name) ?? ""} onChange={(x) => set("name", x, r.name)} />
                <Pick label="Designation" value={v("designationId", r.designationId) ?? ""} onChange={(x) => set("designationId", x || null, r.designationId)} options={options.designations} />
                <Pick label="Entity" value={v("payingEntityId", r.entityId) ?? ""} onChange={(x) => set("payingEntityId", x || null, r.entityId)} options={options.entities} />
                {/* FUNCTION. Migration 0234 moved these 18 rows into the
                    `functions` table keeping their ids, so this IS the Function
                    and not a stand-in; the old empty `functionId` picker is
                    gone. Read-only here because a person can hold several
                    (employee_departments is a join table) and the Employees
                    screen owns that multi-select. */}
                <Field label="Function"><Readout>{r.departmentName ?? "—"}</Readout></Field>
              </Rows>
            </Pane>

            <Pane title="Employment dates">
              <Rows>
                <DateInput label="Date of Joining" value={dateStr(v("joinedAt", dateStr(r.joinedAt)) ?? null)} onChange={(x) => set("joinedAt", x || null, dateStr(r.joinedAt))} />
                {/* PROBATION END DATE IS REQUIRED for a non-intern (0244), and
                    the server refuses a save without it. The marker is on the
                    LABEL here so the admin sees the requirement on the control
                    they must fill, rather than meeting it as a failed save. The
                    date is never replaced by the word "Completed" — see
                    probation-cell.tsx. */}
                <div>
                  <DateInput
                    label={
                      r.effectiveEmployeeType === "intern"
                        ? "Probation Ends On"
                        : "Probation Ends On *"
                    }
                    value={v("probationEnd", r.probationEnd) ?? ""}
                    onChange={(x) => set("probationEnd", x || null, r.probationEnd)}
                  />
                  {!r.probationEnd && r.effectiveEmployeeType !== "intern" && (
                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--color-red-deep, #b91c1c)" }}>
                      Required — this employee cannot be saved without it.
                    </p>
                  )}
                </div>

                {/* EMPLOYEE TYPE (0244) — the per-person override of the
                    designation's flag. `Follow designation` is the default and
                    the common case; picking one here makes this person the
                    exception. Interns cannot earn incentives, so this is the
                    field that decides that for a single person. */}
                <div>
                  <Pick
                    label="Employee Type"
                    value={v("employeeType", (r.employeeType ?? null) as EmployeeTypeCode | null) ?? ""}
                    onChange={(x) =>
                      set(
                        "employeeType",
                        x === "" ? null : (x as EmployeeTypeCode),
                        (r.employeeType ?? null) as EmployeeTypeCode | null,
                      )
                    }
                    emptyLabel={`Follow designation (${r.designationEmployeeType === "intern" ? "Intern" : "Employee"})`}
                    options={EMPLOYEE_KIND_OPTIONS.map((o) => ({ id: o.value, name: o.label }))}
                  />
                  <p className="mt-1 text-[11.5px] text-ink-subtle">
                    Effective: <strong>{r.effectiveEmployeeType === "intern" ? "Intern" : "Employee"}</strong>.
                    Interns do not earn incentives.
                  </p>
                </div>

                {/* INTERNSHIP — start only. The end date is computed by the
                    database as start + 6 months, so it is shown and never
                    typed; nothing in the app can write a pair that disagrees. */}
                <div>
                  <DateInput
                    label="Internship Start"
                    value={v("internshipStart", r.internshipStart) ?? ""}
                    onChange={(x) => set("internshipStart", x || null, r.internshipStart)}
                  />
                  <p className="mt-1 text-[11.5px] text-ink-subtle">
                    Internship end: <strong>{r.internshipEnd ? formatDate(r.internshipEnd) : "—"}</strong>{" "}
                    (start + 6 months, computed)
                  </p>
                </div>

                <DateInput label="Date of Completion" value={v("lastWorkingDay", r.dateOfCompletion) ?? ""} onChange={(x) => set("lastWorkingDay", x || null, r.dateOfCompletion)} />
                {/* SHIFT TYPE is the worker-type record, relabelled and now
                    editable. The empty `shift_types` picker was removed. */}
                <ShiftTypeField
                  value={v("workerType", asWorkerType(r.workerType)) ?? null}
                  original={asWorkerType(r.workerType)}
                  onChange={(x) => set("workerType", x, asWorkerType(r.workerType))}
                />
                <Field label="Status"><Readout className="capitalize">{r.status}</Readout></Field>
              </Rows>
            </Pane>

            <Pane title="Reporting & entitlements">
              <Rows>
                <Pick label="Manager" value={v("managerId", r.managerId) ?? ""} onChange={(x) => set("managerId", x || null, r.managerId)} options={options.managers} />
                <Toggle label="Team Lead" value={v("isTeamLead", r.isTeamLead) ?? false} onChange={(x) => set("isTeamLead", x, r.isTeamLead)} />
                <Toggle label="Train Pass" value={v("trainPass", r.trainPass) ?? false} onChange={(x) => set("trainPass", x, r.trainPass)} />
              </Rows>
            </Pane>
          </Panes>

          <CodePanel detail={detail} onChanged={onRefresh} />
        </Stack>
      );
    }

    case "payroll":
      return canSeePay ? <PayrollSection detail={detail} onRefresh={onRefresh} /> : null;

    case "contact":
      return (
        <Stack>
          <Panes>
            <Pane title="Reach">
              <Rows>
                <Text label="Office Mail" value={v("officialEmail", r.officeEmail) ?? ""} onChange={(x) => set("officialEmail", x || null, r.officeEmail)} />
                <Text label="Personal Mail" value={v("personalEmail", r.personalEmail) ?? ""} onChange={(x) => set("personalEmail", x || null, r.personalEmail)} />
                <Text label="Personal Cell" value={v("phone", r.phone) ?? ""} onChange={(x) => set("phone", x || null, r.phone)} />
                <Field label="WhatsApp"><Readout>{r.whatsapp ?? "—"}</Readout></Field>
                <Field label="Login address"><Readout>{r.officeEmail}</Readout></Field>
              </Rows>
              <Note>
                The login address is bound to the Firebase account and is changed through the invite
                flow, not here — editing it on this screen would break sign-in.
              </Note>
            </Pane>

            <Pane title="Current Address"><AddressBlock a={detail.currentAddress} /></Pane>
            <Pane title="Permanent Address"><AddressBlock a={detail.permanentAddress} /></Pane>
          </Panes>

          {/* Family and emergency contacts, merged in from what used to be
              its own Family tab. Same question as the addresses above — "how
              do we reach this person, and who do we call" — and the same
              source, the onboarding submission. */}
          <FamilyPanes detail={detail} />
        </Stack>
      );

    case "documents":
      return <DocumentsSection detail={detail} />;

    case "work":
      return (
        <Stack>
          <Panes>
            <Pane title="Schedule">
              <Rows>
                <Field label="Weekly off"><Readout>{WEEKDAYS[detail.work.weeklyOff ?? -1] ?? "—"}</Readout></Field>
                <Field label="Official start"><Readout>{detail.work.officialStart ?? "Company default"}</Readout></Field>
                <Field label="Official end"><Readout>{detail.work.officialEnd ?? "Company default"}</Readout></Field>
                <Field label="Timezone"><Readout>{detail.work.timezone ?? "—"}</Readout></Field>
              </Rows>
            </Pane>

            <Pane title="Thresholds">
              <Rows>
                <Field label="Late after"><Readout>{detail.work.lateAfter ?? "—"}</Readout></Field>
                <Field label="Early before"><Readout>{detail.work.earlyBefore ?? "—"}</Readout></Field>
                <Field label="Full day"><Readout>{detail.work.fullDayMinutes ? `${detail.work.fullDayMinutes} min` : "Company default"}</Readout></Field>
                <Field label="Half day"><Readout>{detail.work.halfDayMinutes ? `${detail.work.halfDayMinutes} min` : "Company default"}</Readout></Field>
                <Field label="Weekly target"><Readout>{detail.work.weeklyTargetMinutes ? `${Math.round(detail.work.weeklyTargetMinutes / 60)}h` : "Company default"}</Readout></Field>
                <Field label="Works outside office"><Readout>{detail.work.worksOutsideOffice == null ? "—" : detail.work.worksOutsideOffice ? "Yes" : "No"}</Readout></Field>
                {/* Moved here when the Employment section was removed — it
                    was that section's only field not already on Overview,
                    and this is where the rest of the attendance
                    configuration lives. */}
                <Field label="Daily task quota"><Readout>{detail.work.dailyTaskQuota ?? "—"}</Readout></Field>
              </Rows>
            </Pane>
          </Panes>

          <Note>
            This is the CONFIGURATION, not the record. Punches, leave and the monthly attendance
            summary live in the Attendance module and are not duplicated here (§13).
          </Note>
        </Stack>
      );

    /* ── OTHER (0228) ─────────────────────────────────────────────────────
       The five employee-level settings. Everything here is editable and rides
       the shared draft, so Save Changes in the header commits it with the rest
       of the record — there is no second save button and no second write path. */
    case "other": {
      const w = detail.work;
      const satOn = (n: 1 | 2 | 3 | 4 | 5): boolean => {
        const key = `sat${n}Working` as const;
        return (v(key, w.saturdayWorking[n - 1]) ?? true) as boolean;
      };
      const applicable = v("attendanceApplicable", w.attendanceApplicable) ?? true;

      return (
        <Stack>
          <Pane title="Attendance">
            <Rows>
              <Toggle
                label="Is Attendance Applicable"
                value={applicable}
                onChange={(x) => set("attendanceApplicable", x, w.attendanceApplicable)}
              />
            </Rows>
            <Note>
              <b>No</b> means this person is not required to punch. Their missing punches stop being
              graded as absence, so nothing here can reach an attendance or salary deduction. It is
              not a smaller week — their weekly target is unchanged.
            </Note>
          </Pane>

          <Panes>
            <Pane title="Saturday working">
              {/* Five independent Yes/No controls, per the brief. "1st Saturday"
                  is the first Saturday BY DATE in the month — `saturdayOrdinal()`
                  in lib/attendance/effective-config.ts is the shared rule, so
                  this screen and the grader cannot disagree about which one a
                  date is. */}
              <Rows>
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <Toggle
                    key={n}
                    label={`${ORDINALS[n]} Saturday Working`}
                    value={satOn(n)}
                    onChange={(x) => set(`sat${n}Working` as const, x, w.saturdayWorking[n - 1])}
                  />
                ))}
              </Rows>
              <Note>
                A Saturday set to No is treated as a non-working day for this employee, the same way
                their weekly off is — no absence, no deduction. A 5th Saturday exists only in months
                whose Saturdays reach the 29th or later.
              </Note>
            </Pane>

            <Pane title="Employee timings">
              <Rows>
                <TimeInput
                  label="Monday–Friday Start"
                  value={v("attOfficialStart", hhmm(w.officialStart)) ?? ""}
                  onChange={(x) => set("attOfficialStart", x, hhmm(w.officialStart))}
                />
                <TimeInput
                  label="Monday–Friday End"
                  value={v("attOfficialEnd", hhmm(w.officialEnd)) ?? ""}
                  onChange={(x) => set("attOfficialEnd", x, hhmm(w.officialEnd))}
                />
                <TimeInput
                  label="Saturday Start"
                  value={v("satOfficialStart", hhmm(w.satOfficialStart)) ?? ""}
                  onChange={(x) => set("satOfficialStart", x, hhmm(w.satOfficialStart))}
                  hint="Blank = same as Mon–Fri"
                />
                <TimeInput
                  label="Saturday End"
                  value={v("satOfficialEnd", hhmm(w.satOfficialEnd)) ?? ""}
                  onChange={(x) => set("satOfficialEnd", x, hhmm(w.satOfficialEnd))}
                  hint="Blank = same as Mon–Fri"
                />
              </Rows>
              <Note>
                These are the SAME columns the Attendance schedule screen writes, so the two cannot
                drift apart. <b>The 54 h/week full-time target is unaffected</b> — timings define
                when the scheduled period is, never how long the contractual week is.
              </Note>
            </Pane>

            <Pane title="Remote Work">
              <Rows>
                <Toggle
                  label="Remote Work — Full Time Allowed"
                  value={v("wfhFullTimeAllowed", w.wfhFullTimeAllowed) ?? false}
                  onChange={(x) => set("wfhFullTimeAllowed", x, w.wfhFullTimeAllowed)}
                />
                <Toggle
                  label="Remote Work — Part Time Allowed"
                  value={v("wfhPartTimeAllowed", w.wfhPartTimeAllowed) ?? false}
                  onChange={(x) => set("wfhPartTimeAllowed", x, w.wfhPartTimeAllowed)}
                />
              </Rows>
              <Note>
                Both default to No. They record the entitlement on the employee record; the remote
                work request flow reads it rather than keeping a second list.
              </Note>
            </Pane>
          </Panes>
        </Stack>
      );
    }
  }
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"] as const;

/** A `time` column arrives as "HH:mm:ss"; the input wants "HH:mm". */
function hhmm(v: string | null): string | null {
  return v ? v.slice(0, 5) : null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ── Payroll ──────────────────────────────────────────────────────────────── */

function PayrollSection({ detail, onRefresh }: { detail: EmployeeMasterDetail; onRefresh: () => Promise<void> }) {
  const [rows, setRows] = React.useState(() =>
    detail.ctc.components.length > 0
      ? detail.ctc.components.map((c) => ({ label: c.label, annual: String(c.annual) }))
      : [
          { label: "Basic", annual: "" },
          { label: "HRA", annual: "" },
          { label: "Allowance", annual: "" },
          { label: "Other", annual: "" },
        ],
  );
  const [total, setTotal] = React.useState(String(detail.ctc.annualTotal || ""));
  const [tds, setTds] = React.useState(String(detail.row.tdsMonthly ?? ""));
  const [ptExempt, setPtExempt] = React.useState(!!detail.row.ptExempt);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const summed = rows.reduce((s, r) => s + (Number(r.annual) || 0), 0);
  const effective = summed > 0 ? summed : Number(total) || 0;

  async function saveAll() {
    setBusy(true); setMsg(null);
    const a = await saveCtcBreakup({
      employeeId: detail.row.id,
      annualCtc: Number(total) || 0,
      components: rows.filter((r) => r.label.trim() && Number(r.annual) > 0)
        .map((r) => ({ label: r.label.trim(), annual: Number(r.annual) })),
    });
    const b = await savePayrollScalars({
      employeeId: detail.row.id,
      tdsMonthly: tds === "" ? undefined : Number(tds),
      ptExempt,
    });
    setBusy(false);
    setMsg(!a.ok ? a.error : !b.ok ? b.error : "Saved.");
    if (a.ok && b.ok) await onRefresh();
  }

  return (
    <Stack>
      <Pane title="Cost to company">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <Stat label="Annual" value={`₹${Math.round(effective).toLocaleString("en-IN")}`} unit="per year" />
          <Stat label="Monthly" value={`₹${Math.round(effective / 12).toLocaleString("en-IN")}`} unit="per month" />
        </div>
      </Pane>

      <Pane title="CTC breakup">
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Share</th>
              <th className="n">Monthly</th>
              <th className="n">Annual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const annual = Number(row.annual) || 0;
              // The meter turns four numbers into a shape: which component
              // actually carries the package is the thing you want to see.
              const share = effective > 0 ? Math.min(100, (annual / effective) * 100) : 0;
              return (
                <tr key={i}>
                  <td>
                    <input
                      value={row.label}
                      aria-label={`Component ${i + 1} name`}
                      onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      className="ctl"
                    />
                  </td>
                  <td style={{ width: "22%", minWidth: 90 }}>
                    <div className="meter" role="presentation">
                      <span style={{ width: `${share}%` }} />
                    </div>
                  </td>
                  <td className="n quiet">₹{Math.round(annual / 12).toLocaleString("en-IN")}</td>
                  <td className="n" style={{ width: "20%", minWidth: 110 }}>
                    <input
                      inputMode="numeric"
                      aria-label={`Component ${i + 1} annual amount`}
                      value={row.annual}
                      onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, annual: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                      className="ctl num text-right"
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="strong display">Total CTC</td>
              <td />
              <td className="n strong num">₹{Math.round(effective / 12).toLocaleString("en-IN")}</td>
              <td className="n strong num">₹{Math.round(effective).toLocaleString("en-IN")}</td>
            </tr>
          </tbody>
        </table>

        <button type="button" onClick={() => setRows((p) => [...p, { label: "", annual: "" }])} className="btn-quiet mt-3">
          + Add component
        </button>
        {summed === 0 && (
          <p className="quiet mt-2.5 text-[12px] leading-relaxed">
            No component split recorded. Enter the annual total below, or fill the components — the
            total is then their sum.
          </p>
        )}
      </Pane>

      <Panes>
        <Pane title="Tax & basis">
          <Rows>
            <Field label="Annual CTC (when no split)">
              <input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))}
                disabled={summed > 0} className="ctl num" />
            </Field>
            <Field label="Monthly TDS">
              <input inputMode="numeric" value={tds} onChange={(e) => setTds(e.target.value.replace(/[^\d.]/g, ""))} className="ctl num" />
            </Field>
            <Toggle label="PT Exempt" value={ptExempt} onChange={setPtExempt} />
            <Field label="Pay basis"><Readout className="capitalize">{(detail.row.payType ?? "—").replace(/_/g, " ")}</Readout></Field>
          </Rows>

          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={saveAll} disabled={busy} className="btn">
              {busy ? "Saving…" : "Save payroll"}
            </button>
            {msg && <span className="muted text-[12.5px] font-semibold">{msg}</span>}
          </div>
        </Pane>
      </Panes>

      <Note>
        Salary Profile, advances, adjustments and the monthly runs stay in the Salary module — this
        section edits the employee&rsquo;s CTC, TDS and PT exemption, which is what belongs on the
        employee record. Banking details are shown under Contact when recorded at onboarding.
      </Note>
    </Stack>
  );
}

/* ── Family / Documents ───────────────────────────────────────────────────── */

/**
 * Family + emergency contacts, as panes rather than a whole section.
 *
 * Returns a fragment, not a `<Stack>`: it is rendered INSIDE Contact
 * Details' stack now, and a stack nested in a stack doubles the gap between
 * the address panes and these.
 */
function FamilyPanes({ detail }: { detail: EmployeeMasterDetail }) {
  const { family, emergencyContacts } = detail;
  return (
    <>
      <Panes>
        <Pane title="Family">
          {family.length === 0 ? (
            <Empty>No family details were recorded at onboarding.</Empty>
          ) : (
            <table>
              <thead>
                <tr><th>Relationship</th><th>Name</th><th>Contact</th></tr>
              </thead>
              <tbody>
                {family.map((m) => (
                  <tr key={m.relationship}>
                    <td className="strong">{m.relationship}</td>
                    <td>{m.name ?? "—"}</td>
                    <td className="num">{m.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Pane>

        <Pane title="Emergency Contacts">
          {emergencyContacts.length === 0 ? (
            <Empty>None recorded.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {emergencyContacts.map((c, i) => (
                <li key={i} className="readout text-[13px]">
                  {[c.name, c.phone, c.note].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          )}
        </Pane>
      </Panes>

      <Note>
        Family and address details come from the employee&rsquo;s onboarding submission, which is
        their source of truth. Editing them there keeps one copy rather than two that can disagree.
      </Note>
    </>
  );
}

function DocumentsSection({ detail }: { detail: EmployeeMasterDetail }) {
  const docs = detail.documents.filter((d) => !d.archived);
  return (
    <Stack>
      <Pane title={`Documents — ${docs.length}`}>
        {docs.length === 0 ? (
          <Empty>No documents on this employee record.</Empty>
        ) : (
          <table>
            <thead>
              <tr><th>Type</th><th>Title</th><th>File</th><th>Effective</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="strong capitalize">{d.docType.replace(/_/g, " ")}</td>
                  <td>{d.title ?? "—"}</td>
                  <td>{d.fileName ?? "—"}</td>
                  <td className="num">{d.effectiveDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Pane>

      <Note>
        Letters, agreements and the signed HR paperwork live in the HR module and are reached
        through HR Records — this list is the employee document store, not a second copy of it (§12).
      </Note>
    </Stack>
  );
}

/* ── Primitives ───────────────────────────────────────────────────────────── */

/** Vertical rhythm between panes. Whitespace is the only separator (§8). */
function Stack({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 pb-2">{children}</div>;
}

/** Panes rebalance instead of orphaning — `auto-fit` with a 300px floor (§8). */
function Panes({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
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

/** Fields inside a pane: one column when narrow, two when there is room. */
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-4 gap-y-3 min-[520px]:grid-cols-2">{children}</div>;
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

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="min-w-0">
      <span className="label mb-1.5 block">{label}</span>
      <div className="stat">
        <b>{value}</b>
        <span>{unit}</span>
      </div>
    </div>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="ctl" />
    </Field>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="ctl num" />
    </Field>
  );
}

/**
 * A clock time (0228).
 *
 * `type="time"` rather than a text box, so the browser enforces HH:mm and
 * offers the platform picker — the server validates the same shape, but a
 * control that cannot produce "10.30" is better than an error that explains it.
 * Clearing it emits "" which the action normalises to null, which is what makes
 * "blank = follow Mon–Fri" typable rather than a separate checkbox.
 */
function TimeInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label}>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="ctl num" />
      {hint && <span className="quiet mt-1 block text-[11px]">{hint}</span>}
    </Field>
  );
}

function Pick({ label, value, onChange, options, emptyLabel = "—" }: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[];
  /** What the empty choice SAYS. "—" suits a nullable reference (no entity); a
   *  field where empty is a real, meaningful value — Employee Type's "follow the
   *  designation" — needs to name it, or the admin cannot tell "no answer yet"
   *  from "inherit" (0244). */
  emptyLabel?: string;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="ctl">
        <option value="">{emptyLabel}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </Field>
  );
}

/**
 * SHIFT TYPE — and the reason it says what it pays.
 *
 * This field is `employees.worker_type`. The screen used to show it read-only
 * as "Employee Type" beside a separate, empty "Shift Type" picker; the two read
 * as duplicates (they even shared the value "Second Half"), so they were merged
 * into this one under the name that was kept.
 *
 * ── WHY THE PAY BASIS IS PRINTED UNDERNEATH ───────────────────────────────
 * `worker_type` is not a scheduling preference. It is the single branch point
 * the salary engine and the attendance grader both read
 * (lib/attendance/worker-type.ts): Full Time is paid a monthly CTC, and First
 * Half, Second Half and Hybrid are paid for the hours actually worked. So
 * changing this field moves a real person between a monthly salary and hourly
 * pay — and under the label "Shift Type" alone, somebody would do that while
 * believing they were adjusting working hours.
 *
 * Hiding that would be the easy option and the wrong one. The consequence is
 * derived from the same function payroll uses, so it cannot describe a basis
 * the payslip will not apply, and it updates as the selection changes.
 */
function ShiftTypeField({
  value,
  original,
  onChange,
}: {
  value: WorkerType | null;
  original: WorkerType | null;
  onChange: (v: WorkerType) => void;
}) {
  const basis = value ? payBasisFor(value) : null;
  const basisLabel =
    basis === "monthly_ctc"
      ? "Paid a monthly CTC"
      : basis === "hourly"
        ? "Paid for hours actually worked"
        : basis === "fixed_fee"
          ? "Paid a fixed retainer"
          : null;

  // Only worth flagging when the change actually crosses pay bases.
  const changesPay =
    value != null && original != null && value !== original && payBasisFor(value) !== payBasisFor(original);

  return (
    <Field label="Shift Type">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as WorkerType)}
        className="ctl"
      >
        <option value="">—</option>
        {EMPLOYEE_TYPE_OPTIONS.map((w) => (
          <option key={w} value={w}>
            {WORKER_TYPE_LABELS[w]}
          </option>
        ))}
      </select>
      {basisLabel && (
        <span
          className="quiet mt-1 block text-[11.5px] leading-snug"
          style={changesPay ? { color: "var(--accent)", fontWeight: 600 } : undefined}
        >
          {changesPay ? "Changes how they are paid — " : ""}
          {basisLabel.toLowerCase()}
        </span>
      )}
    </Field>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <label className="check">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {value ? "Yes" : "No"}
      </label>
    </Field>
  );
}

function AddressBlock({ a }: { a: EmployeeMasterDetail["currentAddress"] }) {
  if (a.empty) return <Empty>Not recorded.</Empty>;
  return (
    <div className="readout leading-relaxed">
      {[a.line1, a.line2, a.line3, a.landmark].filter(Boolean).join(", ")}
      {(a.city || a.state || a.pincode) && (
        <div className="quiet mt-0.5">{[a.city, a.state, a.pincode].filter(Boolean).join(" · ")}</div>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="quiet mt-3 text-[12px] leading-relaxed">
      {children}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="quiet rounded-[12px] border border-dashed px-3 py-5 text-center text-[12.5px]"
      style={{ borderColor: "rgba(10,15,34,0.16)" }}>
      {children}
    </div>
  );
}
