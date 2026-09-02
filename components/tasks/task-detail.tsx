import { format, formatDistanceToNow } from "date-fns";
import { Calendar, Sparkles, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import type { TaskDetail as TaskDetailModel } from "@/lib/queries/tasks";
import type { TaskPriority } from "@/db/enums";

const PRIORITY_PILL: Record<
  TaskPriority,
  { label: string; rgb: string; toneVar: string }
> = {
  imp_urgent: {
    label: "Urgent · Important",
    rgb: "225, 6, 0",
    toneVar: "var(--color-red-deep)",
  },
  imp_not_urgent: {
    label: "Important · Not urgent",
    rgb: "59, 130, 246",
    toneVar: "var(--color-blue-deep)",
  },
  not_imp_urgent: {
    label: "Not important · Urgent",
    rgb: "245, 158, 11",
    toneVar: "var(--color-amber-deep)",
  },
  not_imp_not_urgent: {
    label: "Not important · Not urgent",
    rgb: "100, 116, 139",
    toneVar: "var(--color-ink-soft)",
  },
};

/**
 * Read-mode hero treatment for a task.  Editorial-document feel:
 * eyebrow priority chip, oversized serif subject, meta avatars row,
 * then the description body and (when present) internal notes.
 */
export function TaskDetail({ task }: { task: TaskDetailModel }) {
  const eyebrow = PRIORITY_PILL[task.priority];
  // sir's changes #11 — the HERO is the task itself (its description = the
  // work to do), not the client name. The form writes Client Name into both
  // `title` and `client`, so the client gets its own clearly-labelled field
  // below the hero instead of dominating as the headline.
  const description = task.description?.trim() || null;
  const clientName = task.client?.trim() || task.title?.trim() || null;
  const headline =
    description || task.subject?.trim() || clientName || "Untitled task";
  const subjectChip = task.subject?.trim() || null;
  // Overdue is keyed off the EFFECTIVE due (revised ?? original), not the
  // immutable original due_at.
  const effectiveDue = task.revisedTargetDate ?? task.dueAt;
  const overdue =
    effectiveDue.getTime() < Date.now() &&
    !["approved", "cancelled", "transferred"].includes(task.status);

  return (
    <article className="relative">
      {/* Eyebrow row — overdue/due pill + created-ago text + subject chip.
          Matches the design comp where small meta sits ABOVE the title. */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <DuePill dueAt={task.dueAt} overdue={overdue} />
        <span className="text-[14px] text-ink-subtle">
          Created {formatDistanceToNow(task.createdAt, { addSuffix: true })}
        </span>
        {subjectChip && (
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[12.5px] font-bold uppercase tracking-[0.08em] border"
            style={{
              background: "var(--color-surface-soft)",
              color: "var(--color-ink-muted)",
              borderColor: "var(--color-hairline-strong)",
            }}
          >
            {subjectChip}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12.5px] font-bold tracking-[0.08em] uppercase"
          style={{
            background: `rgba(${eyebrow.rgb}, 0.10)`,
            color: eyebrow.toneVar,
            border: `1px solid rgba(${eyebrow.rgb}, 0.25)`,
          }}
        >
          <Sparkles size={12} strokeWidth={2.6} />
          {eyebrow.label}
        </span>
      </div>

      {/* HEADLINE — the task itself (its description). The biggest element
          on the page. Short phrase-length headlines get the full display
          treatment (brand titles are font-display 900); long/multi-line
          descriptions fall back to a comfortable serif reading size so a
          paragraph never shouts. */}
      <h1
        className="text-ink-strong"
        style={
          headline.length <= 96 && !headline.includes("\n")
            ? {
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(25px, 2.4vw, 36px)",
                lineHeight: 1.12,
                letterSpacing: "-0.022em",
                whiteSpace: "pre-wrap",
                textWrap: "balance",
              }
            : {
                fontFamily: "var(--font-serif)",
                fontWeight: 500,
                fontSize: "clamp(20px, 1.8vw, 26px)",
                lineHeight: 1.35,
                letterSpacing: "-0.01em",
                // Preserve the line breaks the author typed (multi-line
                // descriptions like an imported list of clients/notes)
                // instead of collapsing them into one run-on paragraph.
                whiteSpace: "pre-wrap",
                maxWidth: "72ch",
              }
        }
      >
        {headline}
      </h1>

      {/* CLIENT — prominent but clearly secondary to the task headline. */}
      {clientName && (
        <div className="mt-4">
          <span className="block text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold">
            Client
          </span>
          <span
            className="block text-ink-strong mt-0.5"
            style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}
          >
            {clientName}
          </span>
        </div>
      )}

      {/* Attribution strip — created-by / initiator → doer avatars.
          Hairline-separated meta band at the foot of the hero document. */}
      <div className="mt-7 pt-5 border-t border-hairline flex flex-wrap items-center gap-x-8 gap-y-4">
        {task.creatorName && (
          <PersonChip
            label="Created by"
            name={task.creatorName}
            relative={task.createdAt}
          />
        )}
        <RolePair
          fromName={task.initiatorName}
          fromLabel="Initiator"
          toName={task.doerName}
          toLabel="Doer"
        />
      </div>

      {/* The task description is now the hero above (sir's changes #11), so it
          is no longer repeated here as body prose. */}

      {/* Internal notes — boxed sub-card, distinct from the body. The
          design comp shows it as its own clear region with a labeled
          header inside the main task card. */}
      {task.notes && (
        <div
          className="mt-8 rounded-chip px-6 py-5"
          style={{
            background: "var(--color-surface-soft)",
            border: "1px solid var(--color-hairline)",
            borderLeft:
              "3px solid color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
            maxWidth: "68ch",
          }}
        >
          <h2
            className="text-ink-subtle font-bold mb-3"
            style={{
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Internal Notes
          </h2>
          <p
            className="text-ink whitespace-pre-wrap"
            style={{ fontSize: 17, lineHeight: 1.6 }}
          >
            {task.notes}
          </p>
        </div>
      )}
    </article>
  );
}

function DuePill({ dueAt, overdue }: { dueAt: Date; overdue: boolean }) {
  const rgb = overdue ? "225, 6, 0" : "100, 116, 139";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[14px] tabular-nums"
      style={{
        background: `rgba(${rgb}, 0.08)`,
        color: overdue ? "var(--color-red-deep)" : "var(--color-ink-soft)",
        border: `1px solid rgba(${rgb}, ${overdue ? 0.30 : 0.16})`,
        fontWeight: 700,
      }}
      title={`${format(dueAt, "EEE")}, ${formatDate(dueAt)}`}
    >
      <Calendar size={14} strokeWidth={2.4} />
      {overdue ? "Overdue · " : "Due "}
      {formatDate(dueAt)}
    </span>
  );
}

function PersonChip({
  label,
  name,
  relative,
}: {
  label: string;
  name: string;
  relative?: Date;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 text-ink-soft">
      <Avatar name={name} size={28} />
      <span className="leading-tight">
        <span className="block text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold">
          {label}
        </span>
        <span className="block text-ink-strong font-semibold mt-0.5" style={{ fontSize: 15.5 }}>
          {name}
          {relative && (
            <span className="ml-1.5 text-ink-subtle font-normal text-[13.5px]">
              · {formatDistanceToNow(relative, { addSuffix: true })}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

function RolePair({
  fromName,
  fromLabel,
  toName,
  toLabel,
}: {
  fromName: string | null;
  fromLabel: string;
  toName: string | null;
  toLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Avatar name={fromName ?? "?"} size={28} title={`${fromLabel}: ${fromName ?? "—"}`} />
      <span className="leading-tight">
        <span className="block text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold">
          {fromLabel}
        </span>
        <span className="block text-ink-strong font-semibold mt-0.5" style={{ fontSize: 15.5 }}>
          {fromName ?? "—"}
        </span>
      </span>
      <ArrowRight
        size={16}
        strokeWidth={2.4}
        className="text-ink-subtle mx-1.5"
      />
      <Avatar name={toName ?? "?"} size={28} title={`${toLabel}: ${toName ?? "—"}`} />
      <span className="leading-tight">
        <span className="block text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold">
          {toLabel}
        </span>
        <span className="block text-ink-strong font-semibold mt-0.5" style={{ fontSize: 15.5 }}>
          {toName ?? "—"}
        </span>
      </span>
    </span>
  );
}
