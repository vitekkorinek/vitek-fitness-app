-- Total weight moved (Σ weight × reps) per session date, aggregated IN POSTGRES.
--
-- ⚠️ Doing this client-side is a trap twice over: passing every session id into
-- one `.in()` filter blows the URL length (169 UUIDs ≈ 6KB and it returns
-- nothing), and reading the raw rows hits PostgREST's default 1000-row cap —
-- this client already has 1283 log rows, so a fifth of the volume would go
-- missing silently and the totals would just look a bit low.
--
-- SECURITY INVOKER (the default) on purpose: RLS still applies to the caller, so
-- a client sees only their own and the trainer keeps their existing access. Do
-- NOT make this SECURITY DEFINER — it takes a client id as an argument.
create or replace function public.client_volume_by_date(p_client uuid)
returns table (day date, volume numeric)
language sql
stable
as $$
  select s.date, sum(l.weight_kg * l.reps_completed)
  from public.session_logs l
  join public.sessions s on s.id = l.session_id
  where s.client_id = p_client
    and s.status = 'completed'
    and l.is_removed = false
    and l.weight_kg is not null
    and l.reps_completed is not null
  group by s.date;
$$;

grant execute on function public.client_volume_by_date(uuid) to authenticated;
