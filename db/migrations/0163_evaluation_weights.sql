-- 0163 — Weighted Candidate-Evaluation section scoring.
-- ADDITIVE + idempotent.
--   org_settings.evaluation_weights — a super-admin-set weight (0..100) per
--   Candidate-Evaluation section, keyed by the EVAL_CATEGORIES id
--   (culture, behaviour, communication, technical, workstyle, policy,
--   readiness, personality). The weights must total 100; the app validates
--   that before saving. NULL => the app falls back to EQUAL weights across the
--   eight sections. Shape: { "culture": 13, "behaviour": 12, ... }.

alter table org_settings
  add column if not exists evaluation_weights jsonb;
