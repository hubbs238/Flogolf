-- ============================================================
--  Table privileges
--
--  Row level security decides WHICH rows a signed in user may touch, but
--  Postgres checks the table level GRANT first and never reaches the policy
--  without it. Older Supabase projects handed these out automatically through
--  default privileges. This project does not, so every table came back
--  "permission denied for table" even though the policies were correct.
--
--  Safe to run more than once.
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.golfers,
  public.characteristics,
  public.ratings,
  public.rating_scores,
  public.drafts,
  public.draft_teams,
  public.draft_pool
to authenticated;

-- Picks are never inserted directly. make_pick() owns turn order, so
-- authenticated gets read access and admins get delete through the policy.
grant select, delete on public.draft_picks to authenticated;

grant select on public.golfer_category_averages to authenticated;
grant select on public.golfer_rating_counts to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.pick_slot(int, int) to authenticated;
grant execute on function public.make_pick(uuid, uuid) to authenticated;
grant execute on function public.undo_last_pick(uuid) to authenticated;

-- anon deliberately gets nothing beyond schema usage. Sign in first.

-- ------------------------------------------------------------
--  Verification. This should return one row per table below.
-- ------------------------------------------------------------

select
  table_name,
  string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
group by table_name
order by table_name;
