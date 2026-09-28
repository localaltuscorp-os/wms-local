-- ════════════════════════════════════════════════════════════════════════════
-- 16 — Training & Learning (LMS) — verify. Run AFTER 15-apply-training-learning.sql.
-- Every query returns 0 rows on a correctly-applied database.
-- ════════════════════════════════════════════════════════════════════════════

-- tc_sessions new columns
SELECT 'tc_sessions.function_id missing' AS check
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='tc_sessions' AND column_name='function_id')
UNION ALL SELECT 'tc_sessions.training_type missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_sessions' AND column_name='training_type')
UNION ALL SELECT 'tc_sessions.audience_scope missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_sessions' AND column_name='audience_scope')
UNION ALL SELECT 'tc_sessions.recurrence_rule missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_sessions' AND column_name='recurrence_rule')
UNION ALL SELECT 'tc_sessions.recurrence_parent_id missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_sessions' AND column_name='recurrence_parent_id')
UNION ALL SELECT 'tc_sessions.recurrence_occurrence_date missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_sessions' AND column_name='recurrence_occurrence_date');

-- tc_session_attendees new columns
SELECT 'tc_session_attendees.required missing' AS check
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_session_attendees' AND column_name='required')
UNION ALL SELECT 'tc_session_attendees.join_time missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_session_attendees' AND column_name='join_time');

-- tc_watch_progress new columns
SELECT 'tc_watch_progress.video_duration_sec missing' AS check
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_watch_progress' AND column_name='video_duration_sec')
UNION ALL SELECT 'tc_watch_progress.watched_sec missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_watch_progress' AND column_name='watched_sec')
UNION ALL SELECT 'tc_watch_progress.last_position_sec missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_watch_progress' AND column_name='last_position_sec');

-- tc_self_learning new columns
SELECT 'tc_self_learning.start_time missing' AS check
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_self_learning' AND column_name='start_time')
UNION ALL SELECT 'tc_self_learning.end_time missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_self_learning' AND column_name='end_time')
UNION ALL SELECT 'tc_self_learning.function_id missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_self_learning' AND column_name='function_id');

-- new tables
SELECT 'tc_training_surveys missing' AS check WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tc_training_surveys')
UNION ALL SELECT 'tc_survey_questions missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tc_survey_questions')
UNION ALL SELECT 'tc_survey_responses missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tc_survey_responses')
UNION ALL SELECT 'tc_learning_targets missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tc_learning_targets')
UNION ALL SELECT 'tc_share_schedule missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tc_share_schedule')
UNION ALL SELECT 'tc_share_attendees missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tc_share_attendees');

-- 0249 — share → self-learning link
SELECT 'tc_shares.self_learning_id missing' AS check
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_shares' AND column_name='self_learning_id')
UNION ALL SELECT 'tc_share_schedule.self_learning_id missing' WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tc_share_schedule' AND column_name='self_learning_id');

-- 0250 — writable master data
SELECT 'tc_lookups missing' AS check WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tc_lookups')
UNION ALL SELECT 'tc_lookups not seeded' WHERE (SELECT count(*) FROM tc_lookups) < 26;

-- Expected: 26 rows — training_type 7, audience_scope 6, share_slot 2, self_learning_source 11.
SELECT kind, count(*)::int AS options FROM tc_lookups GROUP BY kind ORDER BY kind;

-- A clean run prints nothing (or one empty result set). Any row is a defect.
