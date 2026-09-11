-- ============================================================
--  Per round dues
--
--  A flat charge every player on the card pays to play the round, deducted
--  from what they collect at settlement. Unlike a payout it never moves
--  between players: it leaves the group entirely, so a round carrying dues no
--  longer nets to zero. That is expected, not a leak.
--
--  Dues are money only. They never reach FLO Cup points, which come from the
--  main game alone, so backfilling an old round changes settlement and leaves
--  the standings untouched.
--
--  Defaults to 0 so a new round never charges anyone until an admin sets it
--  in Stakes and payouts.
--
--  The backfill puts $35 on the three most recently finished rounds, the
--  league's current arrangement. Only finished rounds count as past ones, so a
--  round still being set up or still being played is left alone and an admin
--  sets its dues in Stakes and payouts. The select at the bottom prints every
--  round with its dues, so it is easy to see what was charged and change any
--  of it from the admin screen.
--
--  The backfill runs only in the same execution that creates the column, so it
--  happens exactly once whatever anyone does to the figures afterwards. A
--  second run finds the column already there and changes nothing, even if an
--  admin has since set every round back to zero.
--
--  Safe to run more than once.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'dues_per_player'
  ) then
    alter table public.matches
      add column dues_per_player numeric not null default 0
      check (dues_per_player >= 0);

    -- Same statement as the column, so it is a one time backfill rather than
    -- something that can fire again on a later run.
    update public.matches
    set dues_per_player = 35
    where id in (
      select id
      from public.matches
      where status = 'complete'
      order by match_date desc, created_at desc
      limit 3
    );
  end if;
end $$;

select
  name,
  match_date,
  status,
  dues_per_player
from public.matches
order by match_date desc, created_at desc;
