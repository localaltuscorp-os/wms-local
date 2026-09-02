import {
  StickyNote,
  Phone,
  Users2,
  Mail,
  MessageCircle,
  GitBranch,
  Wallet,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ActivityRow } from "@/lib/queries/ambassadors";

/**
 * Vertical activity timeline — reusable. One row per activity with a
 * per-type brand-toned icon, title/body, "time ago" + author. Pure presentation;
 * brand tokens only.
 */

const TYPE_META: Record<string, { icon: LucideIcon; tint: string; ink: string; label: string }> = {
  note: { icon: StickyNote, tint: "rgba(225,6,0,0.10)", ink: "var(--color-altus-red-deep)", label: "Note" },
  call: { icon: Phone, tint: "rgba(20,140,80,0.12)", ink: "var(--color-green-deep, #0f7a47)", label: "Call" },
  meeting: { icon: Users2, tint: "rgba(59,130,246,0.12)", ink: "#1d4ed8", label: "Meeting" },
  email: { icon: Mail, tint: "rgba(168,85,247,0.12)", ink: "#7c3aed", label: "Email" },
  whatsapp: { icon: MessageCircle, tint: "rgba(20,140,80,0.12)", ink: "var(--color-green-deep, #0f7a47)", label: "WhatsApp" },
  stage_change: { icon: GitBranch, tint: "rgba(214,138,20,0.14)", ink: "#9a5a00", label: "Stage Change" },
  commission: { icon: Wallet, tint: "rgba(20,140,80,0.12)", ink: "var(--color-green-deep, #0f7a47)", label: "Commission" },
  reminder: { icon: Sparkles, tint: "rgba(225,6,0,0.10)", ink: "var(--color-altus-red-deep)", label: "Reminder" },
  system: { icon: Sparkles, tint: "rgba(80,80,100,0.10)", ink: "#4a4a57", label: "System" },
};

function metaFor(type: string) {
  return TYPE_META[type] ?? TYPE_META.system!;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function ActivityFeed({ activities }: { activities: ActivityRow[] }) {
  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-8 text-center">
        <div
          className="mx-auto mb-3 inline-grid h-11 w-11 place-items-center rounded-xl"
          style={{ background: "rgba(225,6,0,0.08)" }}
        >
          <StickyNote size={19} strokeWidth={2.4} className="text-ink-strong" />
        </div>
        <p className="text-[14px] font-semibold text-ink-strong">No activity yet</p>
        <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">
          Log a note, call, or meeting above to start the timeline.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative">
      {/* spine */}
      <span
        aria-hidden
        className="absolute left-[18px] top-2 bottom-2 w-px"
        style={{ background: "var(--color-hairline)" }}
      />
      {activities.map((a) => {
        const meta = metaFor(a.type);
        const Icon = meta.icon;
        return (
          <li key={a.id} className="relative flex gap-3.5 pb-4 last:pb-0">
            <span
              className="relative z-[1] inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-2 ring-white"
              style={{ background: meta.tint }}
            >
              <Icon size={16} strokeWidth={2.5} style={{ color: meta.ink }} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[14px] font-semibold text-ink-strong">
                  {a.title || meta.label}
                </span>
                <span className="shrink-0 text-[11.5px] font-medium text-ink-soft tabular-nums">
                  {timeAgo(a.occurredAt)}
                </span>
              </div>
              {a.body && (
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] font-medium leading-snug text-ink-muted">
                  {a.body}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11.5px] font-medium text-ink-soft">
                <span
                  className="rounded-full px-1.5 py-px font-bold uppercase tracking-wide"
                  style={{ background: meta.tint, color: meta.ink, fontSize: 9.5, letterSpacing: "0.06em" }}
                >
                  {meta.label}
                </span>
                {a.createdByName && <span>· {a.createdByName}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
