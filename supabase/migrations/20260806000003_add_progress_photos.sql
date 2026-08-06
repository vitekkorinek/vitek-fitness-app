-- Progress photos. PRIVATE BY DEFAULT — the client owns them and the trainer sees
-- nothing until the client shares that individual photo.
--
-- ⚠️ This is the first PRIVATE bucket in the app; every other one is public and
-- serves getPublicUrl(). Reads here go through createSignedUrl(). Body photos are
-- why CLAUDE.md §8 rejected client-body workout covers — that rejection was about
-- them being PUBLIC. This is acceptable precisely because it is not.
create table if not exists public.progress_photos (
  id                  uuid        primary key default gen_random_uuid(),
  client_id           uuid        not null references public.users(id) on delete cascade,
  slot                text        not null,
  date                date        not null,
  storage_path        text        not null unique,
  shared_with_trainer boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists idx_progress_photos_client_slot
  on public.progress_photos (client_id, slot, date);

alter table public.progress_photos enable row level security;

create policy "progress photos: client manages own"
  on public.progress_photos for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- ⚠️ SELECT only, and ONLY the shared rows. The trainer deliberately does NOT get
-- the blanket is_trainer() ALL policy every other table gives them.
create policy "progress photos: trainer reads shared only"
  on public.progress_photos for select
  using (is_trainer() and shared_with_trainer);

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "progress photos storage: client manages own folder"
  on storage.objects for all
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "progress photos storage: trainer reads shared only"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and is_trainer()
    and exists (
      select 1 from public.progress_photos p
      where p.storage_path = storage.objects.name
        and p.shared_with_trainer
    )
  );
