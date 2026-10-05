import type { PGlite } from "@electric-sql/pglite";

type FixtureEmployees = {
  primary: string;
  secondary: string;
  tertiary: string;
  extendedName: string;
  admin: string;
};

type FixtureEmployee = keyof Pick<FixtureEmployees, "primary" | "secondary" | "tertiary" | "extendedName">;

const DISPLAY_NAMES: Record<FixtureEmployee, string> = {
  primary: "Test Employee One",
  secondary: "Test Employee Two",
  tertiary: "Test Employee Three",
  extendedName: "Test Employee With Extended Name",
};

function monthStart(offset: number): string {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function dayOfMonth(month: string, day: number): string {
  return `${month.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/**
 * A deliberately varied, local-only compensation fixture. It is never loaded
 * by the web app and runs only through `pnpm dummy:setup`, which uses PGlite.
 * The fixed IDs make `pnpm dummy:reset` reproducible while normal setup runs
 * preserve any decision edits made during a test.
 */
export async function seedDummyCompensationFixtures(pg: PGlite, people: FixtureEmployees): Promise<Record<string, number>> {
  const attendance = [
    ["00000000-0000-4000-8200-000000000001", "primary", monthStart(0), "20.00", "pending", null],
    ["00000000-0000-4000-8200-000000000002", "secondary", monthStart(-1), "21.00", "approved", "Attendance checked"],
    ["00000000-0000-4000-8200-000000000003", "tertiary", monthStart(-2), "19.50", "rejected", "Missing daily status needs review"],
    ["00000000-0000-4000-8200-000000000004", "extendedName", monthStart(-3), "22.00", "paid", "Historical test record"],
  ] as const;

  for (const [id, employeeKey, month, worked, status, note] of attendance) {
    const employee = employeeKey as FixtureEmployee;
    await pg.query(
      `insert into attendance_sheet_month
         (id, month, employee_name, employee_id, present, weekly_off, days_in_month, total_days_worked, remark)
       values ($1,$2,$3,$4,$5,4,30,$5,'Dummy approval fixture')
       on conflict do nothing`,
      [id, month, DISPLAY_NAMES[employee], people[employee], worked],
    );
    const dailyEntries = Array.from({ length: 30 }, (_, index) => {
      const day = index + 1;
      const date = dayOfMonth(month, day);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const code = weekday === 0 || weekday === 6 ? "W/O" : day === 9 ? "A" : day === 15 ? "H" : "P";
      return { day, code };
    });
    for (const { day, code } of dailyEntries) {
      const date = dayOfMonth(month, day);
      await pg.query(
        `insert into attendance_sheet_day (id, employee_name, employee_id, month, day, status_code, date)
         values ($1,$2,$3,$4,$5::smallint,$6,($4::date + (($5::smallint)::integer - 1)))
         on conflict do nothing`,
        [`${id.slice(0, -3)}${id.slice(-1)}${String(day).padStart(2, "0")}`, DISPLAY_NAMES[employee], people[employee], month, day, code],
      );
      if (code === "P") {
        const hours: readonly [string, string] = day === 4 ? ["03:35", "13:20"] : day === 2 ? ["03:30", "12:05"] : ["03:45", "12:00"];
        await pg.query(
          `insert into attendance_logs (id, employee_id, log_date, kind, logged_at, source)
           values ($1,$2,$3,'in',$4::timestamptz,'self'), ($5,$2,$3,'out',$6::timestamptz,'self')
           on conflict do nothing`,
          [
            `${id.slice(0, -4)}a${id.slice(-1)}${String(day).padStart(2, "0")}`,
            people[employee],
            date,
            `${date}T${hours[0]}:00.000Z`,
            `${id.slice(0, -4)}b${id.slice(-1)}${String(day).padStart(2, "0")}`,
            `${date}T${hours[1]}:00.000Z`,
          ],
        );
      }
    }
    if (status !== "pending") {
      await pg.query(
        `insert into compensation_approvals
           (kind, subject_id, employee_id, period_month, status, decision_note, decided_by_id, decided_at, paid_by_id, paid_at)
         values ('attendance',$1,$2,$3,$4,$5,$6,now(),case when $4 = 'paid' then $6::uuid else null end,case when $4 = 'paid' then now() else null end)
         on conflict do nothing`,
        [id, people[employee], month, status, note, people.admin],
      );
    }
  }

  const incentives = [
    ["00000000-0000-4000-8201-000000000001", "primary", "bss_conversion", "pending", "0.00", null],
    ["00000000-0000-4000-8201-000000000002", "secondary", "sales_pitch", "approved", "2500.00", "Approved test incentive"],
    ["00000000-0000-4000-8201-000000000003", "tertiary", "client_happiness", "rejected", "0.00", "Evidence needs improvement"],
    ["00000000-0000-4000-8201-000000000004", "extendedName", "group_intro", "paid", "1800.00", "Paid test incentive"],
  ] as const;

  for (const [id, employeeKey, type, approvalStatus, amount, note] of incentives) {
    const employee = employeeKey as FixtureEmployee;
    const sourceStatus = approvalStatus === "paid" ? "approved" : approvalStatus;
    await pg.query(
      `insert into incentive_requests (id, employee_id, type, status, details, decided_by_id, decided_at, decision_note)
       values ($1,$2,$3,$4,$5::jsonb,case when $4 <> 'pending' then $6::uuid else null end,case when $4 <> 'pending' then now() else null end,$7)
       on conflict do nothing`,
      [id, people[employee], type, sourceStatus, JSON.stringify({ source: "Dummy approval fixture" }), people.admin, note],
    );
    if (approvalStatus !== "pending") {
      await pg.query(
        `insert into compensation_approvals
           (kind, subject_id, employee_id, period_month, payable_amount, paid_amount, status, decision_note, decided_by_id, decided_at, paid_by_id, paid_at)
         values ('incentive',$1,$2,$3,$4::numeric,case when $5 = 'paid' then $4::numeric else 0::numeric end,$5,$6,$7,now(),case when $5 = 'paid' then $7::uuid else null end,case when $5 = 'paid' then now() else null end)
         on conflict do nothing`,
        [id, people[employee], monthStart(-1), amount, approvalStatus, note, people.admin],
      );
    }
  }

  const reimbursements = [
    ["00000000-0000-4000-8202-000000000001", "primary", "pending", "640.00", null],
    ["00000000-0000-4000-8202-000000000002", "secondary", "approved", "1250.00", "Travel receipt verified"],
    ["00000000-0000-4000-8202-000000000003", "tertiary", "rejected", "0.00", "Receipt is incomplete"],
    ["00000000-0000-4000-8202-000000000004", "extendedName", "paid", "980.00", "Paid test reimbursement"],
  ] as const;

  for (const [id, employeeKey, approvalStatus, amount, note] of reimbursements) {
    const employee = employeeKey as FixtureEmployee;
    await pg.query(
      `insert into module_submissions (id, module, employee_id, fields, admin_fields, status)
       values ($1,'reimbursement',$2,$3::jsonb,'{}'::jsonb,'pending')
       on conflict do nothing`,
      [id, people[employee], JSON.stringify({ amount, purpose: "Dummy approval fixture" })],
    );
    if (approvalStatus !== "pending") {
      await pg.query(
        `insert into compensation_approvals
           (kind, subject_id, employee_id, period_month, payable_amount, paid_amount, status, decision_note, decided_by_id, decided_at, paid_by_id, paid_at)
         values ('reimbursement',$1,$2,$3,$4::numeric,case when $5 = 'paid' then $4::numeric else 0::numeric end,$5,$6,$7,now(),case when $5 = 'paid' then $7::uuid else null end,case when $5 = 'paid' then now() else null end)
         on conflict do nothing`,
        [id, people[employee], monthStart(-1), amount, approvalStatus, note, people.admin],
      );
    }
  }

  const salaries = [
    ["00000000-0000-4000-8203-000000000001", "primary", monthStart(0), "32000.00", "pending", null],
    ["00000000-0000-4000-8203-000000000002", "secondary", monthStart(-1), "42000.00", "approved", "Approved payroll test"],
    ["00000000-0000-4000-8203-000000000003", "tertiary", monthStart(-2), "28500.00", "rejected", "Awaiting payroll correction"],
    ["00000000-0000-4000-8203-000000000004", "extendedName", monthStart(-3), "51000.00", "paid", "Paid payroll test"],
  ] as const;

  for (const [id, employeeKey, month, amount, approvalStatus, note] of salaries) {
    const employee = employeeKey as FixtureEmployee;
    await pg.query(
      `insert into salary_breakup (id, month, employee_name, employee_id, present, days_in_month, total_days_worked, final_working_days, monthly_ctc, final_payment, paid, amount_paid)
       values ($1,$2,$3,$4,20,30,24,24,$5::numeric,$5::numeric,$6,case when $6 then $5::numeric else 0::numeric end)
       on conflict do nothing`,
      [id, month, DISPLAY_NAMES[employee], people[employee], amount, approvalStatus === "paid"],
    );
    if (approvalStatus !== "pending") {
      await pg.query(
        `insert into compensation_approvals
           (kind, subject_id, employee_id, period_month, payable_amount, paid_amount, status, decision_note, decided_by_id, decided_at, paid_by_id, paid_at)
         values ('salary',$1,$2,$3,$4::numeric,case when $5 = 'paid' then $4::numeric else 0::numeric end,$5,$6,$7,now(),case when $5 = 'paid' then $7::uuid else null end,case when $5 = 'paid' then now() else null end)
         on conflict do nothing`,
        [id, people[employee], month, amount, approvalStatus, note, people.admin],
      );
    }
  }

  const counts: Record<string, number> = {};
  for (const table of ["attendance_sheet_month", "attendance_sheet_day", "attendance_logs", "incentive_requests", "module_submissions", "salary_breakup", "compensation_approvals"]) {
    const result = await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    counts[table] = result.rows[0]?.n ?? 0;
  }
  return counts;
}
