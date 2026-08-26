-- ============================================================
--  No range limit on a hole score
--
--  Drops every check on hole_scores.strokes. Scores are relative to par and
--  may be any whole number, negative or positive. Postgres still enforces
--  integer via the column type; nothing else constrains the value.
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

select
  coalesce(
    (select string_agg(conname, ', ')
     from pg_constraint
     where conrelid = 'public.hole_scores'::regclass and contype = 'c'),
    'none'
  ) as remaining_checks_on_hole_scores;
