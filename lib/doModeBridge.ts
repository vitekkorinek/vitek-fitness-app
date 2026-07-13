// Bridges in-memory exercise state between Do Mode and Exercise Detail screens.
// Both screens run in the same JS process, so a module-level singleton is safe.

export interface BridgedNoteEntry {
  id: string;
  text: string;
  date: string;
  isDeleted?: boolean;
}

export interface BridgedSet {
  localId: string;
  workoutSetId: string | null;
  setNumber: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  firstSessionWeightKg: number | null;
  firstSessionReps: number | null;
  repsCompleted: string;
  weightKg: string;
  isRemoved: boolean;
  isDropset: boolean;
  dropsetParentLocalId: string | null;
  trainerNotes: BridgedNoteEntry[];
  clientNotes: BridgedNoteEntry[];
  isAddedDuringSession: boolean;
  isDone: boolean;
  prefillTrendWeight: 'up' | 'down' | 'same' | null;
  prefillTrendReps: 'up' | 'down' | 'same' | null;
}

export interface BridgedExercise {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroups: string[];
  secondaryMuscleGroups: string[];
  isSuperset: boolean;
  supersetGroupId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  equipment: string | null;
  exerciseDescription: string | null;
  trainerNotes: BridgedNoteEntry[];
  clientNotes: BridgedNoteEntry[];
  sets: BridgedSet[];
  slotNumber: number | null;
  targetBarbellWeightKg: number | null;
  firstSessionBarbellWeightKg: number | null;
  firstSessionMachineBrand: string | null;
  currentMachineBrand: string | null;
  isChecked: boolean;
  movedFromLabel: string | null;
}

export type SetUpdateField = 'repsCompleted' | 'weightKg';

export interface PendingSetUpdate {
  workoutExerciseId: string;
  setLocalId: string;
  field: SetUpdateField;
  value: string;
}

let _exercises: BridgedExercise[] = [];
// Note IDs soft-deleted in exercise-detail, to be permanently deleted at saveSession time
const _pendingNoteDeletes = new Set<string>();

export function addPendingNoteDelete(noteId: string): void { _pendingNoteDeletes.add(noteId); }
export function removePendingNoteDelete(noteId: string): void { _pendingNoteDeletes.delete(noteId); }
export function flushPendingNoteDeletes(): string[] {
  const ids = [..._pendingNoteDeletes];
  _pendingNoteDeletes.clear();
  return ids;
}

// Keyed by `${weId}:${setLocalId}:${field}` to deduplicate rapid edits
const _pendingSetUpdates = new Map<string, PendingSetUpdate>();
const _pendingBarbellUpdates = new Map<string, number>(); // weId → kg
const _pendingCheckUpdates = new Map<string, boolean>(); // weId → isChecked
const _pendingMachineBrandUpdates = new Map<string, string | null>(); // weId → brand
const _pendingSetDoneUpdates = new Map<string, boolean>(); // `${weId}:${setLocalId}` → isDone
const _pendingFullSets = new Map<string, BridgedSet[]>(); // weId → full sets array (for add/remove)

// Direct live-update callbacks — exercise-detail calls these so Do Mode state updates immediately,
// without waiting for useFocusEffect. Same pattern as registerStartSession.
type SetsChangedFn = (workoutExerciseId: string, sets: BridgedSet[]) => void;
type CheckChangedFn = (workoutExerciseId: string, isChecked: boolean) => void;
type PhotosChangedFn = (workoutExerciseId: string, urls: string[]) => void;
let _onSetsChanged: SetsChangedFn | null = null;
let _onCheckChanged: CheckChangedFn | null = null;
// Two separate slots so Do Mode and exercise-detail can both listen simultaneously.
let _onPhotosChangedDoMode: PhotosChangedFn | null = null;
let _onPhotosChangedDetail: PhotosChangedFn | null = null;

export function registerOnSetsChanged(fn: SetsChangedFn | null): void { _onSetsChanged = fn; }
export function registerOnCheckChanged(fn: CheckChangedFn | null): void { _onCheckChanged = fn; }
export function registerOnPhotosChangedDoMode(fn: PhotosChangedFn | null): void { _onPhotosChangedDoMode = fn; }
export function registerOnPhotosChangedDetail(fn: PhotosChangedFn | null): void { _onPhotosChangedDetail = fn; }
export function notifyPhotosChanged(workoutExerciseId: string, urls: string[]): void {
  _onPhotosChangedDoMode?.(workoutExerciseId, urls);
  _onPhotosChangedDetail?.(workoutExerciseId, urls);
}

// Called by exercise-detail on every set mutation — updates bridge + notifies Do Mode directly.
export function notifySetsChanged(workoutExerciseId: string, sets: BridgedSet[]): void {
  updateBridgedExerciseSets(workoutExerciseId, sets);
  setPendingFullSets(workoutExerciseId, sets);
  _onSetsChanged?.(workoutExerciseId, sets);
}
// Called by exercise-detail on checkmark toggle.
export function notifyCheckChanged(workoutExerciseId: string, isChecked: boolean): void {
  const ex = _exercises.find(e => e.workoutExerciseId === workoutExerciseId);
  if (ex) ex.isChecked = isChecked;
  _pendingCheckUpdates.set(workoutExerciseId, isChecked);
  _onCheckChanged?.(workoutExerciseId, isChecked);
}

// Live mode: superset groupIds where Live mode is active. Synced from Do Mode on every toggle.
let _liveGroupIds: Set<string> = new Set();
export function setBridgeLiveGroupIds(ids: Set<string>): void { _liveGroupIds = ids; }
export function isBridgeLiveGroup(groupId: string): boolean { return _liveGroupIds.has(groupId); }

// Live mode triggered: groupIds where live text has been revealed (visible but may be dimmed). Synced from Do Mode.
let _liveGroupIdsTriggered: Set<string> = new Set();
export function setBridgeLiveGroupIdsTriggered(ids: Set<string>): void { _liveGroupIdsTriggered = ids; }
export function isBridgeTriggeredGroup(groupId: string): boolean { return _liveGroupIdsTriggered.has(groupId); }

// Live toggle callback — exercise-detail calls invokeLiveToggle so Do Mode state updates immediately.
let _onLiveToggle: ((groupId: string) => void) | null = null;
export function registerOnLiveToggle(fn: ((groupId: string) => void) | null): void { _onLiveToggle = fn; }
export function invokeLiveToggle(groupId: string): void { _onLiveToggle?.(groupId); }

// Live activate callback — exercise-detail calls invokeActivateLive on first data entry.
let _onLiveActivate: ((groupId: string) => void) | null = null;
export function registerOnLiveActivate(fn: ((groupId: string) => void) | null): void { _onLiveActivate = fn; }
export function invokeActivateLive(groupId: string): void {
  // Update bridge synchronously so immediate re-reads (e.g. exercise-detail re-render) see the change
  // before Do Mode's async React state update has had a chance to run setBridgeLiveGroupIdsTriggered.
  if (!_liveGroupIdsTriggered.has(groupId)) {
    const next = new Set(_liveGroupIdsTriggered);
    next.add(groupId);
    _liveGroupIdsTriggered = next;
  }
  if (!_liveGroupIds.has(groupId)) {
    const next = new Set(_liveGroupIds);
    next.add(groupId);
    _liveGroupIds = next;
  }
  _onLiveActivate?.(groupId);
}

// Session prompt state — shared between Do Mode and Exercise Detail
let _softPromptDismissed = false;
let _startSessionCallback: (() => Promise<void>) | null = null;
let _activeSessionId: string | null = null;
// Set from exercise-detail Finish button; Do Mode reads this on focus and triggers handleFinish
let _pendingFinish = false;

export function getSoftPromptDismissed(): boolean { return _softPromptDismissed; }
export function setSoftPromptDismissed(v: boolean): void { _softPromptDismissed = v; }
export function registerStartSession(fn: (() => Promise<void>) | null): void { _startSessionCallback = fn; }
export async function invokeStartSession(): Promise<void> {
  if (_startSessionCallback) await _startSessionCallback();
}
export function setBridgeActiveSessionId(id: string | null): void { _activeSessionId = id; }
export function getBridgeActiveSessionId(): string | null { return _activeSessionId; }
export function setPendingFinish(v: boolean): void { _pendingFinish = v; }
export function getPendingFinish(): boolean { return _pendingFinish; }

export function setBridgedExercises(exs: BridgedExercise[]): void {
  _exercises = exs;
}

export function getBridgedExercises(): BridgedExercise[] {
  return _exercises;
}

// Update a single exercise's sets in the bridge without replacing the whole array.
// Used by exercise-detail when swiping between exercises so re-visits load the latest data.
export function updateBridgedExerciseSets(workoutExerciseId: string, sets: BridgedSet[]): void {
  const ex = _exercises.find(e => e.workoutExerciseId === workoutExerciseId);
  if (ex) ex.sets = sets;
}

export function addPendingSetUpdate(update: PendingSetUpdate): void {
  const key = `${update.workoutExerciseId}:${update.setLocalId}:${update.field}`;
  _pendingSetUpdates.set(key, update);
}

export function addPendingBarbellUpdate(workoutExerciseId: string, weightKg: number): void {
  _pendingBarbellUpdates.set(workoutExerciseId, weightKg);
}

export function addPendingCheckUpdate(workoutExerciseId: string, isChecked: boolean): void {
  _pendingCheckUpdates.set(workoutExerciseId, isChecked);
}

export function addPendingMachineBrandUpdate(workoutExerciseId: string, brand: string | null): void {
  _pendingMachineBrandUpdates.set(workoutExerciseId, brand);
}

export function addPendingSetDoneUpdate(workoutExerciseId: string, setLocalId: string, isDone: boolean): void {
  _pendingSetDoneUpdates.set(`${workoutExerciseId}:${setLocalId}`, isDone);
}

export function setPendingFullSets(workoutExerciseId: string, sets: BridgedSet[]): void {
  _pendingFullSets.set(workoutExerciseId, sets);
}

export function flushPendingUpdates(): {
  setUpdates: PendingSetUpdate[];
  barbellUpdates: Map<string, number>;
  checkUpdates: Map<string, boolean>;
  machineBrandUpdates: Map<string, string | null>;
  setDoneUpdates: Map<string, boolean>;
  fullSets: Map<string, BridgedSet[]>;
} {
  const setUpdates = [..._pendingSetUpdates.values()];
  const barbellUpdates = new Map(_pendingBarbellUpdates);
  const checkUpdates = new Map(_pendingCheckUpdates);
  const machineBrandUpdates = new Map(_pendingMachineBrandUpdates);
  const setDoneUpdates = new Map(_pendingSetDoneUpdates);
  const fullSets = new Map(_pendingFullSets);
  _pendingSetUpdates.clear();
  _pendingBarbellUpdates.clear();
  _pendingCheckUpdates.clear();
  _pendingMachineBrandUpdates.clear();
  _pendingSetDoneUpdates.clear();
  _pendingFullSets.clear();
  return { setUpdates, barbellUpdates, checkUpdates, machineBrandUpdates, setDoneUpdates, fullSets };
}
