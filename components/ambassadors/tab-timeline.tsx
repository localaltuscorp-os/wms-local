"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote, Phone, Users2, Mail, MessageCircle, BellRing, Check, Send } from "lucide-react";
import type { ActivityRow } from "@/lib/queries/ambassadors";
import { logActivity, completeReminder } from "@/app/(app)/ambassadors/actions";
import { createFollowUpTask } from "@/app/(app)/ambassadors/doc-ai-actions";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { ActivityFeed } from "./activity-feed";
import { ListTodo } from "lucide-react";

type ActType = "note" | "call" | "meeting" | "email" | "whatsapp";

const TYPES: { value: ActType; label: string; icon: typeof StickyNote }[] = [
  { value: "note", label: "Note", icon: StickyNote },
  { value: "call", label: "Call", icon: Phone },
  { value: "meeting", label: "Meeting", icon: Users2 },
  { value: "email", label: "Email", icon: Mail },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

export function TabTimeline({
  ambassadorId,
  activities,
}: {
  ambassadorId: string;
  activities: ActivityRow[];
}) {
  const router = useRouter();
  const [type, setType] = useState<ActType>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [pending, startTransition] = useTransition();

  const reminders = activities.filter((a) => a.remindAt && !a.done);

  function submit() {
    if (!title.trim() && !body.trim()) {
      fireToast({ message: "Add a title or note before logging.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await logActivity({
        ambassadorId,
        type,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        remindAt: remindAt ? new Date(remindAt).toISOString() : undefined,
      });
      if (res.ok) {
        setTitle("");
        setBody("");
        setRemindAt("");
        setType("note");
        fireToast({ message: "Activity logged." });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  function followUp() {
    startTransition(async () => {
      const res = await createFollowUpTask({
        ambassadorId,
        title: title.trim() || "",
        dueAt: remindAt ? new Date(remindAt).toISOString().slice(0, 10) : null,
      });
      if (res.ok) {
        fireToast({ message: "Follow-up task created — it'll sync to the calendar." });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  function markDone(id: string) {
    startTransition(async () => {
      const res = await completeReminder(id);
      if (res.ok) {
        fireToast({ message: "Reminder completed." });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <div className="grid grid-cols-[1.15fr_1fr] gap-5 max-lg:grid-cols-1">
      {/* left: composer + reminders */}
      <div className="space-y-5">
        {/* composer */}
        <section className="rounded-2xl border border-hairline bg-white p-5" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
          <h2 className="mb-3 text-[15px] font-bold text-ink-strong">Log Activity</h2>

          {/* type selector */}
          <div role="radiogroup" aria-label="Activity type" className="mb-3 flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(t.value)}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors"
                  style={
                    active
                      ? { borderColor: "var(--color-altus-red)", background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }
                      : { borderColor: "var(--color-hairline)", background: "white", color: "var(--color-ink-muted)" }
                  }
                >
                  <t.icon size={15} strokeWidth={2.6} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            autoFocus
            className="mb-2.5 w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-soft focus:border-[color:var(--color-altus-red)]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened? Add details…"
            rows={3}
            className="mb-2.5 w-full resize-y rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-soft focus:border-[color:var(--color-altus-red)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink-muted">
              <BellRing size={15} strokeWidth={2.5} style={{ color: "var(--color-altus-red)" }} />
              Remind me
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="rounded-lg border border-hairline bg-white px-2 py-1.5 text-[13px] font-medium text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={followUp}
                disabled={pending}
                title="Create a WMS task (syncs to the assignee's Google Calendar)"
                className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2.5 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] disabled:opacity-60"
              >
                <ListTodo size={15} strokeWidth={2.6} />
                Follow-up Task
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -14px rgba(225,6,0,0.6)" }}
              >
                <Send size={15} strokeWidth={2.6} />
                {pending ? "Logging…" : "Log Activity"}
              </button>
            </div>
          </div>
        </section>

        {/* reminders strip */}
        {reminders.length > 0 && (
          <section className="rounded-2xl border border-hairline bg-white p-5" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink-strong">
              <BellRing size={16} strokeWidth={2.6} style={{ color: "var(--color-altus-red)" }} />
              Reminders
            </h2>
            <ul className="space-y-2">
              {reminders.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-hairline px-3 py-2.5"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 4%, transparent)" }}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-strong">{a.title || "Reminder"}</span>
                    {a.remindAt && (
                      <span className="block text-[12px] font-medium text-ink-muted tabular-nums">
                        {formatDate(new Date(a.remindAt))} · {new Date(a.remindAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => markDone(a.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-green,#15803d)] disabled:opacity-60"
                  >
                    <Check size={14} strokeWidth={2.8} />
                    Done
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* right: feed */}
      <section className="rounded-2xl border border-hairline bg-white p-5" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
        <h2 className="mb-4 text-[15px] font-bold text-ink-strong">Timeline</h2>
        <ActivityFeed activities={activities} />
      </section>
    </div>
  );
}
