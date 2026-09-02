"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import type { AuditFeedRow } from "@/lib/queries/audit";
import type { TaskEventType } from "@/lib/events";
import type { TaskStatus } from "@/db/enums";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import { editComment, deleteComment } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";

const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

type StatusLabels = Record<TaskStatus, string>;

function statusLabel(
  s: string | undefined,
  labels: StatusLabels,
): string {
  if (!s) return "—";
  return labels[s as TaskStatus] ?? s;
}

function readField(value: unknown, key: string): string | undefined {
  if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === "string" ? v : v == null ? undefined : String(v);
  }
  return undefined;
}

interface Props {
  row: AuditFeedRow;
  /** When true the row renders with a "Just now" badge in the meta line. */
  fresh?: boolean;
  /** Admin-overridable status labels. Falls back to STATUS_LABELS_FALLBACK. */
  statusLabels?: StatusLabels;
  /** Current user — gates the comment edit/delete UI. */
  me?: { id: string; isAdmin: boolean };
}

/**
 * A single audit-feed row, in body-only form.  The surrounding timeline
 * frame (vertical line + dot) lives in `AuditFeed` so it can layer extra
 * UI like the "fresh" ring pulse.
 */
export function AuditEvent({ row, fresh, statusLabels, me }: Props) {
  const who = row.actorName ?? "Someone";
  const labels = statusLabels ?? STATUS_LABELS_FALLBACK;

  // Relative time is computed against Date.now(), so the server render
  // ("13 minutes ago") will differ from the client render ("9 minutes
  // ago") if SSR was cached even briefly. We render the initial value
  // on first render and then refresh on mount + every 60s to stay
  // current. `suppressHydrationWarning` lets React swap the text on
  // hydration without flagging the (deliberately) different value.
  const [when, setWhen] = React.useState(() =>
    formatDistanceToNow(row.createdAt, { addSuffix: true }),
  );
  React.useEffect(() => {
    function refresh() {
      setWhen(formatDistanceToNow(row.createdAt, { addSuffix: true }));
    }
    refresh();
    const handle = setInterval(refresh, 60_000);
    return () => clearInterval(handle);
  }, [row.createdAt]);

  return (
    <div className="text-[14.5px] text-ink break-words" style={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
      <Body row={row} who={who} labels={labels} me={me} />
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className="text-[12.5px] text-ink-subtle tabular-nums"
          suppressHydrationWarning
        >
          {when}
        </span>
        {fresh && (
          <span
            className="text-[11px] uppercase tracking-[0.08em] font-bold px-2 py-0.5 rounded-full"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              color: "#ffffff",
              letterSpacing: "0.06em",
            }}
          >
            Just now
          </span>
        )}
      </div>
    </div>
  );
}

function Body({
  row,
  who,
  labels,
  me,
}: {
  row: AuditFeedRow;
  who: string;
  labels: StatusLabels;
  me?: { id: string; isAdmin: boolean };
}) {
  const e = row.eventType;
  switch (e) {
    case "created":
      return (
        <>
          <strong>{who}</strong> created the task
          {row.note ? <span className="text-ink-subtle"> — {row.note}</span> : null}
        </>
      );

    case "status_changed": {
      const from = statusLabel(readField(row.fromValue, "status"), labels);
      const to = statusLabel(readField(row.toValue, "status"), labels);
      return (
        <>
          <strong>{who}</strong> moved status:{" "}
          <span className="font-medium">{from}</span> →{" "}
          <span className="font-medium">{to}</span>
          {row.note ? <span className="text-ink-subtle"> — {row.note}</span> : null}
        </>
      );
    }

    case "field_updated": {
      const field = readField(row.toValue, "field");
      const fromVal = readField(row.fromValue, "value");
      const toVal = readField(row.toValue, "value");
      return (
        <>
          <strong>{who}</strong> updated <code className="text-[13px]">{field}</code>
          {fromVal !== undefined && toVal !== undefined ? (
            <span className="text-ink-subtle">
              {" "}({fromVal || "—"} → {toVal || "—"})
            </span>
          ) : null}
        </>
      );
    }

    case "reassigned": {
      const fromDoer = readField(row.fromValue, "doerId");
      const toDoer = readField(row.toValue, "doerId");
      const resetStatus = readField(row.toValue, "resetStatus");
      return (
        <>
          <strong>{who}</strong> reassigned the task
          {fromDoer && toDoer ? (
            <span className="text-ink-subtle"> (doer {fromDoer.slice(0, 6)} → {toDoer.slice(0, 6)})</span>
          ) : null}
          {resetStatus === "true" ? (
            <span className="text-ink-subtle"> · status reset</span>
          ) : null}
        </>
      );
    }

    case "transferred_external":
      return (
        <>
          <strong>{who}</strong> transferred the task externally
          {row.note ? <span className="text-ink-subtle"> — {row.note}</span> : null}
        </>
      );

    case "priority_changed": {
      const from = readField(row.fromValue, "priority");
      const to = readField(row.toValue, "priority");
      return (
        <>
          <strong>{who}</strong> changed priority
          {from && to ? <span className="text-ink-subtle"> ({from} → {to})</span> : null}
        </>
      );
    }

    case "due_changed":
      return (
        <>
          <strong>{who}</strong> changed the due date
        </>
      );

    case "archived":
      return (
        <>
          <strong>{who}</strong> archived the task
        </>
      );

    case "restored":
      return (
        <>
          <strong>{who}</strong> restored the task
        </>
      );

    case "commented": {
      const body = readField(row.toValue, "body") ?? "";
      const editedAt = readField(row.toValue, "editedAt");
      const ageMs = Date.now() - row.createdAt.getTime();
      const canMutate = !!me && (me.isAdmin || (row.actorId === me.id && ageMs <= COMMENT_EDIT_WINDOW_MS));
      return (
        <CommentBody
          eventId={row.id}
          who={who}
          body={body}
          editedAt={editedAt}
          canMutate={canMutate}
        />
      );
    }

    default: {
      // Exhaustiveness fallback for unknown event types.
      const _exhaustive: TaskEventType = e;
      return <span>{_exhaustive}</span>;
    }
  }
}

/**
 * Inline comment body with author edit/delete affordances (Phase 3.2).
 * Pencil + trash appear on hover when the caller is the author within the
 * 15-minute edit window, or an admin (gate computed in the parent). Edit
 * swaps the static body for a textarea + Save / Cancel. Delete pops a
 * single-step `confirm()` — minor friction is preferable to a Radix dialog
 * for a 1-action confirmation.
 */
function CommentBody({
  eventId,
  who,
  body,
  editedAt,
  canMutate,
}: {
  eventId: string;
  who: string;
  body: string;
  editedAt: string | undefined;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(body);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    setDraft(body);
  }, [body]);

  function save() {
    const next = draft.trim();
    if (!next) return;
    if (next === body) {
      setEditing(false);
      return;
    }
    start(async () => {
      const res = await editComment(eventId, { body: next });
      if (!res.ok) {
        fireToast({ message: res.message ?? "Couldn't save the edit." });
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this comment? This can't be undone.")) return;
    start(async () => {
      const res = await deleteComment(eventId);
      if (!res.ok) {
        fireToast({ message: res.message ?? "Couldn't delete the comment." });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="group">
      <span className="inline-flex items-center gap-2">
        <strong>{who}</strong> commented{editedAt ? <span className="text-ink-subtle text-[12px]"> (edited)</span> : null}:
        {canMutate && !editing && (
          <span className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              aria-label="Edit comment"
              className="p-1 rounded-md text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
            >
              <Pencil size={12} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Delete comment"
              className="p-1 rounded-md text-ink-subtle hover:bg-surface-soft"
              style={{ color: pending ? undefined : undefined }}
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} strokeWidth={2.4} />}
            </button>
          </span>
        )}
      </span>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                setDraft(body);
              }
            }}
            rows={Math.max(2, Math.min(8, draft.split("\n").length))}
            className="w-full rounded-md p-3 outline-none resize-y"
            style={{
              background: "rgba(15, 23, 42, 0.03)",
              border: "1px solid var(--color-hairline-strong)",
              fontSize: 14.5,
              lineHeight: 1.55,
              fontWeight: 400,
            }}
          />
          <div className="flex items-center gap-2 text-[12.5px]">
            <button
              type="button"
              onClick={save}
              disabled={pending || draft.trim() === ""}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white font-semibold disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.6} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(body); }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-card text-ink-muted font-semibold hover:bg-surface-soft"
            >
              <X size={12} strokeWidth={2.6} />
              Cancel
            </button>
            <span className="text-ink-subtle ml-1">⌘/Ctrl+Enter to save · Esc to cancel</span>
          </div>
        </div>
      ) : (
        <div
          className="mt-2 whitespace-pre-wrap text-ink-soft rounded-md p-3"
          style={{
            background: "rgba(15, 23, 42, 0.03)",
            borderLeft: "2px solid color-mix(in srgb, var(--color-green) 50%, transparent)",
            fontSize: 14.5,
            lineHeight: 1.55,
          }}
        >
          {body}
        </div>
      )}
    </div>
  );
}

export { dotColorFor, eventFilterBucket } from "./audit-event-meta";
