-- CTC versions are approved in Admin > Approvals, but never become Accounts
-- payments. This only widens the existing audit table's source-kind constraint.

ALTER TABLE IF EXISTS "compensation_approvals"
  DROP CONSTRAINT IF EXISTS "compensation_approvals_kind_check";

ALTER TABLE IF EXISTS "compensation_approvals"
  ADD CONSTRAINT "compensation_approvals_kind_check"
  CHECK ("kind" IN ('attendance', 'incentive', 'reimbursement', 'salary', 'ctc'));
