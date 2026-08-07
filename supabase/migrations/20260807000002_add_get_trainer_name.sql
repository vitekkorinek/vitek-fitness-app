-- The trainer's display name, readable by a signed-in client.
--
-- Why it needs to exist: `users` RLS is `id = auth.uid() OR is_trainer()`, so a
-- client cannot read the trainer's row at all — the long-standing rule that any
-- client-side need for trainer data goes through a SECURITY DEFINER RPC.
--
-- What it is for: the Body composition screen credits every reading to whoever
-- entered it. From the trainer's side a row he entered reads "Added by you"; from
-- the CLIENT's side that same row has to read "Added by <trainer>", and the client
-- has no way to learn that name.
--
-- ⚠️ SECURITY DEFINER is deliberate and safe HERE because the function takes NO
-- ARGUMENTS and returns exactly one public-facing field. That is the line: a
-- definer function that accepts a user id would let any caller read any row, which
-- is why `client_muscle_volume` and `client_volume_by_date` are INVOKER instead.
-- Do not add parameters to this one.
create or replace function public.get_trainer_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select name from public.users where role = 'trainer' limit 1;
$$;

grant execute on function public.get_trainer_name() to authenticated;
