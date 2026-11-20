--  The second lowest eighteen becomes a pot of its own.
--
--  The league's book has always had two prizes on the eighteen: a full pot to
--  the lowest round and a half pot to the second lowest, each with its own
--  rate and its own set of payers. The app folded them into one table, which
--  can reproduce a given night's money but is not the same game: with one
--  table a tie across the top two splits, and with two pots the lowest takes
--  one prize and the second lowest takes the other.
--
--  Existing rounds are untouched on purpose. They carry no 'second' rows, so
--  that pot pays nothing and their settlement is exactly what it was. Only
--  rounds made after this get the split by default.
--
--  Safe to run twice.

-- fb18_payouts.segment was pinned to three values.
alter table public.fb18_payouts
  drop constraint if exists fb18_payouts_segment_check;

alter table public.fb18_payouts
  add constraint fb18_payouts_segment_check
  check (segment in ('front', 'back', 'total', 'second'));

-- Its own rate, like the other three. Null falls back the same way: to
-- fb18_dollars_per_unit, and from there to the round's main rate.
alter table public.matches
  add column if not exists fb18_second_dollars_per_unit numeric
    check (fb18_second_dollars_per_unit is null or fb18_second_dollars_per_unit >= 0);

-- What this changed.
select
  count(*) as rounds,
  count(fb18_second_dollars_per_unit) as with_second_rate
from public.matches;

select segment, count(*) as payout_rows
from public.fb18_payouts
group by segment
order by segment;
