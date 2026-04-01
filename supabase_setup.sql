-- ============================================================
-- PawTimer — Supabase database setup
-- Run this entire file in: Supabase → SQL Editor → New query
-- ============================================================

-- 1. Dogs table — one row per dog, stores settings as JSON
create table if not exists dogs (
  id       text primary key,          -- e.g. "LUNA-4829"
  settings jsonb not null default '{}',
  created_at timestamptz default now()
);

-- 2. Sessions table — one row per training session
create table if not exists sessions (
  id               text primary key,  -- e.g. "LUNA-4829-1712345678000"
  dog_id           text not null references dogs(id) on delete cascade,
  date             timestamptz not null,
  planned_duration integer not null,  -- seconds
  actual_duration  integer not null,  -- seconds
  distress_level   text not null check (distress_level in ('none', 'mild', 'strong')),
  result           text not null check (result in ('success', 'distress')),
  context          jsonb not null default '{}',
  symptoms         jsonb not null default '{}',
  recovery_seconds integer,
  pre_session      jsonb not null default '{}',
  environment      jsonb not null default '{}',
  revision         bigint not null default 0,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz default now()
);

-- 3. Walks table — one row per "walked together" log
create table if not exists walks (
  id         text primary key,        -- e.g. "walk-LUNA-4829-1712345678000"
  dog_id     text not null references dogs(id) on delete cascade,
  date       timestamptz not null,
  duration   integer not null default 0, -- seconds
  walk_type  text not null default 'regular_walk',
  revision   bigint not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz default now()
);

-- 4. Pattern-break table — one row per desensitization cue log
create table if not exists patterns (
  id         text primary key,
  dog_id     text not null references dogs(id) on delete cascade,
  date       timestamptz not null,
  type       text not null check (type in ('keys', 'shoes', 'jacket')),
  revision   bigint not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz default now()
);



-- Compatibility for existing deployments created before sync metadata expansion
alter table if exists sessions
  add column if not exists context jsonb not null default '{}',
  add column if not exists symptoms jsonb not null default '{}',
  add column if not exists recovery_seconds integer,
  add column if not exists pre_session jsonb not null default '{}',
  add column if not exists environment jsonb not null default '{}',
  add column if not exists revision bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists walks
  add column if not exists duration integer not null default 0,
  add column if not exists walk_type text not null default 'regular_walk',
  add column if not exists revision bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

-- Ensure patterns table exists on older environments
create table if not exists patterns (
  id         text primary key,
  dog_id     text not null references dogs(id) on delete cascade,
  date       timestamptz not null,
  type       text not null check (type in ('keys', 'shoes', 'jacket')),
  revision   bigint not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table if exists patterns
  add column if not exists revision bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

-- Indexes for fast lookups by dog
create index if not exists sessions_dog_id_idx on sessions(dog_id);
create index if not exists walks_dog_id_idx    on walks(dog_id);
create index if not exists patterns_dog_id_idx on patterns(dog_id);

-- ============================================================
-- Row Level Security (RLS)
-- The app uses the anon key — no accounts, just dog IDs.
-- Anyone who knows the dog ID can read/write to it.
-- This is intentional (shared partner access).
-- ============================================================

alter table dogs     enable row level security;
alter table sessions enable row level security;
alter table walks    enable row level security;
alter table patterns enable row level security;

-- Allow all operations via the anon key (public, ID-gated access)
create policy "Public dog access"      on dogs     for all using (true) with check (true);
create policy "Public session access"  on sessions for all using (true) with check (true);
create policy "Public walk access"     on walks    for all using (true) with check (true);
create policy "Public pattern access"  on patterns for all using (true) with check (true);
