import * as React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Clock, MapPin, Video, Star, FileText, ExternalLink, GraduationCap, Users, MessageSquareHeart, ClipboardCheck, Film } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager, listTcSubjects } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getScoreConfig } from "@/lib/queries/pms";
import { getSession } from "@/lib/queries/training-calendar";
import { MODULE_THEME } from "@/lib/module-theme";
import { AttendanceEditor } from "@/components/training/calendar/attendance-editor";
import { SessionFeedbackForm } from "@/components/training/calendar/session-feedback-form";
import { AssessmentPanel } from "@/components/training/calendar/assessment-panel";
import { SessionEdit } from "@/components/training/calendar/session-edit";
import { requestRecording, addSessionSubject } from "../actions";
import { RecordingButton } from "@/components/training/calendar/recording-button";
import type { SessionFormValues } from "@/components/training/calendar/session-form";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: ACCENT_DEEP, bg: `color-mix(in srgb, ${ACCENT} 12%, transparent)` },
  done: { label: "Done", color: "var(--color-green-deep)", bg: "color-mix(in srgb, var(--color-green) 14%, transparent)" },
  cancelled: { label: "Cancelled", color: "var(--color-ink-subtle)", bg: "var(--color-surface-track)" },
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** ISO → 'YYYY-MM-DDTHH:mm' in IST for the datetime-local edit field. */
function toIstInput(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm max-md:p-4">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ink-strong">
        <span style={{ color: ACCENT }}>{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireWorkspace("training");
  const [session, manager, subjects, employeeOptions, cfg] = await Promise.all([
    getSession(id),
    isManager(me.id),
    listTcSubjects(),
    listEmployeeOptions(),
    getScoreConfig(),
  ]);
  if (!session) notFound();

  const isSuper = isSuperAdmin(me.email);
  // Trainer of the session, an admin, super, or any manager can mark/assess/edit.
  const canManage = me.isAdmin || isSuper || manager || session.trainerId === me.id;
  const maxSessionMinutes = cfg.thresholds.maxSessionMinutes || 90;
  const passPct = cfg.thresholds.assessmentPassPct || 80;

  const status = STATUS_META[session.status] ?? STATUS_META.scheduled!;
  const myAttendance = session.attendees.find((a) => a.employeeId === me.id) ?? null;
  const myFeedback = session.feedback.find((f) => f.employeeId === me.id) ?? null;
  const isAttendee = !!myAttendance;

  const initial: SessionFormValues = {
    id: session.id,
    topic: session.topic,
    subjectId: session.subjectId,
    los: session.los,
    criticality: session.criticality,
    trainerId: session.trainerId,
    scheduledAt: toIstInput(session.scheduledAt),
    durationMin: session.durationMin,
    mode: session.mode,
    location: session.location,
    meetingUrl: session.meetingUrl,
    notes: session.notes,
    inManual: session.inManual,
    attendeeIds: session.attendees.map((a) => a.employeeId),
  };

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/training/calendar" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-[var(--tc-deep)]" style={{ ["--tc-deep" as string]: ACCENT_DEEP }}>
          <ArrowLeft size={15} strokeWidth={2.4} /> Training Calendar
        </Link>

        <header className="mt-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ background: status.bg, color: status.color }}>
              {status.label}
            </span>
            <span className="inline-flex items-center gap-0.5" aria-label={`Criticality ${session.criticality} of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} size={14} fill={i < session.criticality ? ACCENT : "transparent"} style={{ color: i < session.criticality ? ACCENT : "var(--color-hairline-strong)" }} />
              ))}
            </span>
            {session.inManual && (
              <span className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT_DEEP }}>
                <Star size={11} fill={ACCENT} style={{ color: ACCENT }} /> In Manual
              </span>
            )}
          </div>
          <h1 className="mt-2 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2.6vw, 36px)", letterSpacing: "-0.02em", lineHeight: 1.06, overflowWrap: "anywhere" }}>
            {session.topic}
          </h1>
          {session.subject && <p className="mt-1.5 font-semibold text-ink-muted" style={{ fontSize: 15 }}>{session.subject}</p>}
        </header>

        <div className="grid grid-cols-[1.7fr_1fr] gap-6 max-lg:grid-cols-1 items-start">
          {/* LEFT column */}
          <div className="flex flex-col gap-6">
            {/* Overview */}
            <Card title="Session Details" icon={<Clock size={16} />}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 max-sm:grid-cols-1">
                <Meta label="When">{fmtWhen(session.scheduledAt)}</Meta>
                <Meta label="Duration">{session.durationMin} minutes</Meta>
                <Meta label="Mode">
                  <span className="inline-flex items-center gap-1.5">
                    {session.mode === "online" ? <Video size={15} className="text-ink-subtle" /> : <MapPin size={15} className="text-ink-subtle" />}
                    {session.mode === "online" ? "Online" : "In Person"}
                  </span>
                </Meta>
                {session.mode === "online" && session.meetingUrl ? (
                  <Meta label="Meeting link">
                    <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold" style={{ color: ACCENT_DEEP }}>
                      Join <ExternalLink size={13} />
                    </a>
                  </Meta>
                ) : session.location ? (
                  <Meta label="Location">{session.location}</Meta>
                ) : null}
                {session.trainerName && <Meta label="Trainer">{session.trainerName}</Meta>}
              </dl>

              {session.los && (
                <div className="mt-4 border-t border-hairline pt-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Learning outcomes (LOS)</div>
                  <p className="mt-1 whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-soft">{session.los}</p>
                </div>
              )}
              {session.notes && (
                <div className="mt-4 border-t border-hairline pt-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Notes</div>
                  <p className="mt-1 whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-soft">{session.notes}</p>
                </div>
              )}

              {(session.videoPath || session.pptPath) && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
                  {session.videoPath && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-track px-3 py-2 text-[13px] font-bold text-ink-soft">
                      <Video size={14} /> Video Attached
                    </span>
                  )}
                  {session.pptPath && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-track px-3 py-2 text-[13px] font-bold text-ink-soft">
                      <FileText size={14} /> PPT Attached
                    </span>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                <RecordingButton sessionId={session.id} requested={session.recordingRequested} action={requestRecording} />
                {canManage && (
                  <SessionEdit
                    initial={initial}
                    status={session.status}
                    subjectOptions={subjects}
                    employeeOptions={employeeOptions}
                    maxSessionMinutes={maxSessionMinutes}
                    onAddSubject={addSessionSubject}
                  />
                )}
              </div>
            </Card>

            {/* Attendance */}
            <Card title="Attendance" icon={<Users size={16} />}>
              <AttendanceEditor sessionId={session.id} attendees={session.attendees} durationMin={session.durationMin} canMark={canManage} />
            </Card>

            {/* Assessment */}
            <Card title={`Assessment · below ${passPct}% = redo`} icon={<ClipboardCheck size={16} />}>
              <AssessmentPanel sessionId={session.id} assessments={session.assessments} attendees={session.attendees} passPct={passPct} canAssess={canManage} />
            </Card>
          </div>

          {/* RIGHT column */}
          <div className="flex flex-col gap-6">
            {/* My feedback */}
            {isAttendee && (
              <Card title="Your Feedback" icon={<MessageSquareHeart size={16} />}>
                <SessionFeedbackForm sessionId={session.id} mine={myFeedback} />
              </Card>
            )}

            {/* All feedback (managers / trainer) */}
            {canManage && (
              <Card title={`Feedback received (${session.feedback.length})`} icon={<MessageSquareHeart size={16} />}>
                {session.feedback.length === 0 ? (
                  <p className="text-[14px] font-semibold text-ink-subtle">No feedback yet.</p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {session.feedback.map((f) => {
                      const avg = [f.content, f.depth, f.understanding, f.applicability].filter((x): x is number => x != null);
                      const mean = avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : "—";
                      return (
                        <li key={f.id} className="rounded-xl border border-hairline bg-surface-soft p-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[14px] font-bold text-ink-strong">{f.employeeName}</span>
                            <span className="inline-flex items-center gap-1 text-[13px] font-bold tabular-nums" style={{ color: ACCENT_DEEP }}>
                              <Star size={13} fill={ACCENT} style={{ color: ACCENT }} /> {mean}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-semibold text-ink-subtle">
                            <span>Content {f.content ?? "—"}</span>
                            <span>Depth {f.depth ?? "—"}</span>
                            <span>Understanding {f.understanding ?? "—"}</span>
                            <span>Applicability {f.applicability ?? "—"}</span>
                          </div>
                          {f.learned && <p className="mt-2 text-[13.5px] text-ink-soft"><span className="font-bold text-ink-strong">Learned: </span>{f.learned}</p>}
                          {f.improve && <p className="mt-1 text-[13.5px] text-ink-soft"><span className="font-bold text-ink-strong">Improve: </span>{f.improve}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}

            {/* Manual badge note */}
            {session.inManual && (
              <div className="rounded-2xl border p-4" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)`, background: `color-mix(in srgb, ${ACCENT} 6%, transparent)` }}>
                <p className="flex items-center gap-2 text-[13.5px] font-bold" style={{ color: ACCENT_DEEP }}>
                  <GraduationCap size={16} /> In the Training Manual
                </p>
                <p className="mt-1 text-[13px] font-semibold text-ink-soft">A curated, high-criticality session kept for reference.</p>
              </div>
            )}

            {session.recordingRequested && (
              <div className="rounded-2xl border border-hairline bg-surface-card p-4">
                <p className="flex items-center gap-2 text-[13.5px] font-bold text-ink-strong"><Film size={16} style={{ color: ACCENT }} /> Recording requested</p>
                <p className="mt-1 text-[13px] font-semibold text-ink-subtle">The trainer has been notified to record this session.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-[14.5px] font-semibold text-ink-strong">{children}</dd>
    </div>
  );
}
