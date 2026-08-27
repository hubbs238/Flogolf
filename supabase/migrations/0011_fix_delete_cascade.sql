-- ============================================================
--  Let a round be deleted
--
--  Deleting a match cascades to hole_scores, and the audit trigger on that
--  table then tried to insert a score_edits row referencing the match that
--  had just been removed. The foreign key refused, so the whole delete rolled
--  back and the audit trail blocked the deletion it exists to record.
--
--  Fix: skip the audit write when the row is disappearing because its parent
--  is. There is nothing worth logging -- the round it belonged to is gone,
--  and score_edits cascades away with it anyway.
--
--  A per-hole delete during a live round still logs normally, because the
--  match and team both still exist in that case.
--
--  Safe to run more than once.
-- ============================================================

create or replace function public.log_score_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match uuid := coalesce(new.match_id, old.match_id);
  v_team  uuid := coalesce(new.team_id,  old.team_id);
begin
  -- Inside the same transaction this sees the cascade's own deletes, so a
  -- missing parent means the row is being removed by that cascade.
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.matches where id = v_match)
       or not exists (select 1 from public.match_teams where id = v_team) then
      return old;
    end if;
  end if;

  insert into public.score_edits
    (match_id, team_id, hole, old_strokes, new_strokes, changed_by)
  values (
    v_match,
    v_team,
    coalesce(new.hole, old.hole),
    case when tg_op in ('UPDATE','DELETE') then old.strokes end,
    case when tg_op in ('INSERT','UPDATE') then new.strokes end,
    auth.uid()
  );

  return coalesce(new, old);
end $$;

select 'delete cascade fixed' as result;
