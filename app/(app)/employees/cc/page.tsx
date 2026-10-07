import Link from "next/link";
import type { Route } from "next";
import { CalendarCheck2, ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { localDateString } from "@/lib/format";
import { addDays, mondayOf } from "@/lib/compliance/schedule";
import {
  ccMonthKeys,
  ccDayLabel,
  ccPeriodColumns,
  ccPeriodKind,
  ccTimeframe,
  type CcTimeframe,
} from "@/lib/compliance/cc-timeframes";
import { loadComplianceBoard } from "@/lib/queries/compliance-board";
import { loadCompliancePeriodChecks } from "@/lib/queries/compliance-period-checks";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { ComplianceBoard } from "@/components/compliance/compliance-board";
import { ScopePicker } from "@/components/compliance/compliance-controls";
import { CcTimeframeTabs } from "@/components/compliance/cc-timeframe-tabs";

export const dynamic = "force-dynamic";

type Params = {
  view?: string;
  date?: string;
  year?: string;
  who?: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function EmployeesCcPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = localDateString("Asia/Kolkata");
  const view = ccTimeframe(sp.view);
  const subjects = await listActiveSubjectNames();
  // Daily history is deliberately unreachable: prior-day records lock at
  // midnight. Future days are allowed for planning, as requested.
  const date = YMD.test(sp.date ?? "") && sp.date! >= today ? sp.date! : today;
  const defaultYear = Number(date.slice(0, 4));
  const year =
    /^\d{4}$/.test(sp.year ?? "") &&
    Number(sp.year) >= 2000 &&
    Number(sp.year) <= 2100
      ? Number(sp.year)
      : defaultYear;

  if (view === "consolidated") {
    return (
      <ConsolidatedCc
        me={me}
        today={today}
        who={sp.who}
        date={date}
        year={year}
        subjects={subjects}
      />
    );
  }

  const isShortRange = view === "daily" || view === "weekly";
  const from = view === "daily" ? date : mondayOf(date);
  const to = view === "daily" ? date : addDays(from, 6);
  const board = await loadComplianceBoard(
    isShortRange
      ? { me, kind: "wcc", who: sp.who, today, from, to, personalGroup: "day" }
      : {
          me,
          kind: "mcc",
          who: sp.who,
          today,
          monthKeys: ccMonthKeys(year),
          personalGroup: "month",
        },
  );
  const periodColumns = ccPeriodColumns(view, date, year);
  const periodChecks = await loadCompliancePeriodChecks(
    board.itemIds,
    ccPeriodKind(view),
    periodColumns[0]?.periodYear ?? year,
  );
  const href = (nextDate: string) =>
    `/employees/cc?view=${view}&date=${nextDate}&year=${year}${sp.who ? `&who=${encodeURIComponent(sp.who)}` : ""}` as Route;

  return (
    <PageShell>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-altus-red">
          <CalendarCheck2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">
            Compliance Checklist
          </h1>
          <p className="text-[12.5px] font-medium text-ink-muted">
            Employees · daily to yearly tracking in one checklist.
          </p>
        </div>
        <ScopePicker picker={board.picker} who={board.who} meId={me.id} />
      </header>

      <div className="mb-4 space-y-3">
        <CcTimeframeTabs active={view} date={date} year={year} who={sp.who} />
        {isShortRange && (
          <div className="flex items-center gap-2">
            {date > today ? (
              <Link
                href={href(addDays(date, -1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[12px] font-bold text-ink-soft hover:bg-surface-soft"
              >
                <ChevronLeft size={15} /> Previous day
              </Link>
            ) : (
              <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[12px] font-bold text-ink-subtle opacity-50">
                <ChevronLeft size={15} /> Previous day
              </span>
            )}
            <span className="text-[12.5px] font-bold text-ink-strong">
              {view === "daily" ? ccDayLabel(date) : `${ccDayLabel(from)} to ${ccDayLabel(to)}`}
            </span>
            <Link
              href={href(addDays(date, 1))}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-[12px] font-bold text-ink-soft hover:bg-surface-soft"
            >
              Next day <ChevronRight size={15} />
            </Link>
          </div>
        )}
      </div>

      <ComplianceBoard
        kind={isShortRange ? "wcc" : "mcc"}
        rows={board.rows}
        groups={board.groups}
        multiPerson={board.multiPerson}
        manageable={board.manageable}
        defaultOwnerId={
          board.who === "me" || board.who === "team" ? me.id : board.who
        }
        today={today}
        viewerId={me.id}
        periodColumns={periodColumns}
        periodChecks={periodChecks}
        periodKind={ccPeriodKind(view)}
        subjects={subjects}
      />
    </PageShell>
  );
}

async function ConsolidatedCc({
  me,
  today,
  who,
  date,
  year,
  subjects,
}: {
  me: Awaited<ReturnType<typeof requireUser>>;
  today: string;
  who: string | undefined;
  date: string;
  year: number;
  subjects: readonly string[];
}) {
  const [shortBoard, longBoard] = await Promise.all([
    loadComplianceBoard({
      me,
      kind: "wcc",
      who,
      today,
      from: addDays(today, -6),
      to: today,
      personalGroup: "day",
    }),
    loadComplianceBoard({
      me,
      kind: "mcc",
      who,
      today,
      monthKeys: ccMonthKeys(year),
      personalGroup: "month",
    }),
  ]);
  const sections = [
    {
      label: "Daily",
      board: overdueSubset(shortBoard, (row) => row.schedule === "Daily"),
      kind: "wcc" as const,
    },
    {
      label: "Weekly",
      board: overdueSubset(shortBoard, (row) => row.schedule !== "Daily"),
      kind: "wcc" as const,
    },
    {
      label: "Monthly",
      board: overdueSubset(
        longBoard,
        (row) =>
          row.mcc?.frequency === "monthly" ||
          row.mcc?.frequency === "twice_monthly" ||
          row.mcc?.frequency === "thrice_monthly" ||
          row.mcc?.frequency === "alternate_month",
      ),
      kind: "mcc" as const,
    },
    {
      label: "Quarterly",
      board: overdueSubset(
        longBoard,
        (row) => row.mcc?.frequency === "quarterly",
      ),
      kind: "mcc" as const,
    },
    {
      label: "Half-Yearly",
      board: overdueSubset(
        longBoard,
        (row) => row.mcc?.frequency === "half_yearly",
      ),
      kind: "mcc" as const,
    },
    {
      label: "Yearly",
      board: overdueSubset(
        longBoard,
        (row) => row.mcc?.frequency === "annually",
      ),
      kind: "mcc" as const,
    },
  ];

  return (
    <PageShell>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-altus-red">
          <CalendarCheck2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">
            Consolidated Overdue
          </h1>
          <p className="text-[12.5px] font-medium text-ink-muted">
            Missed records grouped by their daily, weekly, monthly, quarterly,
            6-month and yearly schedules.
          </p>
        </div>
        <ScopePicker
          picker={shortBoard.picker}
          who={shortBoard.who}
          meId={me.id}
        />
      </header>
      <div className="mb-4">
        <CcTimeframeTabs
          active="consolidated"
          date={date}
          year={year}
          who={who}
        />
      </div>
      <div className="space-y-8">
        {sections.map(({ label, board, kind }) => (
          <section key={label}>
            <h2 className="mb-3 text-[15px] font-black text-ink-strong">
              {label}
            </h2>
            <ComplianceBoard
              kind={kind}
              rows={board.rows}
              groups={board.groups}
              multiPerson={board.multiPerson}
              manageable={board.manageable}
              defaultOwnerId={
                board.who === "me" || board.who === "team" ? me.id : board.who
              }
              today={today}
              viewerId={me.id}
              initialStatuses={["lapsed"]}
              subjects={subjects}
            />
          </section>
        ))}
      </div>
    </PageShell>
  );
}

/** Retain each board's grouping, while limiting the Consolidated section to one cadence. */
function overdueSubset<
  T extends Awaited<ReturnType<typeof loadComplianceBoard>>,
>(board: T, include: (row: T["rows"][number]) => boolean): T {
  const rows = board.rows.filter(include);
  const visible = new Set(rows.map((row) => row.key));
  return {
    ...board,
    rows,
    groups: board.groups
      .map((group) => ({
        ...group,
        rowKeys: group.rowKeys.filter((key) => visible.has(key)),
      }))
      .filter((group) => group.rowKeys.length > 0),
  } as T;
}
