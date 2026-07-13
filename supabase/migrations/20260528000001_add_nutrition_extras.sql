-- 1. Add water_target_ml to client_nutrition_targets
alter table client_nutrition_targets add column if not exists water_target_ml integer;

-- 2. water_logs
create table water_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  date date not null,
  glasses_count integer not null default 0,
  created_at timestamptz default now(),
  unique(client_id, date)
);

alter table water_logs enable row level security;

create policy "client_manage_own_water_logs"
  on water_logs
  for all
  using (client_id = auth.uid());

create policy "trainer_read_water_logs"
  on water_logs
  for select
  using (exists (select 1 from users where id = auth.uid() and role = 'trainer'));

-- 3. favourite_days
create table favourite_days (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  name text not null,
  date_reference date not null,
  snapshot_json jsonb not null,
  created_at timestamptz default now()
);

alter table favourite_days enable row level security;

create policy "client_manage_own_favourite_days"
  on favourite_days
  for all
  using (client_id = auth.uid());

-- 4. grocery_list_items
create table grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  name text not null,
  quantity text,
  is_checked boolean default false,
  created_at timestamptz default now()
);

alter table grocery_list_items enable row level security;

create policy "client_manage_own_grocery_list_items"
  on grocery_list_items
  for all
  using (client_id = auth.uid());
