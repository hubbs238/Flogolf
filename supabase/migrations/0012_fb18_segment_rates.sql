-- ============================================================
--  A dollar rate per FB18 segment
--
--  Front nine, back nine, and the eighteen can each be worth something
--  different. Null on any of them falls back to fb18_dollars_per_unit, which
--  itself falls back to the round's main rate, so nothing existing changes
--  and there is nothing to backfill.
--
--  Safe to run more than once.
-- ============================================================

alter table public.matches
  add column if not exists fb18_front_dollars_per_unit numeric
    check (fb18_front_dollars_per_unit is null or fb18_front_dollars_per_unit >= 0),
  add column if not exists fb18_back_dollars_per_unit numeric
    check (fb18_back_dollars_per_unit is null or fb18_back_dollars_per_unit >= 0),
  add column if not exists fb18_total_dollars_per_unit numeric
    check (fb18_total_dollars_per_unit is null or fb18_total_dollars_per_unit >= 0);

select
  count(*) as rounds,
  count(fb18_front_dollars_per_unit) as with_front_override,
  count(fb18_back_dollars_per_unit)  as with_back_override,
  count(fb18_total_dollars_per_unit) as with_total_override
from public.matches;
