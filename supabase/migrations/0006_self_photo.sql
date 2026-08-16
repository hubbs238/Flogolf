-- ============================================================
--  Let people upload their own photo
--
--  Photos live at golfer-photos/<golfer_id>/<timestamp>.<ext>, so the first
--  path segment already says who a file belongs to. That is what both halves
--  of this migration key on.
--
--  Deliberately NOT done here: granting UPDATE on public.golfers to ordinary
--  users. Row level security gates rows, not columns, so that would let
--  anyone linked to a golfer rename themselves or flip their own in_pool
--  flag. A narrow security definer function is the tighter tool.
--
--  Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
--  Storage: you may write inside your own folder
-- ------------------------------------------------------------

drop policy if exists "golfers manage their own photo" on storage.objects;
create policy "golfers manage their own photo"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'golfer-photos'
    and (storage.foldername(name))[1] = (
      select p.golfer_id::text
      from public.profiles p
      where p.id = auth.uid()
    )
  )
  with check (
    bucket_id = 'golfer-photos'
    and (storage.foldername(name))[1] = (
      select p.golfer_id::text
      from public.profiles p
      where p.id = auth.uid()
    )
  );

-- ------------------------------------------------------------
--  The one column they may change on their own golfer row
-- ------------------------------------------------------------

create or replace function public.set_my_photo(p_image_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_golfer uuid;
begin
  if not public.is_approved() then
    raise exception 'Your access has not been approved yet';
  end if;

  select golfer_id into v_golfer
    from public.profiles
   where id = auth.uid();

  if v_golfer is null then
    raise exception 'Your login is not linked to a golfer yet. Ask an admin.';
  end if;

  -- Stops someone pointing their row at a file sitting in another
  -- golfer's folder.
  if p_image_path is not null
     and split_part(p_image_path, '/', 1) <> v_golfer::text then
    raise exception 'That file does not belong to you';
  end if;

  update public.golfers
     set image_path = p_image_path
   where id = v_golfer;
end $$;

grant execute on function public.set_my_photo(text) to authenticated;

-- ------------------------------------------------------------
--  Verification
-- ------------------------------------------------------------

select
  p.email,
  g.name  as linked_golfer,
  g.image_path
from public.profiles p
left join public.golfers g on g.id = p.golfer_id
order by p.created_at;
