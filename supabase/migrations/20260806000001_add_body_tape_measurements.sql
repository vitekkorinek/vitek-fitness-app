-- Tape measurements — LONG format, one row per site per date.
-- Long on purpose: Vitek's spec was "biceps, or anything", so adding a new site
-- must never need a migration. A wide table would need one every time.
create table if not exists public.body_tape_measurements (
  id         uuid        primary key default gen_random_uuid(),
  client_id  uuid        not null references public.users(id) on delete cascade,
  date       date        not null,
  -- Stable preset KEY (e.g. 'biceps_l') or the raw text of a custom site.
  -- Never the display label: renaming a preset must not orphan its history.
  site       text        not null,
  value_cm   numeric(6,1) not null,
  created_by uuid        not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, date, site)
);

create index if not exists idx_btm_client_date on public.body_tape_measurements (client_id, date desc);
create index if not exists idx_btm_client_site on public.body_tape_measurements (client_id, site);

alter table public.body_tape_measurements enable row level security;

-- Mirrors `measurements`, plus client INSERT/UPDATE of their own rows so a client
-- can record between sessions. `created_by` is what tells the two apart in the UI.
create policy "tape measurements: trainer all"
  on public.body_tape_measurements for all
  using (is_trainer());

create policy "tape measurements: client manages own"
  on public.body_tape_measurements for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid());
