-- 0226 — the Job Description rank ladder becomes the account holder's 26.
--
-- Replaces the fourteen seeded by 0222. Twelve ranks are new, the orders of the
-- ones that stay are renumbered, and ONE old rank — DGM — has no equivalent in
-- the new list.
--
-- `rank_order` IS BEHAVIOUR: the vacancy resolver climbs it, so a job
-- description on an empty seat goes to the next filled rung above. Renumbering
-- therefore reroutes live work, which is why this is a migration with a report
-- at the end rather than a seed script.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

-- Orders are rewritten in two passes. Doing it in one would collide with the
-- unique index on rank_order the moment a new number lands on a row that has
-- not moved yet — 'Executive' going from 30 to 40 while 40 is still 'Sr.
-- Executive'. Parking every existing rank in a range nothing else uses makes
-- the second pass unconditional.
update jd_ranks set rank_order = rank_order + 10000 where rank_order < 10000;

insert into jd_ranks (name, rank_order, band, is_active) values
  ('Intern - First Year',         10,  'Trainee',            true),
  ('Intern - Second Year',        20,  'Trainee',            true),
  ('Intern - Third Year',         30,  'Trainee',            true),
  ('Executive',                   40,  'Individual',         true),
  ('Sr. Executive',               50,  'Individual',         true),
  ('Consultant',                  60,  'Individual',         true),
  ('Sr. Consultant',              70,  'Individual',         true),
  ('Assistant Manager',           80,  'Management',         true),
  ('Deputy Manager',              90,  'Management',         true),
  ('Manager',                     100, 'Management',         true),
  ('Associate Vice President',    110, 'Leadership',         true),
  ('Deputy Vice President',       120, 'Leadership',         true),
  ('Vice President',              130, 'Leadership',         true),
  ('Senior Vice President',       140, 'Leadership',         true),
  ('President',                   150, 'Leadership',         true),
  ('Sr President',                160, 'Leadership',         true),
  ('Assistant General Manager',   170, 'General Management', true),
  ('General Manager',             180, 'General Management', true),
  ('Sr. General Manager',         190, 'General Management', true),
  ('Associate Director',          200, 'Director',           true),
  ('Deputy Director',             210, 'Director',           true),
  ('Director',                    220, 'Director',           true),
  ('Senior Director',             230, 'Director',           true),
  ('CEO',                         240, 'Board',              true),
  ('Managing Director',           250, 'Board',              true),
  ('Chairman',                    260, 'Board',              true)
on conflict (name) do update
  set rank_order = excluded.rank_order,
      band       = excluded.band,
      is_active  = true,
      updated_at = now();

-- The four renamed intern rungs. Their old names were parked above, so the seats
-- pointing at them move across intact rather than being orphaned.
update jd_ranks r set is_active = false
 where r.rank_order >= 10000
   and r.name in ('Intern (2nd Yr)', 'Intern (3rd Yr)');

-- DGM IS LEFT ALONE, DELIBERATELY. It has no equivalent in the new list, and
-- guessing between Deputy Director and General Manager would reroute whatever
-- work sits on those seats. It stays active, parked above the ladder, and the
-- notice below asks a human to decide.
do $$
declare
  stranded int;
begin
  select count(*) into stranded
    from jd_positions p
    join jd_ranks r on r.id = p.rank_id
   where r.rank_order >= 10000 and r.is_active;

  if stranded > 0 then
    raise notice 'Migration 0226: % position(s) still sit on a rank outside the new ladder (DGM or similar). Re-point them by hand — they will escalate above every new rank until you do.', stranded;
  end if;
end $$;
