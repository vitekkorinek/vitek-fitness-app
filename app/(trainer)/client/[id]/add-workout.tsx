import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_OPTIONS, CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import WorkoutPaperCover, { DARK_CARD_FOOTER } from '@/components/WorkoutPaperCover';
import { useCardVariant } from '@/lib/cardVariant';
import { fetchExerciseNames, fetchTemplateExerciseNames } from '@/lib/exerciseNames';
import { ft, fd } from '@/lib/appType';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const BG = '#f0f1f3';
const CARD = '#ffffff';
const TEXT = '#1a1a1a';
const MUTED = '#999';

type MainTab = 'workouts' | 'templates';

type PickerWorkout = {
  id: string;
  name: string;
  category: string | null;
  coverImageUrl: string | null;
  clientId: string;
  clientName: string;
  lastSessionDate: string | null;
  createdAt: string;
  exerciseNames: string[];
};

type PickerTemplate = {
  id: string;
  name: string;
  category: string | null;
  coverImageUrl: string | null;
  exerciseCount: number;
  exerciseNames: string[];
  createdAt: string;
};

function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

async function fetchAllWorkouts(trainerId: string): Promise<PickerWorkout[]> {
  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, name, category, cover_image_url, client_id, created_at, users!client_id(name)')
    .eq('created_by', trainerId)
    .order('created_at', { ascending: false });

  if (!wRows?.length) return [];

  const workoutIds = (wRows as any[]).map(w => w.id);
  const [{ data: sessions }, exerciseMap] = await Promise.all([
    supabase
      .from('sessions')
      .select('workout_id, date')
      .in('workout_id', workoutIds)
      .eq('status', 'completed')
      .order('date', { ascending: false }),
    fetchExerciseNames(workoutIds),
  ]);

  const lastDateMap = new Map<string, string>();
  (sessions ?? []).forEach((s: any) => {
    if (!lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
  });

  return (wRows as any[]).map(w => ({
    id: w.id,
    name: w.name,
    category: w.category ?? null,
    coverImageUrl: w.cover_image_url ?? null,
    clientId: w.client_id,
    clientName: (w.users as any)?.name ?? 'Unknown',
    lastSessionDate: lastDateMap.get(w.id) ?? null,
    exerciseNames: exerciseMap.get(w.id) ?? [],
    createdAt: w.created_at,
  }));
}

async function fetchTemplates(trainerId: string): Promise<PickerTemplate[]> {
  const { data: tRows } = await supabase
    .from('workout_templates')
    .select('id, name, category, cover_image_url, created_at')
    .eq('created_by', trainerId)
    .order('created_at', { ascending: false });

  if (!tRows?.length) return [];

  const ids = (tRows as any[]).map(t => t.id);
  // One query covers both the count and the cover's exercise list.
  const nameMap = await fetchTemplateExerciseNames(ids);

  return (tRows as any[]).map(t => ({
    id: t.id,
    name: t.name,
    category: t.category ?? null,
    coverImageUrl: t.cover_image_url ?? null,
    exerciseCount: (nameMap.get(t.id) ?? []).length,
    exerciseNames: nameMap.get(t.id) ?? [],
    createdAt: t.created_at,
  }));
}

export default function AddWorkoutToDayScreen() {
  const { id: clientId, date } = useLocalSearchParams<{ id: string; date: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  // Workout card style (trainer Account → Appearance): footer always the OPPOSITE of
  // the cover — 'dark' = dark cover + WHITE footer, 'light' = white cover + DARK footer.
  const coverDark = useCardVariant(s => s.variant) === 'dark';
  const footerDark = !coverDark;
  const [mainTab, setMainTab] = useState<MainTab>('workouts');
  const [allWorkouts, setAllWorkouts] = useState<PickerWorkout[]>([]);
  const [templates, setTemplates] = useState<PickerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [clientExpanded, setClientExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const [w, t] = await Promise.all([fetchAllWorkouts(profile.id), fetchTemplates(profile.id)]);
    setAllWorkouts(w);
    setTemplates(t);
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    allWorkouts.forEach(w => { if (!map.has(w.clientId)) map.set(w.clientId, w.clientName); });
    return [...map.entries()]
      .map(([cid, name]) => ({ id: cid, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allWorkouts]);

  const selectedClientName = selectedClientId
    ? (clientOptions.find(c => c.id === selectedClientId)?.name.split(' ')[0] ?? 'Client')
    : null;

  const workouts = useMemo(() => {
    const list = allWorkouts.filter(w => {
      const q = search.trim().toLowerCase();
      if (q && !w.name.toLowerCase().includes(q) && !w.clientName.toLowerCase().includes(q)) return false;
      if (selectedCategory && w.category !== selectedCategory) return false;
      if (selectedClientId && w.clientId !== selectedClientId) return false;
      return true;
    });
    const performed = list.filter(w => w.lastSessionDate !== null)
      .sort((a, b) => new Date(b.lastSessionDate!).getTime() - new Date(a.lastSessionDate!).getTime());
    const neverDone = list.filter(w => w.lastSessionDate === null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...performed, ...neverDone];
  }, [allWorkouts, search, selectedCategory, selectedClientId]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const q = search.trim().toLowerCase();
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (selectedCategory && t.category !== selectedCategory) return false;
      return true;
    });
  }, [templates, search, selectedCategory]);

  // Tapping a workout no longer instant-schedules — it opens the builder in edit
  // mode (review/tweak weights/exercises), which schedules + saves to the library
  // on Save. `router.replace` so the builder's post-save back returns to the
  // client profile (not this picker).
  const openWorkout = useCallback((w: PickerWorkout) => {
    router.replace(`/(trainer)/workout-builder?clientId=${clientId}&editWorkoutId=${w.id}&scheduleDate=${date}` as any);
  }, [router, clientId, date]);

  const openTemplate = useCallback((t: PickerTemplate) => {
    router.replace(`/(trainer)/workout-builder?clientId=${clientId}&templateId=${t.id}&scheduleDate=${date}` as any);
  }, [router, clientId, date]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Workouts Library</Text>
            {date ? <Text style={styles.headerSub}>{formatDay(date)}</Text> : null}
          </View>
          <View style={{ width: 28 }} />
        </View>
      </SafeAreaView>

      {/* Workouts / Templates sub-tabs */}
      <View style={styles.subTabRow}>
        <View style={styles.subTabBar}>
          {(['workouts', 'templates'] as MainTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.subTabItem, mainTab === tab && styles.subTabItemActive]}
              onPress={() => { setMainTab(tab); setClientExpanded(false); setCategoryExpanded(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.subTabText, mainTab === tab && styles.subTabTextActive]}>
                {tab === 'workouts' ? 'Workouts' : 'Templates'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {/* Search */}
          <View style={styles.searchBar}>
            <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
            <TextInput
              style={styles.searchInput}
              placeholder={mainTab === 'workouts' ? 'Search workouts...' : 'Search templates...'}
              placeholderTextColor="#bbb"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Filter row — Category always; Client only on the Workouts tab */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.dropdownBtn, categoryExpanded && styles.dropdownBtnActive]}
              onPress={() => { setCategoryExpanded(v => !v); setClientExpanded(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownBtnText, categoryExpanded && styles.dropdownBtnTextActive]}>
                {selectedCategory ?? 'Category'}
              </Text>
              <SymbolView name="chevron.down" size={10} tintColor={categoryExpanded ? '#fff' : '#555'} />
            </TouchableOpacity>
            {mainTab === 'workouts' && (
              <TouchableOpacity
                style={[styles.dropdownBtn, clientExpanded && styles.dropdownBtnActive]}
                onPress={() => { setClientExpanded(v => !v); setCategoryExpanded(false); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.dropdownBtnText, clientExpanded && styles.dropdownBtnTextActive]}>
                  {selectedClientName ?? 'All Clients'}
                </Text>
                <SymbolView name="chevron.down" size={10} tintColor={clientExpanded ? '#fff' : '#555'} />
              </TouchableOpacity>
            )}
          </View>

          {/* Client panel */}
          {clientExpanded && mainTab === 'workouts' && (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>CLIENT</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  style={[styles.pill, !selectedClientId && styles.pillActive]}
                  onPress={() => setSelectedClientId(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillText, !selectedClientId && styles.pillTextActive]}>All clients</Text>
                </TouchableOpacity>
                {clientOptions.map(c => {
                  const isSelected = selectedClientId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pill, isSelected && styles.pillActive]}
                      onPress={() => setSelectedClientId(isSelected ? null : c.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Category panel */}
          {categoryExpanded && (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>CATEGORY</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  style={[styles.pill, !selectedCategory && styles.pillActive]}
                  onPress={() => setSelectedCategory(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillText, !selectedCategory && styles.pillTextActive]}>All</Text>
                </TouchableOpacity>
                {CATEGORY_OPTIONS.map(cat => {
                  const colors = CATEGORY_COLORS[cat];
                  const isSelected = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.pill, isSelected && { backgroundColor: colors.pillBg, borderColor: colors.border }]}
                      onPress={() => setSelectedCategory(isSelected ? null : cat)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pillText, isSelected && { color: colors.pillText }]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Workouts list ── */}
          {mainTab === 'workouts' && (
            workouts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No workouts found</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {workouts.map(w => {
                  const catColors = w.category ? CATEGORY_COLORS[w.category as WorkoutCategory] : null;
                  const clientFirstName = (w.clientName ?? '').split(' ')[0];
                  const subtitle = w.lastSessionDate ? formatShortDate(w.lastSessionDate) : 'Not yet done';
                  return (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.card, footerDark && styles.cardDarkBg]}
                      onPress={() => openWorkout(w)}
                      activeOpacity={0.9}
                    >
                      <View style={[styles.cardInner, footerDark && styles.cardDarkBg]}>
                        <WorkoutPaperCover category={w.category} exerciseNames={w.exerciseNames}>
                          {!!clientFirstName && (
                            <View style={[styles.clientPill, !coverDark && styles.coverPillOnLight]}>
                              <SymbolView name="person.fill" size={9} tintColor={coverDark ? '#fff' : '#8a8a86'} />
                              <Text style={[styles.clientPillText, !coverDark && styles.coverPillTextOnLight]}>{clientFirstName}</Text>
                            </View>
                          )}
                        </WorkoutPaperCover>
                        <View style={styles.footer}>
                          <Text style={[styles.cardName, footerDark && styles.textOnDark, fd(700)]} numberOfLines={1}>{w.name}</Text>
                          <Text style={[styles.footerSub, footerDark && styles.subOnDark, ft(400)]} numberOfLines={1}>{subtitle}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          )}

          {/* ── Templates list ── */}
          {mainTab === 'templates' && (
            filteredTemplates.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No templates found</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {filteredTemplates.map(t => {
                  const catColors = t.category ? CATEGORY_COLORS[t.category as WorkoutCategory] : null;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.card, footerDark && styles.cardDarkBg]}
                      onPress={() => openTemplate(t)}
                      activeOpacity={0.9}
                    >
                      <View style={[styles.cardInner, footerDark && styles.cardDarkBg]}>
                        <WorkoutPaperCover category={t.category} exerciseNames={t.exerciseNames}>
                          <View style={[styles.templateBadge, !coverDark && styles.coverPillOnLight]}>
                            <Text style={[styles.templateBadgeText, !coverDark && styles.coverPillTextOnLight]}>TEMPLATE</Text>
                          </View>
                        </WorkoutPaperCover>
                        <View style={styles.footer}>
                          <Text style={[styles.cardName, footerDark && styles.textOnDark, fd(700)]} numberOfLines={1}>{t.name}</Text>
                          <Text style={[styles.footerSub, footerDark && styles.subOnDark, ft(400)]} numberOfLines={1}>
                            {t.exerciseCount} {t.exerciseCount === 1 ? 'exercise' : 'exercises'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: HEADER,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4 },

  subTabRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  subTabBar: { flexDirection: 'row', backgroundColor: '#e2e2de', borderRadius: 100, padding: 3 },
  subTabItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 100 },
  subTabItemActive: { backgroundColor: CARD },
  subTabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  subTabTextActive: { color: TEXT, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginTop: 10, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 100, backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  dropdownBtnActive: { backgroundColor: HEADER },
  dropdownBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  dropdownBtnTextActive: { color: '#fff' },

  panel: {
    backgroundColor: CARD, borderRadius: 12,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  panelLabel: {
    fontSize: 10, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
    backgroundColor: BG,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  pillActive: { backgroundColor: HEADER },
  pillText: { fontSize: 13, fontWeight: '600', color: TEXT },
  pillTextActive: { color: '#fff' },

  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: MUTED },

  // Card-style-aware card ("Workout card style", trainer Account → Appearance): white
  // base + light lift shadow; the *Dark overrides flip the frame/footer to
  // DARK_CARD_FOOTER for the 'light' style (white cover + dark footer).
  card: {
    borderRadius: 14, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardDarkBg: { backgroundColor: DARK_CARD_FOOTER },
  cardInner: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  footer: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'transparent' },
  footerSub: { fontSize: 11, color: '#999' },
  subOnDark: { color: 'rgba(255,255,255,0.6)' },
  cardName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  textOnDark: { color: '#fff' },
  cardSub: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  templateBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  templateBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  clientPill: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  clientPillText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  // On the white ('light'-style) cover the scrim pills flip to the quiet ink register.
  coverPillOnLight:     { backgroundColor: 'rgba(0,0,0,0.06)' },
  coverPillTextOnLight: { color: '#8a8a86' },
});
