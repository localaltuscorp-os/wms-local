"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  X,
  Users,
  ArrowUpRight,
  Pencil,
  ChevronRight,
} from "lucide-react";
import { approveTask } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { ReassignDialog } from "./reassign-dialog";

interface Props {
  taskId: string;
  expectedUpdatedAt: string;
  currentDoerId: string;
  employees: { id: string; name: string }[];
  canEdit: boolean;
  canApproveTask: boolean;
  canReassignTask: boolean;
  /** When the user clicks Edit (left column). */
  onStartEdit: () => void;
  /** Dialog hash open-state from the wrapper. */
  approveOpen: boolean;
  setApproveOpen: (next: boolean) => void;
  reassignOpen: boolean;
  setReassignOpen: (next: boolean) => void;
  /** Viewer's relationship to the task — drives the role banner above
   *  the action cards. `null` = neither doer nor initiator. */
  myRole: "doer" | "initiator" | "both" | null;
  /** True when the viewer has admin override (no role on the task but
   *  can still act). */
  adminOverride: boolean;
}

/**
 * Right-rail action rail.  Each workflow surface is a full-width card
 * (icon · label · subtext · chevron) with hover lift and color-coded
 * affordances.  Cards stagger-fade-in on mount (60ms per card).
 *
 * Approve fires inline (no dialog).  Decline opens the existing dialog
 * portal owned by ApproveDeclineDialog (rendered here, hidden trigger).
 */
export function ActionRail({
  taskId,
  expectedUpdatedAt,
  currentDoerId,
  employees,
  canEdit,
  canApproveTask,
  canReassignTask,
  onStartEdit,
  approveOpen,
  setApproveOpen,
  reassignOpen,
  setReassignOpen,
  myRole,
  adminOverride,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveTask(
        taskId,
        { decision: "approved" },
        expectedUpdatedAt,
      );
      if (!result.ok) {
        setError(
          result.error === "stale"
            ? "Task changed by someone else. Reload to see the latest."
            : result.error === "forbidden"
              ? "You don't have permission to approve this task."
              : (result.message ?? "Action failed."),
        );
        return;
      }
      fireToast({ message: "Approved." });
      router.refresh();
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const result = await approveTask(
        taskId,
        { decision: "not_approved", note: declineNote || undefined },
        expectedUpdatedAt,
      );
      if (!result.ok) {
        setError(
          result.error === "stale"
            ? "Task changed by someone else. Reload first."
            : result.error === "forbidden"
              ? "You don't have permission to approve this task."
              : (result.message ?? "Action failed."),
        );
        return;
      }
      fireToast({ message: "Declined." });
      setApproveOpen(false);
      setDeclineNote("");
      router.refresh();
    });
  }

  const cards: Array<{
    key: string;
    visible: boolean;
    node: React.ReactNode;
  }> = [
    {
      key: "approve",
      visible: canApproveTask,
      node: (
        <ActionCard
          icon={<Check size={16} strokeWidth={2.6} />}
          label="Approve"
          subtext="Lock the work as done and close out."
          tone="green"
          onClick={approve}
          disabled={pending}
          primary
        />
      ),
    },
    {
      key: "decline",
      visible: canApproveTask,
      node: (
        <ActionCard
          icon={<X size={16} strokeWidth={2.6} />}
          label="Decline"
          subtext="Send back for rework with a note."
          tone="ink"
          onClick={() => setApproveOpen(true)}
          disabled={pending}
        />
      ),
    },
    {
      key: "reassign",
      visible: canReassignTask,
      node: (
        <ActionCard
          icon={<Users size={16} strokeWidth={2.4} />}
          label="Reassign"
          subtext="Hand the doer role to someone else."
          tone="ink"
          onClick={() => setReassignOpen(true)}
          disabled={pending}
        />
      ),
    },
    {
      key: "edit",
      visible: canEdit,
      node: (
        <ActionCard
          icon={<Pencil size={16} strokeWidth={2.4} />}
          label="Edit Task"
          subtext="Change client name, subject, due date, priority."
          tone="ink"
          onClick={onStartEdit}
          disabled={pending}
        />
      ),
    },
  ];

  const visibleCards = cards.filter((c) => c.visible);

  if (visibleCards.length === 0) {
    return (
      <div className="px-5 py-4 text-[13px] text-ink-subtle italic">
        No actions available for your role on this task.
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h2
        className="px-1 mb-3 text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold"
      >
        Admin & Process Actions
      </h2>
      <RoleBanner role={myRole} adminOverride={adminOverride} />
      <div className="flex flex-col gap-2">
        {visibleCards.map((c, i) => (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.36,
              delay: i * 0.06,
              ease: [0.2, 0.7, 0.3, 1],
            }}
          >
            {c.node}
          </motion.div>
        ))}
      </div>
      {error && (
        <p
          className="text-[13px] mt-3 px-1"
          style={{ color: "var(--color-red-deep)" }}
        >
          {error}
        </p>
      )}

      {/* Dialog portals.  These are headless triggers — the visible UI is
          the cards above; the dialogs themselves stay in their own files. */}

      {/* Decline dialog — owned inline because Approve also lives here. */}
      <Dialog.Root open={approveOpen} onOpenChange={setApproveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[60]"
            style={{
              background: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(4px)",
            }}
          />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[70] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-section border border-hairline bg-surface-card p-6 shadow-xl"
          >
            <Dialog.Title className="text-display-md text-ink-strong">
              Decline task
            </Dialog.Title>
            <Dialog.Description className="text-[15px] text-ink-subtle mt-1">
              Add an optional note for the doer.
            </Dialog.Description>
            <textarea
              rows={3}
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              className="mt-4 w-full rounded-md border border-hairline px-3.5 py-2.5 text-[15px] bg-white resize-y"
              placeholder="Why is this being declined? (optional)"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="px-5 py-2.5 rounded-md text-[14px] font-medium border border-hairline bg-surface-soft text-ink-strong disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={pending}
                onClick={decline}
                className="px-5 py-2.5 rounded-md text-[14px] font-medium text-white disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-red), var(--color-red-deep))",
                }}
              >
                {pending ? "Saving…" : "Decline"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Reassign dialog.  Its hidden trigger stays out of the layout via
          display:none — open-state is fully driven by the card above and the
          hash-open effect in the wrapper. */}
      {canReassignTask && (
        <ReassignDialog
          taskId={taskId}
          currentDoerId={currentDoerId}
          expectedUpdatedAt={expectedUpdatedAt}
          employees={employees}
          open={reassignOpen}
          onOpenChange={setReassignOpen}
          renderTrigger={false}
        />
      )}
    </div>
  );
}

/**
 * Banner that names the viewer's relationship to the task — "you're the
 * doer", "you're the initiator", or "admin override".  Sits above the
 * action cards so the user understands *why* certain affordances appear.
 *
 * Uses the same blue/purple/altus-red palette as the /tasks "My role"
 * column for cross-page consistency.
 */
function RoleBanner({
  role,
  adminOverride,
}: {
  role: "doer" | "initiator" | "both" | null;
  adminOverride: boolean;
}) {
  if (!role && !adminOverride) return null;

  const lines: Array<{
    tone: "blue" | "purple" | "altus";
    icon: React.ReactNode;
    label: string;
    detail: string;
  }> = [];

  if (role === "doer" || role === "both") {
    lines.push({
      tone: "blue",
      icon: <Check size={13} strokeWidth={2.6} />,
      label: "Doer",
      detail: "Move status, mark done, comment.",
    });
  }
  if (role === "initiator" || role === "both") {
    lines.push({
      tone: "purple",
      icon: <ArrowUpRight size={13} strokeWidth={2.6} />,
      label: "Initiator",
      detail: "Approve, decline, reassign.",
    });
  }
  if (!role && adminOverride) {
    lines.push({
      tone: "altus",
      icon: <Pencil size={13} strokeWidth={2.6} />,
      label: "Admin override",
      detail: "You're not on this task but can still act.",
    });
  }

  return (
    <div className="px-1 mb-3 flex flex-col gap-1.5">
      {lines.map((l, i) => {
        const palette =
          l.tone === "blue"
            ? {
                bg: "#EFF6FF",
                ring: "#BFDBFE",
                fg: "#1D4ED8",
                iconFg: "#1D4ED8",
              }
            : l.tone === "purple"
              ? {
                  bg: "#F5F3FF",
                  ring: "#DDD6FE",
                  fg: "#6D28D9",
                  iconFg: "#6D28D9",
                }
              : {
                  bg: "var(--color-red-bg)",
                  ring: "color-mix(in srgb, var(--color-altus-red) 25%, transparent)",
                  fg: "var(--color-altus-red-deep)",
                  iconFg: "var(--color-altus-red)",
                };
        return (
          <div
            key={i}
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
            style={{
              background: palette.bg,
              border: `1px solid ${palette.ring}`,
            }}
          >
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5"
              style={{
                background: "rgba(255, 255, 255, 0.75)",
                color: palette.iconFg,
              }}
            >
              {l.icon}
            </span>
            <span className="text-[13.5px] leading-snug flex-1 min-w-0" style={{ lineHeight: 1.45 }}>
              <span
                className="font-bold"
                style={{ color: palette.fg }}
              >
                You're the {l.label.toLowerCase()}
              </span>
              <span className="text-ink-soft"> — {l.detail}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ActionCardProps {
  icon: React.ReactNode;
  label: string;
  subtext: string;
  tone: "green" | "ink" | "rose" | "purple";
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

function ActionCard({
  icon,
  label,
  subtext,
  tone,
  onClick,
  disabled,
  primary,
}: ActionCardProps) {
  const toneVar =
    tone === "green"
      ? "var(--color-green)"
      : tone === "rose"
        ? "var(--color-rose)"
        : tone === "purple"
          ? "var(--color-purple)"
          : "var(--color-ink-strong)";

  const primaryStyle: React.CSSProperties | undefined = primary
    ? {
        background:
          "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
        color: "#ffffff",
        borderColor: "color-mix(in srgb, var(--color-green-deep) 80%, transparent)",
        boxShadow:
          "0 8px 20px -10px color-mix(in srgb, var(--color-green) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.16)",
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="action-card group"
      style={primaryStyle}
    >
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
        style={{
          background: primary
            ? "rgba(255, 255, 255, 0.18)"
            : `color-mix(in srgb, ${toneVar} 10%, transparent)`,
          color: primary ? "#ffffff" : toneVar,
          border: primary
            ? "1px solid rgba(255,255,255,0.2)"
            : `1px solid color-mix(in srgb, ${toneVar} 18%, transparent)`,
        }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block font-semibold ${primary ? "" : "text-ink-strong"}`}
          style={{ fontSize: 15, letterSpacing: "0.005em" }}
        >
          {label}
        </span>
        <span
          className={`block mt-0.5 ${primary ? "opacity-90" : "text-ink-subtle"}`}
          style={{ fontSize: 13, lineHeight: 1.45 }}
        >
          {subtext}
        </span>
      </span>
      <ChevronRight
        size={16}
        strokeWidth={2.4}
        className={`shrink-0 mt-1 transition-transform group-hover:translate-x-0.5 ${primary ? "opacity-80" : "text-ink-subtle"}`}
      />
    </button>
  );
}
