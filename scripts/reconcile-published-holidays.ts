import postgres from "postgres";
import { HOLIDAY_YEARS, holidaysForYear } from "../lib/hr/holidays-2026";

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is required");

const desired = HOLIDAY_YEARS.flatMap((year) =>
  holidaysForYear(year).map((holiday) => ({
    holiday_date: `${year}-${String(holiday.month).padStart(2, "0")}-${String(holiday.dayNum).padStart(2, "0")}`,
    label: holiday.name,
  })),
);

const sql = postgres(url, { max: 1 });

async function main() {
try {
  const result = await sql.begin(async (tx) => {
    await tx`create temporary table desired_published_holidays (
      holiday_date date primary key,
      label text not null
    ) on commit drop`;

    await tx`
      insert into desired_published_holidays ${tx(desired, "holiday_date", "label")}
    `;

    const obsoleteAdmin = await tx`
      select holiday_date::text, label, is_active
      from holidays
      where holiday_date between '2026-01-01' and '2031-12-31'
        and not exists (
          select 1 from desired_published_holidays d
          where d.holiday_date = holidays.holiday_date
        )
      order by holiday_date
    `;

    const obsoleteEvents = await tx`
      select id, holiday_date::text, name, is_office_closed
      from event_holidays
      where holiday_date between '2026-01-01' and '2031-12-31'
        and is_office_closed = true
        and not exists (
          select 1 from desired_published_holidays d
          where d.holiday_date = event_holidays.holiday_date
        )
      order by holiday_date, name
    `;

    if (apply) {
      await tx`
        update holidays h
        set is_active = false, updated_at = now()
        where h.holiday_date between '2026-01-01' and '2031-12-31'
          and not exists (
            select 1 from desired_published_holidays d
            where d.holiday_date = h.holiday_date
          )
      `;

      await tx`
        insert into holidays (holiday_date, label, is_active)
        select holiday_date, label, true from desired_published_holidays
        on conflict (holiday_date) do update
        set label = excluded.label, is_active = true, updated_at = now()
      `;

      await tx`
        update event_holidays e
        set is_office_closed = false, updated_at = now()
        where e.holiday_date between '2026-01-01' and '2031-12-31'
          and e.is_office_closed = true
          and not exists (
            select 1 from desired_published_holidays d
            where d.holiday_date = e.holiday_date
          )
      `;
    }

    const activeCount = await tx`
      select count(*)::int as count
      from holidays
      where holiday_date between '2026-01-01' and '2031-12-31'
        and is_active = true
    `;

    if (!apply) throw { dryRun: true, obsoleteAdmin, obsoleteEvents, desiredCount: desired.length, activeCount: activeCount[0]?.count };
    return { obsoleteAdmin, obsoleteEvents, desiredCount: desired.length, activeCount: activeCount[0]?.count };
  });
  console.log(JSON.stringify({ mode: "applied", ...result }, null, 2));
} catch (error) {
  if (typeof error === "object" && error && "dryRun" in error) {
    console.log(JSON.stringify({ mode: "dry-run", ...error }, null, 2));
  } else {
    throw error;
  }
} finally {
  await sql.end();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
