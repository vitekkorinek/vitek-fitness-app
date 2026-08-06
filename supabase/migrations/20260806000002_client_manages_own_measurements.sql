-- measurements: the client could READ their own rows but never write one, while
-- the UI has shown them an "Add measurement" button all along. It looked fine
-- only because Vitek's own account passes is_trainer(); a real client's add hit
-- RLS and failed SILENTLY (zero rows matched, no error).
--
-- A client may add, and may edit/delete WHAT THEY THEMSELVES ENTERED. Trainer
-- rows stay untouchable: a blanket `client_id = auth.uid()` would also let a
-- client delete a measurement Vitek took, and there is no PITR on this plan.
create policy "measurements: client inserts own"
  on public.measurements for insert
  with check (client_id = auth.uid() and created_by = auth.uid());

create policy "measurements: client updates own entries"
  on public.measurements for update
  using (client_id = auth.uid() and created_by = auth.uid())
  with check (client_id = auth.uid() and created_by = auth.uid());

create policy "measurements: client deletes own entries"
  on public.measurements for delete
  using (client_id = auth.uid() and created_by = auth.uid());

-- Same rule for the tape table, which shipped an hour ago with a blanket
-- "client manages own" — replaced so the two behave identically.
drop policy if exists "tape measurements: client manages own" on public.body_tape_measurements;

create policy "tape measurements: client reads own"
  on public.body_tape_measurements for select
  using (client_id = auth.uid());

create policy "tape measurements: client inserts own"
  on public.body_tape_measurements for insert
  with check (client_id = auth.uid() and created_by = auth.uid());

create policy "tape measurements: client updates own entries"
  on public.body_tape_measurements for update
  using (client_id = auth.uid() and created_by = auth.uid())
  with check (client_id = auth.uid() and created_by = auth.uid());

create policy "tape measurements: client deletes own entries"
  on public.body_tape_measurements for delete
  using (client_id = auth.uid() and created_by = auth.uid());
