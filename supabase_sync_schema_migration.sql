-- ============================================================
-- PawTimer sync schema compatibility migration
-- Purpose: align DB schema with current frontend queries/writes
-- Safe to run multiple times (idempotent where possible)
-- ============================================================

begin;

-- 0) Ensure core tables exist (without dropping existing data)
create table if not exists public.dogs (
  id text primary key,
  settings jsonb not null default '{}',
  created_at timestamptz default now()
);

create table if not exists public.sessions (
  id text primary key,
  dog_id text,
  date timestamptz,
  planned_duration integer,
  actual_duration integer,
  distress_level text,
  result text,
  created_at timestamptz default now()
);

create table if not exists public.walks (
  id text primary key,
  dog_id text,
  date timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.patterns (
  id text primary key,
  dog_id text,
  date timestamptz,
  type text,
  created_at timestamptz default now()
);

-- 1) Add missing columns expected by frontend (sessions)
alter table public.sessions
  add column if not exists context jsonb,
  add column if not exists symptoms jsonb,
  add column if not exists recovery_seconds integer,
  add column if not exists pre_session jsonb,
  add column if not exists environment jsonb;

-- 2) Add missing columns expected by frontend (walks/patterns)
alter table public.walks
  add column if not exists duration integer,
  add column if not exists walk_type text;

alter table public.patterns
  add column if not exists type text;

-- 3) Backfill/defaults to keep existing rows compatible
update public.walks
set duration = 0
where duration is null;

update public.walks
set walk_type = 'regular_walk'
where walk_type is null or walk_type = '';

update public.sessions
set context = '{}'::jsonb
where context is null;

update public.sessions
set symptoms = '{}'::jsonb
where symptoms is null;

update public.sessions
set pre_session = '{}'::jsonb
where pre_session is null;

update public.sessions
set environment = '{}'::jsonb
where environment is null;

-- 4) Tighten nullability/defaults only after backfill
alter table public.walks
  alter column duration set default 0,
  alter column duration set not null;

alter table public.sessions
  alter column context set default '{}'::jsonb,
  alter column symptoms set default '{}'::jsonb,
  alter column pre_session set default '{}'::jsonb,
  alter column environment set default '{}'::jsonb;

-- 5) Foreign keys/indexes required for dog-scoped sync queries
-- Add FK constraints defensively (skip if already present by name)
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
end $$;

create index if not exists sessions_dog_id_idx on public.sessions(dog_id);
create index if not exists walks_dog_id_idx on public.walks(dog_id);
create index if not exists patterns_dog_id_idx on public.patterns(dog_id);

-- 6) Optional compatibility backfill from legacy activities table
-- If an older deployment logged pattern-breaks in activities,
-- copy recognizable rows into patterns table without duplicates.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'activities'
  ) then
    execute $ins$
      insert into public.patterns (id, dog_id, date, type)
      select
        a.id::text,
        a.dog_id::text,
        a.date::timestamptz,
        lower(a.type)::text
      from public.activities a
      where lower(a.type) in ('keys', 'shoes', 'jacket')
      on conflict (id) do nothing
    $ins$;
  end if;
end $$;

-- 7) RLS/policies (rerunnable + deterministic)
alter table public.dogs enable row level security;
alter table public.sessions enable row level security;
alter table public.walks enable row level security;
alter table public.patterns enable row level security;

drop policy if exists "Public dog access" on public.dogs;
create policy "Public dog access" on public.dogs for all using (true) with check (true);

drop policy if exists "Public session access" on public.sessions;
create policy "Public session access" on public.sessions for all using (true) with check (true);

drop policy if exists "Public walk access" on public.walks;
create policy "Public walk access" on public.walks for all using (true) with check (true);

drop policy if exists "Public pattern access" on public.patterns;
create policy "Public pattern access" on public.patterns for all using (true) with check (true);

commit;
