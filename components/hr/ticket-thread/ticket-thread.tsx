"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Paperclip,
  X,
  Lock,
  MessageSquare,
  StickyNote,
  Download,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  HR_TICKET_CATEGORY_LABELS,
  HR_TICKET_STATUS_LABELS,
  HR_TICKET_STATUS_EMPLOYEE_LABELS,
  HR_TICKET_PRIORITIES,
  HR_TICKET_PRIORITY_LABELS,
  type HrTicketStatus,
} from "@/db/enums";
import { STATUS_TONE, PRIORITY_TONE, relTime } from "@/lib/hr/ticket-ui";
import { CsatCard } from "@/components/hr/csat/csat-card";
import {
  replyOnTicket,
  addInternalNote,
  assignTicket,
  changeStatus,
  changePriority,
  reopenTicket,
} from "@/app/(app)/support/actions";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

interface Msg {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  internal: boolean;
  createdAt: string;
}
interface Att {
  id: string;
  messageId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  signedUrl: string | null;
  createdAt: string;
}
export interface TicketThreadProps {
  ticket: {
    id: string;
    ticketNo: number;
    subject: string;
    category: keyof typeof HR_TICKET_CATEGORY_LABELS;
    status: HrTicketStatus;
    priority: keyof typeof HR_TICKET_PRIORITY_LABELS;
    confidential: boolean;
    source: string;
    requesterName: string | null;
    assigneeId: string | null;
    assigneeName: string | null;
    createdAt: string;
    closedAt: string | null;
    csatScore?: number | null;
    csatComment?: string | null;
  };
  messages: Msg[];
  attachments: Att[];
  meId: string;
  canHandle: boolean;
  isRequester: boolean;
  assignees: Array<{ id: string; name: string }>;
}

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TicketThread(props: TicketThreadProps) {
  const router = useRouter();
  const { ticket, messages, attachments, canHandle, isRequester } = props;
  const [tab, setTab] = React.useState<"reply" | "note">("reply");
  const [busy, setBusy] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const tone = STATUS_TONE[ticket.status];
  const statusLabel = isRequester
    ? HR_TICKET_STATUS_EMPLOYEE_LABELS[ticket.status]
    : HR_TICKET_STATUS_LABELS[ticket.status];
  const prio = PRIORITY_TONE[ticket.priority];

  const attByMsg = React.useMemo(() => {
    const m = new Map<string, Att[]>();
    for (const a of attachments) {
      const k = a.messageId ?? "__ticket__";
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [attachments]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 8));
  }

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg?: string) {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    if (okMsg) fireToast({ message: okMsg, type: "success" });
    router.refresh();
  }

  async function submitMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const body = bodyRef.current?.value.trim() ?? "";
    if (!body) {
      fireToast({ message: "Write a message.", type: "error" });
      return;
    }
    const form = new FormData();
    form.set("body", body);
    for (const f of files) form.append("attachments", f);
    setBusy(true);
    const res = tab === "note" ? await addInternalNote(ticket.id, form) : await replyOnTicket(ticket.id, form);
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    if (bodyRef.current) bodyRef.current.value = "";
    setFiles([]);
    fireToast({ message: tab === "note" ? "Internal note added" : "Reply sent", type: "success" });
    router.refresh();
  }

  const closedRecently =
    ticket.status === "closed" &&
    ticket.closedAt &&
    (Date.now() - new Date(ticket.closedAt).getTime()) / 86_400_000 <= 7;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-2xl border border-hairline bg-surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-bold text-ink-muted">
              <span>#{ticket.ticketNo}</span>
              <span aria-hidden>·</span>
              <span>{HR_TICKET_CATEGORY_LABELS[ticket.category]}</span>
              {ticket.confidential && (
                <span className="inline-flex items-center gap-1" style={{ color: RED }}>
                  <Lock size={12} /> Confidential
                </span>
              )}
              {ticket.source === "query" && (
                <>
                  <span aria-hidden>·</span>
                  <span>Ask HR</span>
                </>
              )}
            </div>
            <h1
              className="mt-1 text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.015em" }}
            >
              {ticket.subject}
            </h1>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              Raised by {ticket.requesterName ?? "—"} · {relTime(ticket.createdAt)}
              {ticket.assigneeName && ` · Handled by ${ticket.assigneeName}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
              {statusLabel}
            </span>
            {canHandle && (
              <span className="text-[11.5px] font-bold" style={{ color: prio.fg }}>
                {prio.label} priority
              </span>
            )}
          </div>
        </div>

        {/* HR handler controls */}
        {canHandle && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
            <select
              value={ticket.assigneeId ?? ""}
              disabled={busy}
              onChange={(e) => run(() => assignTicket(ticket.id, e.target.value || null), "Reassigned")}
              className="rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[12.5px] font-medium text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
              aria-label="Assign to"
            >
              <option value="">Unassigned</option>
              {props.assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={ticket.priority}
              disabled={busy}
              onChange={(e) => run(() => changePriority(ticket.id, e.target.value), "Priority updated")}
              className="rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[12.5px] font-medium text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
              aria-label="Priority"
            >
              {HR_TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {HR_TICKET_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-1.5">
              {ticket.status !== "in_progress" && ticket.status !== "resolved" && ticket.status !== "closed" && (
                <StatusBtn label="Start" onClick={() => run(() => changeStatus(ticket.id, "in_progress"), "Now in progress")} busy={busy} />
              )}
              {ticket.status !== "waiting_on_employee" && ticket.status !== "closed" && ticket.status !== "resolved" && (
                <StatusBtn label="Wait on Employee" onClick={() => run(() => changeStatus(ticket.id, "waiting_on_employee"), "Waiting on employee")} busy={busy} />
              )}
              {ticket.status !== "resolved" && ticket.status !== "closed" && (
                <StatusBtn label="Resolve" primary onClick={() => run(() => changeStatus(ticket.id, "resolved"), "Marked resolved")} busy={busy} />
              )}
              {ticket.status === "resolved" && (
                <StatusBtn label="Close" onClick={() => run(() => changeStatus(ticket.id, "closed"), "Closed")} busy={busy} />
              )}
              {ticket.status === "closed" && (
                <StatusBtn label="Reopen" onClick={() => run(() => reopenTicket(ticket.id), "Reopened")} busy={busy} />
              )}
            </div>
          </div>
        )}

        {/* Employee self-service actions */}
        {!canHandle && isRequester && (ticket.status === "resolved" || closedRecently) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
            {ticket.status === "resolved" && (
              <>
                <button
                  onClick={() => run(() => changeStatus(ticket.id, "closed"), "Thanks — closed")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  <CheckCircle2 size={14} /> This resolved it
                </button>
                <button
                  onClick={() => run(() => reopenTicket(ticket.id), "Reopened")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong disabled:opacity-60"
                >
                  <RotateCcw size={14} /> Still need help
                </button>
              </>
            )}
            {ticket.status === "closed" && closedRecently && (
              <button
                onClick={() => run(() => reopenTicket(ticket.id), "Reopened")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong disabled:opacity-60"
              >
                <RotateCcw size={14} /> Reopen
              </button>
            )}
          </div>
        )}
      </header>

      {/* Ticket-level attachments */}
      {attByMsg.get("__ticket__") && (
        <AttachmentRow items={attByMsg.get("__ticket__")!} />
      )}

      {/* Thread */}
      <ol className="space-y-3">
        {messages.map((m) => {
          const mine = m.authorId === props.meId;
          return (
            <li
              key={m.id}
              className="rounded-2xl border p-4"
              style={
                m.internal
                  ? { borderColor: "#f59e0b55", background: "#f59e0b0d" }
                  : { borderColor: "var(--color-hairline, #e5e7eb)", background: "var(--color-surface-card, #fff)" }
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-ink-strong">{m.authorName ?? "Someone"}{mine && " (you)"}</span>
                  {m.internal && (
                    <span className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "#f59e0b22", color: "#b45309" }}>
                      <StickyNote size={11} /> Internal note
                    </span>
                  )}
                </div>
                <span className="text-[11.5px] text-ink-muted">{relTime(m.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-strong">{m.body}</p>
              {attByMsg.get(m.id) && <AttachmentRow items={attByMsg.get(m.id)!} compact />}
            </li>
          );
        })}
      </ol>

      {/* CSAT — requester rates a resolved/closed ticket */}
      {isRequester && (ticket.status === "resolved" || ticket.status === "closed") && (
        <CsatCard
          ticketId={ticket.id}
          existingScore={ticket.csatScore ?? null}
          existingComment={ticket.csatComment ?? null}
        />
      )}

      {/* Composer */}
      {ticket.status !== "closed" && (canHandle || isRequester) && (
        <form onSubmit={submitMessage} className="rounded-2xl border border-hairline bg-surface-card p-4">
          {canHandle && (
            <div className="mb-3 inline-flex rounded-lg border border-hairline p-0.5">
              <ForkTab active={tab === "reply"} onClick={() => setTab("reply")} icon={<MessageSquare size={13} />} label="Reply to Employee" />
              <ForkTab active={tab === "note"} onClick={() => setTab("note")} icon={<StickyNote size={13} />} label="Internal Note" />
            </div>
          )}
          <textarea
            ref={bodyRef}
            rows={4}
            maxLength={8000}
            placeholder={
              tab === "note"
                ? "HR-only note — the employee never sees this."
                : canHandle
                  ? "Write your reply to the employee…"
                  : "Add more detail or reply to HR…"
            }
            className="w-full resize-y rounded-xl border px-3.5 py-3 text-[14px] leading-relaxed text-ink-strong outline-none"
            style={{
              borderColor: tab === "note" ? "#f59e0b66" : "var(--color-hairline, #e5e7eb)",
              background: tab === "note" ? "#f59e0b08" : "transparent",
            }}
          />
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong">
              <Paperclip size={14} /> Attach
              <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
              style={{
                background: tab === "note" ? "linear-gradient(135deg,#f59e0b,#b45309)" : `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : tab === "note" ? <StickyNote size={13} /> : <MessageSquare size={13} />}
              {tab === "note" ? "Add note" : "Send reply"}
            </button>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px]">
                  <span className="truncate font-medium text-ink-strong">{f.name}</span>
                  <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label="Remove">
                    <X size={14} className="text-ink-muted hover:text-[var(--color-altus-red)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {ticket.status === "closed" && !closedRecently && (
        <p className="rounded-2xl border border-hairline bg-surface-card px-4 py-4 text-center text-[13px] font-medium text-ink-muted">
          This ticket is closed. Raise a new one if you still need help.
        </p>
      )}
    </div>
  );

  function AttachmentRow({ items, compact }: { items: Att[]; compact?: boolean }) {
    return (
      <div className={compact ? "mt-2.5 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
        {items.map((a) => (
          <a
            key={a.id}
            href={a.signedUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[12.5px] font-medium text-ink-strong transition hover:border-[var(--color-altus-red)]"
            aria-disabled={!a.signedUrl}
          >
            <Download size={13} className="text-ink-muted" />
            <span className="max-w-[180px] truncate">{a.fileName}</span>
            {a.sizeBytes ? <span className="text-ink-muted">{fmtSize(a.sizeBytes)}</span> : null}
          </a>
        ))}
      </div>
    );
  }
}

function StatusBtn({ label, onClick, busy, primary }: { label: string; onClick: () => void; busy: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-pill px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-60"
      style={
        primary
          ? { background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, color: "#fff" }
          : { border: "1px solid var(--color-hairline, #e5e7eb)", color: "var(--color-ink-strong, #111)" }
      }
    >
      {label}
    </button>
  );
}

function ForkTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-bold transition"
      style={{ background: active ? RED : "transparent", color: active ? "#fff" : "var(--color-ink-muted, #6b7280)" }}
    >
      {icon}
      {label}
    </button>
  );
}
