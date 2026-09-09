"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Gauge,
  Mic,
  Square,
  Pause,
  Play,
  Trash2,
  UploadCloud,
  Loader2,
  Save,
  Check,
  FileText,
  FileImage,
  FileVideo,
  File as FileIcon,
  AudioLines,
  Paperclip,
  StickyNote,
  X,
  UserRound,
  IdCard,
  CalendarDays,
  ClipboardCheck,
  Trophy,
  Sparkles,
  UserSearch,
  Mail,
  ListChecks,
  FilePlus2,
  Send,
  ArrowUpRight,
  IndianRupee,
  Scale,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import {
  getCandidateEvaluation,
  setCandidateStatus,
} from "@/app/(app)/hr/candidate-actions";
import {
  getManagementAssessment,
  saveManagementAssessment,
  deleteManagementFile,
  sendRecruiterOutcome,
  createAssignmentTask,
  type MgmtRecordingView,
  type MgmtAttachmentView,
  type MgmtOutcome,
} from "@/app/(app)/hr/management-assessment-actions";
import { type SkillSelection } from "@/components/hr/candidate/skill-multiselect";
import type { SkillLookupOptions } from "@/lib/hr/skills";
import { type Ratings } from "@/lib/hr/candidate/evaluation-checklist";
import { weightedOverall, type EvaluationWeights } from "@/lib/hr/candidate/evaluation-weights";

const UPLOAD_URL = "/api/hr/management-assessment/upload";

/** outcome → { pipeline status, letter key, compose label }. */
const OUTCOME_MAP: Record<
  Exclude<MgmtOutcome, null>,
  { status: string; letterKey: string; letterLabel: string; label: string }
> = {
  selected: { status: "hired", letterKey: "selection", letterLabel: "Selection letter", label: "Selected" },
  shortlisted: { status: "shortlisted", letterKey: "next-round", letterLabel: "Next-round letter", label: "Shortlisted" },
  rejected: { status: "rejected", letterKey: "rejection", letterLabel: "Rejection letter", label: "Rejected" },
};
const OUTCOME_ORDER: Exclude<MgmtOutcome, null>[] = ["selected", "shortlisted", "rejected"];

const EMPTY_SKILLS: SkillSelection = { technical: [], nonTechnical: [] };
const BAR_COUNT = 32;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function attachKind(mime: string): "image" | "video" | "pdf" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "file";
}
const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", label: "New" },
  shortlisted: { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d", label: "Shortlisted" },
  rejected: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)", label: "Rejected" },
  hired: { bg: "color-mix(in srgb, #2563eb 12%, white)", fg: "#1d4ed8", label: "Hired" },
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
function getSpeechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
function pickAudioMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  const candidates: [string, string][] = [["audio/webm", "webm"], ["audio/mp4", "m4a"], ["audio/ogg", "ogg"]];
  for (const [mime, ext] of candidates) {
    try { if (MediaRecorder.isTypeSupported(mime)) return { mime, ext }; } catch { /* noop */ }
  }
  return { mime: "", ext: "webm" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export function ManagementAssessmentScreen({
  candidates,
  skillOptions,
  isAdmin,
  weights,
}: {
  candidates: CandidateRow[];
  skillOptions: SkillLookupOptions;
  isAdmin: boolean;
  weights: EvaluationWeights;
}) {
  const [candidateId, setCandidateId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [recordings, setRecordings] = React.useState<MgmtRecordingView[]>([]);
  const [attachments, setAttachments] = React.useState<MgmtAttachmentView[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [preview, setPreview] = React.useState<{ kind: "image" | "video"; url: string; name: string } | null>(null);

  // ── Decision + hiring metadata (0162) — all live in the same MA blob ──
  const [designation, setDesignation] = React.useState("");
  const [dateOfJoining, setDateOfJoining] = React.useState("");
  const [outcome, setOutcome] = React.useState<MgmtOutcome>(null);
  const [recruiterVia, setRecruiterVia] = React.useState(false);
  const [recruiterName, setRecruiterName] = React.useState("");
  const [recruiterEmail, setRecruiterEmail] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [skills, setSkills] = React.useState<SkillSelection>(EMPTY_SKILLS);
  const [oneMore, setOneMore] = React.useState(false);
  const [assignmentBrief, setAssignmentBrief] = React.useState("");
  // Management round's own score (0..10) + proposed salary (only when Selected).
  const [managementScore, setManagementScore] = React.useState<number | null>(null);
  const [proposedSalary, setProposedSalary] = React.useState("");
  // Ratings (Candidate Evaluation) — persisted SEPARATELY via saveCandidateEvaluation.
  const [ratings, setRatings] = React.useState<Ratings>({});
  // Optimistic pipeline status so the left rail reflects the chosen outcome.
  const [statusOverride, setStatusOverride] = React.useState<string | null>(null);
  const [emailingRecruiter, setEmailingRecruiter] = React.useState(false);
  const [creatingTask, setCreatingTask] = React.useState(false);

  // Refs mirror state so saveNow() always persists the freshest blob.
  const notesRef = React.useRef(notes); notesRef.current = notes;
  const recRef = React.useRef(recordings); recRef.current = recordings;
  const attRef = React.useRef(attachments); attRef.current = attachments;
  const cidRef = React.useRef(candidateId); cidRef.current = candidateId;
  const designationRef = React.useRef(designation); designationRef.current = designation;
  const dojRef = React.useRef(dateOfJoining); dojRef.current = dateOfJoining;
  const outcomeRef = React.useRef(outcome); outcomeRef.current = outcome;
  const recruiterViaRef = React.useRef(recruiterVia); recruiterViaRef.current = recruiterVia;
  const recruiterNameRef = React.useRef(recruiterName); recruiterNameRef.current = recruiterName;
  const recruiterEmailRef = React.useRef(recruiterEmail); recruiterEmailRef.current = recruiterEmail;
  const rejectionReasonRef = React.useRef(rejectionReason); rejectionReasonRef.current = rejectionReason;
  const skillsRef = React.useRef(skills); skillsRef.current = skills;
  const oneMoreRef = React.useRef(oneMore); oneMoreRef.current = oneMore;
  const briefRef = React.useRef(assignmentBrief); briefRef.current = assignmentBrief;
  const mScoreRef = React.useRef(managementScore); mScoreRef.current = managementScore;
  const proposedSalaryRef = React.useRef(proposedSalary); proposedSalaryRef.current = proposedSalary;
  const ratingsRef = React.useRef(ratings); ratingsRef.current = ratings;
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const evalTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = candidates.find((c) => c.id === candidateId) ?? null;
  const liveStatus = statusOverride ?? selected?.status ?? "new";

  const saveNow = React.useCallback(async () => {
    const id = cidRef.current;
    if (!id) return;
    setSaving(true);
    try {
      const res = await saveManagementAssessment(id, {
        notes: notesRef.current,
        recordings: recRef.current.map((r) => ({ path: r.path, durationSec: r.durationSec, createdAt: r.createdAt })),
        attachments: attRef.current.map((a) => ({ path: a.path, name: a.name, mime: a.mime, size: a.size })),
        designation: designationRef.current || undefined,
        dateOfJoining: dojRef.current || undefined,
        outcome: outcomeRef.current,
        oneMoreAssignment: oneMoreRef.current,
        assignmentBrief: briefRef.current || undefined,
        recruiter: { via: recruiterViaRef.current, name: recruiterNameRef.current || undefined, email: recruiterEmailRef.current || undefined },
        rejectionReason: rejectionReasonRef.current || undefined,
        skills: { technical: skillsRef.current.technical, nonTechnical: skillsRef.current.nonTechnical },
        managementScore: mScoreRef.current ?? undefined,
        proposedSalary: proposedSalaryRef.current || undefined,
      });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, []);

  /** Debounced save of the MA blob (notes + all decision fields together). */
  const scheduleSave = React.useCallback(() => {
    if (!cidRef.current) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 900);
  }, [saveNow]);

  async function selectCandidate(id: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (evalTimer.current) clearTimeout(evalTimer.current);
    setCandidateId(id);
    cidRef.current = id;
    setNotes(""); setRecordings([]); setAttachments([]); setDirty(false);
    setDesignation(""); setDateOfJoining(""); setOutcome(null);
    setRecruiterVia(false); setRecruiterName(""); setRecruiterEmail("");
    setRejectionReason(""); setSkills(EMPTY_SKILLS); setOneMore(false); setAssignmentBrief("");
    setManagementScore(null); mScoreRef.current = null; setProposedSalary(""); proposedSalaryRef.current = "";
    setRatings({}); setStatusOverride(null);
    if (!id) return;
    const cand = candidates.find((c) => c.id === id) ?? null;
    setLoading(true);
    try {
      const [state, evalRatings] = await Promise.all([
        getManagementAssessment(id),
        getCandidateEvaluation(id),
      ]);
      setNotes(state.notes);
      setRecordings(state.recordings);
      setAttachments(state.attachments);
      // Designation defaults to the candidate's applied position when unset.
      setDesignation(state.designation ?? cand?.position ?? cand?.positionApplied ?? "");
      setDateOfJoining(state.dateOfJoining ?? "");
      setOutcome(state.outcome ?? null);
      const rec = state.recruiter;
      setRecruiterVia(rec?.via ?? false);
      setRecruiterName(rec?.name ?? cand?.recruiterName ?? "");
      setRecruiterEmail(rec?.email ?? "");
      setRejectionReason(state.rejectionReason ?? "");
      setSkills(state.skills ? { technical: state.skills.technical, nonTechnical: state.skills.nonTechnical } : EMPTY_SKILLS);
      setOneMore(state.oneMoreAssignment ?? false);
      setAssignmentBrief(state.assignmentBrief ?? "");
      setManagementScore(state.managementScore ?? null); mScoreRef.current = state.managementScore ?? null;
      setProposedSalary(state.proposedSalary ?? ""); proposedSalaryRef.current = state.proposedSalary ?? "";
      setRatings(evalRatings);
    } catch {
      fireToast({ message: "Couldn't load this candidate's assessment.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  // Debounced notes autosave (part of the single MA blob save).
  function onNotesChange(v: string) {
    setNotes(v); notesRef.current = v;
    scheduleSave();
  }

  // ── Decision-field setters: update state + ref, then debounce-save the blob ──
  function updateDesignation(v: string) { setDesignation(v); designationRef.current = v; scheduleSave(); }
  function updateDoj(v: string) { setDateOfJoining(v); dojRef.current = v; scheduleSave(); }
  function updateRecruiterName(v: string) { setRecruiterName(v); recruiterNameRef.current = v; scheduleSave(); }
  function updateRecruiterEmail(v: string) { setRecruiterEmail(v); recruiterEmailRef.current = v; scheduleSave(); }
  function updateRejectionReason(v: string) { setRejectionReason(v); rejectionReasonRef.current = v; scheduleSave(); }
  function updateBrief(v: string) { setAssignmentBrief(v); briefRef.current = v; scheduleSave(); }

  function updateManagementScore(v: number | null) { setManagementScore(v); mScoreRef.current = v; scheduleSave(); }
  function updateProposedSalary(v: string) { setProposedSalary(v); proposedSalaryRef.current = v; scheduleSave(); }

  function toggleRecruiterVia() {
    const next = !recruiterViaRef.current;
    setRecruiterVia(next); recruiterViaRef.current = next;
    // Prefill the recruiter name from intake the first time it's turned on.
    if (next && !recruiterNameRef.current && selected?.recruiterName) {
      setRecruiterName(selected.recruiterName); recruiterNameRef.current = selected.recruiterName;
    }
    scheduleSave();
  }

  function toggleOneMore() {
    const next = !oneMoreRef.current;
    setOneMore(next); oneMoreRef.current = next;
    scheduleSave();
  }

  async function chooseOutcome(next: Exclude<MgmtOutcome, null>) {
    const value: MgmtOutcome = outcomeRef.current === next ? null : next;
    setOutcome(value); outcomeRef.current = value;
    scheduleSave();
    if (value) {
      const status = OUTCOME_MAP[value].status;
      setStatusOverride(status);
      const res = await setCandidateStatus(cidRef.current, status);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    }
  }

  async function emailRecruiter() {
    const email = recruiterEmailRef.current.trim();
    const oc = outcomeRef.current;
    if (!oc || oc === "shortlisted" || !email) return;
    setEmailingRecruiter(true);
    try {
      const res = await sendRecruiterOutcome(cidRef.current, {
        to: email,
        recruiterName: recruiterNameRef.current || undefined,
        outcome: oc,
        reason: oc === "rejected" ? rejectionReasonRef.current || undefined : undefined,
      });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      if (res.skipped) {
        fireToast({ message: "Recruiter email is set up but Resend isn't configured yet." });
      } else {
        fireToast({ message: "Outcome emailed to the recruiter." });
      }
    } finally {
      setEmailingRecruiter(false);
    }
  }

  async function createTask() {
    const brief = briefRef.current.trim();
    if (!brief) { fireToast({ message: "Write a short assignment brief first.", type: "error" }); return; }
    setCreatingTask(true);
    try {
      const res = await createAssignmentTask(cidRef.current, { brief });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Assignment task created (Initiated · Critical)." });
    } finally {
      setCreatingTask(false);
    }
  }

  const addRecording = React.useCallback((rec: MgmtRecordingView) => {
    setRecordings((p) => { const next = [...p, rec]; recRef.current = next; return next; });
    void saveNow();
  }, [saveNow]);

  const addAttachments = React.useCallback((items: MgmtAttachmentView[]) => {
    if (items.length === 0) return;
    setAttachments((p) => { const next = [...p, ...items]; attRef.current = next; return next; });
    void saveNow();
  }, [saveNow]);

  async function removeRecording(path: string) {
    setRecordings((p) => { const next = p.filter((r) => r.path !== path); recRef.current = next; return next; });
    void deleteManagementFile(path);
    void saveNow();
  }
  async function removeAttachment(path: string) {
    setAttachments((p) => { const next = p.filter((a) => a.path !== path); attRef.current = next; return next; });
    void deleteManagementFile(path);
    void saveNow();
  }

  React.useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (evalTimer.current) clearTimeout(evalTimer.current);
  }, []);

  const noCandidate = !candidateId;
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0;
  const overall = weightedOverall(ratings, weights);

  return (
    <>
      <style>{CSS}</style>

      <PageShell width="standard" py={false} className="pt-6 pb-24">
        {/* Two-pane */}
        <div className="grid grid-cols-[340px_1fr] gap-6 max-lg:grid-cols-1">
          {/* LEFT — candidate context */}
          <aside className="max-lg:order-1">
            <div className="lg:sticky lg:top-[76px] space-y-4">
              <div className="rounded-2xl border border-hairline bg-white p-5">
                <label htmlFor="ma-candidate" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                  Candidate
                </label>
                <div className="ma-select-wrap">
                  <select
                    id="ma-candidate"
                    data-autofocus
                    value={candidateId}
                    onChange={(e) => selectCandidate(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-hairline-strong bg-white px-3.5 py-3 pr-9 text-[14.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
                  >
                    <option value="">— Select candidate —</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName || "Unnamed"}{c.positionApplied ? ` · ${c.positionApplied}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {selected ? (
                  <div className="mt-4 ma-fade">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[16px] font-black text-white"
                        style={{ background: "linear-gradient(135deg,#E10600,#A80400)", boxShadow: "0 10px 22px -12px rgba(168,4,0,0.7)" }}
                      >
                        {initials(selected.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-black leading-tight text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
                          {selected.fullName || "Unnamed"}
                        </p>
                        <p className="truncate text-[13px] font-medium text-ink-muted">{selected.positionApplied || "Position not set"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusPill status={liveStatus} />
                      {selected.mobile && <MetaChip>{selected.mobile}</MetaChip>}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <StatTile icon={<AudioLines size={15} />} n={recordings.length} label="Recordings" />
                      <StatTile icon={<Paperclip size={15} />} n={attachments.length} label="Files" />
                      <StatTile icon={<StickyNote size={15} />} n={words} label="Words" />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-subtle">
                    Choose who you assessed to begin. The workspace unlocks on the right.
                  </p>
                )}
              </div>

              {/* Save status card */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-white px-4 py-3">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" style={{ color: "var(--color-altus-red)" }} /> Saving…</>
                  ) : dirty ? (
                    <><span className="ma-dot inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-altus-red)" }} /> Unsaved Changes</>
                  ) : candidateId ? (
                    <><Check size={14} strokeWidth={3} style={{ color: "#15803d" }} /> All Changes Saved</>
                  ) : (
                    <>Nothing to Save Yet</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void saveNow()}
                  disabled={saving || !candidateId}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                >
                  <Save size={14} /> Save
                </button>
              </div>
            </div>
          </aside>

          {/* RIGHT — workspace */}
          <section className="min-w-0 space-y-5 max-lg:order-2">
            {noCandidate ? (
              <EmptyState />
            ) : loading ? (
              <div className="grid place-items-center rounded-2xl border border-hairline bg-white py-14 text-ink-muted">
                <Loader2 className="animate-spin" style={{ color: "var(--color-altus-red)" }} />
                <p className="mt-2 text-[13.5px] font-medium">Loading this candidate&apos;s assessment…</p>
              </div>
            ) : (
              <>
                <RoleDesignationCard
                  role={selected?.position ?? selected?.positionApplied ?? ""}
                  department={selected?.department ?? ""}
                  designation={designation}
                  dateOfJoining={dateOfJoining}
                  onDesignation={updateDesignation}
                  onDoj={updateDoj}
                />

                <EvaluationCard candidateId={candidateId} />

                <ScoresCard
                  hrScore={overall.rated ? overall.avg : null}
                  hrRated={overall.rated}
                  managementScore={managementScore}
                  onManagementScore={updateManagementScore}
                />

                <SkillsSummaryCard value={skills} />

                <RecruiterCard
                  via={recruiterVia}
                  name={recruiterName}
                  email={recruiterEmail}
                  outcome={outcome}
                  rejectionReason={rejectionReason}
                  emailing={emailingRecruiter}
                  onToggleVia={toggleRecruiterVia}
                  onName={updateRecruiterName}
                  onEmail={updateRecruiterEmail}
                  onReason={updateRejectionReason}
                  onEmailRecruiter={emailRecruiter}
                />

                <AssignmentCard
                  enabled={oneMore}
                  brief={assignmentBrief}
                  candidateId={candidateId}
                  creating={creatingTask}
                  onToggle={toggleOneMore}
                  onBrief={updateBrief}
                  onCreateTask={createTask}
                />

                <NotesCard value={notes} onChange={onNotesChange} />
                <RecordingsCard recordings={recordings} candidateId={candidateId} onAdd={addRecording} onRemove={removeRecording} />
                <AttachmentsCard attachments={attachments} onAdd={addAttachments} onRemove={removeAttachment} onPreview={setPreview} />

                {/* Outcome — the management verdict is the FINAL step. */}
                <OutcomeCard
                  outcome={outcome}
                  onChoose={chooseOutcome}
                  candidateId={candidateId}
                  proposedSalary={proposedSalary}
                  onProposedSalary={updateProposedSalary}
                />
              </>
            )}
          </section>
        </div>
      </PageShell>

      {preview && <PreviewOverlay item={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTES
// ─────────────────────────────────────────────────────────────────────────────

function NotesCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [recording, setRecording] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [supported, setSupported] = React.useState(false);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  const valueRef = React.useRef(value); valueRef.current = value;

  React.useEffect(() => { setSupported(getSpeechCtor() != null); }, []);

  const stop = React.useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    recRef.current = null; setRecording(false); setInterim("");
  }, []);

  const start = React.useCallback(() => {
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    let rec: SpeechRecognitionLike;
    try { rec = new Ctor(); } catch { fireToast({ message: "Couldn't start dictation.", type: "error" }); return; }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-IN";
    rec.onresult = (e) => {
      let finalText = "", interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]; if (!r) continue;
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += t; else interimText += t;
      }
      if (finalText.trim()) {
        const base = valueRef.current;
        const sep = base && !/\s$/.test(base) ? " " : "";
        const next = `${base}${sep}${finalText.trim()}`;
        valueRef.current = next; onChange(next);
      }
      setInterim(interimText);
    };
    rec.onerror = () => stop();
    rec.onend = () => { setRecording(false); setInterim(""); recRef.current = null; };
    recRef.current = rec;
    try { rec.start(); setRecording(true); }
    catch { fireToast({ message: "Couldn't access the microphone.", type: "error" }); recRef.current = null; }
  }, [onChange, stop]);

  React.useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  return (
    <Card>
      <CardHead
        n={7}
        icon={<StickyNote size={17} />}
        title="Assessment Notes"
        sub="The management round in your words — type it, or press Dictate to speak."
        action={
          <button
            type="button"
            onClick={recording ? stop : start}
            disabled={!supported}
            aria-pressed={recording}
            title={supported ? (recording ? "Stop dictation" : "Dictate with your voice") : "Speech recognition isn't supported in this browser."}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={recording ? { background: "var(--color-altus-red)", color: "#fff" } : { background: "#fff", color: "var(--color-ink-strong)", border: "1px solid var(--color-hairline-strong)" }}
          >
            {recording ? (
              <><span className="ma-dot grid h-3.5 w-3.5 place-items-center rounded-full bg-white/95"><span className="block h-[6px] w-[6px] rounded-[2px]" style={{ background: "var(--color-altus-red)" }} /></span> Stop</>
            ) : (
              <><Mic size={15} strokeWidth={2.4} /> Dictate</>
            )}
          </button>
        }
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Overall impression, strengths, concerns, compensation discussion, decision & rationale…"
        maxLength={20000}
        rows={12}
        className="w-full rounded-[14px] border-2 px-4 py-3.5 text-[15px] leading-relaxed text-ink-strong outline-none transition-[border-color,box-shadow] focus:border-altus-red focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-altus-red)_13%,transparent)]"
        style={{ minHeight: 240, resize: "vertical", borderColor: "color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))" }}
      />
      {recording && (
        <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-altus-red">
          <span className="ma-dot inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-altus-red)" }} />
          Listening…{interim && <span className="font-normal italic text-ink-muted">“{interim}”</span>}
        </p>
      )}
      {!supported && (
        <p className="mt-2 text-[12.5px] text-ink-subtle">Voice dictation isn&apos;t available in this browser — you can still type. For dictation, try Chrome or Edge.</p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICE RECORDINGS
// ─────────────────────────────────────────────────────────────────────────────

function RecordingsCard({
  recordings, candidateId, onAdd, onRemove,
}: {
  recordings: MgmtRecordingView[];
  candidateId: string;
  onAdd: (r: MgmtRecordingView) => void;
  onRemove: (path: string) => void;
}) {
  const [supported, setSupported] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);

  const mediaRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const barsRef = React.useRef<(HTMLSpanElement | null)[]>([]);
  const mimeRef = React.useRef<{ mime: string; ext: string }>({ mime: "", ext: "webm" });
  const elapsedRef = React.useRef(0); elapsedRef.current = elapsed;

  React.useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const drawBars = React.useCallback(() => {
    const analyser = analyserRef.current;
    const bars = barsRef.current;
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < bars.length; i++) {
        const el = bars[i]; if (!el) continue;
        const v = (data[i] ?? 0) / 255;
        el.style.transform = `scaleY(${(0.12 + v * 0.88).toFixed(3)})`;
      }
    }
    rafRef.current = requestAnimationFrame(drawBars);
  }, []);

  const cleanupEngine = React.useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    analyserRef.current = null;
    for (const b of barsRef.current) { if (b) b.style.transform = "scaleY(0.12)"; }
  }, []);

  async function uploadBlob(blob: Blob, durationSec: number) {
    setUploading(true);
    try {
      const ext = mimeRef.current.ext || "webm";
      const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type || mimeRef.current.mime || "audio/webm" });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "audio");
      const res = await fetch(UPLOAD_URL, { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; path?: string; error?: string };
      if (!json.ok || !json.path) { fireToast({ message: json.error || "Upload failed.", type: "error" }); return; }
      onAdd({ path: json.path, durationSec, createdAt: new Date().toISOString(), url: URL.createObjectURL(blob) });
      fireToast({ message: "Recording saved." });
    } catch {
      fireToast({ message: "Upload failed.", type: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = pickAudioMime();
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const rec = mimeRef.current.mime ? new MediaRecorder(stream, { mimeType: mimeRef.current.mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current.mime || "audio/webm" });
        const dur = elapsedRef.current;
        cleanupEngine();
        setRecording(false); setPaused(false); setElapsed(0);
        if (blob.size > 0) void uploadBlob(blob, dur);
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true); setPaused(false); setElapsed(0); elapsedRef.current = 0;
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      rafRef.current = requestAnimationFrame(drawBars);
    } catch {
      fireToast({ message: "Microphone access was blocked. Allow it in your browser to record.", type: "error" });
      cleanupEngine();
    }
  }

  function stop() { try { mediaRef.current?.stop(); } catch { /* noop */ } }
  function togglePause() {
    const rec = mediaRef.current; if (!rec) return;
    if (paused) {
      try { rec.resume(); } catch { /* noop */ }
      setPaused(false);
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      rafRef.current = requestAnimationFrame(drawBars);
    } else {
      try { rec.pause(); } catch { /* noop */ }
      setPaused(true);
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }
  }

  // Esc stops an in-progress recording.
  React.useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);

  React.useEffect(() => () => { try { mediaRef.current?.stop(); } catch { /* noop */ } cleanupEngine(); }, [cleanupEngine]);

  return (
    <Card>
      <CardHead n={8} icon={<AudioLines size={17} />} title="Voice Recordings" sub="Record the round in-browser — pause, resume, and keep as many takes as you need." />

      {/* Recorder console */}
      <div
        className="ma-console flex flex-wrap items-center gap-4 rounded-2xl border p-4"
        style={{ borderColor: recording ? "color-mix(in srgb, var(--color-altus-red) 45%, transparent)" : "var(--color-hairline)", background: recording ? "color-mix(in srgb, var(--color-altus-red) 5%, white)" : "var(--color-surface-soft)" }}
        data-active={recording ? "true" : undefined}
      >
        {!recording ? (
          <button
            type="button"
            onClick={start}
            disabled={!supported || uploading}
            className="inline-flex items-center gap-2.5 rounded-pill px-5 py-3 text-[14px] font-bold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#E10600,#A80400)", boxShadow: "0 14px 30px -14px rgba(168,4,0,0.75)" }}
          >
            {uploading ? <><Loader2 size={17} className="animate-spin" /> Saving…</> : <><span className="grid h-4 w-4 place-items-center rounded-full bg-white"><span className="block h-2 w-2 rounded-full" style={{ background: "var(--color-altus-red)" }} /></span> Start Recording</>}
          </button>
        ) : (
          <>
            <span className="inline-flex items-center gap-2 text-[15px] font-black tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              <span className={`inline-block h-3 w-3 rounded-full ${paused ? "" : "ma-dot"}`} style={{ background: paused ? "var(--color-ink-subtle)" : "var(--color-altus-red)" }} />
              {mmss(elapsed)}
            </span>

            {/* Live waveform */}
            <div className="ma-wave flex h-9 flex-1 items-center justify-center gap-[3px] px-2" aria-hidden data-paused={paused ? "true" : undefined}>
              {Array.from({ length: BAR_COUNT }).map((_, i) => (
                <span key={i} ref={(el) => { barsRef.current[i] = el; }} className="ma-wave-bar" />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={togglePause} className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-4 py-2.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft">
                {paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
              </button>
              <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2.5 text-[13px] font-bold text-white transition-transform hover:scale-[1.02]" style={{ background: "#18181b" }}>
                <Square size={13} strokeWidth={3} /> Finish
              </button>
            </div>
          </>
        )}

        {!supported && (
          <span className="text-[12.5px] text-ink-subtle">Recording isn&apos;t supported in this browser.</span>
        )}
      </div>

      {/* Recording list */}
      {recordings.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {recordings.map((r, i) => (
            <li key={r.path} className="ma-tile flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-white p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}>
                <AudioLines size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-ink-strong">Recording {i + 1}</p>
                <p className="text-[12px] font-medium text-ink-muted tabular-nums">
                  {mmss(r.durationSec)} · {formatDate(r.createdAt)}, {new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {r.url ? (
                <audio controls src={r.url} className="h-9 max-w-[260px] max-sm:w-full" style={{ minWidth: 200 }} />
              ) : (
                <span className="text-[12px] italic text-ink-subtle">Playback Unavailable</span>
              )}
              <button type="button" onClick={() => onRemove(r.path)} title="Delete recording" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_10%,white)] hover:text-altus-red">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-ink-subtle">No recordings yet — press <span className="font-semibold text-ink-muted">Start Recording</span> to capture the conversation.</p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENTS
// ─────────────────────────────────────────────────────────────────────────────

function AttachmentsCard({
  attachments, onAdd, onRemove, onPreview,
}: {
  attachments: MgmtAttachmentView[];
  onAdd: (items: MgmtAttachmentView[]) => void;
  onRemove: (path: string) => void;
  onPreview: (p: { kind: "image" | "video"; url: string; name: string }) => void;
}) {
  const [drag, setDrag] = React.useState(false);
  const [busy, setBusy] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  async function uploadOne(file: File): Promise<MgmtAttachmentView | null> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "attachment");
    try {
      const res = await fetch(UPLOAD_URL, { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; path?: string; name?: string; mime?: string; size?: number; error?: string };
      if (!json.ok || !json.path) { fireToast({ message: `${file.name}: ${json.error || "upload failed"}`, type: "error" }); return null; }
      return { path: json.path, name: json.name ?? file.name, mime: json.mime ?? file.type, size: json.size ?? file.size, url: URL.createObjectURL(file) };
    } catch {
      fireToast({ message: `${file.name}: upload failed`, type: "error" });
      return null;
    }
  }

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setBusy((b) => b + files.length);
    const done: MgmtAttachmentView[] = [];
    for (const f of files) {
      const r = await uploadOne(f);
      if (r) done.push(r);
      setBusy((b) => b - 1);
    }
    onAdd(done);
  }

  return (
    <Card>
      <CardHead
        n={9}
        icon={<Paperclip size={17} />}
        title="Attachments"
        sub="Resumes, assignments, screenshots, or a short video — drop them here."
        action={
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex shrink-0 items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft">
            <UploadCloud size={15} /> Add files
          </button>
        }
      />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
        className="sr-only"
        onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ""; }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files); }}
        className="ma-drop flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-solid px-6 py-9 text-center transition-colors"
        data-drag={drag ? "true" : undefined}
        style={{ borderColor: drag ? "var(--color-altus-red)" : "var(--color-hairline-strong)", background: drag ? "color-mix(in srgb, var(--color-altus-red) 6%, white)" : "var(--color-surface-soft)" }}
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl text-white" style={{ background: drag ? "var(--color-altus-red)" : "#18181b" }}>
          <UploadCloud size={20} />
        </span>
        <span className="text-[14px] font-bold text-ink-strong">{drag ? "Drop to upload" : "Drag & drop, or click to browse"}</span>
        <span className="text-[12px] text-ink-subtle">Images, video, PDF & documents · up to 50 MB each</span>
      </button>

      {(attachments.length > 0 || busy > 0) && (
        <div className="mt-4 grid grid-cols-3 gap-3 max-md:grid-cols-2">
          {attachments.map((a) => (
            <AttachmentTile key={a.path} a={a} onRemove={() => onRemove(a.path)} onPreview={onPreview} />
          ))}
          {Array.from({ length: busy }).map((_, i) => (
            <div key={`busy-${i}`} className="ma-tile grid aspect-[4/3] place-items-center rounded-xl border border-hairline bg-surface-soft text-ink-muted">
              <Loader2 className="animate-spin" size={20} style={{ color: "var(--color-altus-red)" }} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AttachmentTile({
  a, onRemove, onPreview,
}: {
  a: MgmtAttachmentView;
  onRemove: () => void;
  onPreview: (p: { kind: "image" | "video"; url: string; name: string }) => void;
}) {
  const kind = attachKind(a.mime);
  const canPreview = (kind === "image" || kind === "video") && !!a.url;
  const Icon = kind === "pdf" ? FileText : kind === "video" ? FileVideo : kind === "image" ? FileImage : FileIcon;

  return (
    <div className="ma-tile group relative overflow-hidden rounded-xl border border-hairline bg-white">
      <button
        type="button"
        onClick={() => { if (canPreview && a.url) onPreview({ kind: kind as "image" | "video", url: a.url, name: a.name }); }}
        disabled={!canPreview}
        className="block w-full text-left"
      >
        <div className="grid aspect-[4/3] place-items-center overflow-hidden" style={{ background: "var(--color-surface-soft)" }}>
          {kind === "image" && a.url ? (
            <img src={a.url} alt={a.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
          ) : kind === "video" && a.url ? (
            <video src={a.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}>
              <Icon size={22} />
            </span>
          )}
        </div>
      </button>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <Icon size={14} className="shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-ink-strong" title={a.name}>{a.name}</p>
          <p className="text-[11px] text-ink-subtle tabular-nums">{fmtBytes(a.size)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Delete attachment"
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-white/85 text-ink-muted opacity-0 backdrop-blur transition-opacity hover:text-altus-red group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE & DESIGNATION
// ─────────────────────────────────────────────────────────────────────────────

function RoleDesignationCard({
  role, department, designation, dateOfJoining, onDesignation, onDoj,
}: {
  role: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  onDesignation: (v: string) => void;
  onDoj: (v: string) => void;
}) {
  return (
    <Card>
      <CardHead n={1} icon={<IdCard size={17} />} title="Role & Designation" sub="Confirm the offered designation and joining date." />
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <ReadField label="Role (applied)" value={role || "—"} />
        <ReadField label="Department" value={department || "—"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <FieldLabel label="Designation">
          <input
            type="text"
            value={designation}
            onChange={(e) => onDesignation(e.target.value)}
            placeholder="e.g. Software Engineer"
            maxLength={200}
            className="ma-inp"
          />
        </FieldLabel>
        <FieldLabel label="Date of Joining" icon={<CalendarDays size={13} />}>
          <input
            type="date"
            value={dateOfJoining}
            onChange={(e) => onDoj(e.target.value)}
            className="ma-inp"
          />
        </FieldLabel>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME
// ─────────────────────────────────────────────────────────────────────────────

function OutcomeCard({
  outcome, onChoose, candidateId, proposedSalary, onProposedSalary,
}: {
  outcome: MgmtOutcome;
  onChoose: (o: Exclude<MgmtOutcome, null>) => void;
  candidateId: string;
  proposedSalary: string;
  onProposedSalary: (v: string) => void;
}) {
  const active = outcome ? OUTCOME_MAP[outcome] : null;
  return (
    <Card>
      <CardHead n={10} icon={<Trophy size={17} />} title="Outcome" sub="The final step — record the management verdict; it updates the candidate's pipeline status." />
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
        {OUTCOME_ORDER.map((o) => {
          const on = outcome === o;
          const tone =
            o === "selected" ? "#15803d" : o === "shortlisted" ? "#b45309" : "var(--color-altus-red-deep)";
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChoose(o)}
              aria-pressed={on}
              className="rounded-xl border-2 px-3 py-3 text-center text-[13.5px] font-bold transition-colors"
              style={
                on
                  ? { borderColor: tone, background: `color-mix(in srgb, ${tone} 10%, white)`, color: tone }
                  : { borderColor: "var(--color-hairline-strong)", background: "white", color: "var(--color-ink-strong)" }
              }
            >
              {OUTCOME_MAP[o].label}
            </button>
          );
        })}
      </div>

      {/* Proposed salary — only relevant once the candidate is Selected. */}
      {outcome === "selected" && (
        <div className="mt-4">
          <FieldLabel label="Proposed Salary" icon={<IndianRupee size={13} />}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-bold text-ink-subtle">₹</span>
              <input
                type="text"
                value={proposedSalary}
                onChange={(e) => onProposedSalary(e.target.value)}
                placeholder="e.g. 6,50,000 per annum"
                maxLength={60}
                inputMode="numeric"
                className="ma-inp"
                style={{ paddingLeft: 28 }}
              />
            </div>
          </FieldLabel>
          <p className="mt-1.5 text-[12px] text-ink-subtle">The compensation offered — carried into the selection/offer paperwork.</p>
        </div>
      )}

      {active && (
        <Link
          href={`/hr/letters/${active.letterKey}?candidate=${candidateId}` as Route}
          className="mt-3 inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)" }}
        >
          <FileText size={15} /> Compose {active.letterLabel} <ArrowUpRight size={14} />
        </Link>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluation — the old 76-point inline checklist has been retired. The management
 * round now runs entirely on the v2 A–N "Interview Intelligence" instrument, opened
 * via this CTA (role=management, locked to this candidate). Scores flow back into
 * the side-by-side Interviewer × Management comparison automatically.
 */
function EvaluationCard({ candidateId }: { candidateId: string }) {
  return (
    <Card>
      <CardHead
        n={2}
        icon={<ClipboardCheck size={17} />}
        title="Evaluation"
        sub="The structured, weighted A–N instrument — filled on the dedicated Interview Intelligence screen."
      />

      {/* Full structured Management Evaluation — the weighted A–N instrument. */}
      <Link
        href={`/hr/evaluation?role=management&candidate=${candidateId}` as Route}
        className="group flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
        style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 32%, white)", background: "color-mix(in srgb, var(--color-altus-red) 5%, white)" }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, #E10600, #A80400)", boxShadow: "0 10px 22px -12px rgba(168,4,0,0.7)" }}>
          <ClipboardCheck size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
            Open the full Management Evaluation
            <ArrowUpRight size={16} className="text-[color:var(--color-altus-red-deep)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
          <span className="mt-1 block text-[12.5px] font-medium leading-snug text-ink-muted">
            Non-negotiables, competency ratings, X-Factor, sales gate &amp; recommendation. Saved as the management pass and compared side-by-side with the interviewer&apos;s.
          </span>
        </span>
      </Link>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORES — the HR evaluation (weighted) + the management round's own score
// ─────────────────────────────────────────────────────────────────────────────

function ScoresCard({
  hrScore, hrRated, managementScore, onManagementScore,
}: {
  hrScore: number | null;
  hrRated: number;
  managementScore: number | null;
  onManagementScore: (v: number | null) => void;
}) {
  function onInput(raw: string) {
    if (raw.trim() === "") { onManagementScore(null); return; }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onManagementScore(Math.max(0, Math.min(10, Math.round(n * 2) / 2)));
  }
  return (
    <Card>
      <CardHead
        n={3}
        icon={<Scale size={17} />}
        title="Scores"
        sub="The HR evaluation score (weighted) alongside your own management-round score."
      />
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {/* HR Evaluation — read-only, mirrors the weighted overall */}
        <div className="rounded-2xl border border-hairline bg-surface-soft p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}>
              <ClipboardCheck size={14} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">HR Evaluation</span>
          </div>
          <p className="mt-2.5 tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 34, lineHeight: 1 }}>
            {hrScore != null ? (Number.isInteger(hrScore) ? hrScore : hrScore.toFixed(1)) : "—"}
            <span className="text-[16px] font-bold text-ink-subtle"> / 10</span>
          </p>
          <p className="mt-1 text-[12px] font-medium text-ink-muted">
            {hrRated > 0 ? "Weighted score from the HR evaluation" : "Not yet rated in the HR evaluation"}
          </p>
        </div>

        {/* Management Score — Manan's own 0..10 */}
        <div className="rounded-2xl border-2 p-4" style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline))" }}>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: "#18181b" }}>
              <Gauge size={14} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Management Score</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              inputMode="decimal"
              value={managementScore != null ? String(managementScore) : ""}
              onChange={(e) => onInput(e.target.value)}
              placeholder="—"
              aria-label="Management round score out of 10"
              className="w-[110px] rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[28px] font-black tabular-nums text-ink-strong outline-none focus:border-altus-red"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
            />
            <span className="text-[16px] font-bold text-ink-subtle">/ 10</span>
          </div>
          <p className="mt-1.5 text-[12px] font-medium text-ink-muted">Your verdict score for the management round.</p>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Skills — now a READ-ONLY summary. Editing the skills requirement checklist moved
 * to the per-person HR Record (`/hr/record`); this card just reflects what's on
 * record (the same management_assessment.skills data) and links there to edit.
 */
function SkillsSummaryCard({ value }: { value: SkillSelection }) {
  const count = value.technical.length + value.nonTechnical.length;
  return (
    <Card>
      <CardHead
        n={4}
        icon={<Sparkles size={17} />}
        title="Skills"
        sub="The bare-minimum skills requirement — now edited in the HR Record."
        action={
          <Link
            href={"/hr/record" as Route}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
          >
            <ArrowUpRight size={15} /> Edit in HR Record
          </Link>
        }
      />
      {count === 0 ? (
        <p className="text-[13px] text-ink-subtle">
          No skills ticked yet — open this person&apos;s <span className="font-semibold text-ink-muted">HR Record</span> to set the requirement checklist.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <SkillSummaryGroup title="Technical" items={value.technical} tone="technical" />
          <SkillSummaryGroup title="Non-Technical" items={value.nonTechnical} tone="nonTechnical" />
        </div>
      )}
    </Card>
  );
}

function SkillSummaryGroup({ title, items, tone }: { title: string; items: string[]; tone: "technical" | "nonTechnical" }) {
  const chip =
    tone === "technical"
      ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: "var(--color-altus-red-deep)" }
      : { background: "color-mix(in srgb, #2563eb 10%, white)", color: "#1d4ed8" };
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft p-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{title}</div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-ink-subtle">None ticked.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <span key={s} className="inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-bold" style={chip}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECRUITER
// ─────────────────────────────────────────────────────────────────────────────

function RecruiterCard({
  via, name, email, outcome, rejectionReason, emailing,
  onToggleVia, onName, onEmail, onReason, onEmailRecruiter,
}: {
  via: boolean;
  name: string;
  email: string;
  outcome: MgmtOutcome;
  rejectionReason: string;
  emailing: boolean;
  onToggleVia: () => void;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onReason: (v: string) => void;
  onEmailRecruiter: () => void;
}) {
  const canEmail = (outcome === "selected" || outcome === "rejected") && via && email.trim().length > 0;
  return (
    <Card>
      <CardHead
        n={5}
        icon={<UserSearch size={17} />}
        title="Recruiter"
        sub="If a consultant sourced this candidate, capture them and share the outcome."
        action={<Toggle on={via} onClick={onToggleVia} label="Sourced via a recruiter?" />}
      />
      {via ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <FieldLabel label="Recruiter name">
              <input type="text" value={name} onChange={(e) => onName(e.target.value)} placeholder="Consultant / agency" maxLength={200} className="ma-inp" />
            </FieldLabel>
            <FieldLabel label="Recruiter email" icon={<Mail size={13} />}>
              <input type="email" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="name@agency.com" maxLength={200} className="ma-inp" />
            </FieldLabel>
          </div>
          {outcome === "rejected" && (
            <FieldLabel label="Reason (shared with the recruiter)">
              <textarea value={rejectionReason} onChange={(e) => onReason(e.target.value)} placeholder="Why wasn't this candidate taken forward?" maxLength={8000} rows={3} className="ma-inp" style={{ resize: "vertical", minHeight: 76 }} />
            </FieldLabel>
          )}
          <button
            type="button"
            onClick={onEmailRecruiter}
            disabled={!canEmail || emailing}
            className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
            style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}
            title={outcome === "shortlisted" ? "Available for Selected or Rejected outcomes" : undefined}
          >
            {emailing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Email Recruiter the Outcome
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-subtle">Turn this on if an external recruiter or consultant referred the candidate.</p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE MORE ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

function AssignmentCard({
  enabled, brief, candidateId, creating, onToggle, onBrief, onCreateTask,
}: {
  enabled: boolean;
  brief: string;
  candidateId: string;
  creating: boolean;
  onToggle: () => void;
  onBrief: (v: string) => void;
  onCreateTask: () => void;
}) {
  return (
    <Card>
      <CardHead
        n={6}
        icon={<ListChecks size={17} />}
        title="One More Assignment"
        sub="Set a follow-up task when the candidate needs another round of work."
        action={<Toggle on={enabled} onClick={onToggle} label="One more assignment needed?" />}
      />
      {enabled ? (
        <div className="space-y-3">
          <FieldLabel label="Assignment brief">
            <textarea value={brief} onChange={(e) => onBrief(e.target.value)} placeholder="What should the candidate build or submit, and by when?" maxLength={8000} rows={4} className="ma-inp" style={{ resize: "vertical", minHeight: 96 }} />
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/hr/letters/assignment?candidate=${candidateId}` as Route}
              className="inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              <FileText size={15} /> Compose Assignment Letter <ArrowUpRight size={14} />
            </Link>
            <button
              type="button"
              onClick={onCreateTask}
              disabled={creating || !brief.trim()}
              className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
              style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)" }}
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />} Create assignment task
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-subtle">Turn this on to brief and dispatch a follow-up assignment task.</p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-3 py-2.5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <p className="mt-0.5 truncate text-[14px] font-bold text-ink-strong" title={value}>{value}</p>
    </div>
  );
}

function FieldLabel({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
        {icon && <span className="text-altus-red">{icon}</span>}{label}
      </span>
      {children}
    </label>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className="inline-flex shrink-0 items-center gap-2 rounded-pill border px-3 py-1.5 text-[12.5px] font-bold transition-colors"
      style={on
        ? { borderColor: "var(--color-altus-red)", background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: "var(--color-altus-red-deep)" }
        : { borderColor: "var(--color-hairline-strong)", background: "white", color: "var(--color-ink-muted)" }}
    >
      <span className="relative inline-block h-4 w-7 rounded-full transition-colors" style={{ background: on ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}>
        <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ left: on ? 14 : 2 }} />
      </span>
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="ma-card rounded-2xl border border-hairline bg-white p-6 max-md:p-5">{children}</section>;
}

function CardHead({
  n, icon, title, sub, action,
}: {
  n: number; icon: React.ReactNode; title: string; sub: string; action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}>{icon}</span>
        <div>
          <h2 className="flex items-center gap-2 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}>
            <span className="text-[13px] font-black" style={{ color: "var(--color-altus-red)" }}>{n}.</span> {title}
          </h2>
          <p className="mt-0.5 text-[13px] font-medium text-ink-muted">{sub}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.new!;
  return <span className="rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ background: t.bg, color: t.fg }}>{t.label}</span>;
}
function MetaChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-pill bg-surface-soft px-2.5 py-1 text-[12px] font-semibold text-ink-muted tabular-nums">{children}</span>;
}
function StatTile({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-2 py-2.5 text-center">
      <span className="mx-auto mb-1 grid h-6 w-6 place-items-center rounded-lg text-ink-muted" style={{ background: "white" }}>{icon}</span>
      <p className="text-[17px] font-black leading-none text-ink-strong tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{n}</p>
      <p className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">{label}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ma-fade grid place-items-center rounded-2xl border border-solid border-hairline-strong bg-white py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-3xl text-white" style={{ background: "linear-gradient(135deg,#E10600,#A80400)", boxShadow: "0 18px 40px -18px rgba(168,4,0,0.7)" }}>
        <UserRound size={26} />
      </span>
      <h3 className="mt-3 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20 }}>Pick a candidate to begin</h3>
      <p className="mt-1 max-w-[42ch] text-[13.5px] font-medium text-ink-muted">Select who you assessed on the left. The notes, recorder and attachment workspace unlocks here.</p>
    </div>
  );
}

function PreviewOverlay({ item, onClose }: { item: { kind: "image" | "video"; url: string; name: string }; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ma-overlay fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(9,9,11,0.82)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="ma-overlay-body relative max-h-[88vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} autoFocus className="absolute -right-3 -top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-ink-strong shadow-lg transition-transform hover:scale-105" title="Close (Esc)">
          <X size={18} />
        </button>
        {item.kind === "image" ? (
          <img src={item.url} alt={item.name} className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain" />
        ) : (
          <video src={item.url} controls autoPlay className="max-h-[88vh] max-w-[92vw] rounded-xl" />
        )}
        <p className="mt-2 text-center text-[13px] font-semibold text-white/85">{item.name}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoped CSS — pure transitions/keyframes (no framer-motion), reduced-motion safe
// ─────────────────────────────────────────────────────────────────────────────

const CSS = `
.ma-fade { animation: maFade .45s cubic-bezier(.22,1,.36,1) both; }
@keyframes maFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.ma-card { animation: maFade .5s cubic-bezier(.22,1,.36,1) both; }
.ma-tile { animation: maFade .4s cubic-bezier(.22,1,.36,1) both; }
.ma-dot { animation: maPulse 1.15s ease-in-out infinite; }
@keyframes maPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.82); } }
.ma-console[data-active] { box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 10%, transparent); }
.ma-wave-bar { display: block; width: 4px; height: 100%; border-radius: 3px; transform: scaleY(.12); transform-origin: center; background: linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep)); transition: transform .08s linear; }
.ma-wave[data-paused] .ma-wave-bar { transform: scaleY(.12) !important; opacity: .5; }
.ma-inp {
  width: 100%;
  border-radius: 12px;
  border: 1.5px solid var(--color-hairline-strong);
  background: #fff;
  padding: 10px 12px;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--color-ink-strong);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.ma-inp::placeholder { font-weight: 500; color: var(--color-ink-subtle); }
.ma-inp:focus { border-color: var(--color-altus-red); box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 13%, transparent); }
.ma-select-wrap { position: relative; }
.ma-select-wrap::after { content: ""; position: absolute; right: 14px; top: 50%; width: 8px; height: 8px; border-right: 2px solid var(--color-ink-subtle); border-bottom: 2px solid var(--color-ink-subtle); transform: translateY(-70%) rotate(45deg); pointer-events: none; }
.ma-overlay { animation: maFade .2s ease both; }
.ma-overlay-body { animation: maPop .28s cubic-bezier(.22,1,.36,1) both; }
@keyframes maPop { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .ma-fade, .ma-card, .ma-tile, .ma-dot, .ma-overlay, .ma-overlay-body { animation: none !important; }
  .ma-wave-bar { transition: none !important; }
}
`;
