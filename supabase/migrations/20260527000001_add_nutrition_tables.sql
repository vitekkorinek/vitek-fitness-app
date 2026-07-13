-- Client nutrition targets (set by trainer, read-only for client)
create table client_nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  diet_type text check (diet_type in ('omnivore','pescatarian','vegetarian','vegan','keto','carnivore','low-carb','custom')),
  calories integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer,
  fiber_min_g integer,
  sugar_max_g integer,
  salt_max_g integer,
  food_groups_enabled boolean default false,
  set_by uuid references users(id),
  updated_at timestamptz default now()
);

alter table client_nutrition_targets enable row level security;

create policy "trainer_all_nutrition_targets" on client_nutrition_targets
  for all using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'trainer')
  );

create policy "client_read_own_nutrition_targets" on client_nutrition_targets
  for select using (client_id = auth.uid());

-- Daily food log entries
create table food_log_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  date date not null,
  meal_category text check (meal_category in ('breakfast','lunch','dinner','snack')),
  food_name text not null,
  brand text,
  source text check (source in ('off','usda','manual')),
  source_id text,
  portion_amount numeric not null,
  portion_unit text check (portion_unit in ('g','serving','piece','cup','tbsp','tsp','ml')),
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sugar_g numeric,
  salt_g numeric,
  food_groups text[] default '{}',
  created_at timestamptz default now()
);

alter table food_log_entries enable row level security;

create policy "client_manage_own_food_logs" on food_log_entries
  for all using (client_id = auth.uid());

create policy "trainer_read_client_food_logs" on food_log_entries
  for select using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'trainer')
  );

-- Food cache (avoid repeated API calls)
create table food_cache (
  id uuid primary key default gen_random_uuid(),
  source text check (source in ('off','usda')),
  source_id text not null,
  name text not null,
  brand text,
  nutrients_json jsonb not null,
  food_groups text[] default '{}',
  last_fetched timestamptz default now(),
  unique(source, source_id)
);

alter table food_cache enable row level security;

create policy "authenticated_read_food_cache" on food_cache
  for select using (auth.uid() is not null);

create policy "authenticated_insert_food_cache" on food_cache
  for insert with check (auth.uid() is not null);

create policy "authenticated_update_food_cache" on food_cache
  for update using (auth.uid() is not null);

-- Recent foods per client
create table recent_foods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  food_name text not null,
  brand text,
  source text check (source in ('off','usda','manual')),
  source_id text,
  nutrients_json jsonb not null,
  last_used_at timestamptz default now(),
  unique(client_id, source, source_id)
);

alter table recent_foods enable row level security;

create policy "client_manage_own_recent_foods" on recent_foods
  for all using (client_id = auth.uid());

-- Favourite foods per client
create table favourite_foods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  food_name text not null,
  brand text,
  source text check (source in ('off','usda','manual')),
  source_id text,
  nutrients_json jsonb not null,
  created_at timestamptz default now(),
  unique(client_id, source, source_id)
);

alter table favourite_foods enable row level security;

create policy "client_manage_own_favourite_foods" on favourite_foods
  for all using (client_id = auth.uid());

-- Saved meal combos
create table saved_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  name text not null,
  ingredients jsonb not null,
  created_at timestamptz default now()
);

alter table saved_meals enable row level security;

create policy "client_manage_own_saved_meals" on saved_meals
  for all using (client_id = auth.uid());

-- Recipes (trainer-created or client-created)
create table recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text,
  portions integer default 1,
  cover_photo_url text,
  created_by uuid references users(id),
  created_by_role text check (created_by_role in ('trainer','client')),
  is_shared_to_trainer boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table recipes enable row level security;

create policy "trainer_recipes_readable_by_all" on recipes
  for select using (created_by_role = 'trainer' and auth.uid() is not null);

create policy "trainer_manage_own_recipes" on recipes
  for all using (
    created_by = auth.uid() and exists (
      select 1 from users u where u.id = auth.uid() and u.role = 'trainer'
    )
  );

create policy "client_manage_own_recipes" on recipes
  for all using (
    created_by = auth.uid() and exists (
      select 1 from users u where u.id = auth.uid() and u.role = 'client'
    )
  );

create policy "trainer_read_shared_client_recipes" on recipes
  for select using (
    is_shared_to_trainer = true and exists (
      select 1 from users u where u.id = auth.uid() and u.role = 'trainer'
    )
  );

-- Recipe ingredients
create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes(id) on delete cascade,
  food_name text not null,
  brand text,
  source text check (source in ('off','usda','manual')),
  source_id text,
  portion_amount numeric not null,
  portion_unit text check (portion_unit in ('g','serving','piece','cup','tbsp','tsp','ml')),
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sugar_g numeric,
  salt_g numeric,
  order_index integer default 0
);

alter table recipe_ingredients enable row level security;

create policy "recipe_ingredients_follow_recipe" on recipe_ingredients
  for all using (
    exists (
      select 1 from recipes r
      where r.id = recipe_id
        and (
          r.created_by = auth.uid()
          or r.created_by_role = 'trainer'
          or (r.is_shared_to_trainer = true and exists (
            select 1 from users u where u.id = auth.uid() and u.role = 'trainer'
          ))
        )
    )
  );

-- Weekly trainer notes on client nutrition
create table weekly_nutrition_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) on delete cascade,
  trainer_id uuid references users(id),
  week_start date not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(client_id, week_start)
);

alter table weekly_nutrition_notes enable row level security;

create policy "trainer_manage_nutrition_notes" on weekly_nutrition_notes
  for all using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'trainer')
  );

create policy "client_read_own_nutrition_notes" on weekly_nutrition_notes
  for select using (client_id = auth.uid());

-- recipe-covers storage bucket policies
create policy "recipe_covers_public_select" on storage.objects
  for select using (bucket_id = 'recipe-covers');

create policy "recipe_covers_authenticated_insert" on storage.objects
  for insert with check (bucket_id = 'recipe-covers' and auth.uid() is not null);

create policy "recipe_covers_authenticated_update" on storage.objects
  for update using (bucket_id = 'recipe-covers' and auth.uid() is not null);

create policy "recipe_covers_authenticated_delete" on storage.objects
  for delete using (bucket_id = 'recipe-covers' and auth.uid() is not null);
