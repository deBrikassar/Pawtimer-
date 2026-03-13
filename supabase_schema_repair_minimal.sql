begin;

create table if not exists public.patterns (
  id text primary key,
  dog_id text not null,
  date timestamptz not null,
  type text not null,
  created_at timestamptz default now()
);

alter table if exists public.walks
  add column if not exists duration integer;

alter table if exists public.sessions
  add column if not exists context jsonb,
  add column if not exists symptoms jsonb,
  add column if not exists recovery_seconds integer,
  add column if not exists pre_session jsonb,
  add column if not exists environment jsonb;

commit;

select table_schema, table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'patterns';

select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'walks'
order by ordinal_position;

select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions'
order by ordinal_position;
