"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, X, ShieldAlert, Send, Inbox } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  HR_TICKET_CATEGORIES,
  HR_TICKET_CATEGORY_LABELS,
  HR_TICKET_PRIORITIES,
  HR_TICKET_PRIORITY_LABELS,
  type HrTicketCategory,
} from "@/db/enums";
import { CATEGORY_GLYPH } from "@/lib/hr/ticket-ui";
import { raiseTicket } from "@/app/(app)/support/actions";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

/**
 * Raise a ticket. `mode="support"` shows the full form (category cards +
 * priority + attachments); `mode="query"` is the casual Ask-HR composer (a
 * lighter shell, still the SAME hr_tickets table with source="query").
 *
 * PREFILL: the Inbox can hand a notification straight into this form
 * (`/support/new?n=<id>`). The page resolves those ids server-side and passes
 * the resulting subject / details / best-guess category down here as INITIAL
 * values only — they seed the fields and the user can edit every one of them
 * before submitting. Nothing about `raiseTicket` or the hr_tickets table
 * changes; this is the same form with its boxes already typed in.
 */
export function TicketComposer({
  mode = "support",
  initialSubject,
  initialDescription,
  initialCategory,
  contextNote,
}: {
  mode?: "support" | "query";
  initialSubject?: string;
  initialDescription?: string;
  initialCategory?: HrTicketCategory;
  /** One line naming what was carried in, shown above the fields. */
  contextNote?: string;
}) {
  const router = useRouter();
  const isQuery = mode === "query";
  const [busy, setBusy] = React.useState(false);
  const [category, setCategory] = React.useState<HrTicketCategory>(
    initialCategory ?? (isQuery ? "policy_question" : "payroll"),
  );
  const [priority, setPriority] = React.useState("normal");
  const [files, setFiles] = React.useState<File[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const subjectRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // A prefilled subject is already the right words — put the cursor in the
    // Details box instead, which is where the user still has something to say.
    if (initialSubject) return;
    const t = setTimeout(() => subjectRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [initialSubject]);

  const confidential = category === "grievance";

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 8));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    form.set("category", category);
    form.set("source", mode);
    if (!isQuery) form.set("priority", priority);
    // Ask-HR: the one-line question doubles as the body when no detail is given.
    if (isQuery) {
      const desc = String(form.get("description") ?? "").trim();
      if (!desc) form.set("description", String(form.get("subject") ?? ""));
    }
    form.delete("attachments");
    for (const f of files) form.append("attachments", f);
    setBusy(true);
    const res = await raiseTicket(form);
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: isQuery ? "Sent to HR" : `Ticket raised`, type: "success" });
    router.push(`/support/${res.id}`);
  }

  return (
    <form onSubmit={submit} className="wg-rise space-y-6">
      {contextNote && (
        <div
          className="flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] font-medium"
          style={{ borderColor: `${RED}33`, background: `${RED}08`, color: RED_DEEP }}
        >
          <Inbox size={16} className="mt-0.5 shrink-0" />
          <span>{contextNote}</span>
        </div>
      )}

      {!isQuery && (
        <div>
          <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            What is this about?
          </label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {HR_TICKET_CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition"
                  style={{
                    borderColor: active ? RED : "var(--color-hairline, #e5e7eb)",
                    background: active ? `${RED}0d` : "var(--color-surface-card, #fff)",
                    boxShadow: active ? `0 0 0 1px ${RED} inset` : "none",
                  }}
                >
                  <span className="text-[18px] leading-none">{CATEGORY_GLYPH[c]}</span>
                  <span className="text-[13px] font-semibold text-ink-strong">
                    {HR_TICKET_CATEGORY_LABELS[c]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isQuery && (
        <div>
          <label htmlFor="cat" className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Topic
          </label>
          <select
            id="cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as HrTicketCategory)}
            className="w-full rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
          >
            {HR_TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {HR_TICKET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      )}

      {confidential && (
        <div
          className="flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] font-medium"
          style={{ borderColor: `${RED}55`, background: `${RED}0a`, color: RED_DEEP }}
        >
          <ShieldAlert size={17} className="mt-0.5 shrink-0" />
          <span>
            This is a <strong>confidential grievance</strong>. Only you, the HR person handling it,
            and firm super-admins can ever read it — never your manager or other HR staff.
          </span>
        </div>
      )}

      <div>
        <label htmlFor="subject" className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {isQuery ? "Your question, in one line" : "Subject"}
        </label>
        <input
          id="subject"
          name="subject"
          ref={subjectRef}
          required
          maxLength={200}
          defaultValue={initialSubject}
          placeholder={isQuery ? "e.g. How many casual leaves do I have left?" : "Short summary of your request"}
          className="w-full rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5 text-[15px] font-medium text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {isQuery ? "Anything else? (optional context)" : "Details"}
        </label>
        <textarea
          id="description"
          name="description"
          required={!isQuery}
          rows={isQuery ? 3 : 6}
          maxLength={8000}
          defaultValue={initialDescription}
          placeholder={isQuery ? "Add any details that help HR answer you faster." : "Describe your request — dates, amounts, people, anything relevant."}
          className="w-full resize-y rounded-xl border border-hairline bg-surface-card px-3.5 py-3 text-[14.5px] leading-relaxed text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
        />
      </div>

      {!isQuery && (
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="priority" className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={confidential}
              className="rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none focus:border-[var(--color-altus-red)] disabled:opacity-60"
            >
              {HR_TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {HR_TICKET_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            {confidential && (
              <p className="mt-1 text-[11.5px] font-medium text-ink-muted">Grievances are handled at High priority.</p>
            )}
          </div>
        </div>
      )}

      {!isQuery && (
        <div>
          <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Attachments
          </label>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-solid px-4 py-6 text-center transition"
            style={{ borderColor: dragOver ? RED : "var(--color-hairline, #e5e7eb)", background: dragOver ? `${RED}08` : "transparent" }}
          >
            <Paperclip size={18} className="text-ink-muted" />
            <span className="text-[13px] font-semibold text-ink-strong">Drop files here or click to browse</span>
            <span className="text-[11.5px] text-ink-muted">Up to 8 files, 25 MB each</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[13px]">
                  <span className="truncate font-medium text-ink-strong">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="ml-2 text-ink-muted hover:text-[var(--color-altus-red)]"
                    aria-label="Remove"
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          {isQuery ? "Send to HR" : "Raise ticket"}
        </button>
      </div>
    </form>
  );
}
