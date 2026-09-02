import type { Route } from "next";
import { Download, Gauge, GraduationCap, ListChecks, Target, Users, type LucideIcon } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { GradeBadge } from "@/components/productivity/grade-badge";
import {
  formatHours,
  formatMoney,
  formatPct,
  type Grade,
} from "@/lib/productivity/calc";
import {
  GOALS_THEME,
  KPI_THEME,
  MANAGER_THEME,
  TASKS_THEME,
  TASK_COLOR,
  TRAINING_THEME,
  type SectionTheme,
} from "@/lib/productivity/theme";
import type { ProductivitySnapshot } from "@/lib/productivity/data";

/**
 * The Full Report — the same snapshot as the dashboard, read as a document.
 *
 * NO SECOND DATA PATH: the page hands this the identical `ProductivitySnapshot`
 * the dashboard renders, so a figure can never differ between the two screens.
 * What changes is the READING: the dashboard answers "how am I doing?" in five
 * seconds with one hero per card; the report answers "where exactly does that
 * number come from?" with the underlying values, full-precision percentages and
 * the grade scales spelled out.
 *
 * Rows are label-left / value-right here rather than centred. Centring is the
 * dashboard's rule because a card is a single statement; a report is a list of
 * paired facts, and pairs read along a shared baseline.
 */

export function ProductivityReportView({
  snap,
  backHref,
}: {
  snap: ProductivitySnapshot;
  backHref: Route;
}) {
  const { employee, period, kpi, goals, tasks, training, manager } = snap;
  const role = [employee.designation, employee.department].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-7 max-md:gap-5">
      {/* ── Report masthead ── */}
      <header
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5 rounded-2xl border border-hairline-strong bg-surface-card px-6 py-5 max-md:px-4 max-md:py-4"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <div className="flex min-w-0 items-center gap-4">
          <EmployeeAvatar name={employee.name} size="lg" />
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
              Productivity · Full Report
            </div>
            <h1
              className="mt-0.5 truncate text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: "clamp(22px, 2.2vw, 30px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.08,
              }}
            >
              {employee.name}
            </h1>
            <p className="mt-1 text-[13px] font-semibold text-ink-muted">{role || "—"}</p>
            {employee.managerName && (
              <p className="mt-0.5 text-[12.5px] text-ink-subtle">
                Reporting Manager:{" "}
                <span className="font-semibold text-ink-muted">{employee.managerName}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] font-bold text-ink-muted">
            {period.label}
          </span>
          <a
            href={`/api/productivity/report/${employee.id}/pdf`}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            <Download size={14} strokeWidth={2.4} /> Download
          </a>
        </div>
      </header>

      {/* ── KPI ── */}
      <Block title="KPI" Icon={Gauge} theme={KPI_THEME}>
        <Row label="Earned incentive" value={formatMoney(kpi.incentiveAmount)} strong />
        <Row
          label="Base salary (monthly)"
          value={kpi.baseSalary > 0 ? formatMoney(kpi.baseSalary) : "Not on record"}
          muted={kpi.baseSalary <= 0}
        />
        <Row label="Incentive % of salary" value={formatPct(kpi.incentivePct)} strong />
        <Row label="Incentive grade" value={<GradeChip grade={kpi.grade} />} />
        <Note>
          Earned incentive is the amount APPROVED for {period.label} — the figure signed off as this
          employee&apos;s, which does not lag behind a payroll run the way a disbursed amount does.
          {kpi.baseSalary <= 0 &&
            " With no salary profile on record the percentage is unknown, so it reads “—” rather than 0%."}
        </Note>
      </Block>

      {/* ── Goals ── */}
      <Block title="Goals" Icon={Target} theme={GOALS_THEME}>
        <Row label="Monthly goals completed" value={`${goals.monthly.completed}`} strong />
        <Row label="Monthly goals set" value={`${goals.monthly.target}`} />
        <Row label="Monthly completion" value={formatPct(goals.monthly.pct)} strong />
        <Row label="Monthly grade" value={<GradeChip grade={goals.monthly.grade} />} />
        <Row
          label="Weekly boards counted (MTD)"
          value={`${goals.mtd.weeks} week${goals.mtd.weeks === 1 ? "" : "s"}`}
        />
        <Row label="MTD completion" value={formatPct(goals.mtd.pct)} strong />
        <Row label="MTD grade" value={<GradeChip grade={goals.mtd.grade} />} />
        <Note>
          The month runs {period.monthStart} to {period.monthEnd}. MTD sums every weekly board whose
          Monday falls inside it — W1 + W2 + W3 + W4 (+ W5 where the month has one) — so the period
          begins on the 1st, handles 28/29/30/31-day months without a special case, and starts a new
          period on its own when the calendar turns over. Nothing carries forward.
        </Note>
      </Block>

      {/* ── Tasks ── */}
      <Block title="Tasks" Icon={ListChecks} theme={TASKS_THEME}>
        <Row label="Overdue more than 15 days" value={<Count n={tasks.over15} color={TASK_COLOR.over15} />} />
        <Row label="Overdue 8–14 days" value={<Count n={tasks.days8to14} color={TASK_COLOR.days8to14} />} />
        <Row label="Overdue 1–7 days" value={<Count n={tasks.days1to7} color={TASK_COLOR.days1to7} />} />
        <Row label="Flagged “need help”" value={<Count n={tasks.needHelp} color={TASK_COLOR.needHelp} />} />
        <Note>
          Open assigned work only — done, approved and cancelled tasks are excluded. Age is counted
          in whole calendar days against each task&apos;s effective due date, so a task due yesterday
          evening reads as one day overdue this morning.
        </Note>
      </Block>

      {/* ── Training ── */}
      <Block title="Training" Icon={GraduationCap} theme={TRAINING_THEME}>
        <Row
          label="Training given (by manager)"
          value={`${formatHours(training.givenHours)} / ${training.targetHours} hrs`}
          strong
        />
        <Row label="Given — % of target" value={formatPct(training.givenPct)} />
        <Row
          label="Training attended (by employee)"
          value={`${formatHours(training.attendedHours)} / ${training.targetHours} hrs`}
          strong
        />
        <Row label="Attended — % of target" value={formatPct(training.attendedPct)} />
        <Note>
          Counted from completed sessions this month: hours GIVEN are sessions this person ran as
          trainer, hours ATTENDED are sessions they joined. The target is {training.targetHours} hours
          a month.
        </Note>
      </Block>

      {/* ── Manager — only for someone who actually has reports ── */}
      {manager && (
        <Block title="Manager" Icon={Users} theme={MANAGER_THEME}>
          <Row label="Tasks delegated" value={`${manager.tasksDelegated}`} strong />
          <Row label="Goals delegated" value={`${manager.goalsDelegated}`} strong />
          <Note>
            Work handed to direct reports this month — tasks this person raised on a report&apos;s
            list, and weekly goals they created on a report&apos;s board.
          </Note>
        </Block>
      )}

      {/* ── The two grading scales, stated in full ── */}
      <Block title="Grading" Icon={Gauge} theme={KPI_THEME}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 max-md:grid-cols-1">
          <div>
            <ScaleHeading>Completion — goals, MTD</ScaleHeading>
            <ScaleRow grade="O" band="Above 100%" />
            <ScaleRow grade="A" band="90% and above" />
            <ScaleRow grade="B" band="80% and above" />
            <ScaleRow grade="C" band="70% and above" />
            <ScaleRow grade="D" band="60% and above" />
            <ScaleRow grade="F" band="Below 60%" />
          </div>
          <div>
            <ScaleHeading>Incentive — % of base salary</ScaleHeading>
            <ScaleRow grade="O" band="30% and above" />
            <ScaleRow grade="A" band="20% and above" />
            <ScaleRow grade="B" band="15% and above" />
            <ScaleRow grade="C" band="10% and above" />
            <ScaleRow grade="D" band="5% and above" />
            <ScaleRow grade="F" band="Below 5%" />
          </div>
        </div>
        <Note>
          Two deliberately different scales: an employee can legitimately hold a strong goal grade
          and a weak incentive grade, because they measure different things. No grade is ever stored
          — each is derived from the values above it, so the report and the dashboard cannot drift.
        </Note>
      </Block>

      <p className="text-[12px] text-ink-subtle">
        Generated {snap.generatedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST ·
        every figure reads live from the tasks, goals, training, salary and incentive records — nothing
        is duplicated for this report.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const CARD_SHADOW = "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 28px -22px rgba(15, 23, 42, 0.35)";

function Block({
  title,
  Icon,
  theme,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  theme: SectionTheme;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card px-6 py-5 max-md:px-4"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: theme.accent }} />
      <div className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: theme.tint, color: theme.ink }}
        >
          <Icon size={15} strokeWidth={2.5} />
        </span>
        <h2
          className="uppercase text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(15px, 1.3vw, 18px)",
            letterSpacing: "0.03em",
            lineHeight: 1,
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hairline py-2 last:border-b-0">
      <span className="text-[13px] font-medium text-ink-muted">{label}</span>
      <span
        className={`shrink-0 tabular-nums ${
          strong ? "text-[16px] font-black" : "text-[14px] font-bold"
        } ${muted ? "text-ink-subtle" : "text-ink-strong"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Count({ n, color }: { n: number; color: string }) {
  return <span style={{ color: n > 0 ? color : "var(--color-ink-strong)" }}>{n}</span>;
}

/** `null` = ungraded (nothing was set to grade against), never F. The chip is
 *  the shared badge, so the report and the dashboard cannot drift apart. */
function GradeChip({ grade }: { grade: Grade | null }) {
  return <GradeBadge grade={grade} size="md" />;
}

function ScaleHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
      {children}
    </div>
  );
}

function ScaleRow({ grade, band }: { grade: Grade; band: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hairline py-1 last:border-b-0">
      <GradeBadge grade={grade} size="xs" />
      <span className="text-[12.5px] font-medium text-ink-muted">{band}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">{children}</p>;
}
