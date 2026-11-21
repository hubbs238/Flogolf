alter table public.matches
  add column front_money_tiers jsonb,
  add column whole_dollar_settlement boolean not null default false;
