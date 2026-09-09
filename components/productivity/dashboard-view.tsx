import Link from "next/link";
import type { Route } from "next";
import { Download, FileText, Gauge, GraduationCap, ListChecks, Target, Users, type LucideIcon } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { GradeBadge } from "@/components/productivity/grade-badge";
import { formatHours, formatMoney, formatPctCompact, type Grade } from "@/lib/productivity/calc";
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
 * The Productivity Dashboard — ONE unified page. KPI, Goals, Tasks, Training
 * and (for managers) Manager are sections of a single scroll, never separate
 * routes.
 *
 * The same component renders every context: your own My Dashboard, a manager
 * viewing a direct report, an admin viewing anyone. Only the header and the
 * optional back-link change, so there is no separate "admin design" to drift.
 *
 * THE DESIGN RULES, all of which the pieces below enforce structurally rather
 * than by convention:
 *
 *   • SECTION HEADINGS lead. They are display-sized, left-aligned and carry the
 *     section's accent through an icon chip and a rule that runs to the right
 *     edge. You should be able to find "TASKS" without reading anything.
 *   • CARD CONTENT IS CENTRED — title, metric and support all share one axis,
 *     because `Card` centres its children and nothing overrides it.
 *   • ONE HERO PER CARD. Title (small, quiet) → metric (large, dark) → support
 *     (small, muted). Cards never carry two competing values.
 *   • COLOUR IS AN ACCENT, NOT A SURFACE. Cards stay white; the section colour
 *     appears as a 3px cap, an icon chip and — where the value carries a
 *     judgement — the metric itself. Grades and overdue counts are the only
 *     places colour is allowed to shout, and both always print the letter or
 *     number too, so colour is never the sole signal.
 *   • EQUAL HEIGHTS per section, via `auto-rows-fr` + `h-full` rather than a
 *     hand-tuned min-height that drifts the moment a label wraps.
 */

/* ------------------------------------------------------------------ */

/** Local aliases — the palette itself lives in `lib/productivity/theme` so the
 *  Full Report and the PDF draw from the same hexes. */
const KPI = KPI_THEME;
const GOALS = GOALS_THEME;
const TASKS = TASKS_THEME;
const TRAINING = TRAINING_THEME;
const MANAGER = MANAGER_THEME;

/* ------------------------------------------------------------------ */

export function ProductivityDashboardView({
  snap,
  backHref,
  viewingOther,
}: {
  snap: ProductivitySnapshot;
  /** Set when arriving from Team Performance. */
  backHref?: Route;
  /** True when this is somebody else's dashboard — makes whose it is explicit. */
  viewingOther: boolean;
}) {
  const { employee, period, kpi, goals, tasks, training, manager } = snap;

  return (
    <div className="flex flex-col gap-8 max-md:gap-6">
      <EmployeeHeader employee={employee} period={period} viewingOther={viewingOther} />

      {/* ── 1 · KPI — incentive money, its share of salary, the grade it earns ── */}
      <Section title="KPI" Icon={Gauge} theme={KPI}>
        <Grid cols={3}>
          <Card theme={KPI} title="Incentive Amount">
            <Hero color={KPI.ink}>{formatMoney(kpi.incentiveAmount)}</Hero>
            <Sub>Earned Incentive</Sub>
          </Card>

          <Card theme={KPI} title="Incentive % of Salary">
            <Hero>{formatPctCompact(kpi.incentivePct)}</Hero>
            {/* A missing salary profile is stated, never rendered as ₹0 — that
                would read as "earns nothing" instead of "not on record". */}
            <Sub>
              {kpi.baseSalary > 0 ? `of ${formatMoney(kpi.baseSalary)} salary` : "No salary on record"}
            </Sub>
          </Card>

          <Card theme={KPI} title="Incentive Grade">
            <GradeHero grade={kpi.grade} />
            <Sub>
              {kpi.incentivePct == null
                ? "No salary on record"
                : `${formatPctCompact(kpi.incentivePct)} incentive`}
            </Sub>
          </Card>
        </Grid>
      </Section>

      {/* ── 2 · Goals — this calendar month, reset by the calendar itself ── */}
      <Section title="Goals" Icon={Target} theme={GOALS}>
        <Grid cols={3}>
          <Card theme={GOALS} title="Monthly Goals">
            <Hero>
              {goals.monthly.completed} / {goals.monthly.target}
            </Hero>
            <Sub>Completed this month</Sub>
          </Card>

          <Card theme={GOALS} title="Monthly Goals %">
            <Hero color={GOALS.ink}>{formatPctCompact(goals.monthly.pct)}</Hero>
            <Sub>{goals.monthly.pct == null ? "No goals set" : "Monthly completion"}</Sub>
          </Card>

          <Card theme={GOALS} title="MTD Goals Grade">
            <GradeHero grade={goals.mtd.grade} />
            <Sub>
              {goals.mtd.pct == null
                ? "No weekly goals yet"
                : `${formatPctCompact(goals.mtd.pct)} achievement`}
            </Sub>
          </Card>
        </Grid>
      </Section>

      {/* ── 3 · Tasks — open assigned work, by how late it is ── */}
      <Section title="Tasks" Icon={ListChecks} theme={TASKS}>
        <Grid cols={4}>
          <Card theme={TASKS} title="Overdue > 15 Days">
            <CountHero value={tasks.over15} color={TASK_COLOR.over15} />
          </Card>
          <Card theme={TASKS} title="Overdue 8–14 Days">
            <CountHero value={tasks.days8to14} color={TASK_COLOR.days8to14} />
          </Card>
          <Card theme={TASKS} title="Overdue 1–7 Days">
            <CountHero value={tasks.days1to7} color={TASK_COLOR.days1to7} />
          </Card>
          <Card theme={TASKS} title="Need Help">
            <CountHero value={tasks.needHelp} color={TASK_COLOR.needHelp} />
          </Card>
        </Grid>
      </Section>

      {/* ── 4 · Training — against the 6-hour monthly target ── */}
      <Section title="Training" Icon={GraduationCap} theme={TRAINING}>
        <Grid cols={2}>
          <Card theme={TRAINING} title="Training Given">
            <HoursHero hours={training.givenHours} target={training.targetHours} />
            <Sub>Given by Manager</Sub>
          </Card>
          <Card theme={TRAINING} title="Training Attended">
            <HoursHero hours={training.attendedHours} target={training.targetHours} />
            <Sub>Attended by Employee</Sub>
          </Card>
        </Grid>
      </Section>

      {/* ── 5 · Manager — rendered ONLY when the subject manages someone, so an
             employee never meets an empty or disabled version of this row. ── */}
      {manager && (
        <Section title="Manager" Icon={Users} theme={MANAGER}>
          <Grid cols={2}>
            <Card theme={MANAGER} title="Tasks Delegated">
              <Hero color={MANAGER.ink}>{manager.tasksDelegated}</Hero>
              <Sub>To direct reports</Sub>
            </Card>
            <Card theme={MANAGER} title="Goals Delegated">
              <Hero color={MANAGER.ink}>{manager.goalsDelegated}</Hero>
              <Sub>To direct reports</Sub>
            </Card>
          </Grid>
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Employee header                                                     */
/* ------------------------------------------------------------------ */

/**
 * Identity first, actions second, period stated once.
 *
 * Deliberately compact: three lines of text beside the avatar. The month pill
 * is here rather than repeated per section because every figure below covers
 * the same window, and saying so once is what lets the section headings stay
 * single words.
 */
function EmployeeHeader({
  employee,
  period,
  viewingOther,
}: {
  employee: ProductivitySnapshot["employee"];
  period: ProductivitySnapshot["period"];
  viewingOther: boolean;
}) {
  const role = [employee.designation, employee.department].filter(Boolean).join(" · ");

  return (
    <header
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5 rounded-2xl border border-hairline-strong bg-surface-card px-6 py-5 max-md:px-4 max-md:py-4"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <EmployeeAvatar name={employee.name} size="lg" />
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            {viewingOther ? "Team Productivity · Viewing" : "Team Productivity"}
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
        <Link
          href={`/productivity/report?emp=${employee.id}` as Route}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft"
        >
          <FileText size={14} strokeWidth={2.4} /> View Full Report
        </Link>
        <a
          href={`/api/productivity/report/${employee.id}/pdf`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          <Download size={14} strokeWidth={2.4} /> Download
        </a>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Section + card primitives                                           */
/* ------------------------------------------------------------------ */

const CARD_SHADOW = "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 28px -22px rgba(15, 23, 42, 0.35)";

/**
 * A section heading you can find without reading — display-sized, left-aligned,
 * with an accent icon chip and a rule that fades from the accent into the page.
 * The rule doubles as the separator between the heading and its cards, so no
 * section needs a border of its own.
 */
function Section({
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
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: theme.tint, color: theme.ink }}
        >
          <Icon size={17} strokeWidth={2.5} />
        </span>
        <h2
          className="uppercase text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(17px, 1.6vw, 22px)",
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}
        >
          {title}
        </h2>
        <span
          aria-hidden
          className="h-px flex-1"
          style={{
            background: `linear-gradient(90deg, ${theme.accent}55, var(--color-hairline-strong) 38%, transparent)`,
          }}
        />
      </div>
      {children}
    </section>
  );
}

/** Equal-height card rows. `auto-rows-fr` is what makes the heights match — the
 *  cards themselves stretch rather than being pinned to a guessed pixel value. */
function Grid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  const responsive =
    cols === 4
      ? "grid-cols-4 max-lg:grid-cols-2 max-[380px]:grid-cols-1"
      : cols === 3
        ? "grid-cols-3 max-md:grid-cols-1"
        : "grid-cols-2 max-md:grid-cols-1";
  return <div className={`grid auto-rows-fr gap-4 max-md:gap-3 ${responsive}`}>{children}</div>;
}

/**
 * The one card shape. Everything inside is centred and nothing may opt out —
 * that is enforced here, not asked of each call site.
 */
function Card({
  theme,
  title,
  children,
}: {
  theme: SectionTheme;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex h-full min-h-[164px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card px-5 py-7 text-center max-md:min-h-[136px] max-md:py-6"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: theme.accent }} />
      {/* `ink-soft`, not `ink-subtle`: the old dashboard set labels in the same
          grey as its supporting text, so nothing on a card had a clear rank. */}
      <div className="text-[11px] font-bold uppercase leading-tight tracking-[0.13em] text-ink-soft">
        {title}
      </div>
      {children}
    </div>
  );
}

/** The card's hero value. Dark by default; a colour is passed only where the
 *  number itself carries a judgement. */
function Hero({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      // Not `leading-none`: a long money figure on a narrow card wraps, and
      // zero leading would let the two lines touch.
      className="mt-3 max-w-full break-words font-black leading-[1.04] tabular-nums"
      style={{
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontSize: "clamp(28px, 3vw, 40px)",
        letterSpacing: "-0.02em",
        color: color ?? "var(--color-ink-strong)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Grades are the answer the card exists to give, so they stay the largest mark
 * on it — now as the shared `GradeBadge` rather than a bare coloured letter.
 *
 * The badge is what makes the grade colour survive contrast: a 58px letter in
 * #EAB308 on a white card is unreadable, while the same hex as the chip BEHIND
 * a dark letter keeps the exact palette colour and reads cleanly. The chip is
 * sized to the letter, so this is still an accent and not a coloured panel.
 */
function GradeHero({ grade }: { grade: Grade | null }) {
  return <GradeBadge grade={grade} size="lg" className="mt-2.5" />;
}

/** A task count. Zero is the good outcome, so it stays neutral-dark instead of
 *  wearing the bucket's alarm colour. */
function CountHero({ value, color }: { value: number; color: string }) {
  return <Hero color={value > 0 ? color : undefined}>{value}</Hero>;
}

/** "4 / 6 hrs" — the unit rides along at a smaller size so the hours stay hero. */
function HoursHero({ hours, target }: { hours: number; target: number }) {
  return (
    <Hero color={TRAINING.ink}>
      {formatHours(hours)} / {target}
      <span className="ml-1.5 text-[0.42em] font-extrabold uppercase tracking-[0.08em] text-ink-subtle">
        hrs
      </span>
    </Hero>
  );
}

/** Supporting context — small, muted, and never competing with the hero. */
function Sub({ children }: { children: React.ReactNode }) {
  return <div className="mt-2.5 text-[12.5px] font-medium text-ink-subtle">{children}</div>;
}
