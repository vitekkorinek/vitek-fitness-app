import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Image,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { registerPickHandler } from '@/lib/exercisePicker';
import { CATEGORY_OPTIONS, CATEGORY_COLORS, STRETCHING_CATEGORIES, STRETCHING_CATEGORY_TO_STRETCH_TYPE } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import type { Exercise, Routine } from '@/types/database';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// UUID v4 via Math.random — crypto.getRandomValues not available in Expo Go (Hermes)
const makeUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

// ─── Types ────────────────────────────────────────────────────────────────────

type BuilderSet = {
  key: string;
  set_number: number;
  target_reps: string;
  target_weight_kg: string;
  rest_seconds: string;
};

type BuilderExercise = {
  key: string;
  exercise: Exercise;
  sets: BuilderSet[];
  is_superset: boolean;
  expanded: boolean;
};

type SaveIntent =
  | { type: 'template' }
  | { type: 'standalone'; clientId: string }
  | { type: 'new-routine'; clientId: string; routineName: string }
  | { type: 'existing-routine'; clientId: string; routineId: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSet(setNumber: number, weight?: number): BuilderSet {
  return {
    key: uid(),
    set_number: setNumber,
    target_reps: '10',
    target_weight_kg: weight != null ? String(weight) : '',
    rest_seconds: '60',
  };
}

function repSummary(sets: BuilderSet[]): string {
  if (sets.length === 0) return '—';
  return sets.map(s => s.target_reps || '—').join(' × ');
}

function toRoman(n: number): string {
  if (n <= 0) return 'I';
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  return r;
}

function assignSupersetGroups(items: BuilderExercise[]): (string | null)[] {
  const result: (string | null)[] = [];
  let groupId: string | null = null;
  items.forEach((item, i) => {
    if (item.is_superset) {
      if (i === 0 || !items[i - 1].is_superset) groupId = makeUUID();
      result.push(groupId);
    } else {
      groupId = null;
      result.push(null);
    }
  });
  return result;
}

// Returns all keys in the same superset block as `key` (or just [key] for a solo exercise)
function getSupersetGroupKeys(items: BuilderExercise[], key: string): string[] {
  const idx = items.findIndex(i => i.key === key);
  if (idx === -1 || !items[idx].is_superset) return [key];
  let start = idx;
  while (start > 0 && items[start - 1].is_superset) start--;
  let end = idx;
  while (end < items.length - 1 && items[end + 1].is_superset) end++;
  return items.slice(start, end + 1).map(i => i.key);
}

// Prevents inserting between two exercises that belong to the same superset group.
// If insertKey would land mid-superset, snaps to the first item of that group.
function resolveInsertKey(
  allItems: BuilderExercise[],
  draggingKeys: string[],
  insertKey: string | null,
): string | null {
  if (insertKey === null) return null;
  const insertIdx = allItems.findIndex(i => i.key === insertKey);
  if (insertIdx <= 0) return insertKey;
  const target = allItems[insertIdx];
  if (!target.is_superset) return insertKey;
  // Find the previous non-dragging item
  let prevIdx = insertIdx - 1;
  while (prevIdx >= 0 && draggingKeys.includes(allItems[prevIdx].key)) prevIdx--;
  if (prevIdx < 0) return insertKey;
  if (!allItems[prevIdx].is_superset) return insertKey; // Not mid-superset
  // We'd land inside a superset group — snap to its start
  let startIdx = insertIdx;
  while (
    startIdx > 0 &&
    allItems[startIdx - 1].is_superset &&
    !draggingKeys.includes(allItems[startIdx - 1].key)
  ) startIdx--;
  return allItems[startIdx].key;
}

// Reorders items so the dragging group is at insertBeforeKey's position
function computeDisplayOrder(
  items: BuilderExercise[],
  draggingKeys: string[],
  insertBeforeKey: string | null,
): BuilderExercise[] {
  if (draggingKeys.length === 0) return items;
  const dragging = items.filter(i => draggingKeys.includes(i.key));
  const rest = items.filter(i => !draggingKeys.includes(i.key));
  if (insertBeforeKey === null) return [...rest, ...dragging];
  const insertIdx = rest.findIndex(i => i.key === insertBeforeKey);
  if (insertIdx === -1) return [...rest, ...dragging];
  return [...rest.slice(0, insertIdx), ...dragging, ...rest.slice(insertIdx)];
}

async function fetchLastWeight(clientId: string, exerciseId: string): Promise<number | null> {
  const { data: weRows } = await supabase.from('workout_exercises').select('id').eq('exercise_id', exerciseId);
  if (!weRows?.length) return null;
  const { data: sessions } = await supabase.from('sessions').select('id, date').eq('client_id', clientId).order('date', { ascending: false }).limit(30);
  if (!sessions?.length) return null;
  const sessionIds = (sessions as any[]).map(s => s.id);
  const weIds = (weRows as any[]).map(r => r.id);
  const { data: logs } = await supabase.from('session_logs').select('weight_kg, session_id').in('workout_exercise_id', weIds).in('session_id', sessionIds).not('weight_kg', 'is', null).limit(30);
  if (!logs?.length) return null;
  for (const session of sessions as any[]) {
    const log = (logs as any[]).find(l => l.session_id === session.id);
    if (log?.weight_kg != null) return log.weight_kg as number;
  }
  return null;
}

// Ensure a client has a stretch workout of the given type — auto-provisioned from
// the matching stretch template the first time a workout points to it. Returns
// silently if the client already has one, or if no matching template exists. The
// created workout is a full deep-copy (exercises + sets) the trainer can then edit
// per client without affecting the template.
async function ensureClientStretchWorkout(
  clientId: string,
  stretchType: 'upper_body' | 'lower_body' | 'full_body',
  createdBy: string,
): Promise<void> {
  // Already has one → never overwrite the client's own copy.
  const { data: existing } = await supabase
    .from('workouts')
    .select('id')
    .eq('client_id', clientId)
    .eq('stretch_type', stretchType)
    .in('category', STRETCHING_CATEGORIES)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  // Find the matching stretch template (most recent if several).
  const { data: tmpl } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('created_by', createdBy)
    .eq('stretch_type', stretchType)
    .in('category', STRETCHING_CATEGORIES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!tmpl) return;
  const t = tmpl as any;

  const { data: tes } = await supabase
    .from('template_exercises')
    .select('*')
    .eq('template_id', t.id)
    .order('order_index', { ascending: true });
  const teList = (tes ?? []) as any[];

  const { data: w } = await supabase.from('workouts').insert({
    name: t.name,
    client_id: clientId,
    routine_id: null,
    created_by: createdBy,
    equipment_list: t.equipment_list ?? [],
    muscle_groups: t.muscle_groups ?? [],
    order_index: 0,
    description: null, goal: null, notes: null,
    category: t.category ?? null,
    stretch_type: t.stretch_type ?? stretchType,
    ...(t.cover_image_url ? { cover_image_url: t.cover_image_url } : {}),
  }).select('id').single();
  if (!w) return;
  const workoutId = (w as any).id;
  if (teList.length === 0) return;

  const { data: weRows } = await supabase.from('workout_exercises').insert(
    teList.map((te, i) => ({
      workout_id: workoutId,
      exercise_id: te.exercise_id,
      order_index: i,
      is_superset: te.is_superset,
      superset_group_id: te.superset_group_id ?? null,
      notes: te.notes ?? null,
      equipment_type: te.equipment_type ?? null,
      barbell_weight_kg: te.barbell_weight_kg ?? null,
    }))
  ).select('id');
  if (!weRows) return;

  const teIdToWe = new Map(teList.map((te, i) => [te.id, (weRows as any[])[i].id]));
  const { data: tss } = await supabase.from('template_sets').select('*').in('template_exercise_id', teList.map(te => te.id));
  const wsInserts = (tss ?? []).map((s: any) => ({
    workout_exercise_id: teIdToWe.get(s.template_exercise_id),
    set_number: s.set_number,
    target_reps: s.target_reps,
    target_weight_kg: s.target_weight_kg,
    rest_seconds: s.rest_seconds,
  })).filter(s => s.workout_exercise_id != null);
  if (wsInserts.length > 0) await supabase.from('workout_sets').insert(wsInserts);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkoutBuilderScreen() {
  // `clientId` is present only when launched from a specific client context
  // (client profile / routine detail). Launched from the Library it is empty —
  // the destination (template vs client → placement) is then chosen at Save time.
  const { clientId = '', routineId: defaultRoutineId, templateId } = useLocalSearchParams<{ clientId?: string; routineId?: string; templateId?: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [workoutName, setWorkoutName] = useState('');
  const [workoutCategory, setWorkoutCategory] = useState<WorkoutCategory | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [stretchType, setStretchType] = useState<'upper_body' | 'lower_body' | 'full_body' | null>(null);
  const isStretchingCategory = workoutCategory != null && workoutCategory in STRETCHING_CATEGORY_TO_STRETCH_TYPE;
  const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
  const [items, setItems] = useState<BuilderExercise[]>([]);
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflictModal, setConflictModal] = useState<{ id: string; name: string; intent: SaveIntent } | null>(null);

  // Multi-select state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Drag-to-reorder state
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(null);
  // Video modal
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);

  // Drag refs (no re-renders)
  const scrollOffsetRef = useRef(0);
  const itemLayoutsRef = useRef<Record<string, { y: number; height: number }>>({});
  const listContainerRef = useRef<View>(null);
  const listContainerPageYRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const ghostAnimY = useRef(new Animated.Value(-200)).current;
  const dragActiveRef = useRef(false);
  const dragKeyRef = useRef<string | null>(null);
  const dragInsertKeyRef = useRef<string | null>(null);
  const draggingGroupKeysRef = useRef<string[]>([]);
  const dragSnapshotRef = useRef<Record<string, { y: number; height: number }>>({});
  const itemsRef = useRef(items);

  useEffect(() => {
    return registerPickHandler(async exercise => {
      const newKey = uid();
      setItems(prev => [...prev, {
        key: newKey,
        exercise,
        sets: [makeSet(1), makeSet(2), makeSet(3)],
        is_superset: false,
        expanded: false,
      }]);
      // Pre-fill last-used weight only when the client is already known (launched
      // from a client context). From the Library there is no client yet.
      if (clientId) {
        const weight = await fetchLastWeight(clientId, exercise.id);
        if (weight != null) {
          setItems(prev => prev.map(item =>
            item.key === newKey
              ? { ...item, sets: item.sets.map(s => ({ ...s, target_weight_kg: String(weight) })) }
              : item
          ));
        }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { itemsRef.current = items; }, [items]);

  // Launched from the Templates gallery: preload the template into the builder so
  // it can be reviewed/tweaked and then assigned to a client (or re-saved).
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      const { data: tmpl } = await supabase.from('workout_templates').select('*').eq('id', templateId).maybeSingle();
      if (cancelled || !tmpl) return;
      const t = tmpl as any;
      setWorkoutName(t.name ?? '');
      setWorkoutCategory((t.category ?? null) as WorkoutCategory | null);
      setStretchType((t.stretch_type ?? null) as 'upper_body' | 'lower_body' | 'full_body' | null);
      if (t.cover_image_url) setCoverImageUri(t.cover_image_url);

      const { data: tes } = await supabase.from('template_exercises').select('*').eq('template_id', templateId).order('order_index', { ascending: true });
      const teList = (tes ?? []) as any[];
      if (teList.length === 0) return;
      const exIds = [...new Set(teList.map(te => te.exercise_id))];
      const { data: exs } = await supabase.from('exercises').select('*').in('id', exIds);
      const exMap = new Map((exs ?? []).map((e: any) => [e.id, e as Exercise]));
      const { data: tss } = await supabase.from('template_sets').select('*').in('template_exercise_id', teList.map(te => te.id)).order('set_number', { ascending: true });
      const tsByTe = new Map<string, any[]>();
      (tss ?? []).forEach((s: any) => { const arr = tsByTe.get(s.template_exercise_id) ?? []; arr.push(s); tsByTe.set(s.template_exercise_id, arr); });

      const loaded: BuilderExercise[] = [];
      for (const te of teList) {
        const ex = exMap.get(te.exercise_id);
        if (!ex) continue;
        const setRows = (tsByTe.get(te.id) ?? []).sort((a, b) => a.set_number - b.set_number);
        const sets: BuilderSet[] = setRows.length > 0
          ? setRows.map(s => ({
              key: uid(),
              set_number: s.set_number,
              target_reps: s.target_reps != null ? String(s.target_reps) : '',
              target_weight_kg: s.target_weight_kg != null ? String(s.target_weight_kg) : '',
              rest_seconds: s.rest_seconds != null ? String(s.rest_seconds) : '',
            }))
          : [makeSet(1), makeSet(2), makeSet(3)];
        loaded.push({ key: uid(), exercise: ex, sets, is_superset: !!te.is_superset, expanded: false });
      }
      if (!cancelled) setItems(loaded);
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  const updateItem = useCallback((key: string, patch: Partial<BuilderExercise>) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
    setSelectedKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, expanded: !i.expanded } : i));
  }, []);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Multi-select actions
  const applySuperset = () => {
    if (selectedKeys.size < 2) return;
    const allSuperset = items.filter(i => selectedKeys.has(i.key)).every(i => i.is_superset);
    setItems(prev => prev.map(i =>
      selectedKeys.has(i.key) ? { ...i, is_superset: !allSuperset } : i
    ));
    setSelectedKeys(new Set());
  };

  const deleteSelected = () => {
    if (selectedKeys.size === 0) return;
    Alert.alert(
      `Delete ${selectedKeys.size} exercise${selectedKeys.size > 1 ? 's' : ''}?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: () => {
            setItems(prev => prev.filter(i => !selectedKeys.has(i.key)));
            setSelectedKeys(new Set());
          },
        },
      ]
    );
  };

  const startDrag = useCallback((key: string) => {
    listContainerRef.current?.measure((_x, _y, _w, _h, _px, pageY) => {
      listContainerPageYRef.current = pageY;
      const groupKeys = getSupersetGroupKeys(itemsRef.current, key);
      draggingGroupKeysRef.current = groupKeys;
      // Snapshot current item positions before any visual shift
      dragSnapshotRef.current = { ...itemLayoutsRef.current };
      const itemLayout = dragSnapshotRef.current[key];
      const initialGhostY = itemLayout ? itemLayout.y - scrollOffsetRef.current : 0;
      ghostAnimY.setValue(initialGhostY);
      dragActiveRef.current = true;
      dragKeyRef.current = key;
      dragInsertKeyRef.current = null;
      setDraggingKey(key);
      setDragInsertBeforeKey(null);
      setSelectedKeys(new Set());
    });
  }, [ghostAnimY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: () => dragActiveRef.current,
      onPanResponderGrant: (e) => {
        if (!dragActiveRef.current || !dragKeyRef.current) return;
        const pageY = e.nativeEvent.pageY - listContainerPageYRef.current;
        const itemH = dragSnapshotRef.current[dragKeyRef.current]?.height ?? 56;
        ghostAnimY.setValue(pageY - itemH / 2);
      },
      onPanResponderMove: (e) => {
        if (!dragActiveRef.current || !dragKeyRef.current) return;
        const pageY = e.nativeEvent.pageY - listContainerPageYRef.current;
        const itemH = dragSnapshotRef.current[dragKeyRef.current]?.height ?? 56;
        ghostAnimY.setValue(pageY - itemH / 2);

        // Use snapshot positions so calculations are stable during visual shift
        const contentY = pageY + scrollOffsetRef.current;
        const groupKeys = draggingGroupKeysRef.current;
        let insertBefore: string | null = null;
        for (const item of itemsRef.current) {
          if (groupKeys.includes(item.key)) continue;
          const layout = dragSnapshotRef.current[item.key];
          if (!layout) continue;
          if (contentY < layout.y + layout.height / 2) {
            insertBefore = item.key;
            break;
          }
        }
        insertBefore = resolveInsertKey(itemsRef.current, groupKeys, insertBefore);
        if (insertBefore !== dragInsertKeyRef.current) {
          dragInsertKeyRef.current = insertBefore;
          setDragInsertBeforeKey(insertBefore);
        }
      },
      onPanResponderRelease: () => {
        if (!dragActiveRef.current) return;
        const groupKeys = [...draggingGroupKeysRef.current];
        const insertBefore = dragInsertKeyRef.current;
        dragActiveRef.current = false;
        dragKeyRef.current = null;
        dragInsertKeyRef.current = null;
        draggingGroupKeysRef.current = [];
        dragSnapshotRef.current = {};
        setDraggingKey(null);
        setDragInsertBeforeKey(null);
        setItems(prev => {
          const dragging = prev.filter(i => groupKeys.includes(i.key));
          const rest = prev.filter(i => !groupKeys.includes(i.key));
          const safeInsert = resolveInsertKey(prev, groupKeys, insertBefore);
          if (safeInsert === null) return [...rest, ...dragging];
          const toIdx = rest.findIndex(i => i.key === safeInsert);
          const insertIdx = toIdx === -1 ? rest.length : toIdx;
          return [...rest.slice(0, insertIdx), ...dragging, ...rest.slice(insertIdx)];
        });
      },
      onPanResponderTerminate: () => {
        dragActiveRef.current = false;
        dragKeyRef.current = null;
        dragInsertKeyRef.current = null;
        draggingGroupKeysRef.current = [];
        dragSnapshotRef.current = {};
        setDraggingKey(null);
        setDragInsertBeforeKey(null);
      },
    })
  ).current;

  const handleBack = () => {
    if (workoutName.trim() || items.length > 0) {
      Alert.alert('Discard workout?', 'Your changes will not be saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverImageUri(result.assets[0].uri);
    }
  };

  const uploadCoverImage = async (localUri: string, folder: string): Promise<string | null> => {
    try {
      const filename = `${folder}/${Date.now()}.jpg`;
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();
      console.log('[WorkoutBuilder] uploading cover image, size:', arrayBuffer.byteLength);
      const { data, error } = await supabase.storage
        .from('workout-covers')
        .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        console.error('[WorkoutBuilder] cover upload error:', JSON.stringify(error));
        return null;
      }
      if (!data) return null;
      const { data: urlData } = supabase.storage.from('workout-covers').getPublicUrl(data.path);
      console.log('[WorkoutBuilder] cover uploaded, public URL:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (e) {
      console.error('[WorkoutBuilder] cover upload exception:', e);
      return null;
    }
  };

  const handleConflictConfirm = async () => {
    if (!conflictModal) return;
    const { id, intent } = conflictModal;
    setConflictModal(null);
    await supabase.from('routines').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id);
    handleSave(intent, true);
  };

  const handleConflictSkip = () => {
    if (!conflictModal) return;
    const { intent } = conflictModal;
    setConflictModal(null);
    handleSave(intent, true);
  };

  const handleSavePress = () => {
    if (!workoutName.trim()) { Alert.alert('Name required', 'Please enter a workout name.'); return; }
    if (items.length === 0) { Alert.alert('No exercises', 'Add at least one exercise before saving.'); return; }
    setSaveSheetOpen(true);
  };

  const handleSave = async (intent: SaveIntent, skipConflictCheck = false) => {
    setSaving(true);
    let createdRoutineId: string | null = null;
    let createdWorkoutId: string | null = null;
    let createdTemplateId: string | null = null;
    try {
      const equipment_list = [...new Set(items.map(i => i.exercise.equipment).filter(Boolean) as string[])];
      const muscle_groups = [...new Set(items.flatMap(i => i.exercise.muscle_groups))];

      if (intent.type === 'template') {
        // Upload cover image if one was picked; failure is non-fatal
        const tmplCoverUrl = coverImageUri ? await uploadCoverImage(coverImageUri, 'templates') : null;
        const { data: tmpl, error: tmplErr } = await supabase.from('workout_templates').insert({
          name: workoutName.trim(),
          created_by: profile!.id,
          equipment_list, muscle_groups,
          description: null, goal: null, notes: null,
          category: workoutCategory ?? null,
          stretch_type: stretchType ?? null,
          ...(tmplCoverUrl != null ? { cover_image_url: tmplCoverUrl } : {}),
        }).select().single();
        if (tmplErr || !tmpl) throw tmplErr ?? new Error('Template insert failed');
        createdTemplateId = (tmpl as any).id;

        const groups = assignSupersetGroups(items);
        const { data: teRows, error: teErr } = await supabase.from('template_exercises').insert(
          items.map((item, i) => ({
            template_id: createdTemplateId,
            exercise_id: item.exercise.id,
            order_index: i,
            is_superset: item.is_superset,
            superset_group_id: groups[i],
            notes: null,
            equipment_type: null,
            barbell_weight_kg: null,
          }))
        ).select('id');
        if (teErr || !teRows) throw teErr ?? new Error('Template exercise insert failed');

        const tmplSets = items.flatMap((item, i) =>
          item.sets.map(s => ({
            template_exercise_id: (teRows as any[])[i].id,
            set_number: s.set_number,
            target_reps: parseInt(s.target_reps) || null,
            target_weight_kg: parseFloat(s.target_weight_kg) || null,
            rest_seconds: parseInt(s.rest_seconds) || null,
          }))
        );
        if (tmplSets.length > 0) {
          const { error: tsErr } = await supabase.from('template_sets').insert(tmplSets);
          if (tsErr) throw tsErr;
        }

        setSaving(false);
        router.back();
        return;
      }

      // Target client comes from the Save sheet selection (not the launch param,
      // which is empty when building from the Library).
      const targetClientId = intent.clientId;

      let routineId: string | null = null;
      if (intent.type === 'existing-routine') {
        routineId = intent.routineId;
      } else if (intent.type === 'new-routine') {
        if (!skipConflictCheck) {
          const { data: existing } = await supabase
            .from('routines').select('id, name')
            .eq('client_id', targetClientId).eq('status', 'active')
            .limit(1).maybeSingle();
          if (existing) {
            setSaving(false);
            setConflictModal({ id: (existing as any).id, name: (existing as any).name, intent });
            return;
          }
        }
        const { data: r, error: rErr } = await supabase.from('routines').insert({ name: intent.routineName, client_id: targetClientId, created_by: profile!.id, status: 'active', auto_name: null }).select().single();
        if (rErr || !r) throw rErr ?? new Error('Routine insert failed');
        createdRoutineId = (r as Routine).id;
        routineId = createdRoutineId;
      }

      let order_index = 0;
      if (routineId) {
        const { count } = await supabase.from('workouts').select('*', { count: 'exact', head: true }).eq('routine_id', routineId);
        order_index = count ?? 0;
      }

      // Upload cover image if one was picked; failure is non-fatal
      const cover_image_url = coverImageUri ? await uploadCoverImage(coverImageUri, targetClientId) : null;
      if (coverImageUri && !cover_image_url) {
        console.warn('[WorkoutBuilder] cover image upload failed — workout will be saved without cover');
      }

      const { data: workout, error: wErr } = await supabase.from('workouts').insert({
        name: workoutName.trim(), client_id: targetClientId, routine_id: routineId,
        created_by: profile!.id, equipment_list, muscle_groups, order_index,
        description: null, goal: null, notes: null,
        category: workoutCategory ?? null,
        stretch_type: stretchType ?? null,
        ...(cover_image_url != null ? { cover_image_url } : {}),
      }).select().single();
      if (wErr || !workout) throw wErr ?? new Error('Workout insert failed');
      createdWorkoutId = (workout as any).id;

      const groups = assignSupersetGroups(items);
      const { data: weRows, error: weErr } = await supabase.from('workout_exercises').insert(
        items.map((item, i) => ({ workout_id: createdWorkoutId, exercise_id: item.exercise.id, order_index: i, is_superset: item.is_superset, superset_group_id: groups[i], notes: null, equipment_type: null, barbell_weight_kg: null }))
      ).select('id');
      if (weErr || !weRows) throw weErr ?? new Error('WorkoutExercise insert failed');

      const allSets = items.flatMap((item, i) =>
        item.sets.map(s => ({ workout_exercise_id: (weRows as any[])[i].id, set_number: s.set_number, target_reps: parseInt(s.target_reps) || null, target_weight_kg: parseFloat(s.target_weight_kg) || null, rest_seconds: parseInt(s.rest_seconds) || null }))
      );
      if (allSets.length > 0) {
        const { error: setsErr } = await supabase.from('workout_sets').insert(allSets);
        if (setsErr) throw setsErr;
      }

      // Post-workout stretch: if this regular workout points to an Upper/Lower/Full
      // stretch and the client doesn't have one yet, auto-provision it from the
      // matching stretch template so the link resolves. Non-fatal — the workout is
      // already saved; a failure here must not roll it back.
      if (!isStretchingCategory && stretchType) {
        try {
          await ensureClientStretchWorkout(targetClientId, stretchType, profile!.id);
        } catch (stretchErr) {
          console.warn('[WorkoutBuilder] auto stretch provisioning failed:', stretchErr);
        }
      }

      setSaving(false);
      setSaveSheetOpen(false);
      router.back();
    } catch (e: any) {
      console.error('[WorkoutBuilder] save error:', JSON.stringify(e), e?.message, e?.details, e?.hint);
      if (createdTemplateId) {
        await supabase.from('workout_templates').delete().eq('id', createdTemplateId);
      }
      if (createdWorkoutId) {
        await supabase.from('workouts').delete().eq('id', createdWorkoutId);
      }
      if (createdRoutineId) {
        await supabase.from('routines').delete().eq('id', createdRoutineId);
      }
      setSaving(false);
      Alert.alert('Save failed', e?.message ?? 'Failed to save workout. Please try again.');
    }
  };

  // Superset grouping for visual: mark the start and end of each superset group
  const supersetStarts = new Set<string>();
  const supersetEnds = new Set<string>();
  items.forEach((item, i) => {
    const prevIsSuperset = i > 0 && items[i - 1].is_superset;
    const nextIsSuperset = i < items.length - 1 && items[i + 1].is_superset;
    if (item.is_superset && !prevIsSuperset) supersetStarts.add(item.key);
    if (item.is_superset && !nextIsSuperset) supersetEnds.add(item.key);
  });

  // Drag display computations
  const draggingGroupKeys = draggingKey ? getSupersetGroupKeys(items, draggingKey) : [];
  const displayItems = draggingKey
    ? computeDisplayOrder(items, draggingGroupKeys, dragInsertBeforeKey)
    : items;
  const ghostItem = draggingKey ? items.find(i => i.key === draggingKey) : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Build Workout</Text>
          <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSavePress} activeOpacity={0.8}>
            <Text style={styles.saveHeaderBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View ref={listContainerRef} style={[styles.flex, { backgroundColor: BG }]} {...panResponder.panHandlers}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[styles.content, (selectedKeys.size >= 1 || draggingKey) && { paddingBottom: 96 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!draggingKey}
            onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
          >
            {/* Cover image picker — available for every workout, incl. templates */}
            {coverImageUri ? (
              <View style={styles.coverPicker}>
                <Image source={{ uri: coverImageUri }} style={styles.coverPickerImg} />
                <View style={styles.coverPickerBadgeRow}>
                  <TouchableOpacity style={styles.coverPickerBadge} onPress={pickCoverImage} activeOpacity={0.8}>
                    <SymbolView name="pencil" size={13} tintColor="#fff" />
                    <Text style={styles.coverPickerBadgeText}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.coverPickerBadge, styles.coverPickerRemoveBadge]} onPress={() => setCoverImageUri(null)} activeOpacity={0.8}>
                    <SymbolView name="trash" size={13} tintColor="#fff" />
                    <Text style={styles.coverPickerBadgeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.coverPicker} onPress={pickCoverImage} activeOpacity={0.8}>
                <View style={styles.coverPickerEmpty}>
                  <SymbolView name="photo" size={24} tintColor={MUTED} />
                  <Text style={styles.coverPickerEmptyText}>Add Cover Image</Text>
                  <Text style={styles.coverPickerEmptyHint}>16:9 · shown as header in Do Mode</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Workout name + category */}
            <View style={styles.nameCard}>
              <TextInput
                style={styles.nameInput}
                value={workoutName}
                onChangeText={setWorkoutName}
                placeholder="Workout name..."
                placeholderTextColor="#bbb"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
              />
              <View style={styles.nameCardDivider} />
              <TouchableOpacity
                style={styles.categoryRow}
                onPress={() => setCategoryPickerOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryRowLabel}>Category</Text>
                {workoutCategory ? (
                  <View style={[styles.categoryRowPill, { backgroundColor: CATEGORY_COLORS[workoutCategory].pillBg }]}>
                    <Text style={[styles.categoryRowPillText, { color: CATEGORY_COLORS[workoutCategory].pillText }]}>
                      {workoutCategory}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.categoryRowMuted}>None</Text>
                )}
                <SymbolView name="chevron.right" size={12} tintColor="#ccc" />
              </TouchableOpacity>
              {!isStretchingCategory && <View style={styles.nameCardDivider} />}
              {!isStretchingCategory && <View style={styles.stretchTypeSection}>
                <Text style={styles.stretchTypeLabel}>Post-workout stretch</Text>
                <View style={styles.stretchTypeSwitcher}>
                  {([
                    { label: 'None', value: null },
                    { label: 'Upper', value: 'upper_body' },
                    { label: 'Lower', value: 'lower_body' },
                    { label: 'Full', value: 'full_body' },
                  ] as { label: string; value: 'upper_body' | 'lower_body' | 'full_body' | null }[]).map(opt => {
                    const active = stretchType === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value ?? 'none'}
                        style={[styles.stretchTypeBtn, active && styles.stretchTypeBtnActive]}
                        onPress={() => setStretchType(opt.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.stretchTypeBtnText, active && styles.stretchTypeBtnTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>}
            </View>

            {/* Category picker modal */}
            {categoryPickerOpen && (
              <Modal visible transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)} statusBarTranslucent>
                <Pressable style={catPickerStyles.overlay} onPress={() => setCategoryPickerOpen(false)}>
                  <Pressable style={catPickerStyles.box}>
                    <Text style={catPickerStyles.title}>Category</Text>
                    <TouchableOpacity
                      style={[catPickerStyles.option, !workoutCategory && catPickerStyles.optionActive]}
                      onPress={() => { setWorkoutCategory(null); setStretchType(null); setCategoryPickerOpen(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[catPickerStyles.optionText, !workoutCategory && catPickerStyles.optionTextActive]}>None</Text>
                    </TouchableOpacity>
                    {CATEGORY_OPTIONS.map(cat => {
                      const colors = CATEGORY_COLORS[cat];
                      const isSelected = workoutCategory === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[catPickerStyles.option, isSelected && { backgroundColor: colors.pillBg }]}
                          onPress={() => { setWorkoutCategory(cat); setStretchType(null); setCategoryPickerOpen(false); }}
                          activeOpacity={0.7}
                        >
                          <View style={[catPickerStyles.optionDot, { backgroundColor: colors.border }]} />
                          <Text style={[catPickerStyles.optionText, isSelected && { color: colors.pillText, fontWeight: '700' }]}>
                            {cat}
                          </Text>
                          {isSelected && <SymbolView name="checkmark" size={14} tintColor={colors.pillText} />}
                        </TouchableOpacity>
                      );
                    })}
                    <View style={catPickerStyles.separator} />
                    <Text style={catPickerStyles.sectionLabel}>STRETCHING</Text>
                    {STRETCHING_CATEGORIES.map(cat => {
                      const colors = CATEGORY_COLORS[cat];
                      const isSelected = workoutCategory === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[catPickerStyles.option, isSelected && { backgroundColor: colors.pillBg }]}
                          onPress={() => {
                            setWorkoutCategory(cat);
                            setStretchType(STRETCHING_CATEGORY_TO_STRETCH_TYPE[cat]);
                            setCategoryPickerOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={[catPickerStyles.optionDot, { backgroundColor: colors.border }]} />
                          <Text style={[catPickerStyles.optionText, isSelected && { color: colors.pillText, fontWeight: '700' }]}>
                            {cat}
                          </Text>
                          {isSelected && <SymbolView name="checkmark" size={14} tintColor={colors.pillText} />}
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity onPress={() => setCategoryPickerOpen(false)} style={catPickerStyles.cancelBtn}>
                      <Text style={catPickerStyles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </Pressable>
                </Pressable>
              </Modal>
            )}

            {/* Exercise rows */}
            {displayItems.map((item) => (
              <ExerciseRow
                key={item.key}
                item={item}
                isSelected={selectedKeys.has(item.key)}
                isDragging={draggingGroupKeys.includes(item.key)}
                isSupersetStart={supersetStarts.has(item.key)}
                isSupersetEnd={supersetEnds.has(item.key)}
                onToggleSelect={() => toggleSelect(item.key)}
                onToggleExpand={() => toggleExpand(item.key)}
                onLongPress={() => startDrag(item.key)}
                onUpdate={patch => updateItem(item.key, patch)}
                onOpenVideo={item.exercise.video_url ? () => setVideoModalUrl(item.exercise.video_url) : null}
                onItemLayout={(y, height) => {
                  if (!dragActiveRef.current) {
                    itemLayoutsRef.current[item.key] = { y, height };
                  }
                }}
              />
            ))}

            {/* Add Exercise */}
            <TouchableOpacity
              style={styles.addExBtn}
              onPress={() => { setSelectedKeys(new Set()); router.push('/(trainer)/exercise-library' as any); }}
              activeOpacity={0.8}
            >
              <SymbolView name="plus" size={16} tintColor={ACCENT} />
              <Text style={styles.addExBtnText}>Add Exercise</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Drag ghost */}
        {ghostItem && (
          <Animated.View
            pointerEvents="none"
            style={[styles.ghostCard, { transform: [{ translateY: ghostAnimY }] }]}
          >
            <Text style={styles.ghostName} numberOfLines={1}>{ghostItem.exercise.name}</Text>
            {draggingGroupKeys.length > 1 ? (
              <Text style={styles.ghostMeta}>+{draggingGroupKeys.length - 1} more · superset</Text>
            ) : ghostItem.exercise.muscle_groups[0] ? (
              <Text style={styles.ghostMeta}>{ghostItem.exercise.muscle_groups[0]}</Text>
            ) : null}
          </Animated.View>
        )}
      </View>

      {/* Multi-select action bar */}
      {selectedKeys.size >= 1 && (
        <View style={styles.actionBar}>
          <SafeAreaView edges={['bottom']} style={styles.actionBarInner}>
            {selectedKeys.size >= 2 && (
              <>
                <TouchableOpacity style={styles.actionBarBtn} onPress={applySuperset} activeOpacity={0.8}>
                  <Text style={styles.actionBarBtnText}>
                    {items.filter(i => selectedKeys.has(i.key)).every(i => i.is_superset) ? 'Remove Superset' : 'Superset'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.actionBarDivider} />
              </>
            )}
            <TouchableOpacity style={[styles.actionBarBtn, styles.actionBarDeleteBtn]} onPress={deleteSelected} activeOpacity={0.8}>
              <Text style={styles.actionBarDeleteText}>Delete</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      )}

      {videoModalUrl && (
        <VideoModal url={videoModalUrl} onClose={() => setVideoModalUrl(null)} />
      )}

      <SaveSheet
        visible={saveSheetOpen}
        initialClientId={clientId}
        saving={saving}
        defaultRoutineId={defaultRoutineId}
        onClose={() => { if (!saving) setSaveSheetOpen(false); }}
        onConfirm={handleSave}
      />

      {conflictModal && (
        <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setConflictModal(null)}>
          <Pressable style={conflictStyles.overlay} onPress={() => setConflictModal(null)}>
            <Pressable style={conflictStyles.sheet}>
              <Text style={conflictStyles.title}>Active Routine Exists</Text>
              <Text style={conflictStyles.body}>
                {`"${conflictModal.name}" is currently active. What would you like to do?`}
              </Text>
              <TouchableOpacity style={conflictStyles.primaryBtn} onPress={handleConflictConfirm} activeOpacity={0.85}>
                <Text style={conflictStyles.primaryBtnText}>{`Deactivate "${conflictModal.name}"`}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={conflictStyles.secondaryBtn} onPress={handleConflictSkip} activeOpacity={0.85}>
                <Text style={conflictStyles.secondaryBtnText}>Keep Both Active</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConflictModal(null)} hitSlop={8} style={conflictStyles.cancelWrap}>
                <Text style={conflictStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({
  item,
  isSelected,
  isDragging,
  isSupersetStart,
  isSupersetEnd,
  onToggleSelect,
  onToggleExpand,
  onLongPress,
  onUpdate,
  onOpenVideo,
  onItemLayout,
}: {
  item: BuilderExercise;
  isSelected: boolean;
  isDragging: boolean;
  isSupersetStart: boolean;
  isSupersetEnd: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onLongPress: () => void;
  onUpdate: (patch: Partial<BuilderExercise>) => void;
  onOpenVideo: (() => void) | null;
  onItemLayout: (y: number, height: number) => void;
}) {
  const summary = repSummary(item.sets);
  const firstMuscle = item.exercise.muscle_groups[0] ?? null;

  const addSet = () => {
    const last = item.sets[item.sets.length - 1];
    const next = makeSet(item.sets.length + 1);
    if (last) { next.target_reps = last.target_reps; next.target_weight_kg = last.target_weight_kg; next.rest_seconds = last.rest_seconds; }
    onUpdate({ sets: [...item.sets, next] });
  };

  const updateSet = (setKey: string, patch: Partial<BuilderSet>) =>
    onUpdate({ sets: item.sets.map(s => s.key === setKey ? { ...s, ...patch } : s) });

  const removeSet = (setKey: string) => {
    if (item.sets.length <= 1) return;
    const updated = item.sets.filter(s => s.key !== setKey).map((s, i) => ({ ...s, set_number: i + 1 }));
    onUpdate({ sets: updated });
  };

  return (
    <View
      onLayout={e => onItemLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={[isDragging ? styles.dragPlaceholder : undefined, item.is_superset && isSupersetEnd ? { marginBottom: 8 } : undefined]}
      pointerEvents={isDragging ? 'none' : 'auto'}
    >
      {isSupersetStart && item.is_superset && (
        <View style={styles.ssLabelRow}>
          <Text style={styles.ssLabelText}>SUPERSET</Text>
        </View>
      )}
      <View style={[styles.exCard, item.is_superset && styles.exCardSuperset]}>

        {/* Collapsed row */}
        <View style={styles.collapsedRow}>
          {/* Checkbox */}
          <TouchableOpacity
            style={styles.checkboxWrap}
            onPress={onToggleSelect}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <SymbolView name="checkmark" size={10} tintColor="#fff" />}
            </View>
          </TouchableOpacity>

          {/* Video thumbnail — separate tap target */}
          <ExerciseThumbnail
            thumbnailUrl={item.exercise.thumbnail_url}
            videoUrl={item.exercise.video_url}
            onPress={onOpenVideo}
          />

          {/* Content — tap to expand, long press to drag */}
          <TouchableOpacity
            style={styles.collapsedContent}
            onPress={onToggleExpand}
            onLongPress={onLongPress}
            delayLongPress={350}
            activeOpacity={0.7}
          >
            <View style={styles.collapsedInfo}>
              <Text style={styles.exName} numberOfLines={1}>{item.exercise.name}</Text>
              <View style={styles.metaRow}>
                {firstMuscle && (
                  <View style={styles.muscleTag}>
                    <Text style={styles.muscleTagText}>{firstMuscle}</Text>
                  </View>
                )}
                {item.exercise.equipment && (
                  <Text style={styles.equipText}>{item.exercise.equipment}</Text>
                )}
                <Text style={styles.repSummary}>{summary}</Text>
              </View>
            </View>
            <SymbolView name={item.expanded ? 'chevron.up' : 'chevron.down'} size={14} tintColor="#bbb" />
          </TouchableOpacity>
        </View>

      {/* Expanded section */}
      {item.expanded && (
        <>
          <View style={styles.exCardDivider} />

          {/* Column headers */}
          <View style={styles.setHeaderRow}>
            <View style={styles.setNumCol} />
            <Text style={[styles.setColLabel, styles.repsCol]}>REPS</Text>
            <Text style={[styles.setColLabel, styles.kgCol]}>KG</Text>
            <Text style={[styles.setColLabel, styles.restCol]}>REST</Text>
            <View style={styles.removeCol} />
          </View>

          {/* Set rows */}
          {item.sets.map(s => (
            <SetRow
              key={s.key}
              set={s}
              onUpdate={patch => updateSet(s.key, patch)}
              onRemove={() => removeSet(s.key)}
              canRemove={item.sets.length > 1}
            />
          ))}

          <View style={styles.exCardDivider} />

          {/* Add Set */}
          <TouchableOpacity style={styles.addSetBtn} onPress={addSet} activeOpacity={0.7}>
            <SymbolView name="plus" size={13} tintColor={ACCENT} />
            <Text style={styles.addSetBtnText}>Add Set</Text>
          </TouchableOpacity>
        </>
      )}
      </View>
      {item.is_superset && !isSupersetEnd && <View style={styles.ssGap} />}
    </View>
  );
}

// ─── ExerciseThumbnail ────────────────────────────────────────────────────────

function ExerciseThumbnail({
  thumbnailUrl,
  videoUrl,
  onPress,
}: {
  thumbnailUrl: string | null;
  videoUrl: string | null;
  onPress: (() => void) | null;
}) {
  const hasVideo = !!videoUrl;

  if (!thumbnailUrl && !videoUrl) {
    return <View style={styles.thumbDashed} />;
  }

  return (
    <TouchableOpacity
      style={styles.thumb}
      onPress={onPress ?? undefined}
      disabled={!onPress}
      activeOpacity={0.75}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.thumbImg} />
      ) : (
        <View style={[styles.thumbImg, styles.thumbDark]} />
      )}
      {hasVideo && (
        <View style={styles.thumbOverlay}>
          <View style={styles.playTriangle} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── VideoModal ───────────────────────────────────────────────────────────────

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const player = useVideoPlayer({ uri: url }, p => {
    p.loop = true;
    p.play();
  });

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.videoModalRoot}>
        <VideoView
          player={player}
          style={styles.videoView}
          contentFit="contain"
          nativeControls
        />
        <SafeAreaView edges={['top']} style={styles.videoCloseWrap} pointerEvents="box-none">
          <TouchableOpacity style={styles.videoCloseBtn} onPress={onClose} activeOpacity={0.8} hitSlop={8}>
            <Text style={styles.videoCloseBtnText}>✕</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── SetRow ───────────────────────────────────────────────────────────────────

function SetRow({ set, onUpdate, onRemove, canRemove }: { set: BuilderSet; onUpdate: (patch: Partial<BuilderSet>) => void; onRemove: () => void; canRemove: boolean }) {
  return (
    <View style={styles.setRow}>
      <Text style={styles.setNumLabel}>{set.set_number}</Text>
      <TextInput style={[styles.setInput, styles.repsCol]} value={set.target_reps} onChangeText={v => onUpdate({ target_reps: v })} keyboardType="number-pad" selectTextOnFocus placeholder="—" placeholderTextColor="#ccc" returnKeyType="done" />
      <TextInput style={[styles.setInput, styles.kgCol]} value={set.target_weight_kg} onChangeText={v => onUpdate({ target_weight_kg: v })} keyboardType="decimal-pad" selectTextOnFocus placeholder="—" placeholderTextColor="#ccc" returnKeyType="done" />
      <TextInput style={[styles.setInput, styles.restCol]} value={set.rest_seconds} onChangeText={v => onUpdate({ rest_seconds: v })} keyboardType="number-pad" selectTextOnFocus placeholder="—" placeholderTextColor="#ccc" returnKeyType="done" />
      <View style={styles.removeCol}>
        {canRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <SymbolView name="minus.circle" size={18} tintColor="#d4d4d0" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── SaveSheet ────────────────────────────────────────────────────────────────

// Universal destination picker. Build the workout first, then decide here where
// it goes — a reusable Template, or a specific client (Standalone / part of a
// routine / a new routine). When launched from a client context the client is
// already known (`initialClientId`) and the sheet opens straight on placement.
function SaveSheet({ visible, initialClientId, saving, defaultRoutineId, onClose, onConfirm }: {
  visible: boolean;
  initialClientId: string;
  saving: boolean;
  defaultRoutineId?: string;
  onClose: () => void;
  onConfirm: (intent: SaveIntent) => void;
}) {
  type Step = 'destination' | 'client' | 'placement';
  type Placement = 'standalone' | 'new-routine' | 'existing-routine';

  const [step, setStep] = useState<Step>('destination');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [placement, setPlacement] = useState<Placement>('standalone');
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';

  // Reset each time the sheet opens; jump straight to placement when the client
  // is already known (client-context launch).
  useEffect(() => {
    if (!visible) return;
    setPlacement('standalone');
    setSelectedRoutineId(null);
    setRoutines([]);
    if (initialClientId) {
      setSelectedClientId(initialClientId);
      setStep('placement');
    } else {
      setSelectedClientId('');
      setStep('destination');
    }
  }, [visible, initialClientId]);

  // Client list — only needed for the Library flow (no preset client).
  useEffect(() => {
    if (!visible || initialClientId) return;
    setClientsLoading(true);
    supabase.from('users').select('id, name').eq('role', 'client').order('name', { ascending: true })
      .then(({ data }) => {
        setClients((data ?? []).map((c: any) => ({ id: c.id, name: c.name })));
        setClientsLoading(false);
      });
  }, [visible, initialClientId]);

  // Load the selected client's active routines (+ their name for the client-
  // context launch, where the client list is never fetched).
  useEffect(() => {
    if (!visible || !selectedClientId) return;
    supabase.from('routines').select('*').eq('client_id', selectedClientId).eq('status', 'active').order('created_at', { ascending: false })
      .then(({ data }) => setRoutines((data ?? []) as Routine[]));
    if (!clients.some(c => c.id === selectedClientId)) {
      supabase.from('users').select('id, name').eq('id', selectedClientId).maybeSingle().then(({ data }) => {
        if (data) setClients(prev => prev.some(c => c.id === (data as any).id) ? prev : [...prev, { id: (data as any).id, name: (data as any).name }]);
      });
    }
  }, [visible, selectedClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default routine name + placement once routines load for the placement step.
  useEffect(() => {
    if (!visible || step !== 'placement') return;
    const firstName = selectedClientName.split(' ')[0] || 'Routine';
    setNewName(`${firstName} Routine ${toRoman(routines.length + 1)}`);
    if (defaultRoutineId && routines.some(r => r.id === defaultRoutineId)) {
      setPlacement('existing-routine');
      setSelectedRoutineId(defaultRoutineId);
    } else {
      setSelectedRoutineId(prev => prev ?? routines[0]?.id ?? null);
    }
  }, [visible, step, routines, selectedClientName, defaultRoutineId]);

  const canSavePlacement =
    placement === 'standalone' ||
    (placement === 'new-routine' && newName.trim().length > 0) ||
    (placement === 'existing-routine' && selectedRoutineId !== null);

  const confirmTemplate = () => { if (!saving) onConfirm({ type: 'template' }); };
  const confirmPlacement = () => {
    if (!canSavePlacement || !selectedClientId) return;
    if (placement === 'standalone') onConfirm({ type: 'standalone', clientId: selectedClientId });
    else if (placement === 'new-routine') onConfirm({ type: 'new-routine', clientId: selectedClientId, routineName: newName.trim() });
    else onConfirm({ type: 'existing-routine', clientId: selectedClientId, routineId: selectedRoutineId! });
  };

  const showBack = !saving && (step === 'client' || (step === 'placement' && !initialClientId));
  const goBack = () => { if (step === 'client') setStep('destination'); else setStep('client'); };
  const titleText = step === 'destination' ? 'Save workout' : step === 'client' ? 'Choose a client' : 'Where should it go?';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.overlay} onPress={saving ? undefined : onClose}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={ssStyles.titleRow}>
              {showBack ? (
                <TouchableOpacity onPress={goBack} style={ssStyles.titleSide} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <SymbolView name="chevron.left" size={18} tintColor={TEXT} />
                </TouchableOpacity>
              ) : <View style={ssStyles.titleSide} />}
              <Text style={styles.sheetTitle}>{titleText}</Text>
              <View style={ssStyles.titleSide} />
            </View>
            {step === 'placement' && !!selectedClientName && (
              <Text style={ssStyles.subtitle}>For {selectedClientName}</Text>
            )}

            {saving ? (
              <View style={ssStyles.savingWrap}>
                <ActivityIndicator color={ACCENT} />
                <Text style={ssStyles.savingText}>Saving…</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={ssStyles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {/* ── Step 1: destination ── */}
                {step === 'destination' && (
                  <>
                    <TouchableOpacity style={ssStyles.destRow} onPress={() => setStep('client')} activeOpacity={0.7}>
                      <View style={ssStyles.destIcon}><SymbolView name="person.fill" size={18} tintColor={HEADER} /></View>
                      <View style={styles.modeTextBlock}>
                        <Text style={styles.modeLabel}>Assign to a client</Text>
                        <Text style={styles.modeDesc}>Standalone, or part of a routine</Text>
                      </View>
                      <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
                    </TouchableOpacity>
                    <TouchableOpacity style={ssStyles.destRow} onPress={confirmTemplate} activeOpacity={0.7}>
                      <View style={ssStyles.destIcon}><SymbolView name="square.on.square" size={18} tintColor={HEADER} /></View>
                      <View style={styles.modeTextBlock}>
                        <Text style={styles.modeLabel}>Save as a template</Text>
                        <Text style={styles.modeDesc}>Reusable · saved to the Templates gallery</Text>
                      </View>
                      <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
                    </TouchableOpacity>
                  </>
                )}

                {/* ── Step 2: pick client ── */}
                {step === 'client' && (
                  clientsLoading ? (
                    <ActivityIndicator color={ACCENT} style={{ paddingVertical: 20 }} />
                  ) : clients.length === 0 ? (
                    <Text style={ssStyles.emptyText}>No clients yet</Text>
                  ) : (
                    clients.map((c, i) => (
                      <View key={c.id}>
                        <TouchableOpacity
                          style={ssStyles.clientRow}
                          onPress={() => { setSelectedClientId(c.id); setStep('placement'); }}
                          activeOpacity={0.7}
                        >
                          <Text style={ssStyles.clientName}>{c.name}</Text>
                          <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
                        </TouchableOpacity>
                        {i < clients.length - 1 && <View style={ssStyles.rowDivider} />}
                      </View>
                    ))
                  )
                )}

                {/* ── Step 3: placement ── */}
                {step === 'placement' && (
                  <>
                    <TouchableOpacity style={styles.modeRow} onPress={() => setPlacement('standalone')} activeOpacity={0.7}>
                      <View style={[styles.radio, placement === 'standalone' && styles.radioActive]}>
                        {placement === 'standalone' && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.modeTextBlock}>
                        <Text style={styles.modeLabel}>Standalone Workout</Text>
                        <Text style={styles.modeDesc}>Saved directly to the client's profile</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.modeRow} onPress={() => setPlacement('new-routine')} activeOpacity={0.7}>
                      <View style={[styles.radio, placement === 'new-routine' && styles.radioActive]}>
                        {placement === 'new-routine' && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.modeTextBlock}>
                        <Text style={styles.modeLabel}>Save as New Routine</Text>
                        <Text style={styles.modeDesc}>Creates a new training routine</Text>
                      </View>
                    </TouchableOpacity>

                    {placement === 'new-routine' && (
                      <View style={styles.routineSection}>
                        <TextInput
                          style={styles.newRoutineInput}
                          value={newName}
                          onChangeText={setNewName}
                          placeholder="Routine name..."
                          placeholderTextColor="#bbb"
                          autoCapitalize="words"
                          returnKeyType="done"
                        />
                      </View>
                    )}

                    {routines.length > 0 && (
                      <TouchableOpacity style={styles.modeRow} onPress={() => setPlacement('existing-routine')} activeOpacity={0.7}>
                        <View style={[styles.radio, placement === 'existing-routine' && styles.radioActive]}>
                          {placement === 'existing-routine' && <View style={styles.radioDot} />}
                        </View>
                        <View style={styles.modeTextBlock}>
                          <Text style={styles.modeLabel}>Add to Existing Routine</Text>
                          <Text style={styles.modeDesc}>Add to an existing training routine</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {placement === 'existing-routine' && routines.length > 0 && (
                      <View style={styles.routineSection}>
                        {routines.map(r => (
                          <TouchableOpacity
                            key={r.id}
                            style={styles.routinePickRow}
                            onPress={() => setSelectedRoutineId(r.id)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.radio, selectedRoutineId === r.id && styles.radioActive]}>
                              {selectedRoutineId === r.id && <View style={styles.radioDot} />}
                            </View>
                            <Text style={styles.routinePickName}>{r.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}

                <View style={{ height: 8 }} />
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.sheetFooter}>
              {step === 'placement' && !saving && (
                <TouchableOpacity
                  style={[styles.sheetSaveBtn, !canSavePlacement && styles.sheetSaveBtnDisabled]}
                  onPress={confirmPlacement}
                  disabled={!canSavePlacement}
                  activeOpacity={0.85}
                >
                  <Text style={styles.sheetSaveBtnText}>Save Workout</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.sheetCancelBtn} disabled={saving}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const catPickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 32 },
  box: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', paddingBottom: 8 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT, textAlign: 'center', paddingVertical: 16 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 13,
  },
  optionActive: { backgroundColor: '#f5f5f3' },
  optionDot: { width: 10, height: 10, borderRadius: 5 },
  optionText: { flex: 1, fontSize: 15, color: TEXT },
  optionTextActive: { color: ACCENT, fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#f0f0ee', marginVertical: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  cancelText: { fontSize: 14, color: MUTED },
});

// SaveSheet (universal destination picker) styles
const ssStyles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  titleSide: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  subtitle: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 3, marginBottom: 6 },
  scrollContent: { paddingTop: 4 },
  savingWrap: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 36 },
  savingText: { fontSize: 14, color: MUTED },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 20 },
  destIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f0f0ee', alignItems: 'center', justifyContent: 'center' },
  clientRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20 },
  clientName: { fontSize: 16, color: TEXT, fontWeight: '500' },
  rowDivider: { height: 1, backgroundColor: '#f0f0ee' },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center', paddingVertical: 24 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER },
  flex: { flex: 1 },
  headerSafe: { backgroundColor: HEADER },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  saveHeaderBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7 },
  saveHeaderBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  content: { backgroundColor: BG, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 },

  // Cover image picker
  coverPicker: { width: '100%', aspectRatio: 16 / 9, borderRadius: RADIUS, overflow: 'hidden', marginBottom: 12 },
  coverPickerImg: { width: '100%', height: '100%' },
  coverPickerBadgeRow: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', gap: 8 },
  coverPickerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  coverPickerRemoveBadge: { backgroundColor: 'rgba(180,0,0,0.6)' },
  coverPickerBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  coverPickerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CARD, borderRadius: RADIUS, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  coverPickerEmptyText: { fontSize: 14, fontWeight: '600', color: MUTED },
  coverPickerEmptyHint: { fontSize: 12, color: '#bbb' },

  nameCard: { backgroundColor: CARD, borderRadius: RADIUS, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  nameInput: { fontSize: 17, fontWeight: '600', color: TEXT, paddingHorizontal: 16, paddingVertical: 14 },
  nameCardDivider: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 0 },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  categoryRowLabel: { fontSize: 15, fontWeight: '600', color: TEXT, flex: 1 },
  categoryRowPill: { borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3 },
  categoryRowPillText: { fontSize: 12, fontWeight: '700' },
  categoryRowMuted: { fontSize: 14, color: '#bbb' },

  stretchTypeSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  stretchTypeLabel: { fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 10 },
  stretchTypeSwitcher: { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  stretchTypeBtn: { flex: 1, borderRadius: 100, paddingVertical: 7, alignItems: 'center' },
  stretchTypeBtnActive: { backgroundColor: '#fff' },
  stretchTypeBtnText: { fontSize: 12, fontWeight: '600', color: MUTED },
  stretchTypeBtnTextActive: { color: TEXT, fontWeight: '700' },

  // ─── Exercise card ─────────────────────────────────────────────────────────
  exCard: { backgroundColor: CARD, borderRadius: RADIUS, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  exCardSuperset: { borderLeftWidth: 3, borderRightWidth: 3, borderLeftColor: HEADER, borderRightColor: HEADER, marginBottom: 0 },
  ssLabelRow: { paddingLeft: 4, marginBottom: 4 },
  ssLabelText: { fontSize: 12, fontWeight: '600', color: HEADER, letterSpacing: 0.5 },
  ssGap: { height: 6, backgroundColor: BG },
  // Invisible placeholder while item is floating as ghost
  dragPlaceholder: { opacity: 0 },

  // Drag ghost
  ghostCard: { position: 'absolute', left: 16, right: 16, backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1.5, borderColor: ACCENT, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 12 },
  ghostName: { fontSize: 15, fontWeight: '700', color: TEXT },
  ghostMeta: { fontSize: 12, color: MUTED, marginTop: 2 },


  // Collapsed row
  collapsedRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 12, minHeight: 56 },
  checkboxWrap: { width: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#d4d4d0', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  collapsedContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  collapsedInfo: { flex: 1, gap: 4 },
  exName: { fontSize: 15, fontWeight: '600', color: TEXT },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  muscleTag: { backgroundColor: '#e6f7f3', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  muscleTagText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  equipText: { fontSize: 12, color: MUTED },
  repSummary: { fontSize: 12, color: '#bbb', fontVariant: ['tabular-nums'] },

  exCardDivider: { height: 1, backgroundColor: '#f0f0f0' },

  // Set table
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2, gap: 6 },
  setColLabel: { fontSize: 10, fontWeight: '700', color: '#bbb', letterSpacing: 0.8, textAlign: 'center' },
  setNumCol: { width: 24 },
  repsCol: { flex: 1 },
  kgCol: { flex: 1.4 },
  restCol: { flex: 1 },
  removeCol: { width: 28, alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, gap: 6 },
  setNumLabel: { width: 24, fontSize: 13, fontWeight: '600', color: MUTED, textAlign: 'center' },
  setInput: { backgroundColor: '#f5f5f3', borderRadius: 7, paddingVertical: 7, paddingHorizontal: 4, fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },

  addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  addSetBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },

  // Video thumbnail
  thumb: { width: 36, height: 36, borderRadius: 8, marginLeft: 8, marginRight: 8, overflow: 'hidden' },
  thumbImg: { width: 36, height: 36 },
  thumbDark: { backgroundColor: '#2a2a2a' },
  thumbOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  playTriangle: { width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 9, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 2 },
  thumbDashed: { width: 36, height: 36, borderRadius: 8, marginLeft: 8, marginRight: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d4d4d0' },

  // Video modal
  videoModalRoot: { flex: 1, backgroundColor: '#000' },
  videoView: { flex: 1 },
  videoCloseWrap: { position: 'absolute', top: 0, right: 0, left: 0 },
  videoCloseBtn: { alignSelf: 'flex-end', margin: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  videoCloseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Add Exercise button
  addExBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CARD, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, paddingVertical: 14, marginTop: 4 },
  addExBtnText: { fontSize: 15, fontWeight: '700', color: ACCENT },

  // Multi-select action bar
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 },
  actionBarInner: { flexDirection: 'row', alignItems: 'center' },
  actionBarBtn: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  actionBarDeleteBtn: {},
  actionBarBtnText: { fontSize: 15, fontWeight: '700', color: HEADER },
  actionBarDeleteText: { fontSize: 15, fontWeight: '700', color: '#e53935' },
  actionBarDivider: { width: 1, height: 36, backgroundColor: BORDER },

  // Save Sheet — centered white modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  sheet: { backgroundColor: CARD, borderRadius: 16, overflow: 'hidden', paddingTop: 20 },
  sheetScroll: { maxHeight: 320 },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  modeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#d4d4d0', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: HEADER },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: HEADER },
  modeTextBlock: { flex: 1, gap: 2 },
  modeLabel: { fontSize: 15, fontWeight: '600', color: TEXT },
  modeDesc: { fontSize: 12, color: MUTED },
  routineSection: { marginHorizontal: 16, marginTop: 6, marginBottom: 2, backgroundColor: BG, borderRadius: 12, overflow: 'hidden' },
  routinePickRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  routinePickName: { fontSize: 15, color: TEXT, fontWeight: '500' },
  newRoutineInput: { fontSize: 15, color: TEXT, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER },
  sheetFooter: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16 },
  sheetSaveBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  sheetSaveBtnDisabled: { opacity: 0.4 },
  sheetSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sheetCancelBtn: { alignItems: 'center', paddingTop: 12, paddingBottom: 2 },
  sheetCancelText: { fontSize: 14, color: MUTED },
});

const conflictStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  body: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: { backgroundColor: '#e8e8e4', borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  secondaryBtnText: { color: TEXT, fontWeight: '600', fontSize: 14 },
  cancelWrap: { alignItems: 'center', paddingVertical: 4 },
  cancelText: { fontSize: 14, color: MUTED },
});
