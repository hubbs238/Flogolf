-- ============================================================
--  Majors: the season's five marquee events
--
--  An announcement, not a scoring rule. The points figure is a number an
--  admin types so the banner can say what is on the line; nothing here
--  reaches the scoring engine, and turning a major on cannot move a single
--  FLO Cup point. Whoever wins it is paid by hand, the way it works today.
--
--  Exactly one major can be live at a time. The partial unique index below
--  is what guarantees it: the application also clears the others when it
--  turns one on, but two admins clicking at once would race, and the index
--  is the thing that cannot be raced.
--
--  Everyone approved reads. Only admins write. No golfer is referenced, so
--  there is nothing to cascade and nothing to backfill.
--
--  Safe to run more than once.
-- ============================================================

create table if not exists public.majors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  major_date  date not null,
  -- What the lowest eighteen is worth. Whole points, and zero is allowed for
  -- an event that is played for the title alone.
  points      int not null default 0 check (points >= 0 and points <= 100000),
  is_live     boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One live major, enforced by the database rather than by good intentions.
-- Partial, so any number of majors can sit switched off: only the live rows
-- are in the index, every one of them holds true, and unique on that column
-- therefore permits exactly one. Same shape as profiles_golfer_id_key in
-- 0001. It also serves the is_live lookup the banner does on every page.
create unique index if not exists majors_one_live_key
  on public.majors (is_live) where is_live;

create index if not exists majors_major_date_idx
  on public.majors (major_date desc);

alter table public.majors enable row level security;

drop policy if exists "read majors" on public.majors;
create policy "read majors" on public.majors
  for select to authenticated using (public.is_approved());

drop policy if exists "admin writes majors" on public.majors;
create policy "admin writes majors" on public.majors
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Postgres checks the table grant before it ever reaches a policy, and this
-- project does not hand these out by default.
grant select, insert, update, delete on public.majors to authenticated;

-- 0003 revoked these across every table that existed at the time, and this
-- one did not exist yet. TRUNCATE in particular is never filtered by row
-- level security, so a route to it would go straight past the policies above.
revoke truncate, references, trigger on public.majors from anon, authenticated;

select
  count(*) as majors,
  count(*) filter (where is_live) as live,
  coalesce(max(name) filter (where is_live), '(none live)') as showing
from public.majors;
