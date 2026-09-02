"use client";

import { CollapsibleBody } from "@/components/dashboard/section-chrome";
import { PER_REPORT_PER_DAY } from "@/lib/transforms/initiator-scorecard";
import Link from "next/link";
import type { Route } from "next";
import * as React from "react";
import { motion } from "motion/react";
import { Users, ChevronUp } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { ManagerInitiatorTable } from "@/components/dashboard/exec/manager-initiator-table";
import { ManagerDrilldown } from "@/components/dashboard/exec/manager-drilldown";
import { useReducedMotion } from "@/lib/motion-utils";
import type {
  TaskReportData,
} from "@/lib/queries/task-report";
import type { FineBucketCount } from "@/lib/transforms/aging-buckets-fine";
import type { InitiatorBoard } from "@/lib/types";
import { PageShell } from "@/components/layout/page-shell";

const GREEN = "var(--color-green-deep, #15803D)";
const RED = "var(--color-altus-red, #E10600)";

type WindowKey = "d3" | "d7";

export interface TaskReportViewProps {
  data: TaskReportData;
  avatarById: Record<string, string | null>;
  isAdmin: boolean;
  meId: string | null;
}

export function TaskReportView({ data, avatarById, isAdmin, meId }: TaskReportViewProps) {
  const reduce = useReducedMotion() ?? false;
  const resolveAvatar = React.useCallback(
    (id: string): string | null => avatarById[id] ?? null,
    [avatarById],
  );

  const rise = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <PageShell as="div" width="full" py={false} className="pb-20">
      {/* Section 1 (the 12-bucket delivery spread) MOVED to the main WMS
          dashboard — see components/dashboard/delivery-spread-section.tsx. It
          sits directly under the Delivered-on-Time overview there, which is the
          number it breaks down. `DoneCard` and its GlassCard shell went with
          it; `data.doneByOriginal` is still computed by the report query and no
          longer rendered here. */}
      {/* Section 3 (sent-back work) MOVED to the main WMS dashboard — see
          components/dashboard/sent-back-section.tsx. It sits under Overdue
          Tasks by Person there, which is the card it pairs with. NotApprovedPanel
          and its EmptyState helper went with it. */}
      {/* ── Section 4: Task Initiator scorecards ── */}
      <motion.section {...rise(0.12)} className="mt-12" aria-label="Task initiator scorecards">
        <ReportSection
          icon={<Users size={22} strokeWidth={2.4} />}
          kicker="Task initiator"
          title="Who is delegating — target vs actual"
          /* Reads the CONSTANT, not a literal. This said "3 tasks per report
             per working day" while PER_REPORT_PER_DAY has been 5 — harmless
             while the section showed cards, but now that it renders the same
             table as the dashboard the caption would contradict the Target
             Ratio column directly beneath it. The dashboard header hit exactly
             this and was fixed the same way. */
          subtitle={`Tasks Each Manager Handed to Their Direct Reports, Scored Against the Target of ${PER_REPORT_PER_DAY} Tasks per Report per Working Day.`}
          label="the delegation scorecards"
        >
        <InitiatorPanel
          initiator={data.initiator}
          isAdmin={isAdmin}
          meId={meId}
          resolveAvatar={resolveAvatar}
        />
        </ReportSection>
      </motion.section>
    </PageShell>
  );
}

/* ───────────────────────────── Section header ─────────────────────────── */

function SectionHeader({
  icon,
  kicker,
  title,
  subtitle,
  tone = "brand",
  actions,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  subtitle: React.ReactNode;
  tone?: "brand" | "red";
  /** Fullscreen + collapse cluster, pinned top-right. */
  actions?: React.ReactNode;
}) {
  const accent = tone === "red" ? RED : "var(--color-altus-red-deep)";
  return (
    // relative + an absolutely-placed cluster rather than a flex row: the
    // kicker, title and subtitle are three stacked blocks of differing width,
    // and flexing them against the buttons would drag the subtitle's nowrap
    // line into the button column on narrower screens.
    <header className="relative mb-5 pr-24">
      <p
        className="inline-flex items-center gap-2 text-[10.5px] font-black uppercase tracking-[0.16em]"
        style={{ color: accent }}
      >
        <span
          className="inline-flex size-7 items-center justify-center rounded-lg"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 11%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          {icon}
        </span>
        {kicker}
      </p>
      <h2
        className="mt-2 leading-tight text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 26,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      {/* Single line from lg up. The max-w-[820px] cap is what wrapped these;
          with it gone `whitespace-nowrap` keeps each subtitle on one row.

          lg, not md, because this rule is shared by all three sections and the
          longest subtitle here is 134 characters ≈ 870px at 14px. That clears
          the ~970px of content width at lg, but not the ~710px at md — and a
          nowrap line wider than its container does not truncate, it pushes the
          whole page into horizontal scroll. Below lg they wrap, which is the
          lesser evil. */}
      <p className="mt-1.5 text-[14px] font-semibold text-ink-subtle max-lg:whitespace-normal lg:whitespace-nowrap">
        {subtitle}
      </p>
      {actions && (
        <div className="absolute right-0 top-0 flex items-center gap-1.5">{actions}</div>
      )}
    </header>
  );
}

/**
 * One analytics section: header + collapsible body + a fullscreen view.
 *
 * FULLSCREEN RENDERS THE SAME `children`, MOVED — not a second copy. These
 * sections hold real state (which manager rows are expanded, the 3/7-day
 * window, which tooltip is open), and a duplicate tree for the overlay would
 * reset all of it on entry and strand any change made inside it on exit. React
 * keeps the instance alive across the portal move, so the widget you blow up is
 * the widget you were looking at.
 *
 * It portals to <body> deliberately. `position: fixed` is contained by any
 * ancestor carrying a transform, and each section is a motion.section whose
 * entrance animates `y` — an overlay left in place would be clipped by its own
 * card instead of covering the viewport.
 */
function ReportSection({
  icon,
  kicker,
  title,
  subtitle,
  tone,
  label,
  children,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  subtitle: React.ReactNode;
  tone?: "brand" | "red";
  /** Accessible name for the two controls, e.g. "the 12-bucket spread". */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);


  // ONE control, and it folds the section. This header used to carry two: a
  // Maximize2 that portalled the widget into a fullscreen overlay, and a
  // chevron that collapsed it. The fullscreen one sat FIRST, so the top-right
  // "resize" button on this surface blew the section up while the identical
  // button on every other section folded it away.
  //
  // The overlay is gone rather than rebound: it was a modal in everything but
  // name (fixed inset-0, aria-modal, Esc trap, body scroll lock), and the same
  // pattern was already removed from the activity board for the same reason.
  const controls = (
    <IconAction
      onClick={() => setOpen((v) => !v)}
      label={open ? `Collapse ${label}` : `Expand ${label}`}
      title={open ? "Collapse" : "Expand"}
      aria-expanded={open}
    >
      <ChevronUp
        size={15}
        strokeWidth={2.6}
        className={`transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
          open ? "" : "rotate-180"
        }`}
      />
    </IconAction>
  );

  const header = (
    <SectionHeader
      icon={icon}
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      tone={tone}
      actions={controls}
    />
  );

  return (
    <>
      {header}
      <CollapsibleBody expanded={open}>{children}</CollapsibleBody>
    </>
  );
}

/** Square icon button, shared by the two section controls. */
function IconAction({
  onClick,
  label,
  title,
  children,
  ...rest
}: {
  onClick: () => void;
  label: string;
  title: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"button">, "onClick" | "title" | "children">) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-white text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
      {...rest}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── Card chrome (cream glass) ───────────────────── */

/**
 * The report's card surface. Clean white with a hairline grey border — the
 * cream/beige gradient it replaced (#FBF7F0 → #F4EEE3) tinted every colour
 * sitting on it, which the nine-tier delivery ramp cannot tolerate: the neutral
 * "On Due Date" tier is defined as white, and on a beige ground it read as
 * another filled band rather than the neutral pivot.
 */
/** Shared card shell. STAYS HERE: the Not-approved and Initiator sections below
 *  both use it. Only DoneCard moved out. */
function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm max-md:p-5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/* ──────────────────────────── ③ Not-approved ───────────────────────────── */

/* ─────────────────────────── ④ Task initiator ──────────────────────────── */

function InitiatorPanel({
  initiator,
  isAdmin,
  meId,
  resolveAvatar,
}: {
  initiator: { d3: InitiatorBoard; d7: InitiatorBoard };
  isAdmin: boolean;
  meId: string | null;
  resolveAvatar: (id: string) => string | null;
}) {
  const [windowKey, setWindowKey] = React.useState<WindowKey>("d7");
  const [openManagerId, setOpenManagerId] = React.useState<string | null>(null);
  const board = initiator[windowKey];
  const windowDays: 3 | 7 = windowKey === "d3" ? 3 : 7;

  const managers = isAdmin
    ? board.managers
    : board.managers.filter((m) => m.managerId === meId);

  return (
    <GlassCard>
      <div className="mb-5 flex items-end justify-between gap-4 max-md:flex-col max-md:items-stretch">
        <p className="text-[13px] font-semibold text-ink-subtle">
          Target ={" "}
          <span className="tabular-nums font-black text-ink-soft">3 × {board.workingDays}</span>{" "}
          working {board.workingDays === 1 ? "day" : "days"} × direct reports
        </p>
        <div className="flex items-center gap-2">
          <WindowToggle value={windowKey} onChange={setWindowKey} />
          {/* The rail's ‹ › nudge arrows are gone with the rail — there is no
              longer a horizontal scroller for them to drive. */}
        </div>
      </div>

      {managers.length === 0 ? (
        <EmptyState
          icon={<Users size={24} strokeWidth={2.2} />}
          title="No managers with direct reports yet"
          body="Assign reporting lines in Admin → Employees to see initiation scorecards."
        />
      ) : (
        /* TABLE, not the horizontal card rail that used to live here. The rail
           put one wide card per manager behind a sideways scroll, so comparing
           two managers meant scrolling one out of view to reach the other —
           and delegation is a leaderboard question, which is exactly the
           comparison a rail makes impossible.

           This is the SAME <ManagerInitiatorTable> the WMS dashboard already
           uses (it was converted there first), so the two surfaces now agree
           instead of showing the same numbers in two different shapes. It is
           `table-fixed` with a percentage colgroup, so ten columns fit without
           any horizontal scroll, and each row still expands in place to the
           per-report breakdown. */
        <ManagerInitiatorTable
          managers={managers}
          resolveAvatar={resolveAvatar}
          onOpenDrilldown={(managerId) => setOpenManagerId(managerId)}
        />
      )}

      <ManagerDrilldown
        managerId={openManagerId}
        windowDays={windowDays}
        onClose={() => setOpenManagerId(null)}
      />

    </GlassCard>
  );
}

function WindowToggle({ value, onChange }: { value: WindowKey; onChange: (k: WindowKey) => void }) {
  const options: { id: WindowKey; label: string }[] = [
    { id: "d3", label: "3-day" },
    { id: "d7", label: "7-day" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Initiator window"
      className="inline-flex shrink-0 items-center gap-1 rounded-chip border p-1"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background: "color-mix(in srgb, var(--color-surface-card) 88%, transparent)",
      }}
    >
      {options.map((o) => {
        const isActive = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(o.id)}
            className="rounded-pill px-5 py-2 font-bold transition-all duration-200"
            style={{
              fontSize: 13.5,
              background: isActive
                ? "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
                : "transparent",
              color: isActive ? "#ffffff" : "var(--color-ink-muted)",
              boxShadow: isActive ? "0 6px 16px -6px rgba(168,4,0,0.55)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────── Shared empty state ───────────────────────── */

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      <span
        className="inline-flex size-12 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-ink-subtle) 12%, transparent)",
          color: "var(--color-ink-subtle)",
        }}
      >
        {icon}
      </span>
      <p
        className="text-ink-strong"
        style={{ fontFamily: "var(--font-serif), serif", fontWeight: 700, fontSize: 18 }}
      >
        {title}
      </p>
      <p className="max-w-[420px] text-[13px] font-semibold text-ink-subtle">{body}</p>
    </div>
  );
}
