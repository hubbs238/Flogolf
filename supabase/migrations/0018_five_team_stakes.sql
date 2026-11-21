-- The setup screen adjusts team slots before saving the new team count.
create or replace function public.set_five_team_stakes()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.dollars_per_unit := 25;
  new.dues_per_player := 35;
  new.tie_default := 'hole';
  new.split_by_position := true;
  new.fb18_front_dollars_per_unit := 10;
  new.fb18_back_dollars_per_unit := 10;
  new.fb18_total_dollars_per_unit := 10;
  new.fb18_second_dollars_per_unit := 5;

  if (select count(*) from public.match_teams where match_id = new.id) <> 5 then
    raise exception 'Five teams are required before initializing payouts';
  end if;
  update public.match_teams set in_fb18 = true where match_id = new.id and not in_fb18;

  delete from public.match_payouts where match_id = new.id and position not between 1 and 5;
  insert into public.match_payouts(match_id, position, units)
    select new.id, p, (array[2,1,-1,-1,-1])[p] from generate_series(1,5) p
    on conflict (match_id,position) do update set units = excluded.units;
  delete from public.fb18_payouts where match_id = new.id and position not between 1 and 5;
  insert into public.fb18_payouts(match_id, segment, position, units)
    select new.id, s, p, case when p = (case when s = 'second' then 2 else 1 end) then 4 else -1 end
    from unnest(array['front','back','total','second']) s cross join generate_series(1,5) p
    on conflict (match_id,segment,position) do update set units = excluded.units;
  return new;
end;
$$;

-- Use the same initializer for the one-time historical update and setup resizes.
create trigger initialize_existing_five_team_round
before update of team_count on public.matches for each row
when (new.team_count = 5) execute function public.set_five_team_stakes();

update public.matches set team_count = 5 where team_count = 5;
drop trigger initialize_existing_five_team_round on public.matches;

create trigger initialize_resized_five_team_round
before update of team_count on public.matches for each row
when (old.team_count <> 5 and new.team_count = 5 and new.status = 'setup')
execute function public.set_five_team_stakes();
