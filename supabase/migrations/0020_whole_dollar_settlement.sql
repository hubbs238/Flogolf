alter table public.matches alter column whole_dollar_settlement set default true;

update public.matches set whole_dollar_settlement = true
where whole_dollar_settlement = false;
