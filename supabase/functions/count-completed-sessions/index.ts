import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async () => {
  const now = new Date().toISOString();

  // Find all scheduled PT sessions whose end time has passed.
  // Skip drafts (sent_to_client = false) — unsent planned appointments must never
  // auto-complete or consume a package session.
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id, client_id, duration_minutes, date, start_time')
    .eq('status', 'scheduled')
    .eq('type', 'pt_session')
    .eq('sent_to_client', true)
    .not('client_id', 'is', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const completed: string[] = [];
  const errors: string[] = [];

  for (const appt of appts ?? []) {
    // Build end datetime from date + start_time + duration
    const endDt = new Date(`${appt.date}T${appt.start_time}`);
    endDt.setMinutes(endDt.getMinutes() + appt.duration_minutes);

    if (endDt > new Date(now)) continue; // not finished yet

    // Mark appointment completed
    const { error: updErr } = await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', appt.id);
    if (updErr) { errors.push(`appt ${appt.id}: ${updErr.message}`); continue; }

    // Find client's active package
    const { data: pkg } = await supabase
      .from('session_packages')
      .select('id, sessions_used, total_sessions')
      .eq('client_id', appt.client_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (!pkg) { completed.push(appt.id); continue; }

    const newUsed = (pkg.sessions_used ?? 0) + 1;
    const newStatus = newUsed >= pkg.total_sessions ? 'completed' : 'active';

    const { error: pkgErr } = await supabase
      .from('session_packages')
      .update({ sessions_used: newUsed, status: newStatus })
      .eq('id', pkg.id);

    if (pkgErr) errors.push(`pkg ${pkg.id}: ${pkgErr.message}`);
    else completed.push(appt.id);
  }

  return new Response(
    JSON.stringify({ completed: completed.length, errors }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
