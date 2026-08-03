import { supabase } from '@/lib/supabase';

/**
 * "Is this session row still the one I am running?" — the last line of defence in
 * front of Do Mode's DESTRUCTIVE discard path.
 *
 * ⚠️ Discard used to delete `sessions` (and every `session_log` under it) by id with
 * no status test at all, which is fine only while the id in hand is guaranteed to be
 * a running session. It is not: the suspended-session chip survived FINISH (it was
 * cleared by whoever consumed it, and finishing consumed nothing), so tapping it
 * reopened Do Mode on an id that had already been COMPLETED — looking untouched,
 * because the draft was wiped at finish. Discarding from there wiped a real client's
 * finished session and all of its logs, unrecoverably (Bastian, 3 Aug 2026).
 *
 * The chip is cleared at finish now, so the stale id should never arrive. This exists
 * for the case where one does anyway.
 *
 * **Fails CLOSED — an unreachable server answers "no".** Refusing to discard leaves a
 * stale `in_progress` row, which shows as an IN PROGRESS card and can be discarded
 * again later; the opposite mistake destroys a session that cannot be restored. The
 * caller clears its local state regardless, so the screen still exits.
 */
export async function isSessionStillRunning(sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('status')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) return false;
    return (data as any)?.status === 'in_progress';
  } catch {
    return false;
  }
}
