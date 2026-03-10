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
  created_at       timestamptz default now()
);

-- 3. Walks table — one row per "walked together" log
create table if not exists walks (
  id         text primary key,        -- e.g. "walk-LUNA-4829-1712345678000"
  dog_id     text not null references dogs(id) on delete cascade,
  date       timestamptz not null,
  created_at timestamptz default now()
);

-- Indexes for fast lookups by dog
create index if not exists sessions_dog_id_idx on sessions(dog_id);
create index if not exists walks_dog_id_idx    on walks(dog_id);

-- ============================================================
-- Row Level Security (RLS)
-- The app uses the anon key — no accounts, just dog IDs.
-- Anyone who knows the dog ID can read/write to it.
-- This is intentional (shared partner access).
-- ============================================================

alter table dogs     enable row level security;
alter table sessions enable row level security;
alter table walks    enable row level security;

-- Allow all operations via the anon key (public, ID-gated access)
create policy "Public dog access"      on dogs     for all using (true) with check (true);
create policy "Public session access"  on sessions for all using (true) with check (true);
create policy "Public walk access"     on walks    for all using (true) with check (true);
