-- ============================================================
--  Golf Draft: schema, security, seed
--  Run this once in the Supabase SQL editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
--  Core tables
-- ------------------------------------------------------------

-- Rated categories. A table rather than an enum so admins can add
-- a sixth category later without a code change.
create table public.characteristics (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  label       text not null,
  -- Helper line under the slider on the rating form. Admin editable, which
  -- is why it lives here rather than hardcoded in the component.
  description text,
  weight      numeric not null default 20 check (weight >= 0),
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.golfers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  nickname    text,
  image_path  text,
  in_pool     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- One row per signed in user, created automatically on first login.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  is_admin     boolean not null default false,
  golfer_id    uuid references public.golfers(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- A golfer card belongs to at most one login.
create unique index profiles_golfer_id_key
  on public.profiles(golfer_id) where golfer_id is not null;

-- ------------------------------------------------------------
--  Ratings
-- ------------------------------------------------------------

-- The unique constraint is the one submission per person per golfer rule.
create table public.ratings (
  id         uuid primary key default gen_random_uuid(),
  golfer_id  uuid not null references public.golfers(id) on delete cascade,
  rater_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (golfer_id, rater_id)
);

-- Scores live in their own table so adding a category later does not
-- require a migration, and old ratings simply carry no score for it.
create table public.rating_scores (
  rating_id         uuid not null references public.ratings(id) on delete cascade,
  characteristic_id uuid not null references public.characteristics(id) on delete cascade,
  score             int not null check (score between 0 and 100),
  primary key (rating_id, characteristic_id)
);

create index rating_scores_characteristic_idx on public.rating_scores(characteristic_id);
create index ratings_golfer_idx on public.ratings(golfer_id);

-- ------------------------------------------------------------
--  Drafts
-- ------------------------------------------------------------

-- roster_size counts the captain, so picks to make = team_count * (roster_size - 1)
create table public.drafts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  draft_date   date not null default current_date,
  mode         text not null default 'mock' check (mode in ('mock','live')),
  strategy     text not null default 'balanced' check (strategy in ('overall','balanced')),
  team_count   int not null default 4 check (team_count between 2 and 12),
  roster_size  int not null default 4 check (roster_size between 2 and 20),
  status       text not null default 'setup' check (status in ('setup','in_progress','complete')),
  current_pick int not null default 1,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.draft_teams (
  id                uuid primary key default gen_random_uuid(),
  draft_id          uuid not null references public.drafts(id) on delete cascade,
  name              text not null,
  slot              int not null,
  captain_golfer_id uuid references public.golfers(id) on delete set null,
  captain_user_id   uuid references public.profiles(id) on delete set null,
  unique (draft_id, slot)
);

-- Who is available this particular week.
create table public.draft_pool (
  draft_id  uuid not null references public.drafts(id) on delete cascade,
  golfer_id uuid not null references public.golfers(id) on delete cascade,
  available boolean not null default true,
  primary key (draft_id, golfer_id)
);

create table public.draft_picks (
  id          uuid primary key default gen_random_uuid(),
  draft_id    uuid not null references public.drafts(id) on delete cascade,
  team_id     uuid not null references public.draft_teams(id) on delete cascade,
  golfer_id   uuid not null references public.golfers(id) on delete cascade,
  round       int not null,
  pick_number int not null,
  made_by     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (draft_id, pick_number),
  unique (draft_id, golfer_id)
);

create index draft_picks_draft_idx on public.draft_picks(draft_id);

-- ------------------------------------------------------------
--  Helpers
-- ------------------------------------------------------------

-- security definer so policies on profiles can call it without
-- recursing back through profiles' own row level security.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Create the profile on first login. The very first person to sign in
-- becomes admin, which bootstraps the app without hand editing SQL.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
begin
  select not exists (select 1 from public.profiles where is_admin) into v_first;

  insert into public.profiles (id, email, display_name, avatar_url, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             new.email),
    new.raw_user_meta_data->>'avatar_url',
    v_first
  )
  on conflict (id) do nothing;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nobody promotes themselves, and nobody claims someone else's golfer card.
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
  if new.golfer_id is distinct from old.golfer_id and not public.is_admin() then
    raise exception 'Only an admin can link a login to a golfer';
  end if;
  return new;
end $$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- You cannot rate yourself.
create or replace function public.block_self_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = new.rater_id and p.golfer_id = new.golfer_id
  ) then
    raise exception 'You cannot rate yourself';
  end if;
  return new;
end $$;

create trigger ratings_block_self
  before insert or update on public.ratings
  for each row execute function public.block_self_rating();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger ratings_touch_updated
  before update on public.ratings
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
--  Aggregate views
--
--  These intentionally run as the view owner rather than the caller.
--  That is what lets everyone read averages while the raw ratings
--  underneath stay private to their author and to admins. The Supabase
--  linter flags this pattern; here it is the point.
-- ------------------------------------------------------------

create or replace view public.golfer_category_averages as
select
  g.id                        as golfer_id,
  c.id                        as characteristic_id,
  c.key                       as characteristic_key,
  round(avg(rs.score), 1)     as avg_score,
  count(rs.score)             as score_count
from public.golfers g
cross join public.characteristics c
left join public.ratings r
  on r.golfer_id = g.id
left join public.rating_scores rs
  on rs.rating_id = r.id and rs.characteristic_id = c.id
where c.active
group by g.id, c.id, c.key;

create or replace view public.golfer_rating_counts as
select
  g.id            as golfer_id,
  count(r.id)     as rating_count
from public.golfers g
left join public.ratings r on r.golfer_id = g.id
group by g.id;

revoke all on public.golfer_category_averages from anon;
revoke all on public.golfer_rating_counts from anon;
grant select on public.golfer_category_averages to authenticated;
grant select on public.golfer_rating_counts to authenticated;

-- ------------------------------------------------------------
--  Row level security
-- ------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.golfers        enable row level security;
alter table public.characteristics enable row level security;
alter table public.ratings        enable row level security;
alter table public.rating_scores  enable row level security;
alter table public.drafts         enable row level security;
alter table public.draft_teams    enable row level security;
alter table public.draft_pool     enable row level security;
alter table public.draft_picks    enable row level security;

-- profiles
create policy "profiles readable by signed in users"
  on public.profiles for select to authenticated using (true);
create policy "own profile update"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage profiles"
  on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- golfers and characteristics: everyone reads, admins write
create policy "golfers readable by signed in users"
  on public.golfers for select to authenticated using (true);
create policy "admins manage golfers"
  on public.golfers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "characteristics readable by signed in users"
  on public.characteristics for select to authenticated using (true);
create policy "admins manage characteristics"
  on public.characteristics for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ratings: you see and edit your own, admins see everything
create policy "own ratings readable"
  on public.ratings for select to authenticated
  using (rater_id = auth.uid() or public.is_admin());
create policy "insert own rating"
  on public.ratings for insert to authenticated
  with check (rater_id = auth.uid());
create policy "update own rating"
  on public.ratings for update to authenticated
  using (rater_id = auth.uid()) with check (rater_id = auth.uid());
create policy "delete own rating"
  on public.ratings for delete to authenticated
  using (rater_id = auth.uid() or public.is_admin());

create policy "own rating scores readable"
  on public.rating_scores for select to authenticated
  using (exists (
    select 1 from public.ratings r
    where r.id = rating_id and (r.rater_id = auth.uid() or public.is_admin())
  ));
create policy "write own rating scores"
  on public.rating_scores for all to authenticated
  using (exists (
    select 1 from public.ratings r
    where r.id = rating_id and r.rater_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.ratings r
    where r.id = rating_id and r.rater_id = auth.uid()
  ));

-- drafts: everyone watches, admins set up
create policy "drafts readable by signed in users"
  on public.drafts for select to authenticated using (true);
create policy "admins manage drafts"
  on public.drafts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "draft teams readable by signed in users"
  on public.draft_teams for select to authenticated using (true);
create policy "admins manage draft teams"
  on public.draft_teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "draft pool readable by signed in users"
  on public.draft_pool for select to authenticated using (true);
create policy "admins manage draft pool"
  on public.draft_pool for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Picks are readable by all, but there is deliberately no insert policy.
-- Every pick goes through make_pick() so turn order is enforced server side
-- and nobody can pick out of turn from the browser console.
create policy "draft picks readable by signed in users"
  on public.draft_picks for select to authenticated using (true);
create policy "admins manage draft picks"
  on public.draft_picks for delete to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------
--  Draft turn logic
-- ------------------------------------------------------------

-- Snake order: round 1 runs slot 1..N, round 2 runs N..1, and so on.
create or replace function public.pick_slot(p_pick int, p_team_count int)
returns int
language sql
immutable
as $$
  select case
    when ((p_pick - 1) / p_team_count) % 2 = 0
      then ((p_pick - 1) % p_team_count) + 1
    else p_team_count - ((p_pick - 1) % p_team_count)
  end;
$$;

create or replace function public.make_pick(p_draft_id uuid, p_golfer_id uuid)
returns public.draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.drafts;
  v_team  public.draft_teams;
  v_round int;
  v_slot  int;
  v_total int;
  v_pick  public.draft_picks;
begin
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft not found';
  end if;
  if v_draft.status <> 'in_progress' then
    raise exception 'Draft is not in progress';
  end if;

  -- captains fill one roster spot each, so they are not picked
  v_total := v_draft.team_count * (v_draft.roster_size - 1);
  if v_draft.current_pick > v_total then
    raise exception 'Draft is already complete';
  end if;

  v_round := ((v_draft.current_pick - 1) / v_draft.team_count) + 1;
  v_slot  := public.pick_slot(v_draft.current_pick, v_draft.team_count);

  select * into v_team from public.draft_teams
    where draft_id = p_draft_id and slot = v_slot;
  if not found then
    raise exception 'No team in slot %', v_slot;
  end if;

  if not (public.is_admin() or v_team.captain_user_id = auth.uid()) then
    raise exception 'It is not your pick';
  end if;

  if exists (
    select 1 from public.draft_teams t
    where t.draft_id = p_draft_id and t.captain_golfer_id = p_golfer_id
  ) then
    raise exception 'That golfer is already a captain';
  end if;

  if not exists (
    select 1 from public.draft_pool dp
    where dp.draft_id = p_draft_id
      and dp.golfer_id = p_golfer_id
      and dp.available
  ) then
    raise exception 'That golfer is not available in this draft';
  end if;

  insert into public.draft_picks
    (draft_id, team_id, golfer_id, round, pick_number, made_by)
  values
    (p_draft_id, v_team.id, p_golfer_id, v_round, v_draft.current_pick, auth.uid())
  returning * into v_pick;

  update public.drafts
     set current_pick = current_pick + 1,
         status = case when current_pick + 1 > v_total then 'complete' else status end
   where id = p_draft_id;

  return v_pick;
end $$;

-- Admin escape hatch when someone picks the wrong player.
create or replace function public.undo_last_pick(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can undo a pick';
  end if;

  select max(pick_number) into v_last
    from public.draft_picks where draft_id = p_draft_id;
  if v_last is null then
    raise exception 'Nothing to undo';
  end if;

  delete from public.draft_picks
   where draft_id = p_draft_id and pick_number = v_last;

  update public.drafts
     set current_pick = v_last,
         status = 'in_progress'
   where id = p_draft_id;
end $$;

grant execute on function public.make_pick(uuid, uuid) to authenticated;
grant execute on function public.undo_last_pick(uuid) to authenticated;

-- ------------------------------------------------------------
--  Realtime
-- ------------------------------------------------------------

alter publication supabase_realtime add table public.draft_picks;
alter publication supabase_realtime add table public.drafts;

-- ------------------------------------------------------------
--  Photo storage
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('golfer-photos', 'golfer-photos', true)
on conflict (id) do nothing;

create policy "golfer photos are public"
  on storage.objects for select
  using (bucket_id = 'golfer-photos');

create policy "admins manage golfer photos"
  on storage.objects for all to authenticated
  using (bucket_id = 'golfer-photos' and public.is_admin())
  with check (bucket_id = 'golfer-photos' and public.is_admin());

-- ------------------------------------------------------------
--  Table privileges
--
--  Row level security decides which rows are visible, but Postgres checks
--  the table level GRANT first and never reaches the policy without it.
--  Do not rely on Supabase default privileges here; newer projects do not
--  hand them out.
-- ------------------------------------------------------------

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

-- Picks only ever arrive through make_pick().
grant select, delete on public.draft_picks to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.pick_slot(int, int) to authenticated;

-- ------------------------------------------------------------
--  Seed
-- ------------------------------------------------------------

insert into public.characteristics (key, label, description, weight, sort_order) values
  ('distance',   'Distance',   'Off the tee. How far, and can they carry trouble?',   25, 1),
  ('putting',    'Putting',    'Inside 30 feet. Do they make the ones that matter?',  25, 2),
  ('short_game', 'Short Game', 'Chips, pitches, bunkers. Getting up and down.',       20, 3),
  ('accuracy',   'Accuracy',   'Fairways and greens. How often are they in play?',    20, 4),
  ('clutch',     'Clutch',     'The pressure shot with the match on the line.',       10, 5)
on conflict (key) do nothing;
