/**
 * PROVE the Incentive Dashboard against the live database, changing nothing.
 *
 * The unit tests prove the calculation rules on fixtures. This proves the
 * database half: that real viewers get the scope they should, that the numbers
 * the dashboard shows equal what raw SQL over the same tables says, and that no
 * inactive employee leaks in. Read-only — it never writes.
 *
 * Usage:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/verify-incentive-analytics.ts
 * (`react-server` lets the `server-only` guard in the loader resolve outside Next.)
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { loadIncentiveAnalytics } from "@/lib/queries/incentive-analytics";
import { incentiveAnalyticsScopeFor } from "@/lib/incentive/analytics/scope";
import { resolvePeriod, type PeriodSelection } from "@/lib/incentive/analytics/periods";
import type { IncentiveAnalytics } from "@/lib/incentive/analytics/model";

let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
}

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Row[];

const EXCLUDED = ["manan vasa", "dattaram kap", "parvez khan"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  const viewers = await rows(sql`
    select e.id, e.name, e.email, e.is_admin,
           (select count(*)::int from employees r where r.manager_id = e.id and r.is_active) as reports
      from employees e
     where e.is_active and e.employment_status = 'active' and e.account_type = 'employee'
     order by e.name`);
  const eligible = viewers.filter((v) => !EXCLUDED.includes(String(v.name).trim().toLowerCase()));
  const admin = viewers.find((v) => v.is_admin === true);
  const manager = eligible.find((v) => v.is_admin !== true && Number(v.reports) > 0 && !String(v.email).includes("manan"));
  const loner = eligible.find((v) => v.is_admin !== true && Number(v.reports) === 0 && !String(v.email).includes("manan"));
  console.log(`viewers: admin=${admin?.name ?? "—"}, manager=${manager?.name ?? "—"} (${manager?.reports ?? 0} reports), no-reports=${loner?.name ?? "—"}`);

  const inactive = new Set(
    (await rows(sql`select lower(trim(name)) k from employees where not (is_active and employment_status = 'active' and account_type = 'employee')`)).map((r) => String(r.k)),
  );

  const periods: PeriodSelection[] = [
    { kind: "current_month" },
    { kind: "month", month: "2026-05" },
    { kind: "month", month: "2026-04" },
    { kind: "last_3" },
    { kind: "last_6" },
    { kind: "ytd" },
  ];

  const asViewer = (v: Row) => ({ id: String(v.id), name: String(v.name), email: String(v.email), isAdmin: v.is_admin === true });

  // ── Company-wide viewer: numbers equal raw SQL ──
  if (admin) {
    const me = asViewer(admin);
    const scope = await incentiveAnalyticsScopeFor(me);
    check("admin: company-wide scope", scope.all);
    for (const sel of periods) {
      const t0 = Date.now();
      const a = (await loadIncentiveAnalytics(me, sel, { scope })) as IncentiveAnalytics;
      const ms = Date.now() - t0;
      const p = resolvePeriod(sel)!;
      const tag = `admin ${sel.kind}${sel.month ? ` ${sel.month}` : ""} (${p.label}, ${ms}ms)`;

      check(`${tag}: one row per eligible employee`, a.employees.length === eligible.length, `${a.employees.length} vs ${eligible.length}`);
      check(`${tag}: no inactive or excluded employee appears`, !a.employees.some((e) => inactive.has(e.name.trim().toLowerCase()) || EXCLUDED.includes(e.name.trim().toLowerCase())));
      check(`${tag}: nothing non-finite`, !/NaN|Infinity/.test(JSON.stringify(a)));

      // Earned and Paid / Unpaid, resolved in SQL by the SAME rule the model uses:
      // a linked employee_id first (current → credited; left/excluded → dropped),
      // else the name with its trailing "( … )" annotation removed.
      const resolved = sql`
        with legs as (
          select employee_id eid, emp_name nm, approved_amt::numeric a, paid_amt::numeric pd, period_month from incentive_entries
          union all select supervisor_id, supervisor_name, emp_approved_amt::numeric, emp_paid_amt::numeric, period_month from incentive_projects where supervisor_name is not null
          union all select intern_id, intern_name, intern_approved_amt::numeric, intern_paid_amt::numeric, period_month from incentive_projects where intern_name is not null
        ),
        cur as (
          select id, lower(trim(name)) k from employees
           where is_active and employment_status = 'active' and account_type = 'employee'
             and lower(trim(name)) not in ('manan vasa','dattaram kap','parvez khan')
        ),
        noncur as (select id, lower(trim(name)) k from employees e where not exists (select 1 from cur c where c.id = e.id)),
        l2 as (
          select l.*, lower(trim(regexp_replace(l.nm, '\\s*\\([^()]*\\)\\s*$', ''))) lk from legs l
           where l.period_month >= ${p.start}::date and l.period_month < ${p.endExclusive}::date
             and trim(l.nm) not in ('Manan Vasa','Dattaram Kap','Parvez Khan')
             and lower(trim(l.nm)) <> 'none'
        ),
        r as (
          select l2.a, l2.pd,
            case
              when l2.eid is not null and exists (select 1 from cur c where c.id = l2.eid) then l2.eid
              when l2.eid is not null and exists (select 1 from noncur n where n.id = l2.eid) then null
              else (select c.id from cur c where c.k = l2.lk limit 1)
            end emp,
            case
              when l2.eid is not null and exists (select 1 from cur c where c.id = l2.eid) then false
              when l2.eid is not null and exists (select 1 from noncur n where n.id = l2.eid) then true
              when l2.lk = '' or l2.lk = 'none' then true
              when exists (select 1 from cur c where c.k = l2.lk) then false
              when exists (select 1 from noncur n where n.k = l2.lk) or l2.lk in ('manan vasa','dattaram kap','parvez khan') then true
              else false
            end dropped
          from l2
        )`;

      const sqlEarned = await rows(sql`${resolved} select emp::text, sum(a)::float8 earned from r where not dropped and emp is not null group by emp`);
      const expected = new Map(sqlEarned.map((r) => [String(r.emp), round2(Number(r.earned))]));
      const mismatches = a.employees.filter((e) => round2(expected.get(e.employeeId) ?? 0) !== e.earned);
      check(`${tag}: every person's earned equals SQL`, mismatches.length === 0, mismatches.map((m) => `${m.name} ${m.earned}≠${expected.get(m.employeeId) ?? 0}`).join("; "));

      const [pu] = await rows(sql`${resolved}
        select count(*) filter (where pd > 0)::int paid_n, coalesce(sum(pd) filter (where pd > 0), 0)::float8 paid_amt,
               count(*) filter (where a - pd > 0)::int unpaid_n, coalesce(sum(a - pd) filter (where a - pd > 0), 0)::float8 unpaid_amt
          from r where not dropped`);
      const paid = a.statuses.find((s) => s.key === "paid")!;
      const unpaid = a.statuses.find((s) => s.key === "unpaid")!;
      check(
        `${tag}: Paid / Unpaid equal SQL`,
        paid.count === Number(pu!.paid_n) && paid.amount === round2(Number(pu!.paid_amt)) &&
          unpaid.count === Number(pu!.unpaid_n) && unpaid.amount === round2(Number(pu!.unpaid_amt)),
        `paid ${paid.count}/${paid.amount} vs ${pu!.paid_n}/${pu!.paid_amt}; unpaid ${unpaid.count}/${unpaid.amount} vs ${pu!.unpaid_n}/${pu!.unpaid_amt}`,
      );
      if (sel.kind === "ytd") {
        const mishtie = a.employees.find((e) => e.name === "Mishtie Kanani");
        if (mishtie) console.log(`       YTD Mishtie Kanani: earned ${mishtie.earned}, ${mishtie.pctOfCtc}% of CTC, grade ${mishtie.grade}, rank ${mishtie.rank}`);
        check(`${tag}: no annotated "( Intern … )" name is left for a person who exists`, !a.records.some((r) => r.employeeLabel.includes("Mishtie Kanani (")));
      }

      // Each status card's count is its records.
      check(`${tag}: card counts equal their records`, a.statuses.every((s) => a.records.filter((r) => r.statuses.includes(s.key)).length === s.count));

      // Decided requests in period.
      const [rq] = await rows(sql`
        select count(*)::int n from incentive_requests r join employees e on e.id = r.employee_id
         where r.status in ('approved','rejected','due','not_due')
           and e.is_active and e.employment_status = 'active' and e.account_type = 'employee'
           and coalesce(nullif(r.details->>'incentive_date',''), to_char(r.created_at at time zone 'Asia/Kolkata','YYYY-MM-DD')) >= ${p.start}
           and coalesce(nullif(r.details->>'incentive_date',''), to_char(r.created_at at time zone 'Asia/Kolkata','YYYY-MM-DD')) < ${p.endExclusive}`);
      const reqCount = a.statuses.filter((s) => ["approved", "not_approved", "due", "not_due"].includes(s.key)).reduce((n, s) => n + s.count, 0);
      check(`${tag}: request cards count every decided request in the period`, reqCount === Number(rq!.n), `${reqCount} vs ${rq!.n}`);

      check(`${tag}: loads in under 5s`, ms < 5000, `${ms}ms`);
    }
  }

  // ── A manager: self + downline only, CTC of others withheld ──
  if (manager) {
    const me = asViewer(manager);
    const downline = (await rows(sql`
      with recursive d as (
        select id from employees where manager_id = ${me.id} and is_active
        union select e.id from employees e join d on e.manager_id = d.id where e.is_active
      ) select id from d`)).map((r) => String(r.id));
    const allowed = new Set([me.id, ...downline]);
    const scope = await incentiveAnalyticsScopeFor(me);
    check("manager: scoped, not company-wide", !scope.all);
    check("manager: scope is exactly self + downline", scope.employeeIds.size === allowed.size && [...allowed].every((id) => scope.employeeIds.has(id)), `${scope.employeeIds.size} vs ${allowed.size}`);
    for (const sel of periods) {
      const a = (await loadIncentiveAnalytics(me, sel))!;
      const tag = `manager ${sel.kind}${sel.month ? ` ${sel.month}` : ""}`;
      check(`${tag}: only self and downline rows`, a.employees.every((e) => allowed.has(e.employeeId)), a.employees.map((e) => e.name).join(", "));
      check(`${tag}: others' CTC withheld`, a.employees.every((e) => e.isSelf || e.ctc === null));
      const allowedNames = new Set(a.employees.map((e) => e.name));
      check(
        `${tag}: records name only people in scope`,
        a.records.every((r) => r.employeeLabel.split(" · ").every((part) => [...allowedNames].some((n) => part.startsWith(n)))),
      );
      check(`${tag}: company-wide viewer flag is off`, a.scope.all === false);
    }
  } else {
    console.log("SKIP  no non-admin manager with active reports in this database");
  }

  // ── An employee with no reports: themselves only ──
  if (loner) {
    const me = asViewer(loner);
    for (const sel of periods) {
      const a = (await loadIncentiveAnalytics(me, sel))!;
      const tag = `no-reports ${sel.kind}${sel.month ? ` ${sel.month}` : ""}`;
      check(`${tag}: exactly one row, their own`, a.employees.length === 1 && a.employees[0]!.employeeId === me.id);
      check(`${tag}: records are only their own`, a.records.every((r) => r.employeeLabel.startsWith(me.name)));
      check(`${tag}: rank is company-wide`, a.me?.rank === null || (a.me!.rank! >= 1 && a.me!.rank! <= a.rankedCount));
      if (sel.kind === "current_month") {
        console.log(`       target warning for ${me.name}: ${JSON.stringify(a.targetWarning)}`);
      }
    }
  }

  // ── An id that is nobody: sees nothing but an empty self ──
  const ghost = { id: "00000000-0000-4000-8000-000000000000", name: "Nobody", email: "nobody@example.com", isAdmin: false };
  const g = (await loadIncentiveAnalytics(ghost, { kind: "ytd" }))!;
  check("unknown viewer: no employees, no records, no warning", g.employees.length === 0 && g.records.length === 0 && g.targetWarning === null && g.me === null);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
