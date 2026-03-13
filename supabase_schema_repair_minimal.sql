-- Minimal, focused, rerunnable schema repair for current frontend sync queries
-- Scope intentionally limited to: patterns table, walks.duration, sessions metadata columns

begin;

-- 1) Ensure patterns table exists (exact columns required by frontend)
create table if not exists public.patterns (
  id text primary key,
  dog_id text not null,
  date timestamptz not null,
  type text not null
);

-- 2) Ensure walks.duration exists
alter table if exists public.walks
  add column if not exists duration integer;

-- 3) Ensure expanded sessions columns exist
alter table if exists public.sessions
  add column if not exists context jsonb,
  add column if not exists symptoms jsonb,
  add column if not exists recovery_seconds integer,
  add column if not exists pre_session jsonb,
  add column if not exists environment jsonb;

commit;

-- Verification query 1: confirm patterns table exists
select table_schema, table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'patterns';

-- Verification query 2: list sessions columns
select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions'
order by ordinal_position;

-- Verification query 3: list walks columns
select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'walks'
order by ordinal_position;
