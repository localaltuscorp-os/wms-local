-- 0169 — Target Date for MONTHLY cascade goals (additive, idempotent).
-- Only month-period rows ever carry a value; year/quarter roll up from children,
-- weekly goals keep their own weekly_goals.target_date column.
alter table goals add column if not exists target_date date;
