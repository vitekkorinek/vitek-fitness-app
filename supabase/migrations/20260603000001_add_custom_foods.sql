create table custom_foods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  name text not null,
  brand text,
  calories_per_100g numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sugar_g numeric,
  salt_g numeric,
  default_portion_amount numeric default 100,
  default_portion_unit text default 'g',
  created_at timestamptz default now()
);

alter table custom_foods enable row level security;

create policy "client_own_custom_foods" on custom_foods
  for all using (client_id = auth.uid());
