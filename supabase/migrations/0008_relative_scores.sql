-- ============================================================
--  Hole scores become relative to par
--
--  Was 1..30 gross strokes. Now -3..+5 against par, where 0 is par.
--  Lowest still wins, so the scoring engine needs no change: -5 beats +2
--  exactly the way 68 beat 75.
--
--  Safe to run more than once.
-- ============================================================

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.hole_scores'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%strokes%'
  loop
    execute format('alter table public.hole_scores drop constraint %I', c);
  end loop;
end $$;

alter table public.hole_scores
  add constraint hole_scores_score_range check (strokes between -3 and 5);

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.hole_scores'::regclass and contype = 'c';
