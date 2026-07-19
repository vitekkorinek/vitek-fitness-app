import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import { BottomSheet } from '@/components/BottomSheet';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import CategoryCover, { categoryHasCover, WORKOUT_COVER_PHOTOS_ENABLED } from '@/components/CategoryCover';
import type { Routine } from '@/types/database';

type RoutineWorkout = {
  id: string;
  name: string;
  orderIndex: number;
  category: string | null;
  cover_image_url: string | null;
  lastSessionDate: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  equipment_list: string[];
  muscle_groups: string[];
};

async function fetchRoutineDetail(routineId: string, clientId: string): Promise<{
  routine: Routine | null;
  workouts: RoutineWorkout[];
  currentCycleDone: Set<string>;
  cycleJustCompleted: boolean;
}> {
  const [{ data: routineData }, { data: workoutData }] = await Promise.all([
    supabase.from('routines').select('*').eq('id', routineId).single(),
    supabase.from('workouts').select('id, name, order_index, category, cover_image_url').eq('routine_id', routineId).order('order_index'),
  ]);

  if (!workoutData?.length) {
    return { routine: routineData as Routine | null, workouts: [], currentCycleDone: new Set(), cycleJustCompleted: false };
  }

  const workoutIds = (workoutData as any[]).map(w => w.id);
  const { data: sessionsData } = await supabase
    .from('sessions')
    .select('workout_id, date, created_at')
    .in('workout_id', workoutIds)
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  const totalWorkouts = workoutIds.length;
  let currentCycleDone = new Set<string>();
  let hasCyclesCompleted = false;
  const lastDateMap = new Map<string, string>();

  for (const s of (sessionsData ?? []) as { workout_id: string; date: string }[]) {
    currentCycleDone.add(s.workout_id);
    lastDateMap.set(s.workout_id, s.date); // ascending order → last write = most recent date
    if (currentCycleDone.size === totalWorkouts) {
      currentCycleDone = new Set();
      hasCyclesCompleted = true;
    }
  }

  const cycleJustCompleted = hasCyclesCompleted && currentCycleDone.size === 0;

  return {
    routine: routineData as Routine | null,
    workouts: (workoutData as any[]).map(w => ({
      id: w.id,
      name: w.name,
      orderIndex: w.order_index,
      category: w.category ?? null,
      cover_image_url: w.cover_image_url ?? null,
      lastSessionDate: lastDateMap.get(w.id) ?? null,
    })),
    currentCycleDone,
    cycleJustCompleted,
  };
}

export default function RoutineDetailScreen() {
  const { id: clientId, routineId } = useLocalSearchParams<{ id: string; routineId: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [workouts, setWorkouts] = useState<RoutineWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [currentCycleDone, setCurrentCycleDone] = useState<Set<string>>(new Set());
  const [cycleJustCompleted, setCycleJustCompleted] = useState(false);
  const [historyModal, setHistoryModal] = useState(false);
  const [reorderModal, setReorderModal] = useState(false);
  const [reorderList, setReorderList] = useState<RoutineWorkout[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  // Workout ⋯ menu state
  const [activeMenu, setActiveMenu] = useState<RoutineWorkout | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [routinePickerId, setRoutinePickerId] = useState<string | null>(null);
  const [quickLookWorkout, setQuickLookWorkout] = useState<{ id: string; name: string; category: string | null } | null>(null);
  const [quickLookVisible, setQuickLookVisible] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message?: string; confirmLabel: string; danger?: boolean; onConfirm: () => void;
  } | null>(null);

  // Add popup state
  const [addModal, setAddModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const startRename = () => {
    if (!activeMenu) return;
    setRenameText(activeMenu.name);
    setRenamingId(activeMenu.id);
    setActiveMenu(null);
  };

  const confirmRename = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingId(null); return; }
    await supabase.from('workouts').update({ name: trimmed }).eq('id', id);
    setWorkouts(prev => prev.map(w => w.id === id ? { ...w, name: trimmed } : w));
    setRenamingId(null);
  };

  const startDelete = () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    setConfirmModal({
      title: 'Delete this workout?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await supabase.from('workouts').delete().eq('id', target.id);
        setWorkouts(prev => prev.filter(w => w.id !== target.id));
        setConfirmModal(null);
      },
    });
  };

  const openRoutinePicker = () => {
    if (!activeMenu) return;
    setRoutinePickerId(activeMenu.id);
    setActiveMenu(null);
  };

  const handleAddToRoutine = async (workoutId: string, destRoutineId: string) => {
    await supabase.from('workouts').update({ routine_id: destRoutineId }).eq('id', workoutId);
    setRoutinePickerId(null);
    await load();
  };

  const openChangeCover = async () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to set a cover image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const uri = result.assets[0].uri;
      const filename = `${clientId}/${target.id}-${Date.now()}.jpg`;
      const resp = await fetch(uri);
      const buf = await resp.arrayBuffer();
      const { data, error } = await supabase.storage.from('workout-covers').upload(filename, buf, { contentType: 'image/jpeg', upsert: true });
      if (error || !data) { Alert.alert('Upload failed', 'Could not save the cover photo.'); return; }
      const { data: urlData } = supabase.storage.from('workout-covers').getPublicUrl(data.path);
      await supabase.from('workouts').update({ cover_image_url: urlData.publicUrl }).eq('id', target.id);
      setWorkouts(prev => prev.map(w => w.id === target.id ? { ...w, cover_image_url: urlData.publicUrl } : w));
    } catch {
      Alert.alert('Upload failed', 'Could not save the cover photo.');
    }
  };

  const openViewExercises = () => {
    if (!activeMenu) return;
    setQuickLookWorkout({ id: activeMenu.id, name: activeMenu.name, category: activeMenu.category });
    setQuickLookVisible(true);
    setActiveMenu(null);
  };

  const load = useCallback(async () => {
    const { routine: r, workouts: w, currentCycleDone: ccd, cycleJustCompleted: cjc } = await fetchRoutineDetail(routineId, clientId);
    setRoutine(r);
    setWorkouts(w);
    setCurrentCycleDone(ccd);
    setCycleJustCompleted(cjc);
  }, [routineId, clientId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openReorder = () => {
    setReorderList([...workouts].sort((a, b) => a.orderIndex - b.orderIndex));
    setReorderModal(true);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    await Promise.all(
      reorderList.map((w, i) => supabase.from('workouts').update({ order_index: i }).eq('id', w.id))
    );
    setWorkouts(reorderList.map((w, i) => ({ ...w, orderIndex: i })));
    setReorderModal(false);
    setSavingOrder(false);
  };

  const openTemplateModal = useCallback(async () => {
    setAddModal(false);
    setLoadingTemplates(true);
    setTemplateModal(true);
    const { data } = await supabase
      .from('workout_templates')
      .select('id, name, description, equipment_list, muscle_groups')
      .order('created_at', { ascending: false });
    setTemplates((data ?? []) as TemplateRow[]);
    setLoadingTemplates(false);
  }, []);

  const handleApplyTemplate = useCallback(async (template: TemplateRow) => {
    if (!profile) return;
    setApplyingTemplate(true);

    try {
      const { count } = await supabase
        .from('workouts')
        .select('*', { count: 'exact', head: true })
        .eq('routine_id', routineId);

      const { data: wData, error: wErr } = await supabase
        .from('workouts')
        .insert({
          name: template.name,
          client_id: clientId,
          routine_id: routineId,
          created_by: profile.id,
          equipment_list: template.equipment_list ?? [],
          muscle_groups: template.muscle_groups ?? [],
          order_index: count ?? 0,
        })
        .select()
        .single();

      if (wErr || !wData) throw wErr;
      const workoutId = (wData as any).id;

      const { data: teData } = await supabase
        .from('template_exercises')
        .select('*')
        .eq('template_id', template.id)
        .order('order_index');

      if (teData?.length) {
        const weInserts = (teData as any[]).map((te) => ({
          workout_id: workoutId,
          exercise_id: te.exercise_id,
          order_index: te.order_index,
          notes: te.notes ?? null,
          is_superset: te.is_superset ?? false,
          superset_group_id: te.superset_group_id ?? null,
          equipment_type: te.equipment_type ?? null,
          barbell_weight_kg: te.barbell_weight_kg ?? null,
        }));

        const { data: weData } = await supabase
          .from('workout_exercises')
          .insert(weInserts)
          .select();

        if (weData?.length) {
          const teIds = (teData as any[]).map((te) => te.id);
          const { data: tsData } = await supabase
            .from('template_sets')
            .select('*')
            .in('template_exercise_id', teIds);

          if (tsData?.length) {
            const teToWeId = new Map<string, string>();
            (weData as any[]).forEach((we, i) => teToWeId.set((teData as any[])[i].id, we.id));

            const wsInserts = (tsData as any[])
              .map((ts) => ({
                workout_exercise_id: teToWeId.get(ts.template_exercise_id),
                set_number: ts.set_number,
                target_reps: ts.target_reps ?? null,
                target_weight_kg: ts.target_weight_kg ?? null,
                rest_seconds: ts.rest_seconds ?? null,
                is_added_during_session: false,
              }))
              .filter((ws) => ws.workout_exercise_id);

            if (wsInserts.length) {
              await supabase.from('workout_sets').insert(wsInserts);
            }
          }
        }
      }

      setTemplateModal(false);
      await load();
    } catch {
      Alert.alert('Error', 'Could not apply template. Please try again.');
    } finally {
      setApplyingTemplate(false);
    }
  }, [profile, clientId, routineId, load]);

  const isActive = routine?.status === 'active';

  const byOrder = [...workouts].sort((a, b) => a.orderIndex - b.orderIndex);
  let nextUp: RoutineWorkout | null = null;
  let queueWorkouts: RoutineWorkout[] = [];
  let completedWorkouts: RoutineWorkout[] = [];

  if (workouts.length > 0 && !cycleJustCompleted) {
    const neverDone = byOrder.filter(w => !currentCycleDone.has(w.id));
    const doneOnce  = byOrder.filter(w => currentCycleDone.has(w.id));
    nextUp            = neverDone[0] ?? null;
    queueWorkouts     = neverDone.slice(1);
    completedWorkouts = doneOnce;
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerTitle} numberOfLines={1}>{routine?.name ?? 'Routine'}</Text>
              <TouchableOpacity onPress={() => setHistoryModal(true)} hitSlop={8} style={styles.infoBtn} activeOpacity={0.7}>
                <Text style={styles.infoBtnText}>i</Text>
              </TouchableOpacity>
            </View>
            {isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setAddModal(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.addBtn}
          >
            <SymbolView name="plus" size={16} tintColor="#ffffff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {workouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No workouts in this routine</Text>
              <Text style={styles.emptySub}>Tap + to add a workout</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={secStyles.cycleRow}>
                <View style={secStyles.cycleHeader}>
                  <Text style={secStyles.cycleLabel}>PROGRAM ORDER</Text>
                  <TouchableOpacity onPress={openReorder} hitSlop={8} activeOpacity={0.7}>
                    <Text style={secStyles.cycleEdit}>Edit</Text>
                  </TouchableOpacity>
                </View>
                <View style={secStyles.stripsRow}>
                  {byOrder.map(w => {
                    const color = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
                    const isDoneW = currentCycleDone.has(w.id);
                    const isNextW = !cycleJustCompleted && nextUp?.id === w.id;
                    return (
                      <View key={w.id} style={[secStyles.strip, { backgroundColor: color, opacity: cycleJustCompleted || isDoneW || isNextW ? 1 : 0.4 }]} />
                    );
                  })}
                </View>
                <View style={secStyles.labelsRow}>
                  {byOrder.map(w => {
                    const isDoneW = currentCycleDone.has(w.id);
                    const isNextW = !cycleJustCompleted && nextUp?.id === w.id;
                    const statusChar = cycleJustCompleted ? '✓' : isNextW ? '→' : isDoneW ? '✓' : '—';
                    const statusColor = cycleJustCompleted || isDoneW || isNextW ? ACCENT : '#ccc';
                    const label = w.name.length > 10 ? w.name.slice(0, 9) + '…' : w.name;
                    return (
                      <View key={w.id} style={secStyles.labelCell}>
                        <Text style={secStyles.labelText} numberOfLines={1}>{label}</Text>
                        <Text style={[secStyles.statusChar, { color: statusColor }]}>{statusChar}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {cycleJustCompleted ? (
                <>
                  <View style={secStyles.restartHeader}>
                    <Text style={secStyles.restartTitle}>Start routine again?</Text>
                    <Text style={secStyles.restartSub}>Start with</Text>
                  </View>
                  {byOrder[0] && (
                    <WorkoutItem
                      workout={byOrder[0]}
                      isDone={false}
                      isRenaming={renamingId === byOrder[0].id}
                      renameText={renameText}
                      onRenameChange={setRenameText}
                      onRenameConfirm={() => confirmRename(byOrder[0].id, renameText)}
                      onRenameCancel={() => setRenamingId(null)}
                      onPress={() => router.push(`/(trainer)/client/${clientId}/workout/${byOrder[0].id}` as any)}
                      onMenuPress={() => setActiveMenu(byOrder[0])}
                    />
                  )}
                </>
              ) : (
                <>
                  {nextUp && (
                    <>
                      <Text style={secStyles.label}>NEXT UP</Text>
                      <WorkoutItem
                        workout={nextUp}
                        isDone={false}
                        isRenaming={renamingId === nextUp.id}
                        renameText={renameText}
                        onRenameChange={setRenameText}
                        onRenameConfirm={() => confirmRename(nextUp.id, renameText)}
                        onRenameCancel={() => setRenamingId(null)}
                        onPress={() => router.push(`/(trainer)/client/${clientId}/workout/${nextUp.id}` as any)}
                        onMenuPress={() => setActiveMenu(nextUp)}
                      />
                    </>
                  )}
                  {queueWorkouts.map(w => (
                    <WorkoutItem
                      key={w.id}
                      workout={w}
                      isDone={false}
                      isRenaming={renamingId === w.id}
                      renameText={renameText}
                      onRenameChange={setRenameText}
                      onRenameConfirm={() => confirmRename(w.id, renameText)}
                      onRenameCancel={() => setRenamingId(null)}
                      onPress={() => router.push(`/(trainer)/client/${clientId}/workout/${w.id}` as any)}
                      onMenuPress={() => setActiveMenu(w)}
                    />
                  ))}
                  {completedWorkouts.length > 0 && (
                    <>
                      <Text style={[secStyles.label, secStyles.completedLabel]}>COMPLETED</Text>
                      {completedWorkouts.map(w => (
                        <WorkoutItem
                          key={w.id}
                          workout={w}
                          isDone={true}
                          isRenaming={renamingId === w.id}
                          renameText={renameText}
                          onRenameChange={setRenameText}
                          onRenameConfirm={() => confirmRename(w.id, renameText)}
                          onRenameCancel={() => setRenamingId(null)}
                          onPress={() => router.push(`/(trainer)/client/${clientId}/workout/${w.id}` as any)}
                          onMenuPress={() => setActiveMenu(w)}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Add modal ─────────────────────────────────────────────────────────── */}
      {addModal && (
        <BottomSheet onClose={() => setAddModal(false)}>{close => (<>
          <Text style={popStyles.heading}>Add to Routine</Text>

          <TouchableOpacity
            style={popStyles.option}
            activeOpacity={0.7}
            onPress={() => close(() => router.push(`/(trainer)/workout-builder?clientId=${clientId}&routineId=${routineId}` as any))}
          >
            <SymbolView name="dumbbell" size={18} tintColor={HEADER} />
            <Text style={popStyles.optionText}>New Workout</Text>
          </TouchableOpacity>

          <View style={popStyles.divider} />

          <TouchableOpacity
            style={popStyles.option}
            activeOpacity={0.7}
            onPress={() => close(() => router.push(`/(trainer)/workout-picker?clientId=${clientId}&routineId=${routineId}` as any))}
          >
            <SymbolView name="books.vertical" size={18} tintColor={HEADER} />
            <Text style={popStyles.optionText}>From Workouts</Text>
          </TouchableOpacity>

          <View style={popStyles.divider} />

          <TouchableOpacity
            style={popStyles.option}
            activeOpacity={0.7}
            onPress={() => close(openTemplateModal)}
          >
            <SymbolView name="doc.on.doc" size={18} tintColor={HEADER} />
            <Text style={popStyles.optionText}>From Template</Text>
          </TouchableOpacity>

          <View style={popStyles.divider} />

          <TouchableOpacity
            style={popStyles.option}
            activeOpacity={0.7}
            onPress={() => close(() => router.push(`/(trainer)/client/${clientId}/workout/free` as any))}
          >
            <SymbolView name="timer" size={18} tintColor={ACCENT} />
            <Text style={[popStyles.optionText, { color: ACCENT }]}>Start Free Session</Text>
          </TouchableOpacity>

          <TouchableOpacity style={popStyles.cancelBtn} onPress={() => close()}>
            <Text style={popStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </>)}</BottomSheet>
      )}

      {/* ── History modal ─────────────────────────────────────────────────────── */}
      {routine && historyModal && (
        <BottomSheet onClose={() => setHistoryModal(false)}>{close => (<>
          <Text style={popStyles.heading}>Routine History</Text>
          <View style={{ width: '100%', paddingHorizontal: 20, paddingBottom: 8 }}>
            {buildPeriods(routine.created_at, routine.status_history ?? [], routine.closed_at).map((p, i) => (
              <View key={i} style={histStyles.periodRow}>
                <View style={[histStyles.dot, p.to === null && histStyles.dotActive]} />
                <Text style={histStyles.periodText}>
                  {fmtDate(p.from)}{' – '}{p.to === null ? 'present' : fmtDate(p.to)}
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={popStyles.cancelBtn} onPress={() => close()}>
            <Text style={popStyles.cancelText}>Close</Text>
          </TouchableOpacity>
        </>)}</BottomSheet>
      )}

      {/* ── Reorder modal ────────────────────────────────────────────────────────── */}
      <Modal visible={reorderModal} transparent animationType="fade" onRequestClose={() => { if (!savingOrder) setReorderModal(false); }}>
        <Pressable style={popStyles.overlay} onPress={() => { if (!savingOrder) setReorderModal(false); }}>
          <Pressable style={popStyles.card} onPress={() => {}}>
            <Text style={popStyles.heading}>Edit Order</Text>
            <View style={{ width: '100%', paddingBottom: 4 }}>
              {reorderList.map((w, i) => {
                const color = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
                return (
                  <View key={w.id} style={reorderStyles.row}>
                    <View style={[reorderStyles.dot, { backgroundColor: color }]} />
                    <Text style={reorderStyles.name} numberOfLines={1}>{w.name}</Text>
                    <View style={reorderStyles.arrowBtns}>
                      <TouchableOpacity
                        hitSlop={8}
                        disabled={i === 0}
                        onPress={() => setReorderList(prev => {
                          const next = [...prev];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          return next;
                        })}
                      >
                        <SymbolView name="chevron.up" size={16} tintColor={i === 0 ? '#ddd' : HEADER} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        hitSlop={8}
                        disabled={i === reorderList.length - 1}
                        onPress={() => setReorderList(prev => {
                          const next = [...prev];
                          [next[i], next[i + 1]] = [next[i + 1], next[i]];
                          return next;
                        })}
                      >
                        <SymbolView name="chevron.down" size={16} tintColor={i === reorderList.length - 1 ? '#ddd' : HEADER} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              style={reorderStyles.saveBtn}
              onPress={saveOrder}
              disabled={savingOrder}
            >
              {savingOrder
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={reorderStyles.saveBtnText}>Save Order</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={popStyles.cancelBtn} onPress={() => { if (!savingOrder) setReorderModal(false); }}>
              <Text style={popStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Confirm (delete) modal ────────────────────────────────────────────── */}
      {confirmModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
          <Pressable style={popStyles.overlay} onPress={() => setConfirmModal(null)}>
            <Pressable style={popStyles.card} onPress={() => {}}>
              <Text style={popStyles.heading}>{confirmModal.title}</Text>
              {confirmModal.message && (
                <Text style={{ fontSize: 13, color: '#999', textAlign: 'center', paddingHorizontal: 20, marginBottom: 4 }}>
                  {confirmModal.message}
                </Text>
              )}
              <TouchableOpacity
                style={[popStyles.option, { justifyContent: 'center' }]}
                onPress={confirmModal.onConfirm}
                activeOpacity={0.7}
              >
                <Text style={[popStyles.optionText, { textAlign: 'center', color: confirmModal.danger ? '#ef4444' : ACCENT }]}>
                  {confirmModal.confirmLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={popStyles.cancelBtn} onPress={() => setConfirmModal(null)}>
                <Text style={popStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Workout ⋯ menu ────────────────────────────────────────────────────── */}
      {activeMenu && (
        <WorkoutMenuModal
          workoutName={activeMenu.name}
          onRename={startRename}
          onDelete={startDelete}
          onAddToRoutine={openRoutinePicker}
          onChangeCover={openChangeCover}
          onViewExercises={openViewExercises}
          onClose={() => setActiveMenu(null)}
        />
      )}

      <SessionDetailsSheet
        visible={quickLookVisible}
        onClose={() => setQuickLookVisible(false)}
        workoutId={quickLookWorkout?.id ?? null}
        workoutName={quickLookWorkout?.name ?? ''}
        category={quickLookWorkout?.category ?? null}
        sessionId={null}
        clientId={clientId}
        onOpenFullView={(wid) => router.push(`/(trainer)/client/${clientId}/workout/${wid}?viewOnly=1` as any)}
      />

      {/* ── Routine picker (Add to Routine) ───────────────────────────────────── */}
      {routinePickerId && (
        <RoutinePickerModal
          clientId={clientId}
          onPick={destRoutineId => handleAddToRoutine(routinePickerId, destRoutineId)}
          onClose={() => setRoutinePickerId(null)}
        />
      )}

      {/* ── Template picker modal ──────────────────────────────────────────────── */}
      {templateModal && (
        <BottomSheet onClose={() => setTemplateModal(false)}>{close => (<>
          <Text style={popStyles.heading}>Pick a Template</Text>

          {loadingTemplates ? (
            <ActivityIndicator color={ACCENT} style={{ marginVertical: 20 }} />
          ) : templates.length === 0 ? (
            <View style={popStyles.emptyWrap}>
              <Text style={popStyles.emptyText}>No templates yet</Text>
              <Text style={popStyles.emptySub}>Build templates in the Library tab</Text>
            </View>
          ) : (
            templates.map((t, i) => (
              <View key={t.id} style={{ width: '100%' }}>
                {i > 0 && <View style={popStyles.divider} />}
                <TouchableOpacity
                  style={popStyles.option}
                  activeOpacity={0.7}
                  onPress={() => handleApplyTemplate(t)}
                  disabled={applyingTemplate}
                >
                  <SymbolView name="doc.on.doc" size={18} tintColor={HEADER} />
                  <Text style={popStyles.optionText}>{t.name}</Text>
                  {applyingTemplate && <ActivityIndicator size="small" color={ACCENT} />}
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity style={popStyles.cancelBtn} onPress={() => { if (!applyingTemplate) close(); }}>
            <Text style={popStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </>)}</BottomSheet>
      )}
    </View>
  );
}

// ─── WorkoutItem ──────────────────────────────────────────────────────────────

function WorkoutItem({
  workout, isDone, isRenaming, renameText, onRenameChange, onRenameConfirm, onRenameCancel, onPress, onMenuPress,
}: {
  workout: RoutineWorkout;
  isDone: boolean;
  isRenaming: boolean;
  renameText: string;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onPress: () => void;
  onMenuPress: () => void;
}) {
  const gradColors = (CATEGORY_GRADIENTS[workout.category ?? ''] ?? GRADIENT_DEFAULT) as [string, string];
  const catColors = workout.category ? CATEGORY_COLORS[workout.category as WorkoutCategory] : null;
  const lastDoneText = workout.lastSessionDate ? relativeTime(workout.lastSessionDate) : 'Not yet done';

  if (isRenaming) {
    return (
      <View style={styles.renameRow}>
        <TextInput
          style={styles.renameInput}
          value={renameText}
          onChangeText={onRenameChange}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={onRenameConfirm}
        />
        <TouchableOpacity onPress={onRenameConfirm} hitSlop={8} style={styles.renameBtn}>
          <SymbolView name="checkmark" size={14} tintColor={ACCENT} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRenameCancel} hitSlop={8} style={styles.renameBtn}>
          <SymbolView name="xmark" size={13} tintColor="#aaa" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={coverCardStyles.card} onPress={onPress} activeOpacity={0.92}>
      {WORKOUT_COVER_PHOTOS_ENABLED && workout.cover_image_url ? (
        <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : categoryHasCover(workout.category) ? (
        <CategoryCover category={workout.category} variant="color" />
      ) : (
        <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <TouchableOpacity style={[coverCardStyles.menuBtn, isDone && { right: 34 }]} onPress={onMenuPress} hitSlop={8} activeOpacity={0.5}>
        <SymbolView name="ellipsis" size={14} tintColor="rgba(255,255,255,0.9)" />
      </TouchableOpacity>
      {isDone && (
        <View style={coverCardStyles.doneBadge}>
          <SymbolView name="checkmark" size={9} tintColor="#fff" />
        </View>
      )}
      <View style={coverCardStyles.bottom}>
        <View style={coverCardStyles.bottomLeft}>
          <Text style={coverCardStyles.itemName} numberOfLines={1}>{workout.name}</Text>
          <Text style={coverCardStyles.itemSub} numberOfLines={1}>{lastDoneText}</Text>
        </View>
        {catColors && (
          <View style={[coverCardStyles.catPill, { backgroundColor: catColors.border }]}>
            <Text style={coverCardStyles.catPillText}>{workout.category}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── WorkoutMenuModal ─────────────────────────────────────────────────────────

function WorkoutMenuModal({
  workoutName, onRename, onDelete, onAddToRoutine, onChangeCover, onViewExercises, onClose,
}: {
  workoutName: string; onRename: () => void; onDelete: () => void;
  onAddToRoutine: () => void; onChangeCover: () => void; onViewExercises: () => void; onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>{close => (<>
      <Text style={menuStyles.sheetTitle} numberOfLines={1}>{workoutName}</Text>
      <View style={menuStyles.sheetDivider} />
      <TouchableOpacity style={menuStyles.option} onPress={() => close(onViewExercises)} activeOpacity={0.7}>
        <SymbolView name="list.bullet" size={16} tintColor="#1a1a1a" />
        <Text style={menuStyles.optionText}>View exercises</Text>
      </TouchableOpacity>
      <View style={menuStyles.optionDivider} />
      <TouchableOpacity style={menuStyles.option} onPress={() => close(onRename)} activeOpacity={0.7}>
        <SymbolView name="pencil" size={16} tintColor="#1a1a1a" />
        <Text style={menuStyles.optionText}>Rename</Text>
      </TouchableOpacity>
      <View style={menuStyles.optionDivider} />
      <TouchableOpacity style={menuStyles.option} onPress={() => close(onChangeCover)} activeOpacity={0.7}>
        <SymbolView name="photo" size={16} tintColor="#1a1a1a" />
        <Text style={menuStyles.optionText}>Change Photo</Text>
      </TouchableOpacity>
      <View style={menuStyles.optionDivider} />
      <TouchableOpacity style={menuStyles.option} onPress={() => close(onAddToRoutine)} activeOpacity={0.7}>
        <SymbolView name="plus.circle" size={16} tintColor="#1a1a1a" />
        <Text style={menuStyles.optionText}>Add to Routine</Text>
      </TouchableOpacity>
      <View style={menuStyles.optionDivider} />
      <TouchableOpacity style={menuStyles.option} onPress={() => close(onDelete)} activeOpacity={0.7}>
        <SymbolView name="trash" size={16} tintColor="#ef4444" />
        <Text style={[menuStyles.optionText, { color: '#ef4444' }]}>Delete</Text>
      </TouchableOpacity>
    </>)}</BottomSheet>
  );
}

// ─── RoutinePickerModal ───────────────────────────────────────────────────────

function RoutinePickerModal({
  clientId, onPick, onClose,
}: {
  clientId: string; onPick: (routineId: string) => void; onClose: () => void;
}) {
  const [routines, setRoutines] = useState<{ id: string; name: string }[]>([]);
  const [loadingRoutines, setLoadingRoutines] = useState(true);

  useEffect(() => {
    supabase.from('routines').select('id, name').eq('client_id', clientId).eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRoutines((data ?? []).map((r: any) => ({ id: r.id, name: r.name })));
        setLoadingRoutines(false);
      });
  }, [clientId]);

  return (
    <BottomSheet onClose={onClose}>{close => (<>
      <Text style={menuStyles.sheetTitle}>Add to Routine</Text>
      <View style={menuStyles.sheetDivider} />
      {loadingRoutines ? (
        <ActivityIndicator color={ACCENT} style={{ paddingVertical: 20 }} />
      ) : routines.length === 0 ? (
        <Text style={menuStyles.emptyText}>No active routines</Text>
      ) : (
        routines.map((r, i) => (
          <View key={r.id}>
            <TouchableOpacity style={menuStyles.option} onPress={() => close(() => onPick(r.id))} activeOpacity={0.7}>
              <Text style={menuStyles.optionText}>{r.name}</Text>
            </TouchableOpacity>
            {i < routines.length - 1 && <View style={menuStyles.optionDivider} />}
          </View>
        ))
      )}
    </>)}</BottomSheet>
  );
}


// ─── History helpers ──────────────────────────────────────────────────────────

type HistoryEntry = { status: 'active' | 'closed'; at: string };

function buildPeriods(
  createdAt: string,
  history: HistoryEntry[],
  closedAt: string | null,
): Array<{ from: string; to: string | null }> {
  if (history.length === 0) {
    return [{ from: createdAt, to: closedAt }];
  }
  // If the first event is 'active', the original close wasn't recorded.
  // Reconstruct it using closedAt (kept from deactivation) as the end date.
  const full: HistoryEntry[] =
    history[0].status === 'active' && closedAt
      ? [{ status: 'closed', at: closedAt }, ...history]
      : history;
  const periods: Array<{ from: string; to: string | null }> = [];
  let start = createdAt;
  for (const e of full) {
    if (e.status === 'closed') { periods.push({ from: start, to: e.at }); start = ''; }
    else if (e.status === 'active') { start = e.at; }
  }
  if (start) periods.push({ from: start, to: null });
  return periods;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  'Push':       ['#1e4a7a', '#7BB3E8'],
  'Pull':       ['#0d2e5a', '#2C6BAD'],
  'Upper Body': ['#1a3d6e', '#4A90D9'],
  'Lower Body': ['#2a1f5e', '#7B68C8'],
  'Legs':       ['#1e1652', '#5548A8'],
  'Full Body':  ['#6b2e12', '#E8845A'],
  'Core':       ['#6b4012', '#E8A84A'],
  'Mobility':   ['#0d3d2e', '#24ac88'],
  'Recovery':   ['#4a2a2a', '#C4A0A0'],
};
const GRADIENT_DEFAULT: [string, string] = ['#2a2a2a', '#444444'];

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, gap: 8,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '90%' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600', flexShrink: 1 },
  infoBtn: {
    width: 18, height: 18, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoBtnText: { fontSize: 11, fontStyle: 'italic', fontWeight: '700', color: '#fff' },
  activeBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  activeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  addBtn: {
    width: 30, height: 30, borderRadius: 100,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
  },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 48 },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 20,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: '#666', fontSize: 14, fontWeight: '500' },
  emptySub: { color: '#bbb', fontSize: 12 },

  renameRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  renameInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a1a', padding: 0 },
  renameBtn: { padding: 6 },
});

const coverCardStyles = StyleSheet.create({
  card: {
    height: 100, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  menuBtn: { position: 'absolute', top: 9, right: 10 },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingBottom: 8, gap: 8,
  },
  bottomLeft: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  itemSub: { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  catPill: {
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  catPillText: { fontSize: 9, fontWeight: '700', color: '#ffffff' },
  doneBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
});

const popStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    width: '100%', paddingTop: 20, paddingBottom: 8,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  heading: {
    fontSize: 13, fontWeight: '700', color: '#aaa',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
  },
  option: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 12,
  },
  optionText: { fontSize: 16, fontWeight: '500', color: '#1a1a1a', flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e8e8e4', width: '100%' },
  cancelBtn: { paddingVertical: 14, marginTop: 4 },
  cancelText: { fontSize: 14, color: '#aaa' },
  emptyWrap: { paddingVertical: 24, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 15, fontWeight: '500', color: '#666' },
  emptySub: { fontSize: 13, color: '#bbb' },
});

const secStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: HEADER, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 2, marginBottom: 2, marginTop: 4 },
  completedLabel: { color: '#bbb', marginTop: 16 },
  cycleRow: { paddingHorizontal: 2, marginBottom: 12 },
  cycleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cycleLabel: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase' },
  cycleEdit: { fontSize: 12, fontWeight: '600', color: ACCENT },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strip: { flex: 1, height: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 10, flexShrink: 1, color: '#666' },
  statusChar: { fontSize: 10, fontWeight: '600' },
  restartHeader: { paddingHorizontal: 2, gap: 2, marginTop: 4 },
  restartTitle: { fontSize: 13, fontWeight: '700', color: HEADER },
  restartSub: { fontSize: 11, color: '#999', marginBottom: 2 },
});

const reorderStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  name: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  arrowBtns: { flexDirection: 'row', gap: 14, flexShrink: 0 },
  saveBtn: { marginHorizontal: 20, width: '100%', maxWidth: 260, borderRadius: 100, paddingVertical: 14, backgroundColor: ACCENT, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const histStyles = StyleSheet.create({
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc', flexShrink: 0 },
  dotActive: { backgroundColor: '#24ac88' },
  periodText: { fontSize: 14, color: '#1a1a1a' },
});

const menuStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  sheetTitle: {
    fontSize: 13, fontWeight: '600', color: '#999',
    paddingHorizontal: 16, paddingVertical: 14, textAlign: 'center',
  },
  sheetDivider: { height: 1, backgroundColor: '#e8e8e4' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 15 },
  optionText: { fontSize: 16, color: '#1a1a1a' },
  optionDivider: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 20 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 16 },
});
