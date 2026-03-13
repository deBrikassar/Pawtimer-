-- Feeding logs for Train tab
create table if not exists public.feedings (
  id text primary key,
  dog_id text not null references public.dogs(id) on delete cascade,
  date timestamptz not null,
  food_type text not null check (food_type in ('meal', 'treat', 'kong', 'lick mat', 'chew')),
  amount text not null check (amount in ('small', 'medium', 'large'))
);

create index if not exists feedings_dog_id_date_idx on public.feedings (dog_id, date asc);
