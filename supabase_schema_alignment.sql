-- ============================================================
-- PawTimer — schema alignment migration for existing Supabase projects
-- Purpose: make the live database match the schema expected by src/App.jsx sync code.
-- Safe to run multiple times.
-- ============================================================

begin;

-- Ensure core tables exist.
create table if not exists public.dogs (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.sessions (
  id text primary key,
  dog_id text not null,
  date timestamptz not null,
  planned_duration integer not null,
  actual_duration integer not null,
  distress_level text not null,
  result text not null,
  created_at timestamptz default now()
);

create table if not exists public.walks (
  id text primary key,
  dog_id text not null,
  date timestamptz not null,
  duration integer not null default 0,
  walk_type text not null default 'regular_walk',
  created_at timestamptz default now()
);

create table if not exists public.patterns (
  id text primary key,
  dog_id text not null,
  date timestamptz not null,
  type text not null,
  created_at timestamptz default now()
);

-- Add any missing columns on existing tables.
alter table if exists public.dogs
  add column if not exists settings jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table if exists public.sessions
  add column if not exists dog_id text,
  add column if not exists date timestamptz,
  add column if not exists planned_duration integer,
  add column if not exists actual_duration integer,
  add column if not exists distress_level text,
  add column if not exists result text,
  add column if not exists created_at timestamptz default now();

alter table if exists public.walks
  add column if not exists dog_id text,
  add column if not exists date timestamptz,
  add column if not exists duration integer,
  add column if not exists walk_type text,
  add column if not exists created_at timestamptz default now();

alter table if exists public.patterns
  add column if not exists dog_id text,
  add column if not exists date timestamptz,
  add column if not exists type text,
  add column if not exists created_at timestamptz default now();

-- Normalize column types expected by the app's REST payloads.
alter table if exists public.dogs
  alter column id type text using id::text,
  alter column settings type jsonb using coalesce(settings, '{}'::jsonb),
  alter column settings set default '{}'::jsonb,
  alter column settings set not null;

alter table if exists public.sessions
  alter column id type text using id::text,
  alter column dog_id type text using dog_id::text,
  alter column date type timestamptz using date::timestamptz,
  alter column planned_duration type integer using planned_duration::integer,
  alter column actual_duration type integer using actual_duration::integer,
  alter column distress_level type text using distress_level::text,
  alter column result type text using result::text;

alter table if exists public.walks
  alter column id type text using id::text,
  alter column dog_id type text using dog_id::text,
  alter column date type timestamptz using date::timestamptz,
  alter column duration type integer using coalesce(duration, 0)::integer,
  alter column walk_type type text using coalesce(walk_type, 'regular_walk')::text,
  alter column duration set default 0;

update public.walks set duration = 0 where duration is null;

alter table if exists public.patterns
  alter column id type text using id::text,
  alter column dog_id type text using dog_id::text,
  alter column date type timestamptz using date::timestamptz,
  alter column type type text using type::text;

-- Enforce not-null columns expected by app writes.
alter table if exists public.sessions
  alter column dog_id set not null,
  alter column date set not null,
  alter column planned_duration set not null,
  alter column actual_duration set not null,
  alter column distress_level set not null,
  alter column result set not null;

alter table if exists public.walks
  alter column dog_id set not null,
  alter column date set not null,
  alter column duration set not null,
  alter column walk_type set default 'regular_walk',
  alter column walk_type set not null;

alter table if exists public.patterns
  alter column dog_id set not null,
  alter column date set not null,
  alter column type set not null;

-- Foreign keys and checks (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_dog_id_fkey'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_dog_id_fkey
      foreign key (dog_id) references public.dogs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'walks_dog_id_fkey'
      and conrelid = 'public.walks'::regclass
  ) then
    alter table public.walks
      add constraint walks_dog_id_fkey
      foreign key (dog_id) references public.dogs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'patterns_dog_id_fkey'
      and conrelid = 'public.patterns'::regclass
  ) then
    alter table public.patterns
      add constraint patterns_dog_id_fkey
      foreign key (dog_id) references public.dogs(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_distress_level_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_distress_level_check
      check (distress_level in ('none', 'mild', 'strong'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_result_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_result_check
      check (result in ('success', 'distress'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'patterns_type_check'
      and conrelid = 'public.patterns'::regclass
  ) then
    alter table public.patterns
      add constraint patterns_type_check
      check (type in ('keys', 'shoes', 'jacket'));
  end if;
end $$;

-- Performance indexes used by app filters.
create index if not exists sessions_dog_id_idx on public.sessions(dog_id);
create index if not exists walks_dog_id_idx on public.walks(dog_id);
create index if not exists patterns_dog_id_idx on public.patterns(dog_id);

-- RLS compatibility with existing anon-key sync model.
alter table public.dogs enable row level security;
alter table public.sessions enable row level security;
alter table public.walks enable row level security;
alter table public.patterns enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dogs' and policyname = 'Public dog access'
  ) then
    create policy "Public dog access" on public.dogs for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessions' and policyname = 'Public session access'
  ) then
    create policy "Public session access" on public.sessions for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'walks' and policyname = 'Public walk access'
  ) then
    create policy "Public walk access" on public.walks for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'patterns' and policyname = 'Public pattern access'
  ) then
    create policy "Public pattern access" on public.patterns for all using (true) with check (true);
  end if;
end $$;

commit;
