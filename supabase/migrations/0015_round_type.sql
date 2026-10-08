-- ============================================================
--  Season rounds and majors
--
--  Two separate choices that used to be one.
--
--  round_type says what the points are worth: a major pays double. set_holes
--  says how the eighteen are carved up, six threes or three sixes. Either
--  shape is available to either kind of round, so a regular season round can
--  be played over six-hole sets without becoming a major.
--
--  Carryover on a tie behaves exactly as it always has; there are simply
--  fewer, longer matches for a tie to roll into.
--
--  It also pays double, but only in points. The money is untouched: a major
--  settles in the same dollars as any other round. A hundred dollars won
--  becomes two hundred FLO Cup points, and every bonus is worth twice its
--  usual value.
--
--  Everything is still computed on read, so flipping a round's type
--  re-segments and re-scores it on the next page load with nothing to
--  backfill. Existing rounds default to 'season', which is what they are.
--
--  Safe to run more than once.
-- ============================================================

alter table public.matches
  add column if not exists round_type text not null default 'season'
  check (round_type in ('season', 'major')),
  add column if not exists set_holes int not null default 3
  check (set_holes in (3, 6));

-- A major is six-hole sets unless someone says otherwise. Only touches rounds
-- still sitting on the default, so a deliberate choice is never overwritten.
update public.matches
set set_holes = 6
where round_type = 'major' and set_holes = 3;

select
  round_type,
  set_holes,
  count(*) as rounds
from public.matches
group by round_type, set_holes
order by round_type, set_holes;
