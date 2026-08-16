-- ============================================================
--  Optional hardening. Not required for the app to run.
--
--  Supabase's tooling grants TRUNCATE, REFERENCES, and TRIGGER to anon and
--  authenticated on tables in public. None are reachable through PostgREST,
--  so this is tidying rather than closing a hole. TRUNCATE is the one worth
--  removing on principle: unlike SELECT, INSERT, UPDATE, and DELETE, it is
--  never filtered by row level security, so a route to it would bypass every
--  policy in 0001 at once.
--
--  Safe to run more than once.
-- ============================================================

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- ------------------------------------------------------------
--  Verification. Every row should now show only DML privileges,
--  and draft_picks should still show just DELETE, SELECT.
-- ------------------------------------------------------------

select
  table_name,
  string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
group by table_name
order by table_name;
