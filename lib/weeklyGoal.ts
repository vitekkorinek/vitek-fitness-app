import { supabase } from './supabase';

// ─── Weekly session goal (trainer-set, effective-dated) ───────────────────────
//
// The goal a client should train per week is set by the trainer in the client Info
// tab. It is a STABLE value: once set it applies to every week going forward until the
// trainer changes it — and a change takes effect from the FOLLOWING week (the current
// and past weeks keep the previous number, so it is never applied retroactively).
//
// Storage (on `users`):
//   weekly_session_goal              → the current/latest value (what the picker shows)
//   weekly_session_goal_effective_from → the Monday (YYYY-MM-DD) the current value applies from
//   weekly_session_goal_prev         → the value that applied BEFORE that Monday
//
// The client's per-week availability request (`availability_submissions.sessions_wanted`)
// is deliberately NOT part of this — that is a separate concept and was what made the
// displayed goal flip week to week.

export type WeeklyGoalRow = {
  weekly_session_goal: number | null;
  weekly_session_goal_prev: number | null;
  weekly_session_goal_effective_from: string | null;
};

/** Resolve the effective goal for a given week (its Monday, YYYY-MM-DD) from an already
 *  fetched users row. */
export function resolveWeeklyGoal(row: WeeklyGoalRow | null | undefined, weekMonday: string): number | null {
  if (!row) return null;
  const cur = row.weekly_session_goal ?? null;
  const from = row.weekly_session_goal_effective_from ?? null;
  // No versioning recorded yet → the current value applies to every week.
  if (from == null) return cur;
  // Lexicographic compare works for YYYY-MM-DD.
  if (weekMonday >= from) return cur;
  return row.weekly_session_goal_prev ?? cur;
}

/** Fetch + resolve the effective goal for a client for a given week (its Monday). */
export async function fetchWeeklyGoalForWeek(clientId: string, weekMonday: string): Promise<number | null> {
  const { data } = await supabase
    .from('users')
    .select('weekly_session_goal, weekly_session_goal_prev, weekly_session_goal_effective_from')
    .eq('id', clientId)
    .maybeSingle();
  return resolveWeeklyGoal(data as WeeklyGoalRow | null, weekMonday);
}

/** The Monday of the week containing `d` (local), and the Monday one week later. */
export function mondayOf(d: Date): string {
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
}

export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
