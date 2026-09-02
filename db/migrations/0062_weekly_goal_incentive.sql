-- Weekly Goals incentive amount (Manan 2026-06). When a goal's incentive flag
-- is Yes, an admin can attach a ₹ amount; that becomes a pending entry in the
-- Incentive ledger (source='weekly_goal', linked by source_ref=goal id).
alter table weekly_goals add column if not exists incentive_amount integer not null default 0;
