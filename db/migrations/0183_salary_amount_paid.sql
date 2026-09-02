-- 0183 — Partial salary payments. ADDITIVE + idempotent.
--
-- `paid` (0128) is a boolean: settled or not. It cannot express "₹30,000 of
-- ₹50,000 has gone out", which is what an accounts team actually tracks. This
-- adds the CUMULATIVE rupees paid against a salary_breakup row; the balance is
-- derived (payable − amount_paid, floored at 0) and never stored, so it cannot
-- drift from the amounts it is computed from.
--
-- `paid` STAYS and stays authoritative for "settled". It is what the sheet sync
-- leaves alone, what the payslip email fires on, and what every existing reader
-- already understands. The two are kept in step by the write path: amount_paid
-- reaching the payable sets paid = true, and that edge (and only that edge)
-- sends the slip.

alter table salary_breakup
  add column if not exists amount_paid numeric(14,2) not null default 0;

-- BACKFILL — every row already marked paid is, by definition, paid in full.
-- Without this, existing settled rows would read as "₹0 paid, full balance
-- outstanding" the moment the new columns appear, which would look to the
-- accounts team like the entire month had gone unpaid.
--
-- The amount used is the EFFECTIVE net, mirroring `netAfterWaiveOff` exactly:
-- final_payment + condoned wave-off days at the sheet's per-day rate + the
-- signed payout adjustment. Anything less would leave a settled row showing a
-- residual balance. `nullif(days_in_month, 0)` + coalesce to 30 reproduces the
-- TypeScript fallback for rows whose day count never got imported.
--
-- Guarded by `amount_paid = 0` so re-running this file can never overwrite a
-- real figure someone has since typed in.
update salary_breakup
set amount_paid =
      coalesce(final_payment, 0)
      + case
          when coalesce(waive_off_days, 0) > 0
            then coalesce(waive_off_days, 0)
                 * (coalesce(monthly_ctc, 0) / coalesce(nullif(days_in_month, 0), 30))
          else 0
        end
      + coalesce(payout_adjustment, 0)
where paid = true
  and amount_paid = 0;
