-- ============================================================
--  Match play: live scoring, unit payouts, FB18 side game
--
--  hole_scores is the ONLY thing anyone types. Every match result,
--  carryover, payout, and dollar figure is computed on read, the same way
--  category weights work on the rating board. Reopening a finished round and
--  fixing one hole therefore recomputes everything downstream on its own.
--
--  Safe to run more than once.
-- ============================================================

create table if not exists public.matches (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  course           text not null default '',
  match_date       date not null default current_date,
  team_count       int not null check (team_count between 2 and 12),
  roster_size      int not null default 4 check (roster_size between 1 and 8),
  dollars_per_unit numeric not null default 0 check (dollars_per_unit >= 0),
  -- What happens when a tie contests positions with different payouts.
  -- 'hole' = sudden death on the following hole. 'set' = units roll forward.
  tie_default      text not null default 'hole' check (tie_default in ('hole','set')),
  status           text not null default 'setup'
                     check (status in ('setup','filling','in_progress','complete')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table if not exists public.match_teams (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.matches(id) on delete cascade,
  slot              int not null,
  name              text not null,
  captain_golfer_id uuid references public.golfers(id) on delete set null,
  captain_user_id   uuid references public.profiles(id) on delete set null,
  in_fb18           boolean not null default false,
  unique (match_id, slot)
);

-- Primary key on (match_id, golfer_id) is what stops one person being
-- rostered on two teams in the same match.
create table if not exists public.match_players (
  match_id  uuid not null references public.matches(id) on delete cascade,
  team_id   uuid not null references public.match_teams(id) on delete cascade,
  golfer_id uuid not null references public.golfers(id) on delete cascade,
  slot      int not null,
  primary key (match_id, golfer_id),
  unique (team_id, slot)
);

create table if not exists public.match_payouts (
  match_id uuid not null references public.matches(id) on delete cascade,
  position int not null check (position >= 1),
  units    numeric not null default 0,
  primary key (match_id, position)
);

create table if not exists public.fb18_payouts (
  match_id uuid not null references public.matches(id) on delete cascade,
  segment  text not null check (segment in ('front','back','total')),
  position int not null check (position >= 1),
  units    numeric not null default 0,
  primary key (match_id, segment, position)
);

create table if not exists public.hole_scores (
  match_id   uuid not null references public.matches(id) on delete cascade,
  team_id    uuid not null references public.match_teams(id) on delete cascade,
  hole       int not null check (hole between 1 and 18),
  strokes    int not null check (strokes between 1 and 30),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (match_id, team_id, hole)
);

create table if not exists public.score_edits (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  team_id     uuid not null references public.match_teams(id) on delete cascade,
  hole        int not null,
  old_strokes int,
  new_strokes int,
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now()
);

-- One row per tie an admin has ruled on. block_key identifies which tied
-- group inside a segment, so two separate ties in one segment stay distinct.
create table if not exists public.tie_decisions (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  segment    int not null check (segment between 1 and 6),
  block_key  text not null,
  choice     text not null check (choice in ('hole','set')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (match_id, segment, block_key)
);

create index if not exists hole_scores_match_idx on public.hole_scores(match_id);
create index if not exists match_players_team_idx on public.match_players(team_id);

-- ------------------------------------------------------------
--  Guards
-- ------------------------------------------------------------

-- Rosters are open during setup and filling. After that only an admin may
-- change them, which is what "reopen a round" relies on.
create or replace function public.guard_roster_window()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_match  uuid;
begin
  v_match := coalesce(new.match_id, old.match_id);
  select status into v_status from public.matches where id = v_match;

  if v_status not in ('setup','filling') and not public.is_admin() then
    raise exception 'The round has started. Ask an admin to change a roster.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists match_players_guard on public.match_players;
create trigger match_players_guard
  before insert or update or delete on public.match_players
  for each row execute function public.guard_roster_window();

-- Scores are writable while a round is running, and by admins any time.
create or replace function public.guard_score_window()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_match  uuid;
begin
  v_match := coalesce(new.match_id, old.match_id);
  select status into v_status from public.matches where id = v_match;

  if v_status <> 'in_progress' and not public.is_admin() then
    raise exception 'Scoring is closed for this round.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists hole_scores_guard on public.hole_scores;
create trigger hole_scores_guard
  before insert or update or delete on public.hole_scores
  for each row execute function public.guard_score_window();

-- Every change to a score is logged, so a disputed hole has a paper trail.
create or replace function public.log_score_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.score_edits
    (match_id, team_id, hole, old_strokes, new_strokes, changed_by)
  values (
    coalesce(new.match_id, old.match_id),
    coalesce(new.team_id,  old.team_id),
    coalesce(new.hole,     old.hole),
    case when tg_op in ('UPDATE','DELETE') then old.strokes end,
    case when tg_op in ('INSERT','UPDATE') then new.strokes end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

drop trigger if exists hole_scores_audit on public.hole_scores;
create trigger hole_scores_audit
  after insert or update or delete on public.hole_scores
  for each row execute function public.log_score_edit();

create or replace function public.touch_score()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists hole_scores_touch on public.hole_scores;
create trigger hole_scores_touch
  before insert or update on public.hole_scores
  for each row execute function public.touch_score();

-- ------------------------------------------------------------
--  Row level security
-- ------------------------------------------------------------

alter table public.matches        enable row level security;
alter table public.match_teams    enable row level security;
alter table public.match_players  enable row level security;
alter table public.match_payouts  enable row level security;
alter table public.fb18_payouts   enable row level security;
alter table public.hole_scores    enable row level security;
alter table public.score_edits    enable row level security;
alter table public.tie_decisions  enable row level security;

-- Helper: is the caller the captain of this team?
create or replace function public.is_team_captain(p_team_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.match_teams t
    where t.id = p_team_id and t.captain_user_id = auth.uid()
  );
$$;

grant execute on function public.is_team_captain(uuid) to authenticated;

-- Everyone approved can watch. Admins configure.
do $$
declare t text;
begin
  foreach t in array array['matches','match_teams','match_payouts','fb18_payouts','score_edits','tie_decisions']
  loop
    execute format('drop policy if exists "read %1$s" on public.%1$I', t);
    execute format(
      'create policy "read %1$s" on public.%1$I for select to authenticated using (public.is_approved())', t);
    execute format('drop policy if exists "admin writes %1$s" on public.%1$I', t);
    execute format(
      'create policy "admin writes %1$s" on public.%1$I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Rosters: readable by all, writable by that team's captain or an admin.
drop policy if exists "read match_players" on public.match_players;
create policy "read match_players" on public.match_players
  for select to authenticated using (public.is_approved());

drop policy if exists "captain or admin fills roster" on public.match_players;
create policy "captain or admin fills roster" on public.match_players
  for all to authenticated
  using (public.is_approved() and (public.is_admin() or public.is_team_captain(team_id)))
  with check (public.is_approved() and (public.is_admin() or public.is_team_captain(team_id)));

-- Scores: readable by all, writable by that team's captain or an admin.
drop policy if exists "read hole_scores" on public.hole_scores;
create policy "read hole_scores" on public.hole_scores
  for select to authenticated using (public.is_approved());

drop policy if exists "captain or admin scores" on public.hole_scores;
create policy "captain or admin scores" on public.hole_scores
  for all to authenticated
  using (public.is_approved() and (public.is_admin() or public.is_team_captain(team_id)))
  with check (public.is_approved() and (public.is_admin() or public.is_team_captain(team_id)));

-- ------------------------------------------------------------
--  Grants. RLS gates rows; Postgres checks the grant first.
-- ------------------------------------------------------------

grant select, insert, update, delete on
  public.matches, public.match_teams, public.match_players,
  public.match_payouts, public.fb18_payouts, public.hole_scores,
  public.tie_decisions
to authenticated;

grant select on public.score_edits to authenticated;

-- ------------------------------------------------------------
--  Realtime: everyone watches scores land as they are typed
-- ------------------------------------------------------------

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.hole_scores'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.matches'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.match_players'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.match_teams'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.tie_decisions'; exception when duplicate_object then null; end;
end $$;

select 'matches schema installed' as result;
