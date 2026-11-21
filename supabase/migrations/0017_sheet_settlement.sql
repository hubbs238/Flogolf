-- Keep settled rounds on their original rules. New rounds use the signed
-- value of each occupied position when an unresolved match tie is shared.
alter table public.matches
  add column if not exists split_by_position boolean not null default false,
  add column if not exists overall_money_order uuid[];
alter table public.matches alter column split_by_position set default true;
