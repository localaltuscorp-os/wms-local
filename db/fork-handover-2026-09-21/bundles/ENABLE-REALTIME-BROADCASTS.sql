-- ===========================================================================
--  LET BROADCASTS PUSH INSTEAD OF BEING POLLED
--
--  One statement. Adds the `broadcasts` table to Supabase's realtime
--  publication, so a published broadcast is pushed to every open tab over the
--  websocket the browser already holds, instead of every tab asking for one
--  every four seconds.
--
--  WHAT IT CHANGES ON THE BILL. <BroadcastPopup> is mounted on every
--  authenticated page. At 4s that is 900 requests an hour PER OPEN TAB, and
--  each one costs a session verification (crypto — billed CPU, not the cheap
--  I/O wait) plus three queries. With push carrying the news the poll drops to
--  60s: 60 requests an hour. That is the Fluid Active CPU alert.
--
--  AND IT IS FASTER, not a trade. Push arrives when the row is written;
--  polling arrives up to a full interval later. Delivery goes from
--  "within ~4 seconds" to "immediately".
--
--  SAFE TO SKIP, AND SAFE TO DELAY. The client's poll rate is ADAPTIVE: it
--  runs at 4s until the realtime channel reports SUBSCRIBED and only then
--  slows to 60s. So until this runs, the popup behaves exactly as it always
--  did. There is no window in which it is slower than before.
--
--  Safe to re-run — the DO block checks first, because
--  `alter publication ... add table` errors if the table is already in it.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'broadcasts'
  ) then
    alter publication supabase_realtime add table broadcasts;
    raise notice 'broadcasts added to supabase_realtime';
  else
    raise notice 'broadcasts already in supabase_realtime - nothing to do';
  end if;
end
$$;


-- ── CONFIRM (run on its own; the editor shows only the last result set) ────
-- Expect one row. `tasks` is listed too — it is what the Live indicator in the
-- header already uses, and is the proof this mechanism works here.
--
-- select tablename
--   from pg_publication_tables
--  where pubname = 'supabase_realtime' and schemaname = 'public'
--  order by tablename;


-- ── WHAT IS AND IS NOT SENT ───────────────────────────────────────────────
-- The client subscribes to `broadcasts` only, never `broadcast_recipients`.
-- Publishing writes ONE broadcast row and one recipient row PER PERSON, so
-- subscribing to the recipients table would wake every tab in the company once
-- for every colleague as well as once for itself.
--
-- The push is only a NUDGE. The browser learns "a broadcast row changed" and
-- then calls /api/broadcasts/popup exactly once, which is where all the
-- per-person logic still lives — who the recipient is, whether they snoozed
-- it, whether it is lock-mode. No broadcast content travels over the realtime
-- channel and none of the filtering moves to the client.
