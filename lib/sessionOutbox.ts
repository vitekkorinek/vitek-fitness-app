import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * ─── FINISHING A SESSION IS A LOCAL ACT. UPLOADING IT IS A BACKGROUND CHORE. ───
 *
 * Do Mode used to treat FINISH as "write it to the server, and only then is the session
 * over" — so with no connection the session simply could not end. A real client, 29 July
 * 2026: Finish closed its confirm and did nothing at all, he tapped it repeatedly, left the
 * session still running, and force-quit the app. Vitek's read of it is the right one:
 * people train in the same spot every week, so someone who finishes without signal almost
 * certainly STARTED without signal — "wait for the connection to come back" is a bad bet.
 *
 * So Finish now writes a **job** to this outbox (an AsyncStorage write — it cannot fail for
 * network reasons), the session closes on the spot, and the job is uploaded whenever a
 * connection exists: right away if there is one, otherwise on the next app start or
 * foreground. Nothing about that depends on Do Mode still being on screen, which is what
 * made the previous in-screen retry timer die with a force-quit.
 *
 * ⚠️ THE SESSION ID IS GENERATED ON THE DEVICE. That is what makes the whole thing work
 * offline: the session has an identity before the server has ever heard of it, so every
 * write in the job can be addressed by id, every step is idempotent, and a half-uploaded
 * job resumes instead of duplicating. Never go back to "insert, then learn the id".
 */

const KEY = 'sessionOutbox:v1';
/** A job older than this is beyond saving — a week-old session is not worth re-uploading. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** `makeUUID()` per the app-wide rule — never the `uuid` package, never crypto.randomUUID. */
export const makeUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export type NewSetRow = {
  set_number: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  is_warmup: boolean;
};

export type OutboxLog = {
  /** May be a LOCAL id for an exercise added mid-session — resolved at flush time. */
  weId: string;
  weIsLocal: boolean;
  set_number: number;
  reps_completed: number | null;
  weight_kg: number | null;
  barbell_weight_used_kg: number | null;
  machine_brand: string | null;
  is_removed: boolean;
  is_warmup: boolean;
  is_dropset: boolean;
  dropset_order: number | null;
  notes: string | null;
};

export type FinishJob = {
  version: 1;
  jobId: string;
  queuedAt: number;

  /** Known before the server is ever contacted — see the id note above. */
  sessionId: string;
  /** The `in_progress` row to finalise. Same as sessionId when one was adopted/converted. */
  runningSessionId: string | null;
  clientId: string;
  workoutId: string | null;
  isFreeSession: boolean;
  freeSessionName: string | null;
  /** The training day (YYYY-MM-DD) — a past-day log keeps the day it was logged for. */
  logDate: string;
  durationSeconds: number | null;
  /** Who wrote the notes in this job (`profile.id`). */
  authorId: string | null;

  addedExercises: { localWeId: string; exerciseId: string; sets: NewSetRow[]; realWeId?: string | null; setsDone?: boolean }[];
  extraSets: { workoutExerciseId: string; sets: NewSetRow[] }[];
  replacedExercises: { workoutExerciseId: string; exerciseId: string; originalExerciseId: string; slotNumber: number }[];
  interactionOrder: { workoutExerciseId: string; exerciseId: string; slotNumber: number; position: number }[];
  logs: OutboxLog[];
  setNotes: { id: string; content: string; role: 'trainer' | 'client'; workoutSetId: string }[];
  trainingNotes: { id: string; content: string; role: 'trainer' | 'client' }[];
  deleteNoteIds: string[];
  photos: { weId: string; weIsLocal: boolean; photoUrl: string }[];

  /**
   * Which stages already landed. A flush resumes from where it stopped instead of
   * replaying writes that are NOT idempotent (inserting the same added exercise twice
   * would give the client a duplicate exercise in their workout, forever).
   */
  done: {
    session?: boolean;
    extraSets?: boolean;
    replaced?: boolean;
    order?: boolean;
    logs?: boolean;
    notes?: boolean;
    photos?: boolean;
  };
};

// ─── Queue storage ──────────────────────────────────────────────────────────────

async function readAll(): Promise<FinishJob[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const jobs = JSON.parse(raw) as FinishJob[];
    if (!Array.isArray(jobs)) return [];
    return jobs.filter(j => j?.version === 1 && Date.now() - (j.queuedAt ?? 0) < MAX_AGE_MS);
  } catch (err) {
    console.log('[outbox] read failed:', err);
    return [];
  }
}

async function writeAll(jobs: FinishJob[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(jobs));
  } catch (err) {
    console.log('[outbox] write failed:', err);
  }
}

/** Persist one job's progress without disturbing anything queued alongside it. */
async function patchJob(job: FinishJob): Promise<void> {
  const jobs = await readAll();
  const i = jobs.findIndex(j => j.jobId === job.jobId);
  if (i === -1) return;
  jobs[i] = job;
  await writeAll(jobs);
}

async function removeJob(jobId: string): Promise<void> {
  const jobs = await readAll();
  await writeAll(jobs.filter(j => j.jobId !== jobId));
}

/** Queue a finished session. This is the moment the session is "saved" from the user's side. */
export async function enqueueFinishJob(job: FinishJob): Promise<void> {
  const jobs = await readAll();
  await writeAll([...jobs.filter(j => j.jobId !== job.jobId), job]);
  console.log('[outbox] queued session', job.sessionId, `(${job.logs.length} logs)`);
}

export async function outboxCount(): Promise<number> {
  return (await readAll()).length;
}

/**
 * Is this session's *content* still stuck on the phone?
 *
 * Deliberately narrower than "is it queued": a job hangs around until its last photo is
 * uploaded too, but the session and its numbers may already be on the server — and those
 * are what the overview needs. Answering "yes, still pending" for a stray photo would tell
 * the client there is no internet when there plainly is.
 */
export async function isSessionPending(sessionId: string): Promise<boolean> {
  return (await readAll()).some(j => j.sessionId === sessionId && !(j.done.session && j.done.logs));
}

// ─── Uploading ──────────────────────────────────────────────────────────────────

let flushing = false;

/**
 * Push every queued session to the server. Safe to call at any time and from anywhere —
 * concurrent calls collapse into one, and a job that fails stays queued for the next go.
 *
 * Returns the number of jobs still waiting afterwards, so a caller that wants to know
 * whether *its* save got through can check.
 */
export async function flushSessionOutbox(): Promise<number> {
  // ⚠️ THIS DEPENDS ON THE REQUEST DEADLINE IN lib/supabase.ts — do not remove it there.
  // `flushing` is only cleared in the `finally`, so an upload that never settles (React
  // Native's fetch has no timeout of its own) would leave this latched true forever: every
  // later flush — app start, foreground, the next finish — would return immediately having
  // done nothing, and the queue would sit there until the app was restarted. The outbox
  // would be disabled by exactly the connection it exists to survive.
  if (flushing) return (await readAll()).length;
  flushing = true;
  try {
    const jobs = await readAll();
    for (const job of jobs) {
      try {
        const ok = await uploadJob(job);
        if (ok) await removeJob(job.jobId);
      } catch (err) {
        console.log('[outbox] job threw, leaving it queued:', err);
      }
    }
    const left = (await readAll()).length;
    if (jobs.length) console.log(`[outbox] flush done — ${jobs.length - left}/${jobs.length} uploaded`);
    return left;
  } finally {
    flushing = false;
  }
}

/**
 * Replays one job's writes in the same order `saveSession` used to.
 *
 * Returns true only when EVERY stage has landed; anything short of that leaves the job
 * queued for the next flush. Each stage records itself in `job.done` the moment it
 * succeeds — and only then. An earlier version marked the trailing stages done regardless
 * of their error "because the session itself was safe", and a replay test caught what that
 * really meant: a set added mid-session and a photo the client took were both dropped on
 * the floor, permanently, the first time their insert failed.
 */
async function uploadJob(job: FinishJob): Promise<boolean> {
  const { sessionId } = job;

  // 1. The session row. Finalise the running row if there is one; otherwise insert with
  //    OUR id, so a retry after a timeout updates the same row instead of adding a second.
  if (!job.done.session) {
    let landed = false;
    if (job.runningSessionId) {
      // Deliberately does NOT set `date` — a past-day log must keep the day it was for.
      const { data, error } = await supabase
        .from('sessions')
        .update({ status: 'completed', duration_seconds: job.durationSeconds })
        .eq('id', job.runningSessionId)
        .select('id');
      if (error) console.log('[outbox] sessions update error:', error.message);
      landed = !!(data as any[])?.length;
    }
    if (!landed) {
      const { error } = await supabase.from('sessions').upsert({
        id: sessionId,
        workout_id: job.isFreeSession ? null : job.workoutId,
        client_id: job.clientId,
        date: job.logDate,
        status: 'completed',
        duration_seconds: job.durationSeconds,
        ...(job.isFreeSession ? { name: job.freeSessionName } : {}),
      });
      if (error) { console.log('[outbox] sessions upsert error:', error.message); return false; }
    }
    job.done.session = true;
    await patchJob(job);
  }

  // 2. Exercises added mid-session. NOT idempotent, so each one records its real id the
  //    moment it lands — a re-run would otherwise give the client the same exercise twice.
  if (job.addedExercises.some(a => !a.realWeId) && !job.isFreeSession && job.workoutId) {
    const { data: topWe } = await supabase
      .from('workout_exercises')
      .select('order_index')
      .eq('workout_id', job.workoutId)
      .order('order_index', { ascending: false })
      .limit(1);
    let nextIdx = ((topWe as any[])?.[0]?.order_index ?? 0) + 1;
    for (const added of job.addedExercises) {
      if (added.realWeId) continue;
      const { data: inserted, error } = await supabase
        .from('workout_exercises')
        .insert({ workout_id: job.workoutId, exercise_id: added.exerciseId, order_index: nextIdx })
        .select('id')
        .single();
      if (error || !inserted) { console.log('[outbox] workout_exercises insert failed:', error?.message); return false; }
      added.realWeId = (inserted as any).id as string;
      await patchJob(job);
      nextIdx++;
    }
  }
  // Their sets are a separate step keyed on `setsDone` — folding them into the block above
  // meant that once the exercise landed, a resumed job skipped straight past its sets and
  // they were gone for good.
  for (const added of job.addedExercises) {
    if (!added.realWeId || added.setsDone || !added.sets.length) continue;
    const { error } = await supabase.from('workout_sets').insert(
      added.sets.map(s => ({ ...s, workout_exercise_id: added.realWeId, rest_seconds: null, is_added_during_session: true }))
    );
    if (error) { console.log('[outbox] workout_sets insert failed:', error.message); return false; }
    added.setsDone = true;
    await patchJob(job);
  }

  const realWeId = (weId: string, isLocal: boolean) =>
    isLocal ? job.addedExercises.find(a => a.localWeId === weId)?.realWeId ?? null : weId;

  // 2b. Sets added mid-session to exercises that already existed.
  if (!job.done.extraSets) {
    for (const ex of job.extraSets) {
      if (!ex.sets.length) continue;
      const { error } = await supabase.from('workout_sets').insert(
        ex.sets.map(s => ({ ...s, workout_exercise_id: ex.workoutExerciseId, rest_seconds: null, is_added_during_session: true }))
      );
      // ⚠️ Marking the stage done regardless is how a set the client added mid-session used
      // to vanish: the insert failed, the flag said otherwise, and no retry ever came.
      if (error) { console.log('[outbox] extra workout_sets insert failed:', error.message); return false; }
    }
    job.done.extraSets = true;
    await patchJob(job);
  }

  // 3. Swapped exercises + their slot history.
  if (!job.done.replaced && job.workoutId) {
    for (const r of job.replacedExercises) {
      await supabase.from('workout_exercises').update({ exercise_id: r.exerciseId }).eq('id', r.workoutExerciseId);
      const { data: slotRow } = await supabase
        .from('workout_exercise_slots')
        .upsert(
          { workout_id: job.workoutId, slot_number: r.slotNumber, original_exercise_id: r.originalExerciseId, current_exercise_id: r.exerciseId },
          { onConflict: 'workout_id,slot_number' }
        )
        .select('id')
        .single();
      if (slotRow) {
        await supabase.from('slot_replacement_history').insert({
          slot_id: (slotRow as any).id,
          exercise_id: r.exerciseId,
          replaced_on: job.logDate,
          session_id: sessionId,
          is_permanent: true,
        });
      }
    }
    job.done.replaced = true;
    await patchJob(job);
  }

  // 3b. The order the exercises were actually worked in.
  if (!job.done.order && job.workoutId) {
    for (const o of job.interactionOrder) {
      const { data: existing } = await supabase
        .from('workout_exercise_slots')
        .select('id')
        .eq('workout_id', job.workoutId)
        .eq('slot_number', o.slotNumber)
        .maybeSingle();
      let slotId: string | null = existing ? (existing as any).id : null;
      if (!slotId) {
        const { data: newSlot } = await supabase
          .from('workout_exercise_slots')
          .insert({ workout_id: job.workoutId, slot_number: o.slotNumber, original_exercise_id: o.exerciseId, current_exercise_id: o.exerciseId })
          .select('id').single();
        if (newSlot) slotId = (newSlot as any).id;
      }
      if (slotId) {
        await supabase.from('slot_order_history').insert({
          slot_id: slotId,
          performed_at_position: o.position,
          session_id: sessionId,
          is_permanent: false,
          changed_on: job.logDate,
        });
      }
    }
    job.done.order = true;
    await patchJob(job);
  }

  // 4. ⚠️ THE NUMBERS. Delete-then-insert so a replay can never double a set: a request
  //    can time out AFTER the server applied it. Only this session's own rows are touched.
  if (!job.done.logs) {
    const rows = job.logs
      .map(l => {
        const we = realWeId(l.weId, l.weIsLocal);
        if (!we) return null; // its exercise never made it — skip rather than fail the FK
        const { weId: _w, weIsLocal: _l, ...rest } = l;
        return { ...rest, session_id: sessionId, workout_exercise_id: we };
      })
      .filter(Boolean);
    if (rows.length) {
      await supabase.from('session_logs').delete().eq('session_id', sessionId);
      const { error } = await supabase.from('session_logs').insert(rows);
      if (error) {
        // The session is worthless without its logs — do not call this job done, and put
        // the row back to in_progress so nothing shows a completed session with no weights.
        console.log('[outbox] session_logs insert failed:', error.message);
        await supabase.from('sessions').update({ status: 'in_progress' }).eq('id', sessionId);
        job.done.session = false;
        await patchJob(job);
        return false;
      }
    }
    job.done.logs = true;
    await patchJob(job);
  }

  // 5. Best-effort tail: notes and photos. A failure here is logged, not retried forever —
  //    the session and its numbers are already safe, and holding the job open for a note
  //    would keep re-running the whole upload on every app start.
  if (!job.done.notes) {
    if (job.authorId) {
      if (job.setNotes.length) {
        const { error } = await supabase.from('notes').upsert(job.setNotes.map(n => ({
          id: n.id, content: n.content, role: n.role, level: 'set', reference_id: n.workoutSetId, created_by: job.authorId,
        })));
        if (error) { console.log('[outbox] set notes upsert failed:', error.message); return false; }
      }
      if (job.trainingNotes.length) {
        const { error } = await supabase.from('notes').upsert(job.trainingNotes.map(n => ({
          id: n.id, content: n.content, role: n.role, level: 'training', reference_id: sessionId, created_by: job.authorId,
        })));
        if (error) { console.log('[outbox] training notes upsert failed:', error.message); return false; }
      }
    }
    if (job.deleteNoteIds.length) {
      const { error } = await supabase.from('notes').delete().in('id', job.deleteNoteIds);
      if (error) { console.log('[outbox] note deletes failed:', error.message); return false; }
    }
    job.done.notes = true;
    await patchJob(job);
  }

  if (!job.done.photos) {
    const rows = job.photos
      .map(p => {
        const we = realWeId(p.weId, p.weIsLocal);
        return we ? { session_id: sessionId, workout_exercise_id: we, photo_url: p.photoUrl } : null;
      })
      .filter(Boolean);
    if (rows.length) {
      const { error } = await supabase.from('session_exercise_photos').insert(rows);
      // A photo the client took is their data — retry it rather than drop it silently.
      if (error) { console.log('[outbox] session photos insert failed:', error.message); return false; }
    }
    job.done.photos = true;
    await patchJob(job);
  }

  console.log('[outbox] uploaded session', sessionId);
  return true;
}
