create table nutrition_tips (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid references users(id) on delete cascade,
  title text not null,
  body text,
  category text check (category in ('tip', 'supplement')) default 'tip',
  is_published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table nutrition_tips enable row level security;

create policy "trainer_manage_own_tips"
  on nutrition_tips
  for all
  using (trainer_id = auth.uid());

create policy "client_read_tips"
  on nutrition_tips
  for select
  using (is_published = true);
