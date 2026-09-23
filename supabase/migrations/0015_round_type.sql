-- ============================================================
--  Season rounds and majors
--
--  A major plays the same eighteen holes under the same rules, carved into
--  three six-hole matches instead of six three-hole ones. Carryover on a tie
--  behaves exactly as it always has; there are simply fewer, longer matches
--  for a tie to roll into.
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
  check (round_type in ('season', 'major'));

select
  round_type,
  count(*) as rounds
from public.matches
group by round_type
order by round_type;
