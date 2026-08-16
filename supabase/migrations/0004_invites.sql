-- ============================================================
--  Invite allowlist and access approval
--
--  Before this, anyone with a Google account who found the URL could sign
--  in and submit ratings. Now an admin holds a list of email addresses, and
--  only those addresses land in an approved state. Everyone else gets a
--  holding screen until an admin lets them in.
--
--  Safe to run more than once.
-- ============================================================

create table if not exists public.allowed_emails (
  email      text primary key,
  label      text,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;

drop policy if exists "admins manage allowlist" on public.allowed_emails;
create policy "admins manage allowlist"
  on public.allowed_emails for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.allowed_emails to authenticated;

-- ------------------------------------------------------------
--  Approval flag
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists is_approved boolean not null default false;

-- Anyone already signed in keeps their access. Without this the migration
-- would lock the current admin out of their own app.
update public.profiles set is_approved = true;

create or replace function public.is_approved()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_approved from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_approved() to anon, authenticated;

-- ------------------------------------------------------------
--  Signup now consults the allowlist
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first   boolean;
  v_allowed boolean;
begin
  select not exists (select 1 from public.profiles where is_admin) into v_first;

  select exists (
    select 1 from public.allowed_emails
    where email = lower(new.email)
  ) into v_allowed;

  insert into public.profiles (
    id, email, display_name, avatar_url, is_admin, is_approved
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             new.email),
    new.raw_user_meta_data->>'avatar_url',
    v_first,
    v_first or v_allowed
  )
  on conflict (id) do nothing;

  return new;
end $$;

-- Nobody approves themselves either.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'Only an admin can change admin status';
  end if;
  if new.is_approved is distinct from old.is_approved and not public.is_admin() then
    raise exception 'Only an admin can approve access';
  end if;
  if new.golfer_id is distinct from old.golfer_id and not public.is_admin() then
    raise exception 'Only an admin can link a login to a golfer';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
--  Reads now require approval, not just a session
-- ------------------------------------------------------------

-- Own row stays readable regardless, otherwise a pending user could not
-- even discover that they are pending.
drop policy if exists "profiles readable by signed in users" on public.profiles;
drop policy if exists "profiles readable by approved users" on public.profiles;
create policy "profiles readable by approved users"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_approved());

drop policy if exists "golfers readable by signed in users" on public.golfers;
create policy "golfers readable by approved users"
  on public.golfers for select to authenticated
  using (public.is_approved());

drop policy if exists "characteristics readable by signed in users" on public.characteristics;
create policy "characteristics readable by approved users"
  on public.characteristics for select to authenticated
  using (public.is_approved());

drop policy if exists "drafts readable by signed in users" on public.drafts;
create policy "drafts readable by approved users"
  on public.drafts for select to authenticated
  using (public.is_approved());

drop policy if exists "draft teams readable by signed in users" on public.draft_teams;
create policy "draft teams readable by approved users"
  on public.draft_teams for select to authenticated
  using (public.is_approved());

drop policy if exists "draft pool readable by signed in users" on public.draft_pool;
create policy "draft pool readable by approved users"
  on public.draft_pool for select to authenticated
  using (public.is_approved());

drop policy if exists "draft picks readable by signed in users" on public.draft_picks;
create policy "draft picks readable by approved users"
  on public.draft_picks for select to authenticated
  using (public.is_approved());

-- Submitting a rating requires approval too, not merely a session.
drop policy if exists "insert own rating" on public.ratings;
create policy "insert own rating"
  on public.ratings for insert to authenticated
  with check (rater_id = auth.uid() and public.is_approved());

drop policy if exists "update own rating" on public.ratings;
create policy "update own rating"
  on public.ratings for update to authenticated
  using (rater_id = auth.uid() and public.is_approved())
  with check (rater_id = auth.uid() and public.is_approved());

-- ------------------------------------------------------------
--  Aggregate views close to unapproved users as well
-- ------------------------------------------------------------

create or replace view public.golfer_category_averages as
select
  g.id                    as golfer_id,
  c.id                    as characteristic_id,
  c.key                   as characteristic_key,
  round(avg(rs.score), 1) as avg_score,
  count(rs.score)         as score_count
from public.golfers g
cross join public.characteristics c
left join public.ratings r
  on r.golfer_id = g.id
left join public.rating_scores rs
  on rs.rating_id = r.id and rs.characteristic_id = c.id
where c.active
  and public.is_approved()
group by g.id, c.id, c.key;

create or replace view public.golfer_rating_counts as
select
  g.id        as golfer_id,
  count(r.id) as rating_count
from public.golfers g
left join public.ratings r on r.golfer_id = g.id
where public.is_approved()
group by g.id;

revoke all on public.golfer_category_averages from anon;
revoke all on public.golfer_rating_counts from anon;
grant select on public.golfer_category_averages to authenticated;
grant select on public.golfer_rating_counts to authenticated;

-- ------------------------------------------------------------
--  Verification
-- ------------------------------------------------------------

select email, is_admin, is_approved from public.profiles order by created_at;
