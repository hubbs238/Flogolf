-- ============================================================
--  A separate dollar rate for the FB18 side game
--
--  Null means "use the round's main rate", so existing rounds keep behaving
--  exactly as they do now with nothing to backfill. Set it to 1 and the FB18
--  payout numbers become dollars directly.
--
--  Safe to run more than once.
-- ============================================================

alter table public.matches
  add column if not exists fb18_dollars_per_unit numeric
  check (fb18_dollars_per_unit is null or fb18_dollars_per_unit >= 0);

select
  count(*) filter (where fb18_dollars_per_unit is null) as rounds_using_main_rate,
  count(*) as total_rounds
from public.matches;
