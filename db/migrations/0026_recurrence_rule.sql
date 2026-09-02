-- Manan #20 — richer Google-Calendar-style recurrence. The existing
-- `recurrence` enum column stays as the coarse frequency (none/daily/weekly/
-- monthly/yearly) for backward compat; this adds an optional structured rule
-- (RRULE-lite, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=2026-12-31") capturing
-- weekday selections, monthly mode, and end condition.
alter table tasks add column if not exists recurrence_rule text;
