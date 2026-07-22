import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local snapshot of a running Do Mode session.
 *
 * Weights, reps and done-marks live ONLY in component state until FINISH writes
 * them to `session_logs`. So anything that unmounts Do Mode — swiping back,
 * "Leave — keep it running", the app being backgrounded and reclaimed by iOS —
 * used to wipe every logged number (notes and photos survived because they are
 * written to the DB the moment they're added). This draft is the safety net:
 * it is written on every change while a session is in progress and merged back
 * over the freshly loaded workout when Do Mode reopens.
 */

const KEY_PREFIX = 'sessionDraft:v1:';
// A draft older than this is assumed abandoned (a session never runs 2 days).
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

export type SessionDraft = {
  version: 1;
  clientId: string;
  workoutId: string;
  activeSessionId: string | null;
  startedAt: number | null;
  savedAt: number;
  /** Full snapshot of the Do Mode `exercises` array (plain JSON — no class instances). */
  exercises: any[];
  barbellWeights: [string, number][];
  machineBrands: [string, string][];
};

const keyFor = (clientId: string, workoutId: string) => `${KEY_PREFIX}${clientId}:${workoutId}`;

export async function saveSessionDraft(draft: SessionDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(draft.clientId, draft.workoutId), JSON.stringify(draft));
  } catch (err) {
    console.log('[sessionDraft] save failed:', err);
  }
}

export async function loadSessionDraft(clientId: string, workoutId: string): Promise<SessionDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(clientId, workoutId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as SessionDraft;
    if (draft?.version !== 1 || !Array.isArray(draft.exercises)) return null;
    if (Date.now() - (draft.savedAt ?? 0) > MAX_AGE_MS) {
      await clearSessionDraft(clientId, workoutId);
      return null;
    }
    return draft;
  } catch (err) {
    console.log('[sessionDraft] load failed:', err);
    return null;
  }
}

export async function clearSessionDraft(clientId: string, workoutId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(clientId, workoutId));
  } catch (err) {
    console.log('[sessionDraft] clear failed:', err);
  }
}

type AnySet = {
  localId: string;
  workoutSetId: string | null;
  setNumber: number;
  isDropset: boolean;
  weightKg: string;
  repsCompleted: string;
  isRemoved: boolean;
  isDone: boolean;
};
type AnyExercise = {
  workoutExerciseId: string;
  isDone: boolean;
  isSuperset: boolean;
  supersetGroupId: string | null;
  sets: AnySet[];
};

/**
 * Overlay a draft onto exercises freshly loaded from the DB.
 *
 * The DB row stays the source of truth for everything the trainer can't change
 * mid-session (names, media, notes, targets, first-session peek data); the draft
 * supplies only what the session itself produced — entered weights/reps, done
 * marks, removed/added sets, and any exercise added mid-session (which has no DB
 * row at all, so it is carried over from the draft wholesale).
 */
export function mergeDraftIntoExercises<T extends AnyExercise>(loaded: T[], draftExercises: T[]): T[] {
  if (!draftExercises?.length) return loaded;
  const loadedById = new Map(loaded.map(ex => [ex.workoutExerciseId, ex]));
  const used = new Set<string>();

  const merged: T[] = draftExercises.map(d => {
    const base = loadedById.get(d.workoutExerciseId);
    if (!base) return d; // added mid-session — exists only in the draft
    used.add(d.workoutExerciseId);
    return {
      ...base,
      isDone: d.isDone,
      isSuperset: d.isSuperset,
      supersetGroupId: d.supersetGroupId,
      sets: mergeSets(base.sets, d.sets),
    };
  });

  // Exercises added to the workout (elsewhere) after the draft was written.
  loaded.forEach(ex => { if (!used.has(ex.workoutExerciseId)) merged.push(ex); });
  return merged;
}

function mergeSets(loadedSets: AnySet[], draftSets: AnySet[]): AnySet[] {
  const byWorkoutSetId = new Map<string, AnySet>();
  loadedSets.forEach(s => { if (s.workoutSetId) byWorkoutSetId.set(s.workoutSetId, s); });

  return draftSets.map(d => {
    const base = d.workoutSetId ? byWorkoutSetId.get(d.workoutSetId) : undefined;
    if (!base) return d; // set added during the session
    return {
      ...base,
      setNumber: d.setNumber,
      weightKg: d.weightKg,
      repsCompleted: d.repsCompleted,
      isRemoved: d.isRemoved,
      isDone: d.isDone,
    };
  });
}
