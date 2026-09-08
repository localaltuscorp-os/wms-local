"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  IdCard,
  Loader2,
  Check,
  Save,
  ArrowUpRight,
  FolderLock,
  FileSignature,
  Sparkles,
  Wrench,
  HeartHandshake,
  Library,
  UserRound,
  ScrollText,
  CircleCheck,
  Circle,
  FileDown,
  LogOut,
  MessagesSquare,
  ClipboardCheck,
  ClipboardList,
  Mail,
  Boxes,
  Lock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Search,
  ChevronsUpDown,
  ChevronDown,
  FileText,
  Contact,
  PenLine,
  Eye,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { PageShell } from "@/components/layout/page-shell";
import { Avatar } from "@/components/ui/avatar";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import {
  getManagementAssessment,
  saveManagementAssessment,
  type ManagementAssessmentState,
} from "@/app/(app)/hr/management-assessment-actions";
import { getPolicySigningStatus } from "@/app/(app)/hr/record/policy-status";
import type { PolicySignStatus } from "@/app/(app)/hr/record/policy-status-types";
import { getExitStatus } from "@/app/(app)/hr/record/exit-status";
import type { ExitSummary } from "@/app/(app)/hr/record/exit-status-types";
import {
  getWorkflowStatus,
  createOfficialEmail,
  allocateAssets,
  type WorkflowStatus,
} from "@/app/(app)/hr/record/workflow-status";
import {
  getPersonRecords,
  type PersonRecords,
  type RecordSection,
} from "@/app/(app)/hr/record/person-records";
import { getPersonFiles } from "@/app/(app)/hr/record/person-files";
import {
  EMPTY_PERSON_FILES,
  type FiledFormRow,
  type LetterFileRow,
  type PersonFiles,
} from "@/app/(app)/hr/record/person-files-types";
import { SkillMultiSelect, type SkillSelection } from "@/components/hr/candidate/skill-multiselect";
import type { SkillLookupOptions } from "@/lib/hr/skills";
import { formatDate } from "@/lib/format";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";

const EMPTY_SKILLS: SkillSelection = { technical: [], nonTechnical: [] };

/**
 * The per-person HR Record hub (`/hr/record`). Pick a candidate, then work their
 * whole file from one room:
 *   1. Letters — one-tap Compose links (name + gender pre-seeded via ?candidate=)
 *      for the recruitment/appointment letters, plus the full Letters library.
 *   2. Skills requirement checklist — the bare-minimum "can they do it" surface,
 *      edited HERE with inline +Add/Delete. Persisted onto the SAME
 *      management_assessment.skills field the Management Assessment reads (no new
 *      storage / migration) so it stays one source of truth.
 *   3. Documents — a jump to the person's dossier vault.
 *
 * Saving skills re-persists the WHOLE management_assessment blob (notes,
 * recordings, outcome, …) unchanged around the new skills, so editing here never
 * clobbers what the MA screen captured.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";

/** Recruitment → appointment letters worth composing straight from a record.
 *  Keys mirror the letters registry; titles are inlined so we don't pull the
 *  (server-side) template graph into this client bundle. */
const RECORD_LETTERS: { key: string; title: string; blurb: string }[] = [
  { key: "selection", title: "Selection Letter", blurb: "Extend the role to the selected candidate." },
  { key: "acceptance", title: "Acceptance Letter", blurb: "Their written acceptance of the offer." },
  { key: "appointment", title: "Appointment Letter", blurb: "The formal appointment on the letterhead." },
  { key: "confirmation", title: "Confirmation Letter", blurb: "Confirm the employee after probation." },
  { key: "free-training", title: "Free Training Letter", blurb: "Pre-employment training & evaluation." },
];

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", label: "New" },
  shortlisted: { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)", label: "Shortlisted" },
  rejected: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)", label: "Rejected" },
  hired: { bg: "var(--color-blue-bg)", fg: "var(--color-blue-deep)", label: "Hired" },
  active: { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)", label: "Active" },
};

/** Onboarding completeness — `pct` 100 = fully filled; anything less is "details
 *  missing" (drives the picker + roster chips). */
function isIncomplete(c: CandidateRow): boolean {
  return (c.pct ?? 0) < 100;
}

/** Map a loaded MA state back to the save-action input, so re-saving skills keeps
 *  every other MA field intact. */
function maToInput(ma: ManagementAssessmentState, skills: SkillSelection) {
  return {
    notes: ma.notes,
    recordings: ma.recordings.map((r) => ({ path: r.path, durationSec: r.durationSec, createdAt: r.createdAt })),
    attachments: ma.attachments.map((a) => ({ path: a.path, name: a.name, mime: a.mime, size: a.size })),
    designation: ma.designation,
    dateOfJoining: ma.dateOfJoining,
    outcome: ma.outcome,
    oneMoreAssignment: ma.oneMoreAssignment,
    assignmentBrief: ma.assignmentBrief,
    recruiter: ma.recruiter,
    rejectionReason: ma.rejectionReason,
    skills: { technical: skills.technical, nonTechnical: skills.nonTechnical },
    managementScore: ma.managementScore,
    proposedSalary: ma.proposedSalary,
  };
}

export function HrRecordScreen({
  candidates,
  skillOptions,
  isAdmin,
}: {
  candidates: CandidateRow[];
  skillOptions: SkillLookupOptions;
  isAdmin: boolean;
}) {
  const [candidateId, setCandidateId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [skills, setSkills] = React.useState<SkillSelection>(EMPTY_SKILLS);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [policy, setPolicy] = React.useState<PolicySignStatus | null>(null);
  const [policyLoading, setPolicyLoading] = React.useState(false);
  const [docketLoading, setDocketLoading] = React.useState(false);
  const [exit, setExit] = React.useState<ExitSummary | null>(null);
  const [exitLoading, setExitLoading] = React.useState(false);
  const [workflow, setWorkflow] = React.useState<WorkflowStatus | null>(null);
  const [workflowLoading, setWorkflowLoading] = React.useState(false);
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [assetsBusy, setAssetsBusy] = React.useState(false);
  const [records, setRecords] = React.useState<PersonRecords | null>(null);
  const [recordsLoading, setRecordsLoading] = React.useState(false);
  const [files, setFiles] = React.useState<PersonFiles>(EMPTY_PERSON_FILES);
  const [filesLoading, setFilesLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const maRef = React.useRef<ManagementAssessmentState | null>(null);
  const skillsRef = React.useRef(skills); skillsRef.current = skills;
  const cidRef = React.useRef(candidateId); cidRef.current = candidateId;
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = candidates.find((c) => c.id === candidateId) ?? null;
  const skillCount = skills.technical.length + skills.nonTechnical.length;

  const saveNow = React.useCallback(async () => {
    const id = cidRef.current;
    const ma = maRef.current;
    if (!id || !ma) return;
    setSaving(true);
    try {
      const res = await saveManagementAssessment(id, maToInput(ma, skillsRef.current));
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      // Keep the local MA mirror's skills in sync for the next save.
      maRef.current = { ...ma, skills: { technical: skillsRef.current.technical, nonTechnical: skillsRef.current.nonTechnical } };
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = React.useCallback(() => {
    if (!cidRef.current || !maRef.current) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 800);
  }, [saveNow]);

  async function selectCandidate(id: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setCandidateId(id); cidRef.current = id;
    setSkills(EMPTY_SKILLS); skillsRef.current = EMPTY_SKILLS;
    maRef.current = null;
    setDirty(false);
    setPolicy(null); setPolicyLoading(false);
    setExit(null); setExitLoading(false);
    setWorkflow(null); setWorkflowLoading(false);
    setRecords(null); setRecordsLoading(false);
    setFiles(EMPTY_PERSON_FILES); setFilesLoading(false);
    if (!id) return;
    setLoading(true);
    // Workflow status (onboarding gate + email/asset provisioning) loads in
    // PARALLEL alongside policy + exit — never blocking the editor.
    setWorkflowLoading(true);
    void getWorkflowStatus(id)
      .then((res) => { if (cidRef.current === id) setWorkflow(res.ok ? res.status : null); })
      .catch(() => { if (cidRef.current === id) setWorkflow(null); })
      .finally(() => { if (cidRef.current === id) setWorkflowLoading(false); });
    // Policy-signing + exit records load in PARALLEL (never block the editor).
    setPolicyLoading(true);
    void getPolicySigningStatus(id)
      .then((res) => { if (cidRef.current === id) setPolicy(res.ok ? res.status : null); })
      .catch(() => { if (cidRef.current === id) setPolicy(null); })
      .finally(() => { if (cidRef.current === id) setPolicyLoading(false); });
    setExitLoading(true);
    void getExitStatus(id)
      .then((res) => { if (cidRef.current === id) setExit(res.ok ? res.status : null); })
      .catch(() => { if (cidRef.current === id) setExit(null); })
      .finally(() => { if (cidRef.current === id) setExitLoading(false); });
    // Filled-form records (onboarding + candidate intake) — parallel, non-blocking.
    setRecordsLoading(true);
    void getPersonRecords(id)
      .then((res) => { if (cidRef.current === id) setRecords(res); })
      .catch(() => { if (cidRef.current === id) setRecords(null); })
      .finally(() => { if (cidRef.current === id) setRecordsLoading(false); });
    // Saved forms + issued letters — the openable half of the record. Parallel
    // and non-blocking like the rest; `cidRef` guards a late reply from a person
    // the admin has already navigated away from, which would otherwise paint one
    // employee's letters under another employee's name.
    setFilesLoading(true);
    void getPersonFiles(id)
      .then((res) => { if (cidRef.current === id) setFiles(res); })
      .catch(() => { if (cidRef.current === id) setFiles(EMPTY_PERSON_FILES); })
      .finally(() => { if (cidRef.current === id) setFilesLoading(false); });
    try {
      const state = await getManagementAssessment(id);
      maRef.current = state;
      const next = state.skills
        ? { technical: state.skills.technical, nonTechnical: state.skills.nonTechnical }
        : EMPTY_SKILLS;
      setSkills(next); skillsRef.current = next;
    } catch {
      fireToast({ message: "Couldn't load this person's record.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  function updateSkills(next: SkillSelection) {
    setSkills(next); skillsRef.current = next;
    scheduleSave();
  }

  async function downloadDocket() {
    const id = cidRef.current;
    if (!id || docketLoading) return;
    setDocketLoading(true);
    try {
      const res = await fetch("/api/hr/docket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: id }),
      });
      // A JSON body means "nothing to download" (or an error) — surface it as a toast.
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        fireToast({ message: data?.error || "Couldn't build the docket.", type: "error" });
        return;
      }
      if (!res.ok) {
        fireToast({ message: "Couldn't build the docket.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Docket-${(selected?.fullName || "person").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      fireToast({ message: "Docket downloaded.", type: "success" });
    } catch {
      fireToast({ message: "Couldn't build the docket.", type: "error" });
    } finally {
      setDocketLoading(false);
    }
  }

  async function handleCreateEmail() {
    const id = cidRef.current;
    if (!id || emailBusy) return;
    setEmailBusy(true);
    try {
      const res = await createOfficialEmail(id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      if (cidRef.current === id) setWorkflow(res.status);
      fireToast({ message: `Official email created — welcome mail sent.`, type: "success" });
    } catch {
      fireToast({ message: "Couldn't create the official email.", type: "error" });
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleAllocateAssets() {
    const id = cidRef.current;
    if (!id || assetsBusy) return;
    setAssetsBusy(true);
    try {
      const res = await allocateAssets(id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      if (cidRef.current === id) setWorkflow(res.status);
      fireToast({ message: "Assets marked allocated.", type: "success" });
    } catch {
      fireToast({ message: "Couldn't mark assets allocated.", type: "error" });
    } finally {
      setAssetsBusy(false);
    }
  }

  React.useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const tone = STATUS_TONE[selected?.status ?? "new"] ?? STATUS_TONE.new!;

  return (
    <>
      <style>{CSS}</style>
      <PageShell width="narrow" py={false} className="pt-7 pb-24">
        {/* Hero */}
        <div className="mb-6 rec-fade">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <IdCard size={13} strokeWidth={2.6} /> HR · Record
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            HR Record
          </h1>
        </div>

        {/* Person picker + header.
            `relative z-30`: the combobox dropdown panel lives inside this card.
            Every `.rec-fade` section keeps a persistent transform (animation-
            fill-mode:both → transform:translateY(0), which is NOT `none`), so it
            forms its own stacking context. Without an explicit z-index here, the
            LATER "All people" `.rec-fade` sibling paints ON TOP of this card —
            burying the open dropdown behind the grid (the "completely broken"
            picker). Lifting this card above later siblings fixes it. */}
        <div className="relative z-30 rec-fade rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
            Person
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[280px] flex-1">
              <PersonPicker
                candidates={candidates}
                selectedId={candidateId}
                onSelect={(id) => void selectCandidate(id)}
              />
            </div>

            {/* Save status */}
            {candidateId && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" style={{ color: RED }} /> Saving…</>
                  ) : dirty ? (
                    <><span className="inline-block h-2 w-2 rounded-full" style={{ background: RED }} /> Unsaved</>
                  ) : (
                    <><Check size={14} strokeWidth={3} style={{ color: "var(--color-green-deep)" }} /> Saved</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void saveNow()}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                >
                  <Save size={14} /> Save
                </button>
              </div>
            )}
          </div>

          {selected && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rec-fade">
              <Avatar name={selected.fullName} avatarUrl={selected.avatarUrl} size={48} />
              <div className="min-w-0">
                <p className="truncate text-[17px] font-black leading-tight text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
                  {selected.fullName || "Unnamed"}
                </p>
                <p className="truncate text-[13px] font-medium text-ink-muted">
                  {[selected.positionApplied || selected.position, selected.department].filter(Boolean).join(" · ") || "Position not set"}
                </p>
              </div>
              <span
                className="ml-auto inline-flex items-center rounded-pill px-3 py-1 text-[12px] font-bold"
                style={{ background: tone.bg, color: tone.fg }}
              >
                {tone.label}
              </span>
              {selected.mobile && (
                <span className="inline-flex items-center rounded-pill border border-hairline px-3 py-1 text-[12px] font-semibold text-ink-muted">
                  {selected.mobile}
                </span>
              )}
              <button
                type="button"
                onClick={() => void selectCandidate("")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <ArrowLeft size={13} /> All people
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        {!candidateId ? (
          <Roster
            candidates={candidates}
            query={query}
            onQuery={setQuery}
            onSelect={(id) => void selectCandidate(id)}
          />
        ) : loading ? (
          <div className="mt-6 grid place-items-center rounded-2xl border border-hairline bg-white py-24 text-ink-muted">
            <Loader2 className="animate-spin" style={{ color: RED }} />
            <p className="mt-2 text-[13.5px] font-medium">Loading this person&apos;s record…</p>
          </div>
        ) : (
          <div className="rec-grid mt-6 grid grid-cols-12 gap-5">
            {/* Pending / action-needed — the very TOP of the panel. */}
            <section className="col-span-12 rec-fade">
              <PendingSummary workflow={workflow} policy={policy} loading={workflowLoading || policyLoading} />
            </section>

            {/* Onboarding form — the HIGHEST-priority dependency: it gates email + assets. */}
            <section className="col-span-12 lg:col-span-4 rec-fade">
              <RecordCard
                n={1}
                icon={<ClipboardList size={18} />}
                title="Onboarding Form"
                sub="The joining data form. It must be submitted before email & assets unlock."
              >
                <OnboardingCard workflow={workflow} loading={workflowLoading} />
              </RecordCard>
            </section>

            {/* Create Official Email — locked until onboarding submitted. */}
            <section className="col-span-12 lg:col-span-4 rec-fade">
              <RecordCard
                n={2}
                icon={<Mail size={18} />}
                title="Create Official Email"
                sub="Provision firstname.lastname@altuscorp.com & send the welcome mail."
              >
                <EmailStepCard
                  workflow={workflow}
                  loading={workflowLoading}
                  busy={emailBusy}
                  onCreate={() => void handleCreateEmail()}
                />
              </RecordCard>
            </section>

            {/* Allocate Assets — locked until onboarding submitted. */}
            <section className="col-span-12 lg:col-span-4 rec-fade">
              <RecordCard
                n={3}
                icon={<Boxes size={18} />}
                title="Allocate Assets"
                sub="Hand over the laptop, access & kit — mark it done once allocated."
              >
                <AssetsStepCard
                  workflow={workflow}
                  loading={workflowLoading}
                  busy={assetsBusy}
                  onAllocate={() => void handleAllocateAssets()}
                />
              </RecordCard>
            </section>

            {/* Letters */}
            <section className="col-span-12 lg:col-span-7 rec-fade">
              <RecordCard
                n={4}
                icon={<FileSignature size={18} />}
                title="Letters"
                sub="Open a letter already issued to this person, or compose a new one — their name & gender are pre-filled."
              >
                <IssuedLetters letters={files.letters} loading={filesLoading} />
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {RECORD_LETTERS.map((l) => (
                    <Link
                      key={l.key}
                      href={`/hr/letters/${l.key}?candidate=${candidateId}` as Route}
                      className="group flex items-start gap-3 rounded-xl border border-hairline bg-surface-card px-3.5 py-3 text-left transition-all hover:border-hairline-strong hover:shadow-md"
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                        <FileSignature size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-[14px] font-bold text-ink-strong">
                          {l.title}
                          <ArrowUpRight size={14} className="text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </span>
                        <span className="mt-0.5 block text-[12px] font-medium leading-snug text-ink-muted">{l.blurb}</span>
                      </span>
                    </Link>
                  ))}
                </div>
                <Link
                  href={"/hr/letters" as Route}
                  className="mt-3 inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                >
                  <Library size={15} /> Browse All Letters <ArrowUpRight size={14} />
                </Link>
              </RecordCard>
            </section>

            {/* Documents */}
            <section className="col-span-12 lg:col-span-5 rec-fade">
              <RecordCard
                n={5}
                icon={<FolderLock size={18} />}
                title="Documents"
                sub="Their secure document vault — appointment, CTC, IDs & more."
              >
                {/* ── WHOSE VAULT ────────────────────────────────────────
                    This used to link to a bare "/dossier". With no employee on
                    the URL that route falls back to the VIEWER — so opening
                    someone else's Documents card showed the admin their own
                    file, captioned with the other person's name. The id is now
                    always on the link.

                    The vault itself stays ADMIN-ONLY (canAccessEmployeeDossier
                    is admin-or-self by design), so HR staff who are not admins
                    are told that plainly instead of being bounced to their own
                    dossier — a silent redirect is how the wrong file gets read
                    as the right one. */}
                {isAdmin ? (
                  <Link
                    href={dossierHref(workflow?.employeeId ?? null)}
                    className="group flex items-center gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-3.5 text-left transition-all hover:border-hairline-strong hover:shadow-md"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}>
                      <FolderLock size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-ink-strong">
                        {firstName(selected?.fullName) ? `Open ${firstName(selected?.fullName)}’s Dossier` : "Open Dossier"}
                      </span>
                      <span className="block text-[12.5px] font-medium text-ink-muted">Every document on file, in one secure place.</span>
                    </span>
                    <ArrowUpRight size={17} className="shrink-0 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <LockedNote>
                    The document vault is admin-only. This person&rsquo;s letters and saved forms are still open to you elsewhere on this record.
                  </LockedNote>
                )}
                {selected && (
                  <button
                    type="button"
                    onClick={() => void downloadDocket()}
                    disabled={docketLoading}
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
                  >
                    {docketLoading ? (
                      <><Loader2 size={15} className="animate-spin" /> Building docket…</>
                    ) : (
                      <><FileDown size={15} /> Download Docket (PDF)</>
                    )}
                  </button>
                )}
                <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
                  <UserRound size={13} className="mt-0.5 shrink-0" />
                  The docket merges every archived, signed document into one PDF packet. Files also live in the dossier vault.
                </p>
              </RecordCard>
            </section>

            {/* Policies signed record */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={6}
                icon={<ScrollText size={18} />}
                title="Policy Signatures"
                sub="How many firm policies this person has signed — and what's still pending."
                right={
                  <span
                    className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold"
                    style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}
                  >
                    {policy ? policy.policies.filter((p) => p.signed).length : 0} / {policy ? policy.policies.length : 0} signed
                  </span>
                }
              >
                <PoliciesSigned status={policy} loading={policyLoading} />
              </RecordCard>
            </section>

            {/* Exit & Handover record */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={7}
                icon={<LogOut size={18} />}
                title="Exit & Handover"
                sub="This person's exit interview and handover clearance — populated once their separation begins."
                right={
                  <Link
                    href={"/hr/exit" as Route}
                    className="inline-flex items-center gap-1 rounded-pill border border-hairline-strong bg-white px-3 py-1 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                  >
                    Open Exit <ArrowUpRight size={13} />
                  </Link>
                }
              >
                <ExitHandover status={exit} loading={exitLoading} />
              </RecordCard>
            </section>

            {/* Skills requirement checklist */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={8}
                icon={<Sparkles size={18} />}
                title="Skills requirement checklist"
                sub="The bare-minimum skills this role demands — tick what they can genuinely do. Add or remove options inline."
                right={
                  <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
                    {skillCount} selected
                  </span>
                }
              >
                <SkillMultiSelect value={skills} onChange={updateSkills} options={skillOptions} isAdmin={isAdmin} />

                {skillCount > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <SkillGroupSummary
                      icon={<Wrench size={13} strokeWidth={2.4} />}
                      title="Technical"
                      items={skills.technical}
                      tone="technical"
                    />
                    <SkillGroupSummary
                      icon={<HeartHandshake size={13} strokeWidth={2.4} />}
                      title="Non-Technical"
                      items={skills.nonTechnical}
                      tone="nonTechnical"
                    />
                  </div>
                )}
                <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
                  Saved onto the person&apos;s record — the same skills the Management Assessment shows.
                </p>
              </RecordCard>
            </section>

            {/* Records — the already-filled Onboarding + Candidate details. */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={9}
                icon={<Contact size={18} />}
                title="Records"
                sub="Everything this person has filled — open it, read the actual answers, and correct them against their record."
              >
                <RecordsPanel
                  records={records}
                  loading={recordsLoading}
                  employeeId={workflow?.employeeId ?? null}
                  forms={files.forms}
                  filesLoading={filesLoading}
                />
              </RecordCard>
            </section>
          </div>
        )}
      </PageShell>
    </>
  );
}

/**
 * The per-person policy-signing record: a progress RING (signed / total) beside a
 * checklist of every published policy — a green tick when signed, a hollow ring
 * when still pending. When the person isn't yet linked to an employee account, a
 * gentle note explains why nothing is signed yet.
 */
function PoliciesSigned({ status, loading }: { status: PolicySignStatus | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid place-items-center py-8 text-ink-muted">
        <Loader2 className="animate-spin" style={{ color: RED }} />
      </div>
    );
  }
  const policies = status?.policies ?? [];
  const total = policies.length;
  const signed = policies.filter((p) => p.signed).length;
  const remaining = total - signed;
  const pct = total > 0 ? signed / total : 0;
  const allDone = total > 0 && signed === total;

  // Ring geometry
  const R = 46;
  const C = 2 * Math.PI * R;
  const dash = C * pct;

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      {/* Progress ring */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="relative grid place-items-center" style={{ width: 116, height: 116 }}>
          <svg width={116} height={116} viewBox="0 0 116 116" className="rec-ring">
            <circle cx={58} cy={58} r={R} fill="none" stroke="var(--color-hairline)" strokeWidth={10} />
            <circle
              cx={58} cy={58} r={R} fill="none"
              stroke={allDone ? "#15803d" : RED}
              strokeWidth={10} strokeLinecap="round"
              strokeDasharray={`${dash} ${C - dash}`}
              transform="rotate(-90 58 58)"
              style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute grid place-items-center text-center">
            <span className="text-[26px] font-black leading-none tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              {signed}
              <span className="text-[15px] font-bold text-ink-subtle">/{total}</span>
            </span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Signed</span>
          </div>
        </div>
        <div className="sm:hidden">
          <p className="text-[13px] font-semibold text-ink-strong">{allDone ? "All policies signed 🎉" : `${remaining} remaining`}</p>
        </div>
      </div>

      {/* Checklist */}
      <div className="min-w-0 flex-1">
        {total === 0 ? (
          <p className="text-[13.5px] font-medium text-ink-muted">No policies are published yet.</p>
        ) : (
          <>
            <div className="mb-3 hidden items-center gap-2 sm:flex">
              {allDone ? (
                <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }}>
                  <CircleCheck size={13} strokeWidth={2.6} /> All signed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
                  {remaining} remaining
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {policies.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
                  style={{
                    borderColor: p.signed ? "color-mix(in srgb, #16a34a 30%, white)" : "var(--color-hairline)",
                    background: p.signed ? "color-mix(in srgb, #16a34a 6%, white)" : "var(--color-surface-soft)",
                  }}
                >
                  {p.signed ? (
                    <CircleCheck size={17} strokeWidth={2.4} style={{ color: "#15803d" }} className="shrink-0" />
                  ) : (
                    <Circle size={17} strokeWidth={2} className="shrink-0 text-ink-subtle" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-strong">{p.title}</span>
                  <span
                    className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: p.signed ? "#15803d" : "var(--color-ink-subtle)" }}
                  >
                    {p.signed ? "Signed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
            {status && !status.matched && (
              <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
                <UserRound size={13} className="mt-0.5 shrink-0" />
                Not yet linked to an employee account — signatures will appear here once this person joins and signs on day one.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SkillGroupSummary({
  icon, title, items, tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone: "technical" | "nonTechnical";
}) {
  const chip =
    tone === "technical"
      ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: "var(--color-altus-red-deep)" }
      : { background: "color-mix(in srgb, #2563eb 10%, white)", color: "#1d4ed8" };
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        <span className="text-altus-red">{icon}</span> {title}
      </div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-ink-subtle">None ticked yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <span key={s} className="inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-bold" style={chip}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The per-person Exit & Handover summary — exit interview status + handover
 *  clearance progress, or a gentle note when there's nothing on file yet. */
function ExitHandover({ status, loading }: { status: ExitSummary | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid place-items-center py-8 text-ink-muted">
        <Loader2 className="animate-spin" style={{ color: RED }} />
      </div>
    );
  }
  const started = Boolean(status && (status.interviewUpdatedAt || status.handoverUpdatedAt));
  if (!status || !started) {
    return (
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-subtle">
        <UserRound size={13} className="mt-0.5 shrink-0" />
        {status && !status.matched
          ? "Not linked to an employee account yet — exit records will appear here once this person joins and their separation begins."
          : "No exit process on file yet — the exit interview and handover clearance will show here once started."}
      </p>
    );
  }
  const fmtDate = (iso: string) => formatDate(iso);
  const pct = status.handoverTotal > 0 ? Math.round((status.handoverCleared / status.handoverTotal) * 100) : 0;
  const handoverDone = status.handoverTotal > 0 && status.handoverCleared === status.handoverTotal;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Exit interview */}
      <div
        className="rounded-xl border px-4 py-3"
        style={
          status.interviewUpdatedAt
            ? { borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 6%, white)" }
            : { borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }
        }
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
          <MessagesSquare size={13} /> Exit Interview
        </div>
        {status.interviewUpdatedAt ? (
          <p className="text-[13.5px] font-bold" style={{ color: "#15803d" }}>Completed · {fmtDate(status.interviewUpdatedAt)}</p>
        ) : (
          <p className="text-[13.5px] font-medium text-ink-subtle">Not Done Yet</p>
        )}
      </div>

      {/* Handover & clearance */}
      <div
        className="rounded-xl border px-4 py-3"
        style={
          handoverDone
            ? { borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 6%, white)" }
            : { borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }
        }
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
          <ClipboardCheck size={13} /> Handover & Clearance
        </div>
        {status.handoverUpdatedAt ? (
          <>
            <p className="text-[13.5px] font-bold text-ink-strong tabular-nums">
              {status.handoverCleared}/{status.handoverTotal} cleared
              <span className="ml-1 text-[12px] font-semibold" style={{ color: handoverDone ? "#15803d" : RED_DEEP }}>({pct}%)</span>
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: handoverDone ? "#16a34a" : `linear-gradient(90deg, ${RED}, ${RED_DEEP})` }} />
            </div>
            <p className="mt-1 text-[11px] font-medium text-ink-subtle">Updated {fmtDate(status.handoverUpdatedAt)}</p>
          </>
        ) : (
          <p className="text-[13.5px] font-medium text-ink-subtle">Not Started</p>
        )}
      </div>
    </div>
  );
}

/** A Locked / Ready / Done state chip for the onboarding-gated workflow steps. */
function StepBadge({ state }: { state: "locked" | "ready" | "done" }) {
  const map = {
    locked: { bg: "color-mix(in srgb, #f59e0b 14%, white)", fg: "#b45309", label: "Locked", Icon: Lock },
    ready: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: RED_DEEP, label: "Ready", Icon: Circle },
    done: { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d", label: "Done", Icon: CircleCheck },
  }[state];
  const { Icon } = map;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ background: map.bg, color: map.fg }}>
      <Icon size={12} strokeWidth={2.6} /> {map.label}
    </span>
  );
}

/** The "Pending / Action needed" banner at the very top — the actionable
 *  worklist for this person, prioritising the onboarding dependency first. */
function PendingSummary({
  workflow, policy, loading,
}: {
  workflow: WorkflowStatus | null;
  policy: PolicySignStatus | null;
  loading: boolean;
}) {
  const items: string[] = [];
  const matched = workflow?.matched ?? false;

  if (matched) {
    if (!workflow!.onboardingSubmitted) {
      items.push(workflow!.onboardingExists ? "Onboarding form is a draft — awaiting submission" : "Onboarding form not started");
    }
    if (workflow!.onboardingSubmitted && !workflow!.officialEmail) items.push("Official company email not created");
    if (workflow!.onboardingSubmitted && !workflow!.assetsAllocatedAt) items.push("Company assets not allocated");
  }
  if (policy && policy.matched) {
    const pending = policy.policies.filter((p) => !p.signed).length;
    if (pending > 0) items.push(`${pending} ${pending === 1 ? "policy" : "policies"} pending signature`);
  }

  const allClear = matched && items.length === 0;
  const border = allClear
    ? "color-mix(in srgb, #16a34a 34%, white)"
    : items.length > 0
      ? "color-mix(in srgb, #f59e0b 40%, white)"
      : "var(--color-hairline)";
  const bg = allClear
    ? "color-mix(in srgb, #16a34a 7%, white)"
    : items.length > 0
      ? "color-mix(in srgb, #f59e0b 8%, white)"
      : "var(--color-surface-soft)";

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: border, background: bg }}>
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: allClear ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#f59e0b,#b45309)" }}
        >
          {allClear ? <CircleCheck size={18} /> : <AlertTriangle size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
            {loading ? "Checking what needs action…" : allClear ? "All clear — nothing pending" : items.length > 0 ? "Pending · action needed" : "Nothing to action yet"}
          </h2>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">
            {loading
              ? "Loading this person's workflow status."
              : allClear
                ? "Onboarding, email, assets and every policy are complete."
                : items.length > 0
                  ? "Clear these first — they sit above the rest of the file for a reason."
                  : "Not yet linked to an employee account — items appear here once this person joins."}
          </p>
        </div>
      </div>
      {!loading && items.length > 0 && (
        <ul className="mt-3.5 grid gap-2 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it} className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13px] font-semibold text-ink-strong">
              <ArrowRight size={14} strokeWidth={2.6} style={{ color: "#b45309" }} className="shrink-0" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The onboarding form for a SPECIFIC employee.
 *
 * The page at /dossier/onboarding reads `?emp=` and falls back to the signed-in
 * user when it is absent — correct for an employee opening their own form, and
 * exactly wrong for HR opening someone else's. Both links below go through here
 * so neither can lose the parameter again.
 *
 * A null id (the person has not been linked to an employee account yet) yields
 * the bare path; there is no one to point at, and the card that renders it is
 * already showing the "unlinked" state.
 */
function onboardingHref(employeeId: string | null): Route {
  return (employeeId ? `/dossier/onboarding?emp=${employeeId}` : "/dossier/onboarding") as Route;
}

/** First name for a button label, or "" when there is nothing usable — a name
 *  is display sugar here and must never produce "Open ’s Dossier". */
function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

/** This person's document vault. Same rule as the onboarding form: an id-less
 *  /dossier resolves to whoever is LOOKING, so the id goes on the link. */
function dossierHref(employeeId: string | null): Route {
  return (employeeId ? `/dossier?emp=${employeeId}` : "/dossier") as Route;
}

/** Open and EDIT this candidate's own intake record.
 *
 *  `?draft=` resumes the saved row and `saveCandidateDraft` updates it in place
 *  when an id is present — so an edit corrects the existing record instead of
 *  filing a second one. The card used to point at `?new=1`, which opened a BLANK
 *  wizard: "Open candidate form" produced an empty form for a person whose
 *  answers were on screen directly above it, and finishing it created a
 *  duplicate candidate. */
function candidateFormHref(candidateRecordId: string | null): Route {
  return (candidateRecordId ? `/hr/intake?draft=${candidateRecordId}` : "/hr/intake?new=1") as Route;
}

/** The onboarding-form status body — the gating dependency for email + assets. */
function OnboardingCard({ workflow, loading }: { workflow: WorkflowStatus | null; loading: boolean }) {
  if (loading) return <StepSpinner />;
  if (!workflow?.matched) return <UnlinkedNote what="onboarding" />;
  const submitted = workflow.onboardingSubmitted;
  const draft = workflow.onboardingExists && !submitted;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <StepBadge state={submitted ? "done" : "ready"} />
        {submitted && workflow.onboardingSubmittedAt && (
          <span className="text-[12px] font-semibold text-ink-muted">{fmtDay(workflow.onboardingSubmittedAt)}</span>
        )}
      </div>
      <p className="text-[13.5px] font-semibold text-ink-strong">
        {submitted ? "Onboarding form submitted." : draft ? "Onboarding form saved as a draft." : "Onboarding form not started yet."}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-subtle">
        {submitted
          ? "Email creation and asset allocation are unlocked."
          : "Email creation and asset allocation stay locked until this is submitted."}
      </p>
      {!submitted && (
        <Link
          // `?emp=` IS THE FIX: without it the onboarding page falls back to the
          // SIGNED-IN user, so HR opening someone's record landed on their own
          // form — and any edit saved against HR instead of the employee.
          href={onboardingHref(workflow.employeeId)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
        >
          Open onboarding form <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

/** Create-official-email step — locked until onboarding submitted. */
function EmailStepCard({
  workflow, loading, busy, onCreate,
}: {
  workflow: WorkflowStatus | null;
  loading: boolean;
  busy: boolean;
  onCreate: () => void;
}) {
  if (loading) return <StepSpinner />;
  if (!workflow?.matched) return <UnlinkedNote what="email creation" />;

  // "Done" = the person already has a company email (existing staff all do —
  // it's their login), whether or not it went through the provisioning stamp.
  const done = Boolean(workflow.officialEmail);
  const unlocked = workflow.onboardingSubmitted;
  const state: "locked" | "ready" | "done" = done ? "done" : unlocked ? "ready" : "locked";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <StepBadge state={state} />
        {done && workflow.emailProvisionedAt && (
          <span className="text-[12px] font-semibold text-ink-muted">{fmtDay(workflow.emailProvisionedAt)}</span>
        )}
      </div>

      {done ? (
        <>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">Official email</p>
          <p className="mt-0.5 break-all text-[14px] font-black text-ink-strong">{workflow.officialEmail}</p>
          <p className="mt-2 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
            <Mail size={13} className="mt-0.5 shrink-0" />
            {workflow.emailProvisionedAt
              ? "Welcome mail sent to their personal inbox with login details."
              : "Already has a company email — nothing to provision."}
          </p>
        </>
      ) : unlocked ? (
        <>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">Will provision</p>
          <p className="mt-0.5 break-all text-[14px] font-black text-ink-strong">{workflow.suggestedOfficialEmail}</p>
          <button
            type="button"
            onClick={onCreate}
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Mail size={14} /> Create Email & Welcome</>}
          </button>
        </>
      ) : (
        <LockedNote>Unlocks once the onboarding form is submitted.</LockedNote>
      )}
    </div>
  );
}

/** Allocate-assets step — locked until onboarding submitted. */
function AssetsStepCard({
  workflow, loading, busy, onAllocate,
}: {
  workflow: WorkflowStatus | null;
  loading: boolean;
  busy: boolean;
  onAllocate: () => void;
}) {
  if (loading) return <StepSpinner />;
  if (!workflow?.matched) return <UnlinkedNote what="asset allocation" />;

  const done = Boolean(workflow.assetsAllocatedAt);
  const unlocked = workflow.onboardingSubmitted;
  const state: "locked" | "ready" | "done" = done ? "done" : unlocked ? "ready" : "locked";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <StepBadge state={state} />
        {done && workflow.assetsAllocatedAt && (
          <span className="text-[12px] font-semibold text-ink-muted">{fmtDay(workflow.assetsAllocatedAt)}</span>
        )}
      </div>

      {done ? (
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-strong">
          <CircleCheck size={15} strokeWidth={2.4} style={{ color: "#15803d" }} className="mt-0.5 shrink-0" />
          Company assets allocated to this employee.
        </p>
      ) : unlocked ? (
        <>
          <p className="text-[13px] leading-relaxed text-ink-muted">Hand over the laptop, access and kit, then mark it complete.</p>
          <button
            type="button"
            onClick={onAllocate}
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Marking…</> : <><Boxes size={14} /> Mark Assets Allocated</>}
          </button>
        </>
      ) : (
        <LockedNote>Unlocks once the onboarding form is submitted.</LockedNote>
      )}
    </div>
  );
}

function StepSpinner() {
  return (
    <div className="grid place-items-center py-6 text-ink-muted">
      <Loader2 className="animate-spin" style={{ color: RED }} size={18} />
    </div>
  );
}

function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-hairline bg-surface-soft px-3 py-2.5 text-[12.5px] font-medium leading-relaxed text-ink-muted">
      <Lock size={13} className="mt-0.5 shrink-0" style={{ color: "#b45309" }} /> {children}
    </p>
  );
}

function UnlinkedNote({ what }: { what: string }) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-subtle">
      <UserRound size={13} className="mt-0.5 shrink-0" />
      Not yet linked to an employee account — {what} becomes available once this person joins.
    </p>
  );
}

/** Friendly "12 Aug 2026" for an ISO string. */
function fmtDay(iso: string): string {
  return formatDate(iso); // canonical "01 Jan 2026"
}

/**
 * The "Records" body — what this person has actually filled, and the two things
 * an admin needs to do with it: read it and correct it.
 *
 * Two halves:
 *   • The two self-service forms side by side (Onboarding, Candidate Interview),
 *     each showing status + date, the grouped answered-only fields, and an
 *     employee-scoped "Open & edit". A form that isn't on file shows a gentle
 *     empty state with a jump-to-fill button instead.
 *   • Everything the HR forms index holds for them, listed underneath — the
 *     forms with no dedicated block up here (exit interview, handover) would
 *     otherwise be invisible from a person's record.
 *
 * Onboarding appears in both, and that is deliberate: the block gives the live,
 * editable form, the list row gives the frozen read-only submission behind it
 * (with the PDF). They answer different questions.
 */
function RecordsPanel({
  records,
  loading,
  employeeId,
  forms,
  filesLoading,
}: {
  records: PersonRecords | null;
  loading: boolean;
  /** The person whose record is on screen — never the viewer. */
  employeeId: string | null;
  /** Every indexed submission on file for that same person. */
  forms: FiledFormRow[];
  filesLoading: boolean;
}) {
  if (loading) return <StepSpinner />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FormRecordBlock
          icon={<ClipboardList size={15} />}
          title="Onboarding Form"
          status={records?.onboarding?.status ?? null}
          submittedAt={records?.onboarding?.submittedAt ?? null}
          sections={records?.onboarding?.sections ?? null}
          emptyHint="This person hasn't filled their onboarding joining form yet."
          fillLabel="Fill Onboarding Form"
          fillHref={onboardingHref(employeeId)}
          editHref={onboardingHref(employeeId)}
          editHint="Address, phone, bank and ID details — saved onto this person's record."
          /* With no resolved employee there is nothing to edit safely: an id-less
             link opens the VIEWER's own onboarding form. */
          editDisabled={!employeeId}
        />
        <FormRecordBlock
          icon={<Contact size={15} />}
          title="Candidate Record"
          status={records?.candidate?.status ?? null}
          submittedAt={records?.candidate?.submittedAt ?? null}
          sections={records?.candidate?.sections ?? null}
          emptyHint="No candidate interview form is on file for this person."
          fillLabel="Fill Candidate Interview Form"
          fillHref={"/hr/intake?new=1" as Route}
          editHref={candidateFormHref(records?.candidate?.id ?? null)}
          editHint="Resumes their saved interview record — it updates in place, no second copy."
          editDisabled={!records?.candidate?.id}
        />
      </div>
      <SavedFormsList forms={forms} loading={filesLoading} />
    </div>
  );
}

/**
 * Every submission the HR forms index holds for this person, each openable.
 *
 * The index (`hr_form_submissions`) is keyed by employee, so a row here belongs
 * to the selected person by construction — View follows the ROW id, never a
 * module route that would re-resolve the employee from the session.
 *
 * Edit is offered only where the destination takes the employee's id (see
 * employeeFormEditHref). Where it does not, the module link is labelled as a
 * module link rather than dressed up as an edit link for this person.
 */
function SavedFormsList({ forms, loading }: { forms: FiledFormRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-card px-4 py-6">
        <StepSpinner />
      </div>
    );
  }
  if (forms.length === 0) return null;

  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          <FileText size={15} />
        </span>
        <h3 className="text-[14.5px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
          All Saved Forms
        </h3>
        <span className="ml-auto inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold tabular-nums" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
          {forms.length}
        </span>
      </div>

      <p className="mb-2.5 text-[11.5px] font-medium leading-relaxed text-ink-subtle">
        Every submission on file for this person. <strong className="font-bold text-ink-muted">View</strong> opens
        the saved answers read-only (with a PDF); <strong className="font-bold text-ink-muted">Edit</strong> opens
        their own copy of the form.
      </p>
      <ul className="flex flex-col gap-2">
        {forms.map((f) => {
          const tone = recordStatusTone(f.status);
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold text-ink-strong">{f.formName}</span>
                <span className="block text-[11.5px] font-semibold text-ink-subtle">
                  {f.sectionLabel}
                  {f.dateIso ? ` · ${f.status === "submitted" ? "Submitted" : "Last saved"} ${fmtDay(f.dateIso)}` : ""}
                </span>
              </span>
              <span className="inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                {tone.label}
              </span>
              <Link
                href={f.viewHref as Route}
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <Eye size={13} /> View
              </Link>
              {f.editHref ? (
                <Link
                  href={f.editHref as Route}
                  className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold text-white transition-opacity hover:opacity-95"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  <PenLine size={13} /> Edit
                </Link>
              ) : f.moduleHref ? (
                <Link
                  href={f.moduleHref as Route}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3 py-1.5 text-[12px] font-bold text-ink-muted transition-colors hover:bg-surface-soft"
                  title="Opens the module this form lives in — pick the person there."
                >
                  Open module <ArrowUpRight size={13} />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Letters already ISSUED to this person, newest first, opened straight from
 * their signed storage URL. Renders nothing when there are none, so the Letters
 * card looks exactly as it does today for anyone with no letters yet.
 */
function IssuedLetters({ letters, loading }: { letters: LetterFileRow[]; loading: boolean }) {
  if (loading || letters.length === 0) return null;
  return (
    <div className="mb-3 rounded-xl border border-hairline bg-surface-soft p-3">
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        Issued to this person · {letters.length}
      </p>
      <ul className="flex flex-col gap-1.5">
        {letters.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-ink-strong">{l.title}</span>
              <span className="block text-[11.5px] font-semibold text-ink-subtle">
                {l.label}
                {l.dateIso ? ` · ${fmtDay(l.dateIso)}` : ""}
              </span>
            </span>
            {l.signedUrl ? (
              <a
                href={l.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <Eye size={13} /> Open
              </a>
            ) : (
              // The row exists but its storage path would not sign. Saying so
              // beats a dead button that reads as "the file is missing".
              <span className="text-[11.5px] font-semibold text-ink-subtle">Link unavailable</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tone for an onboarding status ('submitted' | 'draft'); candidate statuses reuse
 *  the page-level STATUS_TONE map. */
function recordStatusTone(status: string): { bg: string; fg: string; label: string } {
  if (STATUS_TONE[status]) return STATUS_TONE[status]!;
  if (status === "submitted") return { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d", label: "Submitted" };
  if (status === "draft") return { bg: "color-mix(in srgb, #f59e0b 14%, white)", fg: "#b45309", label: "Draft" };
  return { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", label: status };
}

/**
 * One filled-form block — the status header, the ACTUAL ANSWERS in collapsible
 * sections, and the two things an admin came here to do: open the form and
 * correct it.
 *
 * ── OPEN & EDIT IS ONE BUTTON, NOT TWO ─────────────────────────────────────
 * These forms have no separate read-only page of their own: the form IS the
 * viewer, pre-filled with what was saved. Offering "View" and "Edit" as two
 * links to the same route would only suggest a safe read that does not exist.
 * The answers ARE readable without leaving — that is what the sections below
 * are — so the link says exactly what following it does.
 *
 * `editDisabled` covers the case where the person did not resolve to a record:
 * the button becomes an explanation instead of a link, because the link would
 * silently fall back to the viewer's own form.
 */
function FormRecordBlock({
  icon, title, status, submittedAt, sections, emptyHint, fillLabel, fillHref,
  editHref, editHint, editDisabled,
}: {
  icon: React.ReactNode;
  title: string;
  status: string | null;
  submittedAt: string | null;
  sections: RecordSection[] | null;
  emptyHint: string;
  fillLabel: string;
  fillHref: Route;
  /** Employee-scoped editor for THIS person's copy of the form. */
  editHref: Route;
  /** One line under the button saying what editing actually changes. */
  editHint: string;
  /** True when the subject could not be resolved — no safe link exists. */
  editDisabled: boolean;
}) {
  const exists = status !== null;
  const filled = sections ?? [];
  const tone = exists ? recordStatusTone(status!) : null;

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          {icon}
        </span>
        <h3 className="text-[14.5px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
          {title}
        </h3>
        {tone && (
          <span className="ml-auto inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
            {tone.label}
          </span>
        )}
      </div>

      {!exists ? (
        <div className="flex flex-1 flex-col items-start justify-center rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-4 py-6">
          <p className="flex items-start gap-2 text-[12.5px] font-medium leading-relaxed text-ink-muted">
            <FileText size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
            {emptyHint}
          </p>
          <Link
            href={fillHref}
            className="mt-3 inline-flex items-center gap-2 rounded-pill px-3.5 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-95"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
          >
            <PenLine size={13} /> {fillLabel}
          </Link>
        </div>
      ) : (
        <>
          {submittedAt && (
            <p className="mb-2 text-[11.5px] font-semibold tabular-nums text-ink-subtle">
              {status === "submitted" || STATUS_TONE[status ?? ""] ? "Submitted" : "Updated"} {fmtDay(submittedAt)}
            </p>
          )}
          {filled.length === 0 ? (
            <p className="rounded-xl border border-hairline bg-surface-soft px-3 py-3 text-[12.5px] font-medium text-ink-muted">
              Started, but no details captured yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {filled.map((sec, i) => (
                <RecordSectionDetails key={sec.title} section={sec} defaultOpen={i === 0} />
              ))}
            </div>
          )}

          <div className="mt-3">
            {editDisabled ? (
              <LockedNote>
                This person isn&apos;t linked to a record yet, so there is nothing to open — link
                them first and the form becomes editable here.
              </LockedNote>
            ) : (
              <>
                <Link
                  href={editHref}
                  className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-95"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
                >
                  <PenLine size={13} /> Open &amp; edit <ArrowUpRight size={13} />
                </Link>
                <p className="mt-2 text-[11.5px] font-medium leading-relaxed text-ink-subtle">{editHint}</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A collapsible section of answered label/value pairs. */
function RecordSectionDetails({ section, defaultOpen }: { section: RecordSection; defaultOpen: boolean }) {
  return (
    <details className="rec-details group rounded-xl border border-hairline bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink-strong">{section.title}</span>
        <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
          {section.items.length}
        </span>
        <ChevronDown size={15} strokeWidth={2.4} className="rec-chevron shrink-0 text-ink-subtle transition-transform" />
      </summary>
      <dl className="grid gap-x-4 gap-y-2 border-t border-hairline px-3 py-3 sm:grid-cols-2">
        {section.items.map((it) => (
          <div key={it.label} className="min-w-0">
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-soft">{it.label}</dt>
            <dd className="mt-0.5 break-words text-[13px] font-semibold tabular-nums text-ink-strong">{it.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function RecordCard({
  n, icon, title, sub, right, children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  sub: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-black tabular-nums text-ink-subtle">{String(n).padStart(2, "0")}</span>
            <h2 className="text-[17px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
              {title}
            </h2>
            {right && <span className="ml-auto">{right}</span>}
          </div>
          <p className="mt-0.5 text-[13px] font-medium leading-snug text-ink-muted">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * The roster — every person on file as a card grid (searchable). Opening any card
 * loads their full A–Z record below (onboarding · email · assets · letters ·
 * documents · policies · exit · skills), each with a jump-to-fill link. This is
 * the "see everyone, then go fill whatever's missing" front door.
 */
function Roster({
  candidates,
  query,
  onQuery,
  onSelect,
}: {
  candidates: CandidateRow[];
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? candidates.filter((c) =>
        `${c.fullName ?? ""} ${c.positionApplied ?? ""} ${c.position ?? ""} ${c.department ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : candidates;

  return (
    <div className="mt-6 rec-fade">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="flex items-center gap-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.01em" }}
          >
            All people
            <span className="rounded-pill px-2.5 py-0.5 text-[12px] font-black" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
              {candidates.length}
            </span>
          </h2>
          <p className="mt-0.5 text-[13px] font-medium text-ink-muted">
            Open anyone to work their whole file A–Z — letters, email, assets, policies, documents and exit.
          </p>
        </div>
        <CollapsibleSearch scope="name, role or department">
        <div className="relative w-full max-w-[320px]">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Local search — name, role or department" title="Local search — filters only the list on this page" aria-label="Local search — name, role or department — this page only"
            className="w-full rounded-xl border border-hairline-strong bg-white py-2.5 pl-9 pr-3 text-[13.5px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
          />
        </div>
        </CollapsibleSearch>
      </div>

      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-hairline-strong bg-white px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
            <IdCard size={26} strokeWidth={2.1} />
          </span>
          <p className="mt-3 text-[15px] font-bold text-ink-strong">
            {candidates.length === 0 ? "No people on file yet" : "No one matches that search"}
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink-muted">
            {candidates.length === 0 ? "People appear here as candidates are entered." : "Try a different name, role or department."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <RosterCard key={c.id} c={c} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The centrepiece person picker — a premium, command-style searchable combobox
 * that replaces the raw native `<select>`. The trigger shows the selected
 * person's character Avatar + name + designation; clicking (or ArrowDown) opens
 * a glass panel with a search box and a keyboard-navigable list. Type to filter
 * by name / role / department, ↑/↓ to move, Enter to pick, Esc to close. Each
 * row carries a character Avatar and a "Complete / Details missing" chip driven
 * by onboarding `pct`.
 */
function PersonPicker({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: CandidateRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      q
        ? candidates.filter((c) =>
            `${c.fullName ?? ""} ${c.positionApplied ?? ""} ${c.position ?? ""} ${c.department ?? ""}`
              .toLowerCase()
              .includes(q),
          )
        : candidates,
    [candidates, q],
  );

  // Reset the active row whenever the filter changes.
  React.useEffect(() => { setActive(0); }, [q]);

  // Focus the search box on open; clear the query on close.
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery("");
    return undefined;
  }, [open]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return undefined;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the active option scrolled into view.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(id: string) {
    onSelect(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) { e.preventDefault(); choose(filtered[active]!.id); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        data-autofocus
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="rec-trigger flex w-full items-center gap-3 rounded-xl border border-hairline-strong bg-white px-3 py-2.5 text-left transition-colors hover:border-altus-red focus:border-altus-red focus:outline-none"
      >
        {selected ? (
          <>
            <Avatar name={selected.fullName} avatarUrl={selected.avatarUrl} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-ink-strong">{selected.fullName || "Unnamed"}</span>
              <span className="block truncate text-[12px] font-medium text-ink-muted">
                {[selected.positionApplied || selected.position, selected.department].filter(Boolean).join(" · ") || "Position not set"}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
              <UserRound size={17} />
            </span>
            <span className="flex-1 text-[14.5px] font-semibold text-ink-muted">Select a person…</span>
          </>
        )}
        <ChevronsUpDown size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
      </button>

      {/* Panel */}
      {open && (
        <div className="rec-panel absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-hairline-strong bg-white shadow-[0_24px_60px_-24px_rgba(24,24,27,0.5)]">
          <div className="border-b border-hairline p-2.5">
            <CollapsibleSearch scope="name, role or department">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Local search — name, role or department" title="Local search — filters only the list on this page" aria-label="Local search — name, role or department — this page only"
                className="w-full rounded-lg border border-hairline-strong bg-surface-soft py-2.5 pl-9 pr-8 text-[13.5px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red focus:bg-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 inline-grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-white hover:text-ink-strong"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
            </CollapsibleSearch>
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] font-medium text-ink-muted">
              No one matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <ul ref={listRef} role="listbox" className="rec-scroll max-h-[320px] overflow-y-auto p-1.5">
              {filtered.map((c, i) => {
                const isSel = c.id === selectedId;
                const isActive = i === active;
                const roleLine = [c.positionApplied || c.position, c.department].filter(Boolean).join(" · ") || "Position not set";
                const incomplete = isIncomplete(c);
                return (
                  <li key={c.id} data-idx={i} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(c.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
                      style={isActive ? { background: "color-mix(in srgb, var(--color-altus-red) 8%, white)" } : undefined}
                    >
                      <Avatar name={c.fullName} avatarUrl={c.avatarUrl} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink-strong">
                          <span className="truncate">{c.fullName || "Unnamed"}</span>
                          {isSel && <Check size={13} strokeWidth={3} className="shrink-0" style={{ color: "var(--color-green-deep)" }} />}
                        </span>
                        <span className="block truncate text-[12px] font-medium text-ink-muted">{roleLine}</span>
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em]"
                        style={
                          incomplete
                            ? { background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }
                            : { background: "var(--color-green-bg)", color: "var(--color-green-deep)" }
                        }
                      >
                        {incomplete ? (
                          <><AlertTriangle size={10} strokeWidth={2.6} /> Details missing</>
                        ) : (
                          <><CircleCheck size={10} strokeWidth={2.6} /> Complete</>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RosterCard({ c, onSelect }: { c: CandidateRow; onSelect: (id: string) => void }) {
  const tone = STATUS_TONE[c.status ?? "new"] ?? STATUS_TONE.new!;
  const role = c.positionApplied || c.position;
  const roleLine = [role, c.department].filter(Boolean).join(" · ") || "Position not set";
  const incomplete = isIncomplete(c);
  return (
    <div className="wg-sheen group flex h-full flex-col rounded-2xl border border-hairline bg-white p-4 shadow-[0_10px_30px_-24px_rgba(24,24,27,0.5)] transition-all hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-md">
      <button type="button" onClick={() => onSelect(c.id)} className="flex items-center gap-3 text-left">
        <Avatar name={c.fullName} avatarUrl={c.avatarUrl} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-black leading-tight text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
            {c.fullName || "Unnamed"}
          </span>
          <span className="block truncate text-[12.5px] font-medium text-ink-muted">{roleLine}</span>
        </span>
        <span className="shrink-0 rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
          {tone.label}
        </span>
      </button>

      <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
        {incomplete && (
          <span className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[11px] font-bold" style={{ background: "color-mix(in srgb, #f59e0b 14%, white)", color: "#b45309" }}>
            <AlertTriangle size={11} strokeWidth={2.6} /> Details missing
          </span>
        )}
        <button
          type="button"
          onClick={() => onSelect(c.id)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-95"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          Open record <ArrowRight size={13} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

const CSS = `
  .rec-fade { animation: recFade 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes recFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

  /* Body grid — a gentle staggered cascade as the person's file loads. */
  .rec-grid > section { animation: recFade 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .rec-grid > section:nth-child(1) { animation-delay: 0ms; }
  .rec-grid > section:nth-child(2) { animation-delay: 45ms; }
  .rec-grid > section:nth-child(3) { animation-delay: 90ms; }
  .rec-grid > section:nth-child(4) { animation-delay: 135ms; }
  .rec-grid > section:nth-child(5) { animation-delay: 180ms; }
  .rec-grid > section:nth-child(6) { animation-delay: 225ms; }
  .rec-grid > section:nth-child(7) { animation-delay: 270ms; }
  .rec-grid > section:nth-child(8) { animation-delay: 315ms; }
  .rec-grid > section:nth-child(n+9) { animation-delay: 360ms; }

  /* Person picker */
  .rec-trigger:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 16%, transparent); }
  .rec-panel { animation: recPop 0.16s cubic-bezier(0.22,1,0.36,1) both; transform-origin: top center; }
  @keyframes recPop { from { opacity: 0; transform: translateY(-6px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .rec-scroll { scrollbar-width: thin; scrollbar-color: var(--color-hairline-strong) transparent; }
  .rec-scroll::-webkit-scrollbar { width: 8px; }
  .rec-scroll::-webkit-scrollbar-thumb { background: var(--color-hairline-strong); border-radius: 9999px; border: 2px solid transparent; background-clip: content-box; }

  /* Records — collapsible section chevron */
  .rec-details summary::-webkit-details-marker { display: none; }
  .rec-details[open] .rec-chevron { transform: rotate(180deg); }
  .rec-details summary:hover { background: color-mix(in srgb, var(--color-altus-red) 4%, white); border-radius: 0.75rem; }

  @media (prefers-reduced-motion: reduce) {
    .rec-fade, .rec-panel, .rec-grid > section { animation: none !important; }
  }
`;
