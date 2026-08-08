import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  InputAccessoryView,
  Image,
  Dimensions,
  PanResponder,
} from 'react-native';
import { GestureDetector, Gesture, ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle as SvgCircle, Rect as SvgRect, Line as SvgLine, Path as SvgPath } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { VFIcon } from '@/components/VFIcon';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import { BottomSheet } from '@/components/BottomSheet';
import GlassPanel from '@/components/GlassPanel';
import { useAuth } from '@/context/AuthContext';
import { fetchClientTraining } from '@/lib/clientTraining';
import NutritionTab from './nutrition-tab';
import { relativeTime } from '@/lib/utils';
import { mondayOf, addDaysStr } from '@/lib/weeklyGoal';
import { CATEGORY_COLORS, STRETCHING_CATEGORIES } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import WorkoutPaperCover, { ExerciseNamesProvider, DARK_CARD_FOOTER, DARK_CARD_GRADIENT } from '@/components/WorkoutPaperCover';
import { useCoverDark, useFooterDark } from '@/lib/cardVariant';
import { fetchExerciseNames } from '@/lib/exerciseNames';
import { ft, fd } from '@/lib/appType';
import t from '@/i18n/en';
import type {
  SessionPackage,
  PackageDefault,
  User,
} from '@/types/database';
import type { ClientTrainingData, WorkoutWithLastDate } from '@/lib/clientTraining';
import ProgressTab from './progress-tab';
import { useSessionStore } from '@/store/sessionStore';
import { RestTimerChip } from '@/components/RestTimerChip';

type Tab = 'training' | 'sessions' | 'nutrition' | 'progress' | 'info';

// ─── Screen ────────────────────────────────────────────────────────────────

export default function ClientProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const headerH = useHeaderHeight();
  // The solid header's row is shorter than its reserved height, leaving dead space
  // under the title. Pull the pinned switcher + content up so "Adam Test" sits
  // tighter to the tabs and the content gets more room.
  const segTop = headerH - 12;
  const { suspendedSession, clearSuspendedSession } = useSessionStore();

  const sessionActive = suspendedSession?.clientId === id;
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Resume a suspended session (tapping the header timer indicator)
  const resumeSession = () => {
    if (!suspendedSession) return;
    const { workoutId: suspWid, activeSessionId: suspSessId, startedAt: suspStart } = suspendedSession;
    clearSuspendedSession();
    const base = suspWid
      ? `/(trainer)/client/${id}/workout/${suspWid}`
      : `/(trainer)/client/${id}/workout/free`;
    const params = suspSessId ? `?resumeSessionId=${suspSessId}&resumeStartedAt=${suspStart}` : '';
    router.push(`${base}${params}` as any);
  };

  useEffect(() => {
    if (!sessionActive || !suspendedSession) { setSessionElapsed(0); return; }
    const tick = () => setSessionElapsed(Math.floor((Date.now() - suspendedSession.startedAt) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [sessionActive, suspendedSession?.startedAt]);

  const [activeTab, setActiveTab] = useState<Tab>('training');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add popup state
  const [addModal, setAddModal] = useState(false);
  // Bumped by the header + while the Progress tab is open; ProgressTab opens the
  // Add Measurement form. A counter rather than a boolean so pressing + twice works.
  const [measAddTick, setMeasAddTick] = useState(0);
  const [headerPlanOpen, setHeaderPlanOpen] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; equipment_list: string[]; muscle_groups: string[] }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  // Data
  const [client, setClient] = useState<User | null>(null);
  const [training, setTraining] = useState<ClientTrainingData | null>(null);
  const [packages, setPackages] = useState<SessionPackage[]>([]);

  // Info tab editable state (synced from client on load)
  const [customSlogan, setCustomSlogan] = useState('');
  const [trainerNotes, setTrainerNotes] = useState('');
  const [clientSex, setClientSex] = useState<'male' | 'female' | 'other' | null>(null);
  const [clientPhone, setClientPhone] = useState('');
  const [clientDob, setClientDob] = useState('');
  const [clientHeight, setClientHeight] = useState('');
  const [clientStreet, setClientStreet] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientPostcode, setClientPostcode] = useState('');
  const [clientCountry, setClientCountry] = useState('');
  const [bannerPhotoUrl, setBannerPhotoUrl] = useState<string | null>(null);
  const [bannerPhotoOffsetY, setBannerPhotoOffsetY] = useState(40);
  const [bannerPhotoZoom, setBannerPhotoZoom] = useState(1.5);
  const [bannerNaturalDims, setBannerNaturalDims] = useState<{w:number,h:number}|null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [vfIconPosX, setVfIconPosX] = useState(0.88);
  const [vfIconPosY, setVfIconPosY] = useState(0.06);
  const [savingInfo, setSavingInfo] = useState(false);
  const [overviewNote, setOverviewNote] = useState('');
  const [savingOverviewNote, setSavingOverviewNote] = useState(false);
  const [allWorkouts, setAllWorkouts] = useState<Array<{ id: string; category: string | null }>>([]);
  const [routineCount, setRoutineCount] = useState(0);

  const loadAll = useCallback(async () => {
    const [
      { data: clientData },
      trainingData,
      { data: packagesData },
      { data: allWorkoutsData },
      { count: routineCountData },
    ] = await Promise.all([
      supabase.from('users').select('*').eq('id', id).single(),
      fetchClientTraining(id),
      supabase.from('session_packages').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('workouts').select('id, category').eq('client_id', id),
      supabase.from('routines').select('id', { count: 'exact', head: true }).eq('client_id', id),
    ]);

    if (clientData) {
      const u = clientData as User;
      setClient(u);
      setCustomSlogan(u.custom_slogan ?? '');
      setTrainerNotes(u.trainer_notes ?? '');
      setClientSex(u.sex ?? null);
      setClientPhone(u.phone ?? '');
      setClientDob(u.date_of_birth ?? '');
      setClientHeight(u.height_cm != null ? `${u.height_cm}` : '');
      setClientStreet(u.address_street ?? '');
      setClientCity(u.address_city ?? '');
      setClientPostcode(u.address_postcode ?? '');
      setClientCountry(u.address_country ?? '');
      setBannerPhotoUrl(u.banner_photo_url ?? null);
      setBannerPhotoOffsetY(u.banner_photo_offset_y ?? 40);
      setBannerPhotoZoom(u.banner_photo_zoom ?? 1.5);
      setVfIconPosX((u as any).vf_icon_pos_x ?? 0.88);
      setVfIconPosY((u as any).vf_icon_pos_y ?? 0.06);
      if (u.banner_photo_url) Image.getSize(u.banner_photo_url, (w, h) => setBannerNaturalDims({w, h}), () => {});
      setOverviewNote(u.overview_note ?? '');
    }
    setTraining(trainingData);
    setPackages((packagesData ?? []) as SessionPackage[]);
    setAllWorkouts((allWorkoutsData ?? []) as { id: string; category: string | null }[]);
    setRoutineCount(routineCountData ?? 0);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadAll().finally(() => setLoading(false));
    }, [loadAll])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const openTemplateModal = useCallback(async () => {
    setAddModal(false);
    setLoadingTemplates(true);
    setTemplateModal(true);
    const { data } = await supabase
      .from('workout_templates')
      .select('id, name, equipment_list, muscle_groups')
      .order('created_at', { ascending: false });
    setTemplates((data ?? []) as typeof templates);
    setLoadingTemplates(false);
  }, []);

  const handleApplyTemplate = useCallback(async (template: { id: string; name: string; equipment_list: string[]; muscle_groups: string[] }) => {
    if (!profile) return;
    setApplyingTemplate(true);
    try {
      const { data: wData, error: wErr } = await supabase
        .from('workouts')
        .insert({
          name: template.name,
          client_id: id,
          routine_id: null,
          created_by: profile.id,
          equipment_list: template.equipment_list ?? [],
          muscle_groups: template.muscle_groups ?? [],
          order_index: 0,
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
        const { data: weData } = await supabase.from('workout_exercises').insert(weInserts).select();
        if (weData?.length) {
          const teIds = (teData as any[]).map((te) => te.id);
          const { data: tsData } = await supabase.from('template_sets').select('*').in('template_exercise_id', teIds);
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
                is_warmup: !!ts.is_warmup,
                is_added_during_session: false,
              }))
              .filter((ws) => ws.workout_exercise_id);
            if (wsInserts.length) await supabase.from('workout_sets').insert(wsInserts);
          }
        }
      }
      setTemplateModal(false);
      await loadAll();
    } catch {
      Alert.alert('Error', 'Could not apply template. Please try again.');
    } finally {
      setApplyingTemplate(false);
    }
  }, [profile, id, loadAll]);

  const saveOverviewNote = useCallback(async (note: string) => {
    setSavingOverviewNote(true);
    await supabase.from('users').update({ overview_note: note.trim() || null }).eq('id', id);
    setOverviewNote(note.trim());
    setSavingOverviewNote(false);
  }, [id]);

  const pickBannerPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploadingBanner(true);
    try {
      const filename = `${id}/${Date.now()}.jpg`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const { data, error } = await supabase.storage
        .from('client-banners')
        .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
      if (error || !data) throw error;
      const { data: urlData } = supabase.storage.from('client-banners').getPublicUrl(data.path);
      setBannerPhotoUrl(urlData.publicUrl);
      setBannerPhotoOffsetY(50);
      setBannerPhotoZoom(1.0);
      Image.getSize(urlData.publicUrl, (w, h) => setBannerNaturalDims({w, h}), () => {});
    } catch {
      Alert.alert('Error', t.clientProfile.info.bannerPhotoError);
    } finally {
      setUploadingBanner(false);
    }
  }, [id]);

  const saveInfo = async () => {
    setSavingInfo(true);
    await supabase
      .from('users')
      .update({
        custom_slogan: customSlogan.trim() || null,
        trainer_notes: trainerNotes.trim() || null,
        sex: clientSex,
        phone: clientPhone.trim() || null,
        date_of_birth: clientDob.trim() || null,
        height_cm: clientHeight.trim() ? parseFloat(clientHeight.trim()) || null : null,
        address_street: clientStreet.trim() || null,
        address_city: clientCity.trim() || null,
        address_postcode: clientPostcode.trim() || null,
        address_country: clientCountry.trim() || null,
        banner_photo_url: bannerPhotoUrl,
        banner_photo_offset_y: bannerPhotoOffsetY,
        banner_photo_zoom: bannerPhotoZoom,
        vf_icon_pos_x: vfIconPosX,
        vf_icon_pos_y: vfIconPosY,
      })
      .eq('id', id);
    setSavingInfo(false);
    Alert.alert('', t.clientProfile.info.saved);
  };


  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#24ac88" size="large" />
        </View>
      ) : (
        <View style={styles.below}>
          {/* Tab content — scrolls UNDER the glass header + pinned pill switcher */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingTop: segTop + SEG_STRIP_H + 12 }]}
            scrollIndicatorInsets={{ top: segTop + SEG_STRIP_H }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#24ac88" progressViewOffset={segTop + SEG_STRIP_H} />}
          >
            {activeTab === 'training' && (
              <TrainingTab
                clientId={id}
                client={client}
                clientName={client?.name ?? ''}
                training={training}
                allWorkouts={allWorkouts}
                routineCount={routineCount}
                packages={packages}
                router={router}
                onReload={loadAll}
                overviewNote={overviewNote}
                savingOverviewNote={savingOverviewNote}
                onSaveNote={saveOverviewNote}
              />
            )}
            {activeTab === 'sessions' && (
              <SessionsTab
                clientId={id}
                clientName={client?.name ?? ''}
                client={client}
                packages={packages}
                onReload={loadAll}
              />
            )}
            {activeTab === 'nutrition' && <NutritionTab clientId={id} trainerId={profile?.id ?? ''} client={client} />}
            {activeTab === 'progress' && (
              <ProgressTab
                clientId={id}
                client={client}
                variant="glass"
                addTick={measAddTick}
              />
            )}
            {activeTab === 'info' && (
              <InfoTab
                clientId={id}
                client={client}
                customSlogan={customSlogan}
                trainerNotes={trainerNotes}
                clientSex={clientSex}
                clientPhone={clientPhone}
                clientDob={clientDob}
                clientHeight={clientHeight}
                clientStreet={clientStreet}
                clientCity={clientCity}
                clientPostcode={clientPostcode}
                clientCountry={clientCountry}
                bannerPhotoUrl={bannerPhotoUrl}
                bannerPhotoOffsetY={bannerPhotoOffsetY}
                bannerPhotoZoom={bannerPhotoZoom}
                bannerNaturalDims={bannerNaturalDims}
                uploadingBanner={uploadingBanner}
                saving={savingInfo}
                onSloganChange={setCustomSlogan}
                onNotesChange={setTrainerNotes}
                onSexChange={setClientSex}
                onPhoneChange={setClientPhone}
                onDobChange={setClientDob}
                onHeightChange={setClientHeight}
                onStreetChange={setClientStreet}
                onCityChange={setClientCity}
                onPostcodeChange={setClientPostcode}
                onCountryChange={setClientCountry}
                onPickBannerPhoto={pickBannerPhoto}
                onRemoveBannerPhoto={() => { setBannerPhotoUrl(null); setBannerNaturalDims(null); }}
                onOffsetYChange={setBannerPhotoOffsetY}
                onZoomChange={setBannerPhotoZoom}
                vfIconPosX={vfIconPosX}
                vfIconPosY={vfIconPosY}
                onVfIconPosXChange={setVfIconPosX}
                onVfIconPosYChange={setVfIconPosY}
                onSave={saveInfo}
              />
            )}
          </ScrollView>

          {/* Pinned section switcher — glass pill slides to the active tab; content
              scrolls under it. */}
          <TabPillSwitcher activeTab={activeTab} onChange={setActiveTab} top={segTop} />
        </View>
      )}

      {/* Solid light header — rendered last so it overlays the (scrolling) content.
          `solid` = opaque (not see-through): the dense week-strip below ghosted
          through the glass, which read as messy. */}
      <LightHeader
        solid
        left={
          <HeaderIcon onPress={() => router.back()}>
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title={client?.name ?? ''}
        // ⚠️ The + means "add the thing this tab is about". On Progress that is a
        // MEASUREMENT, not a session — Vitek, Aug 7 2026, after failing to find the
        // Add Measurement button buried under the whole history list: *"ok wow i
        // missed that haha"*, then *"make the plus in the header to be that button,
        // that is much better, we dont need it then at all in the screen"*. Every
        // other tab keeps the Add Session sheet.
        right={
          <HeaderIcon onPress={() => (activeTab === 'progress' ? setMeasAddTick(n => n + 1) : setAddModal(true))}>
            <SymbolView name="plus" size={22} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        overlay={
          sessionActive ? (
            <>
              <TouchableOpacity style={styles.hdrSessIndicator} onPress={resumeSession} hitSlop={12} activeOpacity={0.8}>
                <SymbolView name="timer" size={13} tintColor={ACCENT} />
                <Text style={styles.hdrSessTimer}>
                  {String(Math.floor(sessionElapsed / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
              <RestTimerChip />
            </>
          ) : null
        }
      />

      {/* ── Add Session modal (header +) — mirrors the week-strip +, defaults to today ── */}
      {addModal && (
        <BottomSheet onClose={() => setAddModal(false)}>
          {close => (
            <View style={addPopStyles.sheetContent}>
              {/* 17/700 dark + divider — the sheet-title treatment (menuStyles), not
                  the uppercase grey `heading`, which stays for the GLASS popups that
                  share this stylesheet. The divider needs alignSelf:'stretch' because
                  sheetContent centres its children (a width-less View would collapse). */}
              <Text style={menuStyles.sheetTitle}>Add Session</Text>
              <View style={[menuStyles.sheetDivider, addPopStyles.sheetDividerStretch]} />

              <TouchableOpacity
                style={addPopStyles.option}
                activeOpacity={0.7}
                onPress={() => close(() => router.push(`/(trainer)/workout-builder?clientId=${id}` as any))}
              >
                <SymbolView name="square.and.pencil" size={18} tintColor="#244e43" />
                <Text style={addPopStyles.optionText}>Create new workout</Text>
              </TouchableOpacity>

              <View style={addPopStyles.divider} />

              <TouchableOpacity
                style={addPopStyles.option}
                activeOpacity={0.7}
                onPress={() => close(() => router.push(`/(trainer)/client/${id}/add-workout?date=${localDateStr(new Date())}` as any))}
              >
                <SymbolView name="plus.rectangle.on.rectangle" size={18} tintColor="#244e43" />
                <Text style={addPopStyles.optionText}>Add workout to this day</Text>
              </TouchableOpacity>

              <View style={addPopStyles.divider} />

              <TouchableOpacity
                style={addPopStyles.option}
                activeOpacity={0.7}
                onPress={() => close(() => setHeaderPlanOpen(true))}
              >
                <SymbolView name="calendar" size={18} tintColor="#244e43" />
                <Text style={addPopStyles.optionText}>Plan a workout</Text>
              </TouchableOpacity>

              {training?.activeRoutine && (
                <>
                  <View style={addPopStyles.divider} />
                  <TouchableOpacity
                    style={addPopStyles.option}
                    activeOpacity={0.7}
                    onPress={() => close(() => router.push(`/(trainer)/client/${id}/routine/${training.activeRoutine!.id}` as any))}
                  >
                    <SymbolView name="arrow.triangle.2.circlepath" size={18} tintColor="#244e43" />
                    <Text style={addPopStyles.optionText}>Continue routine</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={addPopStyles.divider} />

              <TouchableOpacity
                style={addPopStyles.option}
                activeOpacity={0.7}
                onPress={() => close(() => router.push(`/(trainer)/client/${id}/workout/free` as any))}
              >
                <SymbolView name="timer" size={18} tintColor="#24ac88" />
                <Text style={[addPopStyles.optionText, { color: '#24ac88' }]}>Start Free Session</Text>
              </TouchableOpacity>

            </View>
          )}
        </BottomSheet>
      )}

      {/* Header Plan-a-workout — shared flow (pick → schedule), scheduled to today */}
      {headerPlanOpen && (
        <PlanWorkoutFlow
          clientId={id}
          initialDate={localDateStr(new Date())}
          onClose={() => setHeaderPlanOpen(false)}
          onDone={loadAll}
        />
      )}

      {/* ── Template picker modal ────────────────────────────────────────────── */}
      {templateModal && (
        <BottomSheet onClose={() => { if (!applyingTemplate) setTemplateModal(false); }}>
          {close => (
            <View style={addPopStyles.sheetContent}>
              <Text style={menuStyles.sheetTitle}>Pick a Template</Text>
              <View style={[menuStyles.sheetDivider, addPopStyles.sheetDividerStretch]} />
              {loadingTemplates ? (
                <ActivityIndicator color="#24ac88" style={{ marginVertical: 20 }} />
              ) : templates.length === 0 ? (
                <View style={addPopStyles.emptyWrap}>
                  <Text style={addPopStyles.emptyText}>No templates yet</Text>
                  <Text style={addPopStyles.emptySub}>Build templates in the Library tab</Text>
                </View>
              ) : (
                templates.map((t, i) => (
                  <View key={t.id} style={{ width: '100%' }}>
                    {i > 0 && <View style={addPopStyles.divider} />}
                    <TouchableOpacity
                      style={addPopStyles.option}
                      activeOpacity={0.7}
                      onPress={() => handleApplyTemplate(t)}
                      disabled={applyingTemplate}
                    >
                      <SymbolView name="doc.on.doc" size={18} tintColor="#244e43" />
                      <Text style={addPopStyles.optionText}>{t.name}</Text>
                      {applyingTemplate && <ActivityIndicator size="small" color="#24ac88" />}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}
        </BottomSheet>
      )}
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNextSession(startAt: string): { label: string; sub: string } {
  const start = new Date(startAt);
  const now = new Date();
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((startDay.getTime() - todayDay.getTime()) / 86_400_000);
  const timeStr = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  let dayLabel: string;
  if (dayDiff === 0) dayLabel = 'Today';
  else if (dayDiff === 1) dayLabel = 'Tomorrow';
  else dayLabel = start.toLocaleDateString('en-GB', { weekday: 'long' });

  let sub: string;
  if (dayDiff === 0) {
    const diffH = Math.floor((start.getTime() - now.getTime()) / 3_600_000);
    sub = diffH <= 0 ? 'starting now' : diffH === 1 ? 'in 1 hour' : `in ${diffH} hours`;
  } else {
    sub = dayDiff === 1 ? 'in 1 day' : `in ${dayDiff} days`;
  }

  return { label: `${dayLabel} · ${timeStr}`, sub };
}

function apptTypeLabel(type: string): string {
  if (type === 'nutritional_advising') return 'Nutrition';
  if (type === 'pt_session') return 'PT Session';
  if (type === 'trial') return 'Trial';
  if (type === 'consultation') return 'Consultation';
  return 'Session';
}

function fmtWeekApptDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((startDay.getTime() - todayDay.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

// ─── Week strip helpers ───────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const todayStr = localDateStr(new Date());

function getWeekDates(offset: number): Date[] {
  const today = new Date();
  const dow = today.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + toMon + offset * 7);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)
  );
}

function getWeekOffsetForDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const monday = new Date(y, m - 1, d + (dow === 0 ? -6 : 1 - dow));
  const now = new Date();
  const nowDow = now.getDay();
  const todayMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (nowDow === 0 ? -6 : 1 - nowDow));
  return Math.round((monday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function formatWeekLabel(weekDates: Date[]): string {
  const mon = weekDates[0];
  const sun = weekDates[6];
  const year = sun.getFullYear();
  const sunMonth = sun.toLocaleDateString('en-GB', { month: 'short' });
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()} - ${sun.getDate()} ${sunMonth} ${year}`;
  }
  const monMonth = mon.toLocaleDateString('en-GB', { month: 'short' });
  return `${mon.getDate()} ${monMonth} - ${sun.getDate()} ${sunMonth} ${year}`;
}

function fmtDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const PLAN_DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mo–Su display order → JS getDay()
const PLAN_DOW_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const PLAN_STRETCHING_CATS = ['Upper body stretching', 'Lower body stretching', 'Full body stretching'];

function addDaysToDateStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDateStr(dt);
}

function nextDowFrom(fromDate: string, jsDow: number): string {
  const [y, m, d] = fromDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = (jsDow - dt.getDay() + 7) % 7;
  dt.setDate(dt.getDate() + diff);
  return localDateStr(dt);
}

function fmtPlanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── PlanWorkoutFlow ───────────────────────────────────────────────────────────
// Self-contained "Plan a workout" two-step flow (pick workout → schedule), shared
// by the week-strip + and the header + Add Session menus. Mounting = open; it
// loads the client's active workouts on mount. `onDone` fires after a successful
// schedule (reload the caller's view); `onClose` dismisses.
function PlanWorkoutFlow({ clientId, initialDate, onClose, onDone }: {
  clientId: string;
  initialDate: string;
  onClose: () => void;
  onDone: () => void;
}) {
  // Workout card style (trainer Account → Appearance) — picker-card ground follows the cover.
  const coverDark = useCoverDark();
  const [planStep, setPlanStep] = useState<'pick' | 'schedule'>('pick');
  const [planWorkoutsForPicker, setPlanWorkoutsForPicker] = useState<{ id: string; name: string; category: string | null; cover_image_url: string | null; doneThisWeek: boolean }[]>([]);
  const [planLoadingWorkouts, setPlanLoadingWorkouts] = useState(true);
  const [planPickedId, setPlanPickedId] = useState<string | null>(null);
  const [planPickedName, setPlanPickedName] = useState<string | null>(null);
  const [planDate, setPlanDate] = useState(initialDate);
  const [planRepeat, setPlanRepeat] = useState(false);
  const [planRepeatDow, setPlanRepeatDow] = useState(() => {
    const [y, m, d] = initialDate.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  });
  const [planEndMode, setPlanEndMode] = useState<'no_end' | 'weeks'>('no_end');
  const [planEndWeeks, setPlanEndWeeks] = useState(4);
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const todayDow = today.getDay();
      const monDiff = todayDow === 0 ? -6 : 1 - todayDow;
      const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + monDiff);
      const weekStart = localDateStr(mon);
      const weekEnd = localDateStr(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6));
      const [{ data }, { data: weekSessions }] = await Promise.all([
        supabase.from('workouts').select('id, name, category, cover_image_url').eq('client_id', clientId).eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('sessions').select('workout_id').eq('client_id', clientId).eq('status', 'completed').gte('date', weekStart).lte('date', weekEnd),
      ]);
      if (cancelled) return;
      const doneIds = new Set((weekSessions ?? []).map((s: any) => s.workout_id as string));
      setPlanWorkoutsForPicker(
        (data ?? []).filter((w: any) => !PLAN_STRETCHING_CATS.includes(w.category)).map((w: any) => ({ id: w.id, name: w.name, category: w.category ?? null, cover_image_url: w.cover_image_url ?? null, doneThisWeek: doneIds.has(w.id) }))
      );
      setPlanLoadingWorkouts(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const handlePlanDateNav = (delta: number) => {
    const newDate = addDaysToDateStr(planDate, delta);
    setPlanDate(newDate);
    if (planRepeat) {
      const [y, m, d] = newDate.split('-').map(Number);
      setPlanRepeatDow(new Date(y, m - 1, d).getDay());
    }
  };

  const savePlan = async () => {
    if (!planPickedId) return;
    setSavingPlan(true);
    const count = planRepeat ? (planEndMode === 'weeks' ? planEndWeeks : 52) : 1;
    const inserts = Array.from({ length: count }, (_, i) => ({
      workout_id: planPickedId,
      client_id: clientId,
      date: addDaysToDateStr(planDate, i * 7),
      status: 'scheduled' as const,
    }));
    await supabase.from('sessions').insert(inserts);
    setSavingPlan(false);
    onDone();
    onClose();
  };

  return (
    <>
      {planStep === 'pick' && (
        <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
          <Pressable style={addPopStyles.overlay} onPress={onClose}>
            <Pressable style={addPopStyles.cardShadow} onPress={() => {}}>
            <GlassPanel style={[addPopStyles.card, { paddingBottom: 12 }]}>
              <Text style={[addPopStyles.heading, addPopStyles.headingOnGlass]}>Plan a Workout</Text>
              {planLoadingWorkouts ? (
                <ActivityIndicator color={ACCENT} style={{ marginVertical: 20 }} />
              ) : planWorkoutsForPicker.length === 0 ? (
                <View style={addPopStyles.emptyWrap}>
                  <Text style={[addPopStyles.emptyText, addPopStyles.emptyTextOnGlass]}>No active workouts</Text>
                  <Text style={[addPopStyles.emptySub, addPopStyles.emptySubOnGlass]}>Create a workout first</Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 340, width: '100%' }}
                  contentContainerStyle={{ gap: 7, paddingHorizontal: 12, paddingBottom: 4 }}
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                >
                  {planWorkoutsForPicker.map(w => {
                    const catColor = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#2a4a3e') : '#2a4a3e';
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[planStyles.pickerCard, coverDark && darkCardStyles.bg]}
                        activeOpacity={0.85}
                        onPress={() => { setPlanPickedId(w.id); setPlanPickedName(w.name); setPlanStep('schedule'); }}
                      >
                        <WorkoutPaperCover category={w.category} workoutId={w.id} size="mini">
                          {w.doneThisWeek && (
                            <View style={planStyles.pickerCardCheck}>
                              <Text style={planStyles.pickerCardCheckText}>✓</Text>
                            </View>
                          )}
                        </WorkoutPaperCover>
                        <View style={planStyles.pickerCardFooter}>
                          <Text style={[planStyles.pickerCardName, fd(700)]} numberOfLines={1}>{w.name}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
              <TouchableOpacity style={addPopStyles.cancelBtn} onPress={onClose}>
                <Text style={[addPopStyles.cancelText, addPopStyles.cancelTextOnGlass]}>Cancel</Text>
              </TouchableOpacity>
            </GlassPanel>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {planStep === 'schedule' && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPlanStep('pick')} statusBarTranslucent>
          <View style={addPopStyles.overlay}>
            <View style={[addPopStyles.cardShadow, { width: '100%' }]}>
            <GlassPanel style={[addPopStyles.card, { paddingHorizontal: 20, paddingBottom: 16 }]}>
              <Text style={[addPopStyles.heading, addPopStyles.headingOnGlass]}>Schedule</Text>
              <Text style={planStyles.workoutName} numberOfLines={1}>{planPickedName}</Text>

              <View style={planStyles.dateRow}>
                <TouchableOpacity onPress={() => handlePlanDateNav(-1)} hitSlop={10} activeOpacity={0.6}>
                  <Text style={planStyles.dateArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={planStyles.dateText}>{fmtPlanDate(planDate)}</Text>
                <TouchableOpacity onPress={() => handlePlanDateNav(1)} hitSlop={10} activeOpacity={0.6}>
                  <Text style={planStyles.dateArrow}>›</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={planStyles.repeatRow}
                onPress={() => {
                  const next = !planRepeat;
                  setPlanRepeat(next);
                  if (next) {
                    const [y, m, d] = planDate.split('-').map(Number);
                    setPlanRepeatDow(new Date(y, m - 1, d).getDay());
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={planStyles.repeatLabel}>Repeat weekly</Text>
                <View style={[planStyles.toggleTrack, planRepeat && planStyles.toggleTrackOn]}>
                  <View style={[planStyles.toggleThumb, planRepeat && planStyles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>

              {planRepeat && (
                <>
                  <View style={planStyles.dowRow}>
                    {PLAN_DOW_LABELS.map((label, i) => {
                      const jsDow = PLAN_DOW_ORDER[i];
                      const active = planRepeatDow === jsDow;
                      return (
                        <TouchableOpacity
                          key={label}
                          style={[planStyles.dowPill, active && planStyles.dowPillActive]}
                          onPress={() => { setPlanRepeatDow(jsDow); setPlanDate(nextDowFrom(planDate, jsDow)); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[planStyles.dowPillText, active && planStyles.dowPillTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={planStyles.endAfterRow}>
                    <Text style={planStyles.endAfterLabel}>End after</Text>
                    <View style={planStyles.endAfterPills}>
                      <TouchableOpacity style={[planStyles.endPill, planEndMode === 'no_end' && planStyles.endPillActive]} onPress={() => setPlanEndMode('no_end')} activeOpacity={0.7}>
                        <Text style={[planStyles.endPillText, planEndMode === 'no_end' && planStyles.endPillTextActive]}>No end</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[planStyles.endPill, planEndMode === 'weeks' && planStyles.endPillActive]} onPress={() => setPlanEndMode('weeks')} activeOpacity={0.7}>
                        <Text style={[planStyles.endPillText, planEndMode === 'weeks' && planStyles.endPillTextActive]}>Weeks</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {planEndMode === 'weeks' && (
                    <View style={planStyles.weeksStepper}>
                      <TouchableOpacity onPress={() => setPlanEndWeeks(Math.max(1, planEndWeeks - 1))} hitSlop={8} activeOpacity={0.6} style={planStyles.stepBtn}>
                        <Text style={planStyles.stepBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={planStyles.weeksNum}>{planEndWeeks}</Text>
                      <TouchableOpacity onPress={() => setPlanEndWeeks(Math.min(52, planEndWeeks + 1))} hitSlop={8} activeOpacity={0.6} style={planStyles.stepBtn}>
                        <Text style={planStyles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}

              {savingPlan ? (
                <ActivityIndicator color={ACCENT} style={{ marginTop: 16 }} />
              ) : (
                <TouchableOpacity style={planStyles.saveBtn} onPress={savePlan} activeOpacity={0.85}>
                  <Text style={planStyles.saveBtnText}>
                    {planRepeat
                      ? `Schedule ${planEndMode === 'no_end' ? 52 : planEndWeeks} sessions`
                      : 'Schedule session'}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 6 }}>
                <TouchableOpacity onPress={() => setPlanStep('pick')} style={{ paddingVertical: 10 }}>
                  <Text style={[addPopStyles.cancelText, { color: ACCENT }]}>← Change workout</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={{ paddingVertical: 10 }}>
                  <Text style={[addPopStyles.cancelText, addPopStyles.cancelTextOnGlass]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </GlassPanel>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

type StripSession = {
  id: string;
  date: string;
  createdAt: string | null;
  status: 'completed' | 'scheduled' | 'in_progress';
  /** Who pressed START. Only they may re-enter a running session. Null on rows
   *  created before the column existed — those stay open to everyone. */
  startedBy: string | null;
  workoutId: string | null;
  workoutName: string | null;
  coverImageUrl: string | null;
  category: string | null;
};

type ExerciseDelta = {
  name: string;
  workoutExerciseId: string;
  performed: boolean;
  direction: 'up' | 'down' | 'same' | null;
  deltaKg: number | null;
};

type DayDetail = {
  sessionId: string;
  date: string;
  status: 'completed' | 'scheduled';
  workoutId: string | null;
  workoutName: string | null;
  coverImageUrl: string | null;
  category: string | null;
  durationSeconds: number | null;
  exercisesDoneCount: number;
  exercisesTotal: number;
  exercises: ExerciseDelta[];
  clientNotes: string | null;
};

// ─── Training Tab ───────────────────────────────────────────────────────────

function TrainingTab({
  clientId,
  client,
  clientName,
  training,
  allWorkouts,
  routineCount,
  packages,
  router,
  onReload,
  overviewNote,
  savingOverviewNote,
  onSaveNote,
}: {
  clientId: string;
  client: User | null;
  clientName: string;
  training: ClientTrainingData | null;
  allWorkouts: Array<{ id: string; category: string | null }>;
  routineCount: number;
  packages: SessionPackage[];
  router: ReturnType<typeof useRouter>;
  onReload: () => void;
  overviewNote: string;
  savingOverviewNote: boolean;
  onSaveNote: (note: string) => Promise<void>;
}) {
  const { profile } = useAuth();
  const isTrainer = profile?.role === 'trainer';
  // Workout card style — cover-dark and footer-dark are INDEPENDENT (the seamless
  // 'white' / 'green' styles are light+light and dark+dark). See lib/cardVariant.ts.
  const galleryFooterDark = useFooterDark();
  const coverDark = useCoverDark();
  const { suspendedSession } = useSessionStore();
  const {
    activeRoutine,
    standaloneWorkouts, routineWorkouts,
    lastSessionWorkoutId, lastSessionWorkoutName, lastSessionRoutineName, lastSessionCategory, lastSessionCoverImageUrl, lastSessionDate,
    nextUpWorkout, nextUpPosition, routineTotal,
    cycleDoneCount, cycleJustCompleted,
  } = training ?? {
    activeRoutine: null,
    standaloneWorkouts: [], routineWorkouts: [],
    lastSessionWorkoutId: null, lastSessionWorkoutName: null, lastSessionRoutineName: null, lastSessionCategory: null, lastSessionCoverImageUrl: null, lastSessionDate: null,
    nextUpWorkout: null, nextUpPosition: null, routineTotal: null,
    cycleDoneCount: 0, cycleJustCompleted: false,
  };

  // Week strip state
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [stripSessions, setStripSessions] = useState<StripSession[]>([]);
  const [stripLoading, setStripLoading] = useState(false);
  // A day can hold more than one session (morning + evening) — details keyed by session id.
  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});
  const [dayDetailLoadingIds, setDayDetailLoadingIds] = useState<Set<string>>(new Set());
  const [scheduledMenu, setScheduledMenu] = useState<StripSession | null>(null);
  const [moveDateModal, setMoveDateModal] = useState(false);
  const [movingDate, setMovingDate] = useState(false);
  const [moveCalYear, setMoveCalYear] = useState(new Date().getFullYear());
  const [moveCalMonth, setMoveCalMonth] = useState(new Date().getMonth());
  const moveCalGrid = useMemo(() => buildCalendarGrid(moveCalYear, moveCalMonth), [moveCalYear, moveCalMonth]);
  const [moveCalSessionDates, setMoveCalSessionDates] = useState<Set<string>>(new Set());
  const [moveConfirmDate, setMoveConfirmDate] = useState<string | null>(null);
  const [deleteSessionConfirm, setDeleteSessionConfirm] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [logWorkoutModal, setLogWorkoutModal] = useState(false);

  // Workouts gallery + routine quick-look (mirror the client Training tab)
  const [workoutCards, setWorkoutCards] = useState<WorkoutCard[]>([]);
  // One id -> exercise-names map for every card on this screen (gallery, week strip,
  // recent activity, plan picker, WorkoutRow). Provided via context so the six different
  // card shapes don't each need the names threaded down to them.
  const [exerciseNamesMap, setExerciseNamesMap] = useState<Map<string, string[]>>(new Map());

  const loadWorkoutsSection = useCallback(async () => {
    const [{ data: wData }, { data: doneSess }] = await Promise.all([
      supabase
        .from('workouts')
        .select('id, name, cover_image_url, category, routine_id, created_at, routines(name)')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('workout_id, date')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('date', { ascending: false }),
    ]);

    const lastDone = new Map<string, string>();
    const doneCount = new Map<string, number>();
    for (const s of (doneSess ?? []) as any[]) {
      if (!s.workout_id) continue;
      if (!lastDone.has(s.workout_id)) lastDone.set(s.workout_id, s.date);
      doneCount.set(s.workout_id, (doneCount.get(s.workout_id) ?? 0) + 1);
    }

    const cards: WorkoutCard[] = ((wData ?? []) as any[])
      .filter(w => !w.category || !PLAN_STRETCHING_CATS.includes(w.category))
      .map(w => ({
        id: w.id,
        name: w.name,
        coverUrl: w.cover_image_url ?? null,
        category: w.category ?? null,
        routineName: w.routines?.name ?? null,
        lastDoneDate: lastDone.get(w.id) ?? null,
        sessionCount: doneCount.get(w.id) ?? 0,
      }));

    // Most recently done first; never-done fall to the end (kept in created-desc order).
    cards.sort((a, b) => {
      if (a.lastDoneDate && b.lastDoneDate) return b.lastDoneDate.localeCompare(a.lastDoneDate);
      if (a.lastDoneDate) return -1;
      if (b.lastDoneDate) return 1;
      return 0;
    });

    setWorkoutCards(cards);

    // Names for EVERY active workout of this client, not just the gallery slice — the week
    // strip and recent-activity cards can reference workouts filtered out above. PLUS the
    // workouts referenced by completed sessions (Aug 3 2026): a free session's backing
    // workout is `status='completed'`, so the active-only fetch above never has it and its
    // week-strip / recent-activity cards rendered a coverless blank — Vitek's "the
    // exercises done in the free session dont appear on top of the card".
    setExerciseNamesMap(await fetchExerciseNames(Array.from(new Set([
      ...((wData ?? []) as any[]).map(w => w.id),
      ...((doneSess ?? []) as any[]).map(s => s.workout_id).filter(Boolean),
    ]))));
  }, [clientId]);

  const loadStripSessions = useCallback(async () => {
    setStripLoading(true);
    const now = Date.now();
    const rangeStart = localDateStr(new Date(now - 8 * 7 * 24 * 60 * 60 * 1000));
    const rangeEnd   = localDateStr(new Date(now + 8 * 7 * 24 * 60 * 60 * 1000));
    const { data } = await supabase
      .from('sessions')
      .select('id, date, created_at, status, started_by, workout_id, workouts(name, cover_image_url, category)')
      .eq('client_id', clientId)
      // 'in_progress' included so a session the client has STARTED but not finished
      // still shows on its day. Without it the day reads empty while they're training.
      .in('status', ['completed', 'scheduled', 'in_progress'])
      .gte('date', rangeStart)
      .lte('date', rangeEnd);
    setStripSessions(
      (data ?? []).map((s: any) => ({
        id: s.id,
        date: s.date,
        createdAt: s.created_at ?? null,
        status: s.status as 'completed' | 'scheduled' | 'in_progress',
        startedBy: s.started_by ?? null,
        workoutId: s.workout_id ?? null,
        workoutName: s.workouts?.name ?? null,
        coverImageUrl: s.workouts?.cover_image_url ?? null,
        category: s.workouts?.category ?? null,
      }))
    );
    setStripLoading(false);
  }, [clientId]);

  // Recent Activity — last 3 completed sessions (stretch sessions excluded, per the
  // app-wide Recent Activity rule), most recent first.
  const [recentSessions, setRecentSessions] = useState<{ id: string; workoutId: string | null; name: string; date: string }[]>([]);
  const loadRecentSessions = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('id, workout_id, name, date, created_at, workouts(name, category)')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentSessions(
      (data ?? [])
        .filter((s: any) => !STRETCHING_CATEGORIES.includes(s.workouts?.category))
        .slice(0, 3)
        .map((s: any) => ({
          id: s.id,
          workoutId: s.workout_id ?? null,
          name: s.workouts?.name ?? s.name ?? 'Free session',
          date: s.date,
        }))
    );
  }, [clientId]);

  // Jump the week strip to a given day (used by the Recent Activity rows).
  const goToStripDate = useCallback((dateStr: string) => {
    const mondayOf = (d: Date) => {
      const m = new Date(d);
      m.setHours(0, 0, 0, 0);
      m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
      return m;
    };
    const targetMon = mondayOf(new Date(`${dateStr}T00:00:00`));
    const currentMon = mondayOf(new Date());
    setWeekOffset(Math.round((targetMon.getTime() - currentMon.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    setSelectedDate(dateStr);
  }, []);

  useFocusEffect(useCallback(() => { loadStripSessions(); loadWorkoutsSection(); loadRecentSessions(); }, [loadStripSessions, loadWorkoutsSection, loadRecentSessions]));

  const loadMoveCalSessions = useCallback(async (year: number, month: number) => {
    const firstDay = toDateStr(year, month, 1);
    const lastDay = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
    const { data } = await supabase
      .from('sessions')
      .select('date')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .gte('date', firstDay)
      .lte('date', lastDay);
    setMoveCalSessionDates(new Set((data ?? []).map((s: any) => s.date as string)));
  }, [clientId]);

  useEffect(() => {
    if (!moveDateModal) return;
    loadMoveCalSessions(moveCalYear, moveCalMonth);
  }, [moveDateModal, moveCalYear, moveCalMonth, loadMoveCalSessions]);

  // Load the full detail (logs + weight deltas vs the previous session) for one completed session.
  const loadCompletedDetail = useCallback(async (session: StripSession): Promise<DayDetail> => {
    const [{ data: sesData }, { data: logsData }, { data: weData }] = await Promise.all([
      supabase.from('sessions').select('duration_seconds, client_notes').eq('id', session.id).single(),
      supabase.from('session_logs')
        .select('workout_exercise_id, weight_kg, reps_completed')
        .eq('session_id', session.id)
        .eq('is_removed', false),
      session.workoutId
        ? supabase.from('workout_exercises')
            .select('id, order_index, exercises(name)')
            .eq('workout_id', session.workoutId)
            .order('order_index')
        : Promise.resolve({ data: [] }),
    ]);

    const logs = (logsData ?? []) as any[];
    const wes  = (weData  ?? []) as any[];
    const ses  = sesData as any;

    const thisMap = new Map<string, number>();
    const loggedWeIds = new Set<string>();
    for (const log of logs) {
      const weId = log.workout_exercise_id;
      if (!weId) continue;
      if ((log.weight_kg ?? 0) > 0 || (log.reps_completed ?? 0) > 0) {
        loggedWeIds.add(weId);
        const w = log.weight_kg ?? 0;
        if (w > (thisMap.get(weId) ?? 0)) thisMap.set(weId, w);
      }
    }

    const prevMap = new Map<string, number>();
    if (session.workoutId) {
      const { data: prevSess } = await supabase
        .from('sessions')
        .select('id')
        .eq('workout_id', session.workoutId)
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .neq('id', session.id)
        .order('date', { ascending: false })
        .limit(1);
      if (prevSess?.length) {
        const { data: prevLogs } = await supabase
          .from('session_logs')
          .select('workout_exercise_id, weight_kg')
          .eq('session_id', (prevSess[0] as any).id)
          .eq('is_removed', false);
        for (const log of (prevLogs ?? []) as any[]) {
          const weId = log.workout_exercise_id;
          if (!weId) continue;
          const w = log.weight_kg ?? 0;
          if (w > (prevMap.get(weId) ?? 0)) prevMap.set(weId, w);
        }
      }
    }

    const exercises: ExerciseDelta[] = wes.map((we: any) => {
      const weId = we.id;
      const performed = loggedWeIds.has(weId);
      const thisW  = thisMap.get(weId) ?? 0;
      const prevW  = prevMap.get(weId);
      let direction: ExerciseDelta['direction'] = null;
      let deltaKg: number | null = null;
      if (performed && prevW != null) {
        const diff = thisW - prevW;
        direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
        deltaKg   = Math.abs(diff);
      }
      return { name: we.exercises?.name ?? 'Unknown', workoutExerciseId: weId, performed, direction, deltaKg };
    });

    return {
      sessionId: session.id,
      date: session.date,
      status: 'completed',
      workoutId: session.workoutId,
      workoutName: session.workoutName,
      coverImageUrl: session.coverImageUrl,
      category: session.category,
      durationSeconds: ses?.duration_seconds ?? null,
      exercisesDoneCount: loggedWeIds.size,
      exercisesTotal: wes.length,
      exercises,
      clientNotes: ses?.client_notes ?? null,
    };
  }, [clientId]);

  // Load day detail for every session on the selected day. Scheduled sessions get a
  // synthetic detail immediately; completed sessions load their logs/deltas async.
  useEffect(() => {
    const sessions = stripSessions.filter(s => s.date === selectedDate);
    if (sessions.length === 0) { setDayDetails({}); setDayDetailLoadingIds(new Set()); return; }

    const completed = sessions.filter(s => s.status === 'completed');
    const scheduled = sessions.filter(s => s.status === 'scheduled');

    const base: Record<string, DayDetail> = {};
    for (const s of scheduled) {
      base[s.id] = {
        sessionId: s.id,
        date: s.date,
        status: 'scheduled',
        workoutId: s.workoutId,
        workoutName: s.workoutName,
        coverImageUrl: s.coverImageUrl,
        category: s.category,
        durationSeconds: null,
        exercisesDoneCount: 0,
        exercisesTotal: 0,
        exercises: [],
        clientNotes: null,
      };
    }
    setDayDetails(base);
    setDayDetailLoadingIds(new Set(completed.map(s => s.id)));

    if (completed.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(completed.map(s => loadCompletedDetail(s)));
      if (cancelled) return;
      setDayDetails(prev => {
        const next = { ...prev };
        results.forEach((d, i) => { next[completed[i].id] = d; });
        return next;
      });
      setDayDetailLoadingIds(new Set());
    })();
    return () => { cancelled = true; };
  }, [selectedDate, stripSessions, clientId, loadCompletedDetail]);

  const moveSessionDate = useCallback(async () => {
    if (!scheduledMenu || !moveConfirmDate) return;
    setMovingDate(true);
    await supabase.from('sessions').update({ date: moveConfirmDate }).eq('id', scheduledMenu.id);
    setMovingDate(false);
    setMoveConfirmDate(null);
    setMoveDateModal(false);
    setScheduledMenu(null);
    await loadStripSessions();
    setSelectedDate(moveConfirmDate);
  }, [scheduledMenu, moveConfirmDate, loadStripSessions]);

  const deleteSession = useCallback(async () => {
    if (!deleteSessionConfirm) return;
    setDeletingSession(true);
    await supabase.from('sessions').delete().eq('id', deleteSessionConfirm);
    setDeletingSession(false);
    setDeleteSessionConfirm(null);
    setScheduledMenu(null);
    setDayDetails({});
    await loadStripSessions();
  }, [deleteSessionConfirm, loadStripSessions]);

  // Menu state
  const [activeMenu, setActiveMenu] = useState<{ id: string; name: string; category: string | null; status?: 'active' | 'completed' } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [routinePickerId, setRoutinePickerId] = useState<string | null>(null);
  const [quickLookWorkout, setQuickLookWorkout] = useState<{
    id: string; name: string; category: string | null;
    sessionId?: string | null; dateLabel?: string | null; durationSeconds?: number | null;
  } | null>(null);
  const [quickLookVisible, setQuickLookVisible] = useState(false);

  // Open the details sheet for a completed session on the strip (performed mode),
  // or planned mode for a scheduled one.
  const openSessionDetailsSheet = useCallback(async (sess: StripSession) => {
    const completed = sess.status === 'completed';
    const detail = completed ? dayDetails[sess.id] : undefined;
    let sessionId: string | null = completed ? sess.id : null;
    let dateLabel: string | null = completed ? fmtDayLabel(sess.date) : null;
    let durationSeconds: number | null = detail?.durationSeconds ?? null;

    // ⚠️ A RUNNING session has no logs — weights only reach the DB at FINISH — so
    // passing its own id (or null) would render the programmed TARGETS and read as
    // "nothing logged". Show the most recent COMPLETED session for this workout
    // instead: "whatever was logged last, or set last" (Vitek). Falls through to
    // targets when the workout has genuinely never been performed.
    if (sess.status === 'in_progress' && sess.workoutId) {
      const { data } = await supabase
        .from('sessions')
        .select('id, date, duration_seconds')
        .eq('client_id', clientId)
        .eq('workout_id', sess.workoutId)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        sessionId = (data as any).id;
        dateLabel = fmtDayLabel((data as any).date);
        durationSeconds = (data as any).duration_seconds ?? null;
      }
    }

    setQuickLookWorkout({
      id: sess.workoutId ?? '',
      name: sess.workoutName ?? 'Session',
      category: sess.category,
      sessionId, dateLabel, durationSeconds,
    });
    setQuickLookVisible(true);
  }, [dayDetails, clientId]);

  const startRename = () => {
    if (!activeMenu) return;
    setRenameText(activeMenu.name);
    setRenamingId(activeMenu.id);
    setActiveMenu(null);
  };

  const confirmRename = async (workoutId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingId(null); return; }
    await supabase.from('workouts').update({ name: trimmed }).eq('id', workoutId);
    setRenamingId(null);
    onReload();
  };

  const startDelete = () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    Alert.alert('Delete this workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('workouts').delete().eq('id', target.id);
          onReload();
        },
      },
    ]);
  };

  const toggleWorkoutStatus = async () => {
    if (!activeMenu) return;
    const target = activeMenu;
    const newStatus = target.status === 'completed' ? 'active' : 'completed';
    setActiveMenu(null);
    await supabase.from('workouts').update({ status: newStatus }).eq('id', target.id);
    onReload();
  };

  const openRoutinePicker = () => {
    if (!activeMenu) return;
    setRoutinePickerId(activeMenu.id);
    setActiveMenu(null);
  };

  const openViewExercises = () => {
    if (!activeMenu) return;
    setQuickLookWorkout({ id: activeMenu.id, name: activeMenu.name, category: activeMenu.category ?? null });
    setQuickLookVisible(true);
    setActiveMenu(null);
  };

  const openEditWorkout = () => {
    if (!activeMenu) return;
    const wid = activeMenu.id;
    setActiveMenu(null);
    router.push(`/(trainer)/workout-builder?clientId=${clientId}&editWorkoutId=${wid}` as any);
  };

  const handleAddToRoutine = async (workoutId: string, routineId: string) => {
    await supabase.from('workouts').update({ routine_id: routineId }).eq('id', workoutId);
    setRoutinePickerId(null);
    onReload();
  };

  const allWks = [...standaloneWorkouts, ...routineWorkouts];
  const allWksForPicker = allWks.filter(w => (w.status ?? 'active') === 'active');
  // Active routine, shaped for the client-style RoutineReadout (weekly flags come
  // straight from lib/clientTraining's WorkoutWithLastDate).
  const activeRoutineRow = useMemo<RoutineRow | null>(() => {
    if (!activeRoutine) return null;
    const workouts = (routineWorkouts ?? []).map(w => ({
      id: w.id,
      name: w.name ?? '',
      category: w.category ?? null,
      orderIndex: w.order_index,
      doneThisWeek: w.doneThisWeek ?? false,
      missedLastWeek: w.missedLastWeek ?? false,
      lastSessionDate: w.lastSessionDate ?? null,
    }));
    return {
      id: activeRoutine.id,
      name: activeRoutine.name,
      isActive: true,
      createdAt: activeRoutine.created_at,
      closedAt: null,
      workouts,
      weeklyDoneCount: workouts.filter(w => w.doneThisWeek).length,
      routineTotal: workouts.length,
    };
  }, [activeRoutine, routineWorkouts]);

  return (
    <ExerciseNamesProvider value={exerciseNamesMap}>
    <View>
      <View>
          {/* Week strip — includes session content */}
          <WeekStripCard
            weekOffset={weekOffset}
            selectedDate={selectedDate}
            stripSessions={stripSessions}
            daySessions={stripSessions
              .filter(s => s.date === selectedDate)
              .sort((a, b) => {
                // completed (done) → in progress (live) → planned (not started).
                const rank = (s: StripSession) => (s.status === 'completed' ? 0 : s.status === 'in_progress' ? 1 : 2);
                if (rank(a) !== rank(b)) return rank(a) - rank(b);
                return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
              })}
            details={dayDetails}
            loadingIds={dayDetailLoadingIds}
            clientId={clientId}
            allWorkouts={allWksForPicker}
            activeRoutine={activeRoutine}
            nextUpWorkout={nextUpWorkout}
            router={router}
            onWeekChange={setWeekOffset}
            onDaySelect={setSelectedDate}
            onScheduledMenu={setScheduledMenu}
            onShowLastLogged={openSessionDetailsSheet}
            onLogWorkout={() => setLogWorkoutModal(true)}
            onReloadStrip={loadStripSessions}
          />

          {/* Full-bleed wrapper — cancels the tab's 16px content padding so the WORKOUTS
              gallery reaches the screen edge (each section re-adds its own 16px insets). */}
          <View style={sectionStyles.fullBleed}>
          {/* ── ROUTINES section FIRST (mirrors the client Training tab's order) ──
              Extra paddingTop only here: the week-strip zone above gets more separation
              than the section-to-section rhythm, so it reads as its own unit. */}
          {/* The WHOLE header row is the tap target, not just the chevron — a 15px glyph
              16px off the screen edge is a ~15pt target sitting where iOS's own edge
              swipe wants the touch (mirrors the client Training tab). paddingTop 20 on
              top of headerRow's marginTop 22 keeps this section's extra 42px gap. */}
          <TouchableOpacity
            style={[sectionStyles.headerRow, { paddingTop: 20 }]}
            onPress={() => router.push(`/(trainer)/client/${clientId}/all-routines` as any)}
            activeOpacity={0.7}
          >
            <View style={sectionStyles.headerLeft}>
              <Text style={[sectionStyles.headerLabel, { marginLeft: 0 }]}>Routines</Text>
            </View>
            <SymbolView name="chevron.right" size={15} tintColor="#999" weight="semibold" />
          </TouchableOpacity>
          {activeRoutineRow ? (
            <RoutineReadout
              routine={activeRoutineRow}
              onPress={() => router.push(`/(trainer)/client/${clientId}/routine/${activeRoutineRow.id}` as any)}
            />
          ) : (
            <Text style={sectionStyles.noRoutine}>No active routine</Text>
          )}

          {/* ── WORKOUTS gallery — horizontal swipeable cover cards (mirrors client) ── */}
          <TouchableOpacity
            style={sectionStyles.headerRow}
            onPress={() => router.push(`/(trainer)/client/${clientId}/all-workouts` as any)}
            activeOpacity={0.7}
          >
            <View style={sectionStyles.headerLeft}>
              <Text style={[sectionStyles.headerLabel, { marginLeft: 0 }]}>Workouts</Text>
            </View>
            <SymbolView name="chevron.right" size={15} tintColor="#999" weight="semibold" />
          </TouchableOpacity>
          {workoutCards.length === 0 ? (
            <Text style={sectionStyles.noRoutine}>No workouts yet</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sectionStyles.hScroll}>
              {workoutCards.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[sectionStyles.wCardOuter, galleryFooterDark && darkCardStyles.bg]}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/(trainer)/client/${clientId}/workout/${c.id}` as any)}
                >
                  <View style={[sectionStyles.wCard, galleryFooterDark && darkCardStyles.bg]}>
                    <WorkoutPaperCover category={c.category} workoutId={c.id} size="mini" />
                    {/* Compact one-line footer: name · last-done date · ⋯ (matches client) */}
                    <View style={sectionStyles.wBody}>
                      <Text style={[sectionStyles.wName, { flex: 1 }, galleryFooterDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[sectionStyles.wStatus, ft(600), { color: c.lastDoneDate ? ACCENT : galleryFooterDark ? 'rgba(255,255,255,0.5)' : '#999' }]} numberOfLines={1}>
                        {c.lastDoneDate ? fmtShortDate(c.lastDoneDate) : '—'}
                      </Text>
                      {/* All-time session count, right after the date it belongs to —
                          the same slot as My Workouts. Completed sessions only. */}
                      {c.sessionCount > 0 && (
                        <Text style={[sectionStyles.wCount, galleryFooterDark && darkCardStyles.subOnDark]} numberOfLines={1}>
                          {c.sessionCount}×
                        </Text>
                      )}
                      <TouchableOpacity style={sectionStyles.wFooterMenuBtn} hitSlop={8} activeOpacity={0.6} onPress={() => setActiveMenu({ id: c.id, name: c.name, category: c.category })}>
                        <SymbolView name="ellipsis" size={16} tintColor={galleryFooterDark ? DARK_MUTED_ICON : '#bbb'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={sectionStyles.seeAllCard} onPress={() => router.push(`/(trainer)/client/${clientId}/all-workouts` as any)} activeOpacity={0.85}>
                <Text style={sectionStyles.seeAllArrow}>→</Text>
                <Text style={sectionStyles.seeAllCardText}>See all {workoutCards.length}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
          </View>

          {/* Recent Activity — plain list of the last 3 sessions, most recent first
              (Vitek's July 25 call: no cover card; name left, date right, chevron
              jumps the week strip to that session's day). */}
          <View style={[sectionStyles.headerRow, { paddingHorizontal: 0 }]}>
            <View style={sectionStyles.headerLeft}>
              <Text style={[sectionStyles.headerLabel, { marginLeft: 0 }]}>Recent activity</Text>
            </View>
          </View>
          {recentSessions.length === 0 ? (
            <EmptyCard text="No sessions logged yet" />
          ) : (
            <View style={raStyles.card}>
              {recentSessions.map((s, i) => (
                <TouchableOpacity
                  key={s.id}
                  style={[raStyles.row, i > 0 && raStyles.rowBorder]}
                  activeOpacity={0.7}
                  onPress={() => goToStripDate(s.date)}
                >
                  <Text style={raStyles.name} numberOfLines={1}>{s.name}</Text>
                  <Text style={raStyles.date}>{fmtShortDate(s.date)}</Text>
                  <SymbolView name="chevron.right" size={12} tintColor="#ccc" weight="semibold" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Trainer Note */}
          <TrainerNoteWidget
            note={overviewNote}
            saving={savingOverviewNote}
            onSave={onSaveNote}
          />

          {activeMenu && (
            <WorkoutMenuModal
              workoutName={activeMenu.name}
              workoutStatus={activeMenu.status ?? 'active'}
              onEdit={openEditWorkout}
              onDelete={startDelete}
              onAddToRoutine={openRoutinePicker}
              onToggleStatus={toggleWorkoutStatus}
              onViewExercises={openViewExercises}
              onClose={() => setActiveMenu(null)}
            />
          )}

          {routinePickerId && (
            <RoutinePickerModal
              clientId={clientId}
              onPick={routineId => handleAddToRoutine(routinePickerId, routineId)}
              onClose={() => setRoutinePickerId(null)}
            />
          )}

          <SessionDetailsSheet
            visible={quickLookVisible}
            onClose={() => setQuickLookVisible(false)}
            workoutId={quickLookWorkout?.id || null}
            workoutName={quickLookWorkout?.name ?? ''}
            category={quickLookWorkout?.category ?? null}
            sessionId={quickLookWorkout?.sessionId ?? null}
            clientId={clientId}
            dateLabel={quickLookWorkout?.dateLabel ?? null}
            durationSeconds={quickLookWorkout?.durationSeconds ?? null}
            onOpenFullView={(wid) => router.push(`/(trainer)/client/${clientId}/workout/${wid}?viewOnly=1` as any)}
          />

          {/* Scheduled session ⋯ menu */}
          {scheduledMenu && !moveDateModal && (
            <ScheduledSessionMenu
              workoutName={scheduledMenu.workoutName ?? 'Session'}
              status={scheduledMenu.status}
              hasWorkout={!!scheduledMenu.workoutId}
              onViewDetails={() => { const s = scheduledMenu; setScheduledMenu(null); openSessionDetailsSheet(s); }}
              onSeeHowItWent={() => {
                const s = scheduledMenu;
                // Dismiss the menu FIRST, then push — the overview arrives from the right
                // over a settled screen, and back lands exactly where he tapped ⋯.
                setScheduledMenu(null);
                router.push({
                  pathname: '/(trainer)/client/[id]/workout/session-complete',
                  params: {
                    id: clientId,
                    sessionId: s.id,
                    workoutId: s.workoutId ?? 'free',
                    clientName: client?.name ?? '',
                    review: '1',
                  },
                } as any);
              }}
              onEditWorkout={() => {
                const wid = scheduledMenu.workoutId;
                setScheduledMenu(null);
                // ⚠️ `editWorkoutId`, not `workoutId` — the builder has no `workoutId`
                // param, so the old name silently opened an EMPTY "Build Workout" screen
                // (found Aug 3 2026 when this row was extended to completed sessions).
                // No `scheduleDate`: the session row already exists, this is a pure edit.
                if (wid) router.push(`/(trainer)/workout-builder?clientId=${clientId}&editWorkoutId=${wid}` as any);
              }}
              onMove={() => {
                const [y, m] = scheduledMenu.date.split('-').map(Number);
                setMoveCalYear(y);
                setMoveCalMonth(m - 1);
                setMoveDateModal(true);
              }}
              onDelete={() => { setDeleteSessionConfirm(scheduledMenu.id); setScheduledMenu(null); }}
              onClose={() => setScheduledMenu(null)}
            />
          )}

          {/* Move training — calendar picker modal */}
          {moveDateModal && (
            <BottomSheet onClose={() => { setMoveDateModal(false); setScheduledMenu(null); setMoveConfirmDate(null); }}>
              {close => (
                <View style={moveCalStyles.sheetContent}>
                  <Text style={moveCalStyles.title}>Move Training</Text>
                  <Text style={moveCalStyles.sub}>Pick a new date</Text>
                  {/* Month navigation */}
                  <View style={moveCalStyles.monthRow}>
                    <TouchableOpacity hitSlop={10} activeOpacity={0.7} onPress={() => {
                      if (moveCalMonth === 0) { setMoveCalYear(y => y - 1); setMoveCalMonth(11); }
                      else setMoveCalMonth(m => m - 1);
                      setMoveConfirmDate(null);
                    }}>
                      <SymbolView name="chevron.left" size={16} tintColor={MUTED} />
                    </TouchableOpacity>
                    <Text style={moveCalStyles.monthLabel}>{MONTH_NAMES[moveCalMonth]} {moveCalYear}</Text>
                    <TouchableOpacity hitSlop={10} activeOpacity={0.7} onPress={() => {
                      if (moveCalMonth === 11) { setMoveCalYear(y => y + 1); setMoveCalMonth(0); }
                      else setMoveCalMonth(m => m + 1);
                      setMoveConfirmDate(null);
                    }}>
                      <SymbolView name="chevron.right" size={16} tintColor={MUTED} />
                    </TouchableOpacity>
                  </View>
                  {/* Day-of-week headers */}
                  <View style={moveCalStyles.dowRow}>
                    {DAY_LABELS.map((d, i) => (
                      <Text key={i} style={moveCalStyles.dowLabel}>{d}</Text>
                    ))}
                  </View>
                  {/* Calendar grid */}
                  {moveCalGrid.map((week, wi) => (
                    <View key={wi} style={moveCalStyles.weekRow}>
                      {week.map((day, di) => {
                        if (!day) return <View key={di} style={moveCalStyles.dayCell} />;
                        const dateStr = toDateStr(moveCalYear, moveCalMonth, day);
                        const isToday = dateStr === todayStr;
                        const isCurrent = dateStr === scheduledMenu?.date;
                        const isConfirm = dateStr === moveConfirmDate;
                        const hasSession = moveCalSessionDates.has(dateStr);
                        return (
                          <TouchableOpacity
                            key={di}
                            style={moveCalStyles.dayCell}
                            onPress={() => isCurrent ? undefined : setMoveConfirmDate(dateStr)}
                            disabled={movingDate || isCurrent}
                            activeOpacity={0.7}
                          >
                            <View style={[
                              moveCalStyles.dayInner,
                              isToday && !isConfirm && moveCalStyles.todayCircle,
                              isCurrent && moveCalStyles.currentCircle,
                              isConfirm && moveCalStyles.confirmCircle,
                            ]}>
                              <Text style={[
                                moveCalStyles.dayText,
                                isToday && !isConfirm && moveCalStyles.todayText,
                                isCurrent && moveCalStyles.currentText,
                                isConfirm && moveCalStyles.confirmText,
                              ]}>{day}</Text>
                            </View>
                            {hasSession && !isCurrent
                              ? <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
                              : <View style={{ height: 9 }} />
                            }
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                  {/* Legend */}
                  <View style={moveCalStyles.legendRow}>
                    <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
                    <Text style={moveCalStyles.legendText}>Workout logged</Text>
                  </View>
                  {/* Confirmation bar */}
                  {moveConfirmDate && !movingDate && (
                    <View style={moveCalStyles.confirmBar}>
                      <Text style={moveCalStyles.confirmMsg}>
                        Move to {new Date(moveConfirmDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}?
                      </Text>
                      <TouchableOpacity style={moveCalStyles.confirmBtn} onPress={() => close(() => moveSessionDate())} activeOpacity={0.85}>
                        <Text style={moveCalStyles.confirmBtnText}>Move</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {movingDate && <ActivityIndicator color={ACCENT} style={{ marginTop: 12 }} />}
                  <TouchableOpacity onPress={() => close()} hitSlop={8} style={{ marginTop: 12 }}>
                    <Text style={moveCalStyles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </BottomSheet>
          )}

          {/* Delete session confirm modal */}
          {deleteSessionConfirm && (
            <Modal visible transparent animationType="fade" onRequestClose={() => setDeleteSessionConfirm(null)} statusBarTranslucent>
              <View style={cmStyles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteSessionConfirm(null)} />
                <View style={cmStyles.glassShadow}>
                <GlassPanel style={cmStyles.glassBox}>
                  <Text style={cmStyles.title}>Delete session?</Text>
                  <Text style={cmStyles.messageOnGlass}>This removes the session from the calendar. The workout is not deleted.</Text>
                  <TouchableOpacity style={[cmStyles.actionBtn, { backgroundColor: '#ef4444' }]} onPress={deleteSession} disabled={deletingSession} activeOpacity={0.85}>
                    <Text style={cmStyles.actionBtnText}>{deletingSession ? '…' : 'Delete'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeleteSessionConfirm(null)} hitSlop={8}>
                    <Text style={cmStyles.cancelOnGlass}>Cancel</Text>
                  </TouchableOpacity>
                </GlassPanel>
                </View>
              </View>
            </Modal>
          )}

          {/* Log workout picker modal */}
          {logWorkoutModal && (
            <LogWorkoutModal
              workouts={allWksForPicker}
              onPick={(workoutId) => {
                setLogWorkoutModal(false);
                router.push(`/(trainer)/client/${clientId}/workout/${workoutId}` as any);
              }}
              onClose={() => setLogWorkoutModal(false)}
            />
          )}
        </View>
    </View>
    </ExerciseNamesProvider>
  );
}

// ─── TrainerNoteWidget ────────────────────────────────────────────────────────

function TrainerNoteWidget({
  note,
  saving,
  onSave,
}: {
  note: string;
  saving: boolean;
  onSave: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => { setDraft(note); setEditing(true); };
  const handleSave = () => { onSave(draft); setEditing(false); };

  return (
    <>
      <View style={[sectionStyles.headerRow, { paddingHorizontal: 0 }]}>
        <View style={sectionStyles.headerLeft}>
          <Text style={[sectionStyles.headerLabel, { marginLeft: 0 }]}>Trainer note</Text>
        </View>
        {editing ? (
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={8}>
            <Text style={noteStyles.editLink}>{saving ? '…' : 'Save'}</Text>
          </TouchableOpacity>
        ) : note ? (
          <TouchableOpacity onPress={startEdit} hitSlop={8}>
            <Text style={noteStyles.editLink}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={noteStyles.card}>
      {editing ? (
        <TextInput
          style={noteStyles.noteInput}
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          placeholder="Add a note about this client…"
          placeholderTextColor="#ccc"
          textAlignVertical="top"
          autoCapitalize="sentences"
        />
      ) : note ? (
        <Text style={noteStyles.noteText}>{note}</Text>
      ) : (
        <TouchableOpacity onPress={startEdit} activeOpacity={0.7}>
          <Text style={noteStyles.addNote}>+ Add note</Text>
        </TouchableOpacity>
      )}
      </View>
    </>
  );
}

// ─── LastSessionHighlights ───────────────────────────────────────────────────

type HighlightRow = { name: string; direction: 'up' | 'down' | 'same'; weight: number; diff: number | null };

function LastSessionHighlights({ clientId }: { clientId: string }) {
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const STRETCHING_CATS = ['Upper body stretching', 'Lower body stretching', 'Full body stretching'];
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, workouts(category)')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(10);

      const nonStretchSessions = (sessions as any[])?.filter(
        s => !s.workouts?.category || !STRETCHING_CATS.includes(s.workouts.category)
      ) ?? [];

      if (cancelled || nonStretchSessions.length === 0) {
        if (!cancelled) setLoaded(true);
        return;
      }

      const sessionIds = nonStretchSessions.slice(0, 2).map((s: any) => s.id);
      const lastId = sessionIds[0];
      const prevId: string | null = sessionIds[1] ?? null;

      const { data: logs } = await supabase
        .from('session_logs')
        .select('session_id, weight_kg, workout_exercises(exercise_id, exercises(name))')
        .in('session_id', sessionIds)
        .eq('is_removed', false);

      if (cancelled) return;

      const lastMap = new Map<string, { name: string; maxWeight: number }>();
      const prevMap = new Map<string, number>();

      for (const log of (logs ?? []) as any[]) {
        const exId = log.workout_exercises?.exercise_id;
        const name = log.workout_exercises?.exercises?.name;
        const w: number = log.weight_kg ?? 0;
        if (!exId) continue;
        if (log.session_id === lastId && name) {
          const cur = lastMap.get(exId);
          if (!cur || w > cur.maxWeight) lastMap.set(exId, { name, maxWeight: w });
        } else if (log.session_id === prevId) {
          const cur = prevMap.get(exId);
          if (cur == null || w > cur) prevMap.set(exId, w);
        }
      }

      const result: HighlightRow[] = [];
      for (const [exId, { name, maxWeight }] of lastMap.entries()) {
        if (result.length >= 3) break;
        const prev = prevMap.get(exId);
        let direction: 'up' | 'down' | 'same' = 'same';
        let diff: number | null = null;
        if (prev != null) {
          if (maxWeight > prev) { direction = 'up'; diff = maxWeight - prev; }
          else if (maxWeight < prev) { direction = 'down'; diff = maxWeight - prev; }
        }
        result.push({ name, direction, weight: maxWeight, diff });
      }

      if (!cancelled) { setHighlights(result); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!loaded || highlights.length === 0) return null;

  return (
    <View style={hlStyles.card}>
      <Text style={hlStyles.label}>LAST SESSION HIGHLIGHTS</Text>
      {highlights.map((h, i) => {
        const isUp = h.direction === 'up';
        const isDown = h.direction === 'down';
        const arrow = isUp ? '↑' : isDown ? '↓' : '→';
        const color = isUp ? '#22c55e' : isDown ? '#ef4444' : MUTED;
        let valueText = '';
        if (h.diff != null) {
          const diffStr = h.diff > 0 ? `+${h.diff}kg` : `${h.diff}kg`;
          valueText = `${diffStr} · ${h.weight}kg`;
        } else {
          valueText = h.weight > 0 ? `${h.weight}kg` : '—';
        }
        return (
          <View key={i} style={[hlStyles.row, i < highlights.length - 1 && hlStyles.rowBorder]}>
            <Text style={hlStyles.exerciseName} numberOfLines={1}>{h.name}</Text>
            <Text style={[hlStyles.change, { color }]}>{arrow} {valueText}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── WeekStripCard ────────────────────────────────────────────────────────────

function WeekStripCard({
  weekOffset,
  selectedDate,
  stripSessions,
  daySessions,
  details,
  loadingIds,
  clientId,
  allWorkouts,
  activeRoutine,
  nextUpWorkout,
  router,
  onWeekChange,
  onDaySelect,
  onScheduledMenu,
  onShowLastLogged,
  onLogWorkout,
  onReloadStrip,
}: {
  weekOffset: number;
  selectedDate: string;
  stripSessions: StripSession[];
  daySessions: StripSession[];
  details: Record<string, DayDetail>;
  loadingIds: Set<string>;
  clientId: string;
  allWorkouts: WorkoutWithLastDate[];
  activeRoutine: any;
  nextUpWorkout: any;
  router: ReturnType<typeof useRouter>;
  onWeekChange: (n: number) => void;
  onDaySelect: (date: string) => void;
  onScheduledMenu: (s: StripSession) => void;
  /** Opens the last COMPLETED session's details — used when a running session can't be entered. */
  onShowLastLogged: (s: StripSession) => void;
  onLogWorkout: () => void;
  onReloadStrip: () => void;
}) {
  // Workout card style: the week-strip session cards follow the setting like every other
  // workout card since July 24 (the locked all-dark hero is gone on both sides).
  const footerDark = useFooterDark();
  const weekOffsetRef = useRef(weekOffset);
  weekOffsetRef.current = weekOffset;
  const [noSessModal, setNoSessModal] = useState(false);
  // Someone ELSE has this session open (see `startedBy`). Tapping it explains rather
  // than entering — the other device holds the live weights, so opening it here would
  // show an empty session and finishing it would save that emptiness over their work.
  const [busySession, setBusySession] = useState<StripSession | null>(null);
  const { profile: me } = useAuth();

  // Month calendar (jump the week strip to a chosen day) — opened by the calendar icon
  const [calOpen, setCalOpen] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSessionDates, setCalSessionDates] = useState<Set<string>>(new Set());
  const calGrid = useMemo(() => buildCalendarGrid(calYear, calMonth), [calYear, calMonth]);

  const loadCalSessions = useCallback(async (year: number, month: number) => {
    const firstDay = toDateStr(year, month, 1);
    const lastDay = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
    const { data } = await supabase
      .from('sessions')
      .select('date')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .gte('date', firstDay)
      .lte('date', lastDay);
    setCalSessionDates(new Set((data ?? []).map((s: any) => s.date as string)));
  }, [clientId]);

  useEffect(() => {
    if (!calOpen) return;
    loadCalSessions(calYear, calMonth);
  }, [calOpen, calYear, calMonth, loadCalSessions]);

  const openCalendar = () => {
    const [y, m] = localDateStr(getWeekDates(weekOffset)[0]).split('-').map(Number);
    setCalYear(y);
    setCalMonth(m - 1);
    setCalOpen(true);
  };

  // Plan a workout flow — delegated to the shared <PlanWorkoutFlow> component
  const [planOpen, setPlanOpen] = useState(false);

  const panRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -20) onWeekChange(weekOffsetRef.current + 1);
        else if (gs.dx > 20) onWeekChange(weekOffsetRef.current - 1);
      },
    })
  ).current;

  const weekDates = getWeekDates(weekOffset);
  const weekLabel = weekOffset === 0 ? "This week"
    : weekOffset === -1 ? "Last week"
    : weekOffset === 1 ? "Next week"
    : formatWeekLabel(weekDates);

  return (
    <>
      {/* Strip — no card background, sits directly on page */}
      <View style={wsStyles.strip} {...panRef.panHandlers}>
        {/* Header row */}
        <View style={wsStyles.headerRow}>
          <Text style={wsStyles.rangeText}>{weekLabel}</Text>
          <View style={wsStyles.headerActions}>
            {weekOffset !== 0 && (
              <TouchableOpacity
                onPress={() => { onWeekChange(0); onDaySelect(todayStr); }}
                hitSlop={8}
                activeOpacity={0.7}
                style={wsStyles.todayBtn}
              >
                <Text style={wsStyles.todayBtnText}>{parseInt(todayStr.split('-')[2])}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={openCalendar} hitSlop={10} activeOpacity={0.7}>
              <SymbolView name="calendar" size={20} tintColor={HEADER} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Days row (swipe to change week) — green ellipse pill, matches client */}
        <View style={wsStyles.daysContainer}>
          <View style={wsStyles.daysRow}>
            {weekDates.map((date, i) => {
              const dateStr    = localDateStr(date);
              const isToday    = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const sess       = stripSessions.find(s => s.date === dateStr) ?? null;
              return (
                <TouchableOpacity key={dateStr} style={wsStyles.dayCol} onPress={() => onDaySelect(dateStr)} activeOpacity={0.7}>
                  <View style={[wsStyles.dayPill, isSelected && wsStyles.dayPillSel]}>
                    <Text style={[
                      wsStyles.dayLabel,
                      isSelected ? { color: '#fff' } : {},
                      isToday && !isSelected ? { color: ACCENT } : {},
                    ]}>{DAY_LABELS[i]}</Text>
                    <Text style={[
                      wsStyles.dayNum,
                      isSelected ? { color: '#fff' } : {},
                      isToday && !isSelected ? { color: ACCENT } : {},
                    ]}>{date.getDate()}</Text>
                  </View>
                  {sess ? (
                    <View style={[wsStyles.dot, sess.status === 'completed' ? wsStyles.dotCompleted : wsStyles.dotScheduled]} />
                  ) : (
                    <View style={wsStyles.dot} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Session cards — a day can hold more than one (morning + evening); stack them,
          completed first (earlier on top), planned last. */}
      {daySessions.map((session) => (
        session.status === 'in_progress' ? (
          /* Started and not finished. Tapping RESUMES it — opens Do Mode plain so
             load() adopts the running row and replays the draft.
             ⚠️ This was briefly `?viewOnly=1` (July 28 2026) to stop the trainer
             joining a session the CLIENT is running on their own phone. Reverted the
             same day: the trainer runs sessions on his OWN phone as the normal case,
             so view-only broke his main workflow — and worse, the view-only screen
             still offers "Leave view-only and start session?", which inserts a SECOND
             in_progress row because adoption was skipped. Vitek hit exactly that:
             *"the session looked not started … also it allowed me to start the session
             and add weights."* The duplicate is now blocked at the source instead —
             `createInProgressSession` adopts an existing open row before inserting. */
          <View key={session.id} style={[wsStyles.sessCardOuter, footerDark && darkCardStyles.bg]}>
            <TouchableOpacity
              style={[wsStyles.sessCardInner, footerDark && darkCardStyles.bg]}
              onPress={() => {
                if (!session.workoutId) return;
                // "You can only enter the session that you started" (Vitek, July 28 2026).
                // A null startedBy is a pre-column row — leave those open.
                if (session.startedBy && session.startedBy !== me?.id) { setBusySession(session); return; }
                router.push(`/(trainer)/client/${clientId}/workout/${session.workoutId}` as any);
              }}
              activeOpacity={0.88}
            >
              <WorkoutPaperCover category={session.category} workoutId={session.workoutId} size="strip" />
              <View style={wsStyles.sessionHighlights}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[wsStyles.sessFooterName, footerDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{session.workoutName ?? 'Session'}</Text>
                  <View style={wsStyles.runningBadge}>
                    <Text style={[wsStyles.runningText, ft(700)]}>IN PROGRESS</Text>
                  </View>
                  <TouchableOpacity onPress={() => onScheduledMenu(session)} hitSlop={8} activeOpacity={0.5}>
                    <SymbolView name="ellipsis" size={15} tintColor={footerDark ? DARK_MUTED_ICON : '#bbb'} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ) : session.status === 'scheduled' ? (
          /* Scheduled session — standalone card below strip */
          <View key={session.id} style={[wsStyles.sessCardOuter, footerDark && darkCardStyles.bg]}>
            <TouchableOpacity
              style={[wsStyles.sessCardInner, footerDark && darkCardStyles.bg]}
              onPress={() => session.workoutId ? router.push(`/(trainer)/client/${clientId}/workout/${session.workoutId}` as any) : undefined}
              activeOpacity={0.88}
            >
              <WorkoutPaperCover category={session.category} workoutId={session.workoutId} size="strip" />
              <View style={wsStyles.sessionHighlights}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[wsStyles.sessFooterName, footerDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{session.workoutName ?? 'Session'}</Text>
                  <View style={[wsStyles.notYetBadge, footerDark && wsStyles.notYetBadgeOnDark]}>
                    <Text style={[wsStyles.notYetText, footerDark && wsStyles.notYetTextOnDark, ft(600)]}>Not yet done</Text>
                  </View>
                  <TouchableOpacity onPress={() => onScheduledMenu(session)} hitSlop={8} activeOpacity={0.5}>
                    <SymbolView name="ellipsis" size={15} tintColor={footerDark ? DARK_MUTED_ICON : '#bbb'} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ) : loadingIds.has(session.id) ? (
          /* Completed session — loading its detail */
          <View key={session.id} style={[wsStyles.sessCardOuter, footerDark && darkCardStyles.bg]}>
            <View style={[wsStyles.sessCardInner, footerDark && darkCardStyles.bg, { alignItems: 'center', paddingVertical: 16 }]}>
              <ActivityIndicator color={ACCENT} />
            </View>
          </View>
        ) : details[session.id] ? (
          /* Completed session — standalone card below strip */
          (() => {
            const detail = details[session.id];
            return (
          <View key={session.id} style={[wsStyles.sessCardOuter, footerDark && darkCardStyles.bg]}>
            <TouchableOpacity
              style={[wsStyles.sessCardInner, footerDark && darkCardStyles.bg]}
              onPress={() => detail.workoutId ? router.push(`/(trainer)/client/${clientId}/workout/${detail.workoutId}` as any) : undefined}
              activeOpacity={0.88}
            >
              <WorkoutPaperCover category={detail.category} workoutId={detail.workoutId} size="strip" />

              {/* One row: name, the two stats as bare icon+value, then the ⋯ — the
                  "Duration"/"Exercises" labels are redundant next to their own icons. */}
              <View style={wsStyles.sessionHighlights}>
                <View style={wsStyles.hlStatsRow}>
                  <Text style={[wsStyles.sessFooterName, footerDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{detail.workoutName ?? 'Session'}</Text>
                  <View style={wsStyles.hlStatChip}>
                    <SymbolView name="timer" size={13} tintColor={ACCENT} />
                    <Text style={[wsStyles.hlStatValue, footerDark && darkCardStyles.textOnDark, ft(700)]}>{detail.durationSeconds != null ? `${Math.round(detail.durationSeconds / 60)} min` : '—'}</Text>
                  </View>
                  <View style={wsStyles.hlStatChip}>
                    <SymbolView name="checkmark.circle.fill" size={13} tintColor={ACCENT} />
                    <Text style={[wsStyles.hlStatValue, footerDark && darkCardStyles.textOnDark, ft(700)]}>{detail.exercisesDoneCount} / {detail.exercisesTotal}</Text>
                  </View>
                  <TouchableOpacity onPress={() => onScheduledMenu(session)} hitSlop={8} activeOpacity={0.5}>
                    <SymbolView name="ellipsis" size={15} tintColor={footerDark ? DARK_MUTED_ICON : '#bbb'} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </View>
            );
          })()
        ) : null
      ))}

      {/* Day-contextual add affordance — single green + circle (matches client). Opens the Add Session modal. */}
      <TouchableOpacity style={wsStyles.addCircle} onPress={() => setNoSessModal(true)} activeOpacity={0.85}>
        <SymbolView name="plus" size={16} tintColor={ACCENT} weight="semibold" />
      </TouchableOpacity>

      {/* Add session modal */}
      {busySession && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setBusySession(null)} statusBarTranslucent>
          <Pressable style={addPopStyles.overlay} onPress={() => setBusySession(null)}>
            <Pressable style={addPopStyles.cardShadow} onPress={() => {}}>
            <GlassPanel style={addPopStyles.card}>
              <Text style={[addPopStyles.heading, addPopStyles.headingOnGlass]}>Session in progress</Text>
              <Text style={busyStyles.msg}>
                This session is running on another device, so it can’t be opened here — the weights are only on that phone until it’s finished.
              </Text>
              <View style={[addPopStyles.divider, addPopStyles.dividerOnGlass]} />
              <TouchableOpacity style={addPopStyles.option} activeOpacity={0.7}
                onPress={() => { const s = busySession; setBusySession(null); void onShowLastLogged(s); }}>
                <SymbolView name="list.bullet.rectangle" size={18} tintColor="#244e43" />
                <Text style={addPopStyles.optionText}>See last logged values</Text>
              </TouchableOpacity>
            </GlassPanel>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ⚠️ A MENU, so it slides up (§2) — and it is the twin of the header +, which was
          already a BottomSheet. This one had drifted into a centered glass popup, which is for
          confirms and single-value entry only. Same options, but scheduled to the SELECTED day
          rather than today. */}
      {noSessModal && (
        <BottomSheet onClose={() => setNoSessModal(false)}>
          {close => (
            <View style={addPopStyles.sheetContent}>
              <Text style={menuStyles.sheetTitle}>Add Session</Text>
              <View style={[menuStyles.sheetDivider, addPopStyles.sheetDividerStretch]} />

              <TouchableOpacity style={addPopStyles.option} activeOpacity={0.7}
                onPress={() => close(() => router.push(`/(trainer)/workout-builder?clientId=${clientId}&scheduleDate=${selectedDate}` as any))}>
                <SymbolView name="square.and.pencil" size={18} tintColor="#244e43" />
                <Text style={addPopStyles.optionText}>Create new workout</Text>
              </TouchableOpacity>

              <View style={addPopStyles.divider} />

              <TouchableOpacity style={addPopStyles.option} activeOpacity={0.7}
                onPress={() => close(() => router.push(`/(trainer)/client/${clientId}/add-workout?date=${selectedDate}` as any))}>
                <SymbolView name="plus.rectangle.on.rectangle" size={18} tintColor="#244e43" />
                <Text style={addPopStyles.optionText}>Add workout to this day</Text>
              </TouchableOpacity>

              <View style={addPopStyles.divider} />

              <TouchableOpacity style={addPopStyles.option} activeOpacity={0.7}
                onPress={() => close(() => setPlanOpen(true))}>
                <SymbolView name="calendar" size={18} tintColor="#244e43" />
                <Text style={addPopStyles.optionText}>Plan a workout</Text>
              </TouchableOpacity>

              {activeRoutine && (
                <>
                  <View style={addPopStyles.divider} />
                  <TouchableOpacity style={addPopStyles.option} activeOpacity={0.7}
                    onPress={() => close(() => router.push(`/(trainer)/client/${clientId}/routine/${activeRoutine.id}` as any))}>
                    <SymbolView name="arrow.triangle.2.circlepath" size={18} tintColor="#244e43" />
                    <Text style={addPopStyles.optionText}>Continue routine</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={addPopStyles.divider} />

              <TouchableOpacity style={addPopStyles.option} activeOpacity={0.7}
                onPress={() => close(() => router.push(`/(trainer)/client/${clientId}/workout/free` as any))}>
                <SymbolView name="timer" size={18} tintColor="#24ac88" />
                <Text style={[addPopStyles.optionText, { color: '#24ac88' }]}>Start Free Session</Text>
              </TouchableOpacity>

            </View>
          )}
        </BottomSheet>
      )}

      {/* Plan a workout — shared flow (pick → schedule) */}
      {planOpen && (
        <PlanWorkoutFlow
          clientId={clientId}
          initialDate={selectedDate}
          onClose={() => setPlanOpen(false)}
          onDone={onReloadStrip}
        />
      )}

      {/* Month calendar — jump the week strip to any day */}
      {calOpen && (
        <BottomSheet onClose={() => setCalOpen(false)}>
          {close => (
            <View style={moveCalStyles.sheetContent}>
              <Text style={moveCalStyles.title}>Jump to date</Text>
              <Text style={moveCalStyles.sub}>Pick a day</Text>
              {/* Month navigation */}
              <View style={moveCalStyles.monthRow}>
                <TouchableOpacity hitSlop={10} activeOpacity={0.7} onPress={() => {
                  if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
                  else setCalMonth(m => m - 1);
                }}>
                  <SymbolView name="chevron.left" size={16} tintColor={MUTED} />
                </TouchableOpacity>
                <Text style={moveCalStyles.monthLabel}>{MONTH_NAMES[calMonth]} {calYear}</Text>
                <TouchableOpacity hitSlop={10} activeOpacity={0.7} onPress={() => {
                  if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
                  else setCalMonth(m => m + 1);
                }}>
                  <SymbolView name="chevron.right" size={16} tintColor={MUTED} />
                </TouchableOpacity>
              </View>
              {/* Day-of-week headers */}
              <View style={moveCalStyles.dowRow}>
                {DAY_LABELS.map((d, i) => (
                  <Text key={i} style={moveCalStyles.dowLabel}>{d}</Text>
                ))}
              </View>
              {/* Calendar grid */}
              {calGrid.map((week, wi) => (
                <View key={wi} style={moveCalStyles.weekRow}>
                  {week.map((day, di) => {
                    if (!day) return <View key={di} style={moveCalStyles.dayCell} />;
                    const dateStr = toDateStr(calYear, calMonth, day);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const hasSession = calSessionDates.has(dateStr);
                    return (
                      <TouchableOpacity
                        key={di}
                        style={moveCalStyles.dayCell}
                        onPress={() => close(() => {
                          onWeekChange(getWeekOffsetForDate(dateStr));
                          onDaySelect(dateStr);
                        })}
                        activeOpacity={0.7}
                      >
                        <View style={[
                          moveCalStyles.dayInner,
                          isToday && !isSelected && moveCalStyles.todayCircle,
                          isSelected && moveCalStyles.currentCircle,
                        ]}>
                          <Text style={[
                            moveCalStyles.dayText,
                            isToday && !isSelected && moveCalStyles.todayText,
                            isSelected && moveCalStyles.currentText,
                          ]}>{day}</Text>
                        </View>
                        {hasSession
                          ? <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
                          : <View style={{ height: 9 }} />
                        }
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              {/* Legend */}
              <View style={moveCalStyles.legendRow}>
                <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
                <Text style={moveCalStyles.legendText}>Workout logged</Text>
              </View>
            </View>
          )}
        </BottomSheet>
      )}
    </>
  );
}

// ─── ScheduledSessionMenu ─────────────────────────────────────────────────────

function ScheduledSessionMenu({
  workoutName,
  status,
  hasWorkout,
  onViewDetails,
  onSeeHowItWent,
  onEditWorkout,
  onMove,
  onDelete,
  onClose,
}: {
  workoutName: string;
  // "Edit workout" shows for scheduled AND completed sessions (Aug 3 2026, Vitek:
  // editing should work "also from the week strip, for any workout" — completed
  // free sessions included, whose backing workout has no other reachable ⋯ menu).
  // 'in_progress' alone stays WITHOUT it: editing the program under a client who
  // is mid-session would change the workout beneath them.
  status: 'scheduled' | 'completed' | 'in_progress';
  /** False for pre-July-30 free sessions with no backing workout — nothing to edit. */
  hasWorkout: boolean;
  onViewDetails: () => void;
  onSeeHowItWent: () => void;
  onEditWorkout: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    // ⚠️ A ⋯ MENU, so it slides up (§2) — and the identical menu on the trainer's all-workouts
    // screen is a BottomSheet using these very styles (`sheetTitle`, `sheetDivider`). This copy
    // had drifted to a centered glass popup, which made the same menu behave differently
    // depending on which screen you opened it from.
    <BottomSheet onClose={onClose}>
      {close => (
        <>
          <Text style={menuStyles.sheetTitle} numberOfLines={1}>{workoutName}</Text>
          <View style={menuStyles.sheetDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onViewDetails)} activeOpacity={0.7}>
            <SymbolView name="list.bullet.rectangle" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>View details</Text>
          </TouchableOpacity>
          <View style={menuStyles.optionDivider} />
          {/* Details = the facts (what was logged, set by set). This = the story
              (records, better/tougher than last time). Only a session that HAPPENED
              has one — there is nothing to tell about a plan. */}
          {status === 'completed' && (
            <>
              <TouchableOpacity style={menuStyles.option} onPress={() => close(onSeeHowItWent)} activeOpacity={0.7}>
                <SymbolView name="trophy" size={16} tintColor={TEXT} />
                <Text style={menuStyles.optionText}>See how it went</Text>
              </TouchableOpacity>
              <View style={menuStyles.optionDivider} />
            </>
          )}
          {status !== 'in_progress' && hasWorkout && (
            <>
              <TouchableOpacity style={menuStyles.option} onPress={() => close(onEditWorkout)} activeOpacity={0.7}>
                <SymbolView name="pencil" size={16} tintColor={TEXT} />
                <Text style={menuStyles.optionText}>Edit workout</Text>
              </TouchableOpacity>
              <View style={menuStyles.optionDivider} />
            </>
          )}
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onMove)} activeOpacity={0.7}>
            <SymbolView name="calendar" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>Move training</Text>
          </TouchableOpacity>
          <View style={menuStyles.optionDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onDelete)} activeOpacity={0.7}>
            <SymbolView name="trash" size={16} tintColor="#ef4444" />
            <Text style={[menuStyles.optionText, menuStyles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

// ─── LogWorkoutModal ──────────────────────────────────────────────────────────

function LogWorkoutModal({
  workouts,
  onPick,
  onClose,
}: {
  workouts: WorkoutWithLastDate[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={cmStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[cmStyles.glassShadow, { alignSelf: 'stretch', marginHorizontal: 20 }]}>
        <GlassPanel style={[cmStyles.glassBox, { paddingHorizontal: 0, paddingTop: 20, paddingBottom: 8, maxHeight: '75%' }]}>
          <Text style={[cmStyles.title, { paddingHorizontal: 24, marginBottom: 12 }]}>Choose a workout</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ alignSelf: 'stretch' }}>
            {workouts.length === 0 ? (
              <Text style={[cmStyles.messageOnGlass, { paddingVertical: 20 }]}>No workouts found</Text>
            ) : (
              workouts.map((w, i) => (
                <View key={w.id}>
                  {i > 0 && <View style={[styles.sep, { marginLeft: 0, backgroundColor: 'rgba(0,0,0,0.08)' }]} />}
                  <TouchableOpacity
                    style={{ paddingHorizontal: 24, paddingVertical: 14 }}
                    onPress={() => onPick(w.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '500', color: TEXT }}>{w.name}</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
          <TouchableOpacity style={{ paddingVertical: 14, alignItems: 'center' }} onPress={onClose} hitSlop={8}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#414b45' }}>Cancel</Text>
          </TouchableOpacity>
        </GlassPanel>
        </View>
      </View>
    </Modal>
  );
}

// ─── TrainerSmallRing (matches client tile design) ────────────────────────────

function TrainerSmallRing({
  current, total, size = 52, strokeWidth = 3.5,
}: { current: number; total: number; size?: number; strokeWidth?: number }) {
  const R    = (size - strokeWidth) / 2;
  const CIRC = 2 * Math.PI * R;
  const dash = CIRC * (total > 0 ? Math.min(current / total, 1) : 0);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <SvgCircle cx={size/2} cy={size/2} r={R} stroke="rgba(0,0,0,0.1)" strokeWidth={strokeWidth} fill="none" />
        <SvgCircle cx={size/2} cy={size/2} r={R} stroke="#f5a623" strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="round" rotation="-90" origin={`${size/2}, ${size/2}`} />
      </Svg>
      <Text style={{ fontSize: size * 0.18, fontWeight: '700', color: TEXT }}>{current}/{total}</Text>
    </View>
  );
}

// ─── ProgressRing ─────────────────────────────────────────────────────────────

function ProgressRing({ size, current, total, visible, darkMode, trackColor }: { size: number; current: number; total: number; visible: boolean; darkMode?: boolean; trackColor?: string }) {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(current / total, 1) : 0;
  const dashOffset = circumference * (1 - progress);

  if (!visible) return <View style={{ width: size, height: size }} />;

  const resolvedTrack = trackColor ?? (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)');
  const resolvedText = darkMode ? '#fff' : HEADER;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke={resolvedTrack} strokeWidth={strokeWidth} fill="none" />
        <SvgCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={ACCENT}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: size * 0.26, fontWeight: '700', color: resolvedText, lineHeight: size * 0.32 }}>
        {current}/{total}
      </Text>
    </View>
  );
}

// ─── Workouts gallery + Routines section (mirror client Training tab) ─────────

type WorkoutCard = {
  id: string;
  name: string;
  coverUrl: string | null;
  category: string | null;
  routineName: string | null;
  lastDoneDate: string | null;
  /** Completed sessions, all-time — the `N×` after the date. A PLANNED session is
   *  not counted (it isn't completed), so planning one leaves the number alone. */
  sessionCount: number;
};

type RoutineRow = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  closedAt: string | null;
  workouts: { id: string; name: string; category: string | null; orderIndex: number; doneThisWeek: boolean; missedLastWeek: boolean; lastSessionDate: string | null }[];
  weeklyDoneCount: number;
  routineTotal: number;
};


// RoutineReadout — the ONE active routine as an UNBOXED progress readout, ported
// verbatim from the client Training tab (no card; the card look lives only in the
// all-routines gallery). Weekly marks: ✓ done this week · → first workout missed
// last week not yet caught up · ⋯ otherwise. Tap anywhere → routine detail.
function RoutineReadout({ routine, onPress }: { routine: RoutineRow; onPress: () => void }) {
  const sorted = [...routine.workouts].sort((a, b) => a.orderIndex - b.orderIndex);
  const startHereId = sorted.find(w => w.missedLastWeek && !w.doneThisWeek)?.id ?? null;

  return (
    <TouchableOpacity style={roStyles.wrap} onPress={onPress} activeOpacity={0.7}>
      <Text style={[roStyles.name, fd(700)]} numberOfLines={1}>{routine.name}</Text>
      {routine.routineTotal > 0 && (
        <>
          <View style={roStyles.stripsRow}>
            {sorted.map(w => {
              const lit = w.doneThisWeek || w.id === startHereId;
              return (
                <View
                  key={w.id}
                  style={[roStyles.strip, {
                    backgroundColor: (w.category ? CATEGORY_COLORS[w.category as WorkoutCategory]?.border : undefined) ?? '#888',
                    opacity: lit ? 1 : 0.4,
                  }]}
                />
              );
            })}
          </View>
          <View style={roStyles.labelsRow}>
            {sorted.map(w => {
              const mark = w.doneThisWeek ? '✓' : w.id === startHereId ? '→' : '⋯';
              return (
                <View key={w.id} style={roStyles.labelCell}>
                  <Text style={roStyles.labelText} numberOfLines={1}>{w.name || '—'}</Text>
                  <Text style={[roStyles.statusChar, { color: mark === '⋯' ? '#ccc' : '#24ac88' }]}>
                    {mark}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const roStyles = StyleSheet.create({
  wrap:       { marginHorizontal: 16, marginBottom: 12 },
  name:       { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  stripsRow:  { flexDirection: 'row', gap: 4, marginTop: 10, marginBottom: 6 },
  strip:      { flex: 1, height: 4, borderRadius: 2 },
  labelsRow:  { flexDirection: 'row', gap: 4 },
  labelCell:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText:  { fontSize: 10, flexShrink: 1, color: '#666' },
  statusChar: { fontSize: 10, fontWeight: '600' },
});

const darkCardStyles = StyleSheet.create({
  bg:         { backgroundColor: DARK_CARD_FOOTER },
  textOnDark: { color: '#fff' },
  subOnDark:  { color: 'rgba(255,255,255,0.6)' },
});
const DARK_MUTED_ICON = 'rgba(255,255,255,0.65)';

const sectionStyles = StyleSheet.create({
  fullBleed:      { marginHorizontal: -16 },
  // The row IS the touch target on the sections that navigate. The 30px gap above the
  // label is split marginTop 22 + paddingTop 8 so spacing is unchanged while the
  // tappable area starts just above the text instead of 30px up in dead space;
  // zIndex keeps it above anything a neighbouring section bleeds upward.
  headerRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 22, paddingTop: 8, paddingBottom: 14, zIndex: 1 },
  headerLeft:     { flexDirection: 'row', alignItems: 'center' },
  headerLabel:    { fontSize: 12, fontWeight: '700', color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 7 },
  hScroll:        { paddingHorizontal: 16, gap: 10 },

  // Card-style-aware gallery mini (matches the client Training-tab gallery): white base
  // + light lift shadow; darkCardStyles.bg flips the frame for the 'light' style.
  wCardOuter:     { width: 212, height: 112, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  wCard:          { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  wName:          { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  wMenuBtn:       { position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  wBody:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  wFooterMenuBtn: { paddingHorizontal: 2, paddingBottom: 1 },
  wSub:           { fontSize: 11, fontWeight: '400', color: '#999' },
  wStatus:        { fontSize: 11, fontWeight: '600' },
  // All-time session count — muted, so the green date stays the card's live value.
  wCount:         { fontSize: 11, fontWeight: '600', color: '#999' },

  seeAllCard:     { width: 80, height: 112, borderRadius: 14, backgroundColor: 'rgba(36,172,136,0.08)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(36,172,136,0.3)', alignItems: 'center', justifyContent: 'center', gap: 6 },
  seeAllArrow:    { fontSize: 18, color: '#24ac88' },
  seeAllCardText: { fontSize: 11, color: '#24ac88', fontWeight: '600', textAlign: 'center' },

  noRoutine:      { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 12 },
});

// Recent Activity plain list: name left, date right, chevron -> jumps the week strip
// to that session's day.
const raStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ececea' },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  date: { fontSize: 12, color: '#999' },
});


// ─── Sessions Tab ────────────────────────────────────────────────────────────

type PackageType = 'Quick 40' | 'Standard 60' | 'Extended 75';
type SessionSize = 6 | 12 | 20;

interface SessionRow {
  id: string;
  date: string;
  duration_minutes: number | null;
  workoutName: string | null;
}

function calcExpiresAt(size: 6 | 12 | 20): string {
  const d = new Date();
  const months = size === 6 ? 6 : size === 12 ? 9 : 12;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function fmtPrice(amount: number): string {
  return amount.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function fmtAssignedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtMonthYear(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function durationMinutes(seconds: number | null): number | null {
  if (seconds == null) return null;
  return Math.round(seconds / 60);
}


type InvoiceRow = {
  id: string;
  invoice_number: string;
  gross_amount_eur: number;
  issue_date: string;
  status: 'draft' | 'sent' | 'updated';
};

function SessionsTab({
  clientId,
  clientName,
  client,
  packages,
  onReload,
}: {
  clientId: string;
  clientName: string;
  client: User | null;
  packages: SessionPackage[];
  onReload: () => void;
}) {
  const { profile } = useAuth();
  const router = useRouter();

  const [weekSessions, setWeekSessions] = useState<{ date: string; time: string | null; type: string }[]>([]);

  const loadWeekSessions = useCallback(async () => {
    const today = new Date();
    const todayDow = today.getDay();
    const monDiff = todayDow === 0 ? -6 : 1 - todayDow;
    const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + monDiff);
    const weekStart = localDateStr(mon);
    const weekEnd = localDateStr(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6));

    const { data } = await supabase
      .from('appointments')
      .select('date, start_time, type')
      .eq('client_id', clientId)
      .eq('status', 'scheduled')
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    setWeekSessions((data ?? []).map(a => ({ date: a.date, time: a.start_time ?? null, type: a.type })));
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      loadWeekSessions();
    }, [loadWeekSessions])
  );

  const activePackage = packages.find(p => p.status === 'active') ?? null;
  const pastPackages = packages
    .filter(p => p.status !== 'active' && p.status !== 'saved')
    .sort((a, b) => new Date(b.activated_at ?? b.created_at).getTime() - new Date(a.activated_at ?? a.created_at).getTime());

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [newPkgModal, setNewPkgModal] = useState(false);
  const [pkgDefaults, setPkgDefaults] = useState<PackageDefault[]>([]);
  const [selectedType, setSelectedType] = useState<PackageType>('Standard 60');
  const [selectedSize, setSelectedSize] = useState<SessionSize>(12);
  const [priceInput, setPriceInput] = useState('');
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [assigningPkg, setAssigningPkg] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closingPkg, setClosingPkg] = useState(false);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('id, date, duration_seconds, workout_id, workouts(name)')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('date', { ascending: false });

    setSessions((data ?? []).map((s: any) => ({
      id: s.id,
      date: s.date,
      duration_minutes: durationMinutes(s.duration_seconds),
      workoutName: (s.workouts as any)?.name ?? null,
    })));
  }, [clientId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    supabase
      .from('invoices')
      .select('id, invoice_number, gross_amount_eur, issue_date, status')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setInvoices((data ?? []) as InvoiceRow[]));
  }, [clientId]);

  const openNewPkgModal = async () => {
    const { data } = await supabase.from('package_defaults').select('*').order('total_sessions');
    const defaults = (data ?? []) as PackageDefault[];
    setPkgDefaults(defaults);
    const type: PackageType = 'Standard 60';
    const size: SessionSize = 12;
    setSelectedType(type);
    setSelectedSize(size);
    const def = defaults.find(d => d.package_type === type && d.total_sessions === size);
    setPriceInput(def ? `${def.base_price_eur}` : '');
    setExpiresAtInput(calcExpiresAt(size));
    setNewPkgModal(true);
  };

  const handleTypeChange = (type: PackageType) => {
    setSelectedType(type);
    const def = pkgDefaults.find(d => d.package_type === type && d.total_sessions === selectedSize);
    if (def) setPriceInput(`${def.base_price_eur}`);
  };

  const handleSizeChange = (size: SessionSize) => {
    setSelectedSize(size);
    const def = pkgDefaults.find(d => d.package_type === selectedType && d.total_sessions === size);
    if (def) setPriceInput(`${def.base_price_eur}`);
    setExpiresAtInput(calcExpiresAt(size));
  };

  const assignPackage = async () => {
    setAssigningPkg(true);
    const price = parseFloat(priceInput) || null;
    const durMin = selectedType === 'Quick 40' ? 40 : selectedType === 'Extended 75' ? 75 : 60;
    const pkgName = `${selectedType} · ${selectedSize} sessions`;

    if (activePackage) {
      await supabase.from('session_packages')
        .update({ status: 'completed' })
        .eq('id', activePackage.id);
    }

    await supabase.from('session_packages').insert({
      client_id: clientId,
      created_by: profile?.id,
      name: pkgName,
      package_type: selectedType,
      total_sessions: selectedSize,
      sessions_used: 0,
      duration_minutes: durMin,
      price_eur: price,
      status: 'active',
      status_closed_early: false,
      activated_at: new Date().toISOString(),
      expires_at: expiresAtInput || null,
    });

    setAssigningPkg(false);
    setNewPkgModal(false);
    onReload();
  };

  const confirmCloseEarly = async () => {
    if (!activePackage) return;
    setClosingPkg(true);
    await supabase.from('session_packages')
      .update({ status: 'completed', status_closed_early: true })
      .eq('id', activePackage.id);
    setClosingPkg(false);
    setConfirmClose(false);
    onReload();
  };

  const totalPaid = packages
    .filter(p => p.price_eur != null)
    .reduce((sum, p) => sum + (p.price_eur ?? 0), 0);

  const remaining = activePackage
    ? activePackage.total_sessions - activePackage.sessions_used
    : null;
  const showLowWarning = remaining != null && remaining <= 2;
  const pct = activePackage
    ? Math.min((activePackage.sessions_used / activePackage.total_sessions) * 100, 100)
    : 0;

  const expiryDaysLeft = activePackage?.expires_at
    ? Math.ceil((new Date(activePackage.expires_at).getTime() - Date.now()) / 86_400_000)
    : null;
  const showExpiryWarning = expiryDaysLeft != null && expiryDaysLeft <= 30;

  return (
    <View>
      {/* ── This Week's Sessions ── */}
      <SectionHeader title="THIS WEEK'S SESSIONS" />
      <View style={[styles.card, { paddingHorizontal: 16, paddingVertical: weekSessions.length ? 4 : 14, marginBottom: 16 }]}>
        {weekSessions.length ? (
          weekSessions.map((a, i) => (
            <TouchableOpacity
              key={`${a.date}-${a.time ?? ''}-${i}`}
              activeOpacity={0.6}
              onPress={() => router.push(`/(trainer)/(tabs)/schedule?date=${a.date}` as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: '#f0f0ee',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT }}>{fmtWeekApptDay(a.date)}</Text>
                <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {a.time ? a.time.slice(0, 5) : '—'} · {apptTypeLabel(a.type)}
                </Text>
              </View>
              <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
            </TouchableOpacity>
          ))
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: MUTED }}>No sessions this week</Text>
            <SymbolView name="calendar" size={16} tintColor="#ccc" />
          </View>
        )}
      </View>

      {/* ── Active Package ── */}
      <SectionHeader title={t.clientProfile.sessions.activePackage} />
      {activePackage ? (
        <View style={styles.card}>
          {/* Name row + ring */}
          <View style={pkgStyles.pkgHeaderRow}>
            <View style={pkgStyles.pkgHeaderText}>
              <Text style={pkgStyles.pkgTitle}>{activePackage.name}</Text>
              {activePackage.activated_at ? (
                <Text style={pkgStyles.pkgMeta}>
                  {`Assigned ${fmtAssignedDate(activePackage.activated_at)}`}
                  {activePackage.price_eur != null ? ` · €${fmtPrice(activePackage.price_eur)}` : ''}
                </Text>
              ) : null}
              {activePackage.expires_at ? (
                <Text style={pkgStyles.pkgMeta}>
                  {`Valid until ${fmtAssignedDate(activePackage.expires_at)}`}
                </Text>
              ) : null}
            </View>
            <ProgressRing
              size={52}
              current={activePackage.sessions_used}
              total={activePackage.total_sessions}
              visible
            />
          </View>

          {/* Progress bar */}
          <View style={pkgStyles.barBg}>
            <View style={[pkgStyles.barFill, { width: `${pct}%` }]} />
          </View>

          {/* Used / remaining labels */}
          <View style={pkgStyles.barLabels}>
            <Text style={pkgStyles.barUsed}>{activePackage.sessions_used} sessions used</Text>
            {remaining != null && (
              <Text style={pkgStyles.barRemaining}>{remaining} remaining</Text>
            )}
          </View>

          {/* Low warning */}
          {showLowWarning && remaining != null && (
            <View style={pkgStyles.warningRow}>
              <View style={pkgStyles.warningDot} />
              <Text style={pkgStyles.warningText}>
                {t.clientProfile.sessions.lowWarning(remaining)}
              </Text>
            </View>
          )}

          {/* Expiry warning */}
          {showExpiryWarning && expiryDaysLeft != null && (
            <View style={pkgStyles.warningRow}>
              <View style={pkgStyles.warningDot} />
              <Text style={pkgStyles.warningText}>
                {t.clientProfile.sessions.expiresIn(expiryDaysLeft)}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={pkgStyles.actionRow}>
            <TouchableOpacity
              style={pkgStyles.closeBtn}
              onPress={() => setConfirmClose(true)}
              activeOpacity={0.8}
            >
              <Text style={pkgStyles.closeBtnText}>{t.clientProfile.sessions.closeEarly}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={pkgStyles.newPkgBtn}
              onPress={openNewPkgModal}
              activeOpacity={0.8}
            >
              <Text style={pkgStyles.newPkgBtnText}>{t.clientProfile.sessions.newPackage}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.emptyCard, { paddingVertical: 20, alignItems: 'center', gap: 12 }]}>
          <Text style={styles.emptyText}>{t.clientProfile.sessions.noActivePackage}</Text>
          <TouchableOpacity style={pkgStyles.newPkgBtn} onPress={openNewPkgModal} activeOpacity={0.8}>
            <Text style={pkgStyles.newPkgBtnText}>{t.clientProfile.sessions.newPackage}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Session History ── */}
      <SectionHeaderWithLink
        title={t.clientProfile.sessions.sessionHistory}
        link={sessions.length > 3 ? t.clientProfile.sessions.seeAll : ''}
        onLink={() => setShowAllSessions(true)}
      />
      {sessions.length === 0 ? (
        <EmptyCard text={t.clientProfile.sessions.noSessions} />
      ) : (
        <View style={styles.card}>
          {sessions.slice(0, 3).map((s, i, arr) => (
            <View key={s.id}>
              <SessionHistoryRow session={s} />
              {i < arr.length - 1 && <View style={styles.sep} />}
            </View>
          ))}
          {sessions.length > 3 && (
            <>
              <View style={styles.sep} />
              <TouchableOpacity
                style={pkgStyles.seeAllRow}
                onPress={() => setShowAllSessions(true)}
                activeOpacity={0.7}
              >
                <Text style={pkgStyles.seeAllText}>{t.clientProfile.sessions.seeAll}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── Past Packages ── */}
      {pastPackages.length > 0 && (
        <>
          <SectionHeader title={t.clientProfile.sessions.pastPackages} />
          <View style={styles.card}>
            {pastPackages.map((pkg, i) => (
              <View key={pkg.id}>
                <PastPackageRow pkg={pkg} />
                {i < pastPackages.length - 1 && <View style={styles.sep} />}
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Total paid ── */}
      {totalPaid > 0 && (
        <View style={[styles.card, pkgStyles.totalCard]}>
          <Text style={pkgStyles.totalLabel}>{t.clientProfile.sessions.totalPaid(clientName)}</Text>
          <Text style={pkgStyles.totalAmount}>€{fmtPrice(totalPaid)}</Text>
        </View>
      )}

      {/* ── Invoices ── */}
      {invoices.length > 0 && (
        <>
          <SectionHeader title={t.invoice.clientInvoices} />
          <View style={styles.card}>
            {invoices.map((inv, i) => {
              const isPaid = inv.status === 'sent' || inv.status === 'updated';
              const statusLabel = inv.status === 'draft' ? t.invoice.statusDraft : inv.status === 'sent' ? t.invoice.statusSent : t.invoice.statusUpdated;
              return (
                <View key={inv.id}>
                  <TouchableOpacity
                    style={pkgStyles.sessionRow}
                    onPress={() => router.push(`/(trainer)/invoice/${inv.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={pkgStyles.sessionName}>{inv.invoice_number}</Text>
                      <Text style={pkgStyles.sessionMeta}>
                        {fmtShortDate(inv.issue_date)} · €{fmtPrice(inv.gross_amount_eur)}
                      </Text>
                    </View>
                    <View style={[pkgStyles.doneBadge, isPaid && pkgStyles.doneBadgePaid]}>
                      <Text style={[pkgStyles.doneBadgeText, isPaid && pkgStyles.doneBadgeTextPaid]}>{statusLabel}</Text>
                    </View>
                  </TouchableOpacity>
                  {i < invoices.length - 1 && <View style={styles.sep} />}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Close early confirm modal ── */}
      {confirmClose && activePackage && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmClose(false)} statusBarTranslucent>
          <View style={cmStyles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmClose(false)} />
            <View style={cmStyles.glassShadow}>
            <GlassPanel style={cmStyles.glassBox}>
              <Text style={cmStyles.title}>{t.clientProfile.sessions.closeEarlyTitle}</Text>
              <Text style={cmStyles.messageOnGlass}>
                {t.clientProfile.sessions.closeEarlyMsg(activePackage.sessions_used, activePackage.total_sessions)}
              </Text>
              <TouchableOpacity
                style={cmStyles.actionBtn}
                onPress={confirmCloseEarly}
                disabled={closingPkg}
                activeOpacity={0.85}
              >
                <Text style={cmStyles.actionBtnText}>
                  {closingPkg ? '...' : t.clientProfile.sessions.closePackageBtn}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmClose(false)} hitSlop={8}>
                <Text style={cmStyles.cancelOnGlass}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </GlassPanel>
            </View>
          </View>
        </Modal>
      )}

      {/* ── New package modal ── */}
      {newPkgModal && (
        <NewPackageModal
          pkgDefaults={pkgDefaults}
          selectedType={selectedType}
          selectedSize={selectedSize}
          priceInput={priceInput}
          expiresAtInput={expiresAtInput}
          assigning={assigningPkg}
          onTypeSelect={handleTypeChange}
          onSizeSelect={handleSizeChange}
          onPriceChange={setPriceInput}
          onExpiresAtChange={setExpiresAtInput}
          onAssign={assignPackage}
          onClose={() => setNewPkgModal(false)}
        />
      )}

      {/* ── All sessions modal ── */}
      {showAllSessions && (
        <AllSessionsModal
          sessions={sessions}
          onClose={() => setShowAllSessions(false)}
        />
      )}
    </View>
  );
}

function SessionHistoryRow({ session }: { session: SessionRow }) {
  const name = session.workoutName ?? t.clientProfile.sessions.freeSession;
  const meta = [
    session.date ? fmtShortDate(session.date) : null,
    session.duration_minutes != null ? `${session.duration_minutes} min` : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={pkgStyles.sessionRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={pkgStyles.sessionName} numberOfLines={1}>{name}</Text>
        {meta ? <Text style={pkgStyles.sessionMeta}>{meta}</Text> : null}
      </View>
      <View style={[pkgStyles.doneBadge, pkgStyles.doneBadgePaid]}>
        <Text style={[pkgStyles.doneBadgeText, pkgStyles.doneBadgeTextPaid]}>{t.clientProfile.sessions.doneBadge}</Text>
      </View>
    </View>
  );
}

function PastPackageRow({ pkg }: { pkg: SessionPackage }) {
  const isClosed = pkg.status_closed_early;
  const dateStr = pkg.activated_at ? fmtMonthYear(pkg.activated_at) : '';
  const priceStr = pkg.price_eur != null ? `€${fmtPrice(pkg.price_eur)}` : '';
  const meta = [dateStr, priceStr].filter(Boolean).join(' · ');
  return (
    <View style={pkgStyles.pastPkgRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={pkgStyles.pastPkgName} numberOfLines={1}>{pkg.name}</Text>
        {meta ? <Text style={pkgStyles.pastPkgMeta}>{meta}</Text> : null}
      </View>
      <View style={[pkgStyles.statusPill, isClosed ? pkgStyles.statusPillClosed : pkgStyles.statusPillDone]}>
        <Text style={[pkgStyles.statusPillText, isClosed ? pkgStyles.statusTextClosed : pkgStyles.statusTextDone]}>
          {isClosed ? t.clientProfile.sessions.closedBadge : t.clientProfile.sessions.doneBadge}
        </Text>
      </View>
    </View>
  );
}

function NewPackageModal({
  pkgDefaults,
  selectedType,
  selectedSize,
  priceInput,
  expiresAtInput,
  assigning,
  onTypeSelect,
  onSizeSelect,
  onPriceChange,
  onExpiresAtChange,
  onAssign,
  onClose,
}: {
  pkgDefaults: PackageDefault[];
  selectedType: PackageType;
  selectedSize: SessionSize;
  priceInput: string;
  expiresAtInput: string;
  assigning: boolean;
  onTypeSelect: (t: PackageType) => void;
  onSizeSelect: (s: SessionSize) => void;
  onPriceChange: (v: string) => void;
  onExpiresAtChange: (v: string) => void;
  onAssign: () => void;
  onClose: () => void;
}) {
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState('');

  const openDateModal = () => { setDateDraft(expiresAtInput); setDateModalOpen(true); };
  const confirmDate = () => { onExpiresAtChange(dateDraft.trim()); setDateModalOpen(false); };

  const displayDate = expiresAtInput
    ? new Date(expiresAtInput).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : t.clientProfile.sessions.validUntilPlaceholder;

  return (
    <>
    <BottomSheet onClose={onClose} avoidKeyboard>
        <View style={{ paddingHorizontal: 24, paddingBottom: 8, gap: 16, alignItems: 'center' }}>
          <Text style={cmStyles.title}>{t.clientProfile.sessions.assignPackageTitle}</Text>

          {/* Type selector */}
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <Text style={pkgModalStyles.subLabel}>{t.clientProfile.sessions.typeLabel}</Text>
            <View style={pkgModalStyles.typeCol}>
              {(['Quick 40', 'Standard 60', 'Extended 75'] as PackageType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[pkgModalStyles.typeBtn, selectedType === type && pkgModalStyles.optionBtnActive]}
                  onPress={() => onTypeSelect(type)}
                  activeOpacity={0.7}
                >
                  <Text style={[pkgModalStyles.optionBtnText, selectedType === type && pkgModalStyles.optionBtnTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Size selector */}
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <Text style={pkgModalStyles.subLabel}>{t.clientProfile.sessions.sizeLabel}</Text>
            <View style={pkgModalStyles.optionRow}>
              {([6, 12, 20] as SessionSize[]).map(size => (
                <TouchableOpacity
                  key={size}
                  style={[pkgModalStyles.optionBtn, pkgModalStyles.optionBtnSm, selectedSize === size && pkgModalStyles.optionBtnActive]}
                  onPress={() => onSizeSelect(size)}
                  activeOpacity={0.7}
                >
                  <Text style={[pkgModalStyles.optionBtnText, selectedSize === size && pkgModalStyles.optionBtnTextActive]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Price */}
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <Text style={pkgModalStyles.subLabel}>{t.clientProfile.sessions.priceLabel}</Text>
            <TextInput
              style={pkgModalStyles.priceInput}
              value={priceInput}
              onChangeText={onPriceChange}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#ccc"
            />
          </View>

          {/* Valid until */}
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <Text style={pkgModalStyles.subLabel}>{t.clientProfile.sessions.validUntilLabel}</Text>
            <TouchableOpacity
              style={pkgModalStyles.dateRow}
              onPress={openDateModal}
              activeOpacity={0.7}
            >
              <Text style={[pkgModalStyles.dateText, !expiresAtInput && pkgModalStyles.dateMuted]}>
                {displayDate}
              </Text>
              <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[cmStyles.actionBtn, { backgroundColor: HEADER }]}
            onPress={onAssign}
            disabled={assigning}
            activeOpacity={0.85}
          >
            <Text style={cmStyles.actionBtnText}>
              {assigning ? t.clientProfile.sessions.assigningBtn : t.clientProfile.sessions.assignBtn}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={cmStyles.cancelText}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
    </BottomSheet>

      {/* Date edit modal */}
      {dateModalOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDateModalOpen(false)} statusBarTranslucent>
          <View style={infoFieldStyles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDateModalOpen(false)} />
            <View style={infoFieldStyles.glassShadow}>
            <GlassPanel style={infoFieldStyles.glassBox}>
              <Text style={infoFieldStyles.title}>{t.clientProfile.sessions.validUntilLabel}</Text>
              <TextInput
                style={infoFieldStyles.inputOnGlass}
                value={dateDraft}
                onChangeText={setDateDraft}
                placeholder={t.clientProfile.sessions.validUntilPlaceholder}
                placeholderTextColor="#8a938e"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                onSubmitEditing={confirmDate}
                inputAccessoryViewID={Platform.OS === 'ios' ? 'pkg-date-input' : undefined}
              />
              <TouchableOpacity style={infoFieldStyles.confirmBtn} onPress={confirmDate} activeOpacity={0.85}>
                <Text style={infoFieldStyles.confirmBtnText}>{t.common.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDateModalOpen(false)} hitSlop={8}>
                <Text style={infoFieldStyles.cancelOnGlass}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </GlassPanel>
            </View>
          </View>
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID="pkg-date-input">
              <View style={{ height: 0 }} />
            </InputAccessoryView>
          )}
        </Modal>
      )}
    </>
  );
}

function AllSessionsModal({ sessions, onClose }: { sessions: SessionRow[]; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={cmStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[cmStyles.glassShadow, { alignSelf: 'stretch', marginHorizontal: 20 }]}>
        <GlassPanel style={[cmStyles.glassBox, { paddingHorizontal: 0, paddingTop: 20, paddingBottom: 8, maxHeight: '80%' }]}>
          <Text style={[cmStyles.title, { paddingHorizontal: 24, marginBottom: 12 }]}>
            {t.clientProfile.sessions.allSessionsTitle}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ alignSelf: 'stretch' }}>
            {sessions.map((s, i) => (
              <View key={s.id}>
                <SessionHistoryRow session={s} />
                {i < sessions.length - 1 && <View style={[styles.sep, { marginLeft: 0, backgroundColor: 'rgba(0,0,0,0.08)' }]} />}
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={{ paddingVertical: 16, alignItems: 'center' }}
            onPress={onClose}
            hitSlop={8}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: ACCENT }}>{t.common.ok}</Text>
          </TouchableOpacity>
        </GlassPanel>
        </View>
      </View>
    </Modal>
  );
}

// ─── Availability Type Field ──────────────────────────────────────────────────
type AvailType = 'fixed' | 'flexible_recurring' | 'variable';
const AVAIL_OPTIONS: { value: AvailType; label: string; desc: string }[] = [
  { value: 'fixed',              label: 'Fixed',             desc: 'Same slot every week — no availability needed' },
  { value: 'flexible_recurring', label: 'Flexible recurring', desc: 'Same general pattern, repeats automatically' },
  { value: 'variable',           label: 'Variable',           desc: 'Submits fresh availability each week' },
];

function AvailabilityTypeField({ clientId, initialValue }: { clientId: string; initialValue: AvailType | null }) {
  const [value, setValue] = useState<AvailType | null>(initialValue);

  async function pick(v: AvailType) {
    setValue(v);
    await supabase.from('users').update({ availability_type: v }).eq('id', clientId);
  }

  const selected = AVAIL_OPTIONS.find(o => o.value === value);

  return (
    <>
      <SectionHeader title="AVAILABILITY TYPE" />
      <View style={[styles.card, { padding: 12 }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {AVAIL_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.value}
              style={[avt.pill, value === o.value && avt.pillActive]}
              onPress={() => pick(o.value)}
              activeOpacity={0.75}
            >
              <Text style={[avt.pillText, value === o.value && avt.pillTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {selected && (
          <Text style={avt.desc}>{selected.desc}</Text>
        )}
      </View>
    </>
  );
}

const avt = StyleSheet.create({
  pill:          { flex: 1, paddingVertical: 8, borderRadius: 100, backgroundColor: '#f0f0ee', alignItems: 'center' },
  pillActive:    { backgroundColor: '#244e43' },
  pillText:      { fontSize: 11, fontWeight: '600', color: '#1a1a1a' },
  pillTextActive:{ color: '#fff' },
  desc:          { fontSize: 12, color: '#999', marginTop: 10, lineHeight: 17 },
});

// ─── Weekly Session Goal Field ────────────────────────────────────────────────

function WeeklySessionGoalField({ clientId, initialValue }: { clientId: string; initialValue: number | null }) {
  const [value, setValue] = useState<number | null>(initialValue);

  // Setting the goal is effective-dated so it is remembered per week: a CHANGE takes
  // effect from next week (the current + past weeks keep the previous number); the very
  // first time a goal is set it applies from this week. See lib/weeklyGoal.ts.
  async function pick(v: number) {
    const next = value === v ? null : v; // tapping the selected value clears the goal
    setValue(next);

    const mondayCur = mondayOf(new Date());
    const mondayNext = addDaysStr(mondayCur, 7);

    if (next == null) {
      await supabase.from('users').update({
        weekly_session_goal: null,
        weekly_session_goal_prev: null,
        weekly_session_goal_effective_from: null,
      }).eq('id', clientId);
      return;
    }

    const { data } = await supabase
      .from('users')
      .select('weekly_session_goal, weekly_session_goal_effective_from')
      .eq('id', clientId)
      .maybeSingle();
    const curGoal: number | null = (data as any)?.weekly_session_goal ?? null;
    const curFrom: string | null = (data as any)?.weekly_session_goal_effective_from ?? null;

    if (curGoal == null) {
      // First goal ever (or re-set after clearing) → applies from THIS week onward.
      await supabase.from('users').update({
        weekly_session_goal: next,
        weekly_session_goal_prev: null,
        weekly_session_goal_effective_from: mondayCur,
      }).eq('id', clientId);
      return;
    }
    if (next === curGoal) return; // no change

    if (curFrom === mondayNext) {
      // A change was already made this week (pending for next week) — just update the
      // pending value; keep prev so THIS week still shows the truly-current number.
      await supabase.from('users').update({ weekly_session_goal: next }).eq('id', clientId);
    } else {
      // Changing an established goal → the new value applies from NEXT week; the current
      // and past weeks keep the previous number.
      await supabase.from('users').update({
        weekly_session_goal: next,
        weekly_session_goal_prev: curGoal,
        weekly_session_goal_effective_from: mondayNext,
      }).eq('id', clientId);
    }
  }

  return (
    <>
      <SectionHeader title="WEEKLY SESSION GOAL" />
      <View style={[styles.card, { padding: 12 }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <TouchableOpacity
              key={n}
              style={[wsg.pill, value === n && wsg.pillActive]}
              onPress={() => pick(n)}
              activeOpacity={0.75}
            >
              <Text style={[wsg.pillText, value === n && wsg.pillTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={wsg.desc}>Total sessions per week including solo training. Changing the goal takes effect from next week — the current week keeps its number.</Text>
      </View>
    </>
  );
}

const wsg = StyleSheet.create({
  pill:          { flex: 1, paddingVertical: 8, borderRadius: 100, backgroundColor: '#f5f5f3', alignItems: 'center' },
  pillActive:    { backgroundColor: '#244e43' },
  pillText:      { fontSize: 13, fontWeight: '600', color: '#999' },
  pillTextActive:{ color: '#fff' },
  desc:          { fontSize: 12, color: '#999', marginTop: 10, lineHeight: 17 },
});

/** Daily steps goal for the client's Movement ring (Consistency tab). Unlike
 *  the weekly session goal it is NOT effective-dated — a daily rhythm with a
 *  7-day lookback doesn't earn that machinery — and the CLIENT may adjust it
 *  too (the ✎ on their Movement ring writes the same column). NULL = the app
 *  default of 8000. */
function DailyStepsGoalField({ clientId, initialValue }: { clientId: string; initialValue: number | null }) {
  const [value, setValue] = useState<number | null>(initialValue);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const save = async () => {
    const n = parseInt(draft.replace(/\D/g, ''), 10);
    setOpen(false);
    if (!n || n < 1000 || n > 50000) return;
    setValue(n);
    await supabase.from('users').update({ daily_steps_goal: n }).eq('id', clientId);
  };
  const resetDefault = async () => {
    setOpen(false);
    setValue(null);
    await supabase.from('users').update({ daily_steps_goal: null }).eq('id', clientId);
  };

  return (
    <>
      <SectionHeader title="DAILY STEPS GOAL" />
      <View style={[styles.card, { padding: 12 }]}>
        <TouchableOpacity
          style={dsg.row}
          onPress={() => { setDraft(String(value ?? 8000)); setOpen(true); }}
          activeOpacity={0.7}
        >
          <Text style={dsg.value}>{(value ?? 8000).toLocaleString('de-DE')}</Text>
          <Text style={dsg.valueSub}>{value == null ? 'steps a day · default' : 'steps a day'}</Text>
        </TouchableOpacity>
        <Text style={wsg.desc}>Fills the Movement ring in the client's Consistency tab. The client can adjust it themselves too. Changes apply immediately.</Text>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={dsg.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={dsg.shadow}>
            <GlassPanel style={dsg.box}>
              <Text style={dsg.title}>Daily steps goal</Text>
              <TextInput
                style={dsg.input} value={draft} onChangeText={setDraft}
                keyboardType="number-pad" autoFocus placeholder="8000" placeholderTextColor="#9aa39e"
              />
              <TouchableOpacity style={dsg.confirm} onPress={save} activeOpacity={0.85}>
                <Text style={dsg.confirmText}>Save</Text>
              </TouchableOpacity>
              {value != null && (
                <TouchableOpacity onPress={resetDefault} hitSlop={8}>
                  <Text style={dsg.link}>Reset to default (8.000)</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={dsg.link}>Cancel</Text>
              </TouchableOpacity>
            </GlassPanel>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const dsg = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  value:    { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  valueSub: { fontSize: 12, color: '#999' },
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 36 },
  shadow:   { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12, alignSelf: 'stretch' },
  box:      { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 14 },
  title:    { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  input: {
    alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: '#1a1a1a', textAlign: 'center',
  },
  confirm:     { backgroundColor: '#24ac88', borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link:        { fontSize: 14, color: '#414b45', fontWeight: '600' },
});

// ─── Info Tab ─────────────────────────────────────────────────────────────────

const INFO_PREVIEW_H = 220;

function InfoTab({
  clientId, client, customSlogan, trainerNotes, clientSex,
  clientPhone, clientDob, clientHeight,
  clientStreet, clientCity, clientPostcode, clientCountry,
  bannerPhotoUrl, bannerPhotoOffsetY, bannerPhotoZoom, bannerNaturalDims, uploadingBanner,
  saving, onSloganChange, onNotesChange, onSexChange,
  onPhoneChange, onDobChange, onHeightChange,
  onStreetChange, onCityChange, onPostcodeChange, onCountryChange,
  onPickBannerPhoto, onRemoveBannerPhoto, onOffsetYChange, onZoomChange,
  vfIconPosX, vfIconPosY, onVfIconPosXChange, onVfIconPosYChange,
  onSave,
}: {
  clientId: string;
  client: User | null;
  customSlogan: string; trainerNotes: string;
  clientSex: 'male' | 'female' | 'other' | null;
  clientPhone: string; clientDob: string; clientHeight: string;
  clientStreet: string; clientCity: string; clientPostcode: string; clientCountry: string;
  bannerPhotoUrl: string | null; bannerPhotoOffsetY: number; bannerPhotoZoom: number;
  bannerNaturalDims: {w:number,h:number}|null; uploadingBanner: boolean;
  saving: boolean;
  onSloganChange: (v: string) => void; onNotesChange: (v: string) => void;
  onSexChange: (v: 'male' | 'female' | 'other' | null) => void;
  onPhoneChange: (v: string) => void; onDobChange: (v: string) => void;
  onHeightChange: (v: string) => void;
  onStreetChange: (v: string) => void; onCityChange: (v: string) => void;
  onPostcodeChange: (v: string) => void; onCountryChange: (v: string) => void;
  onPickBannerPhoto: () => void; onRemoveBannerPhoto: () => void; onOffsetYChange: (v: number) => void; onZoomChange: (v: number) => void;
  vfIconPosX: number; vfIconPosY: number;
  onVfIconPosXChange: (v: number) => void; onVfIconPosYChange: (v: number) => void;
  onSave: () => void;
}) {
  type FieldModal = { label: string; value: string; placeholder: string; keyboard: 'default' | 'phone-pad' | 'decimal-pad'; onSave: (v: string) => void };
  const [fieldModal, setFieldModal] = useState<FieldModal | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');

  // Banner drag-to-reposition
  const [previewContainerW, setPreviewContainerW] = useState(0);
  const offsetYRef = useRef(bannerPhotoOffsetY);
  offsetYRef.current = bannerPhotoOffsetY;
  const zoomRef = useRef(bannerPhotoZoom);
  zoomRef.current = bannerPhotoZoom;
  const bannerBaseHRef = useRef(INFO_PREVIEW_H);
  const dragStartRef = useRef(bannerPhotoOffsetY);

  const bannerPanGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin(() => {
        dragStartRef.current = offsetYRef.current;
      })
      .onUpdate(({ translationY }) => {
        const overflow = Math.max(Math.round(bannerBaseHRef.current * zoomRef.current) - INFO_PREVIEW_H, 0);
        const range = Math.min(Math.max(overflow, 1), INFO_PREVIEW_H);
        const newY = Math.max(0, Math.min(100, dragStartRef.current - (translationY / range) * 100));
        onOffsetYChange(Math.round(newY));
      }),
    []
  );
  const vfIconPosXRef = useRef(vfIconPosX);
  vfIconPosXRef.current = vfIconPosX;
  const vfIconPosYRef = useRef(vfIconPosY);
  vfIconPosYRef.current = vfIconPosY;
  const iconDragStartX = useRef(vfIconPosX);
  const iconDragStartY = useRef(vfIconPosY);
  const iconDragGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin(() => {
        iconDragStartX.current = vfIconPosXRef.current;
        iconDragStartY.current = vfIconPosYRef.current;
      })
      .onUpdate(({ translationX, translationY }) => {
        const w = Math.max(previewContainerW, 1);
        onVfIconPosXChange(Math.max(0, Math.min(1, iconDragStartX.current + translationX / w)));
        onVfIconPosYChange(Math.max(0, Math.min(1, iconDragStartY.current + translationY / INFO_PREVIEW_H)));
      }),
    [previewContainerW]
  );
  const baseH = (bannerNaturalDims && previewContainerW > 0)
    ? Math.round(bannerNaturalDims.h * previewContainerW / bannerNaturalDims.w)
    : INFO_PREVIEW_H;
  bannerBaseHRef.current = baseH;
  const imageW = previewContainerW > 0 ? Math.round(previewContainerW * bannerPhotoZoom) : undefined;
  const imageL = previewContainerW > 0 ? Math.round(-(previewContainerW * (bannerPhotoZoom - 1) / 2)) : undefined;
  const previewImageH = Math.max(INFO_PREVIEW_H, Math.round(baseH * bannerPhotoZoom));
  const imageTop = -(bannerPhotoOffsetY / 100) * (previewImageH - INFO_PREVIEW_H);
  const canZoomOut = bannerPhotoZoom > 1.0;
  const canZoomIn  = bannerPhotoZoom < 2.5;
  const clientFirstName = client?.name?.split(' ')[0] ?? 'there';

  // Set password modal
  const [setPwdOpen, setSetPwdOpen] = useState(false);
  const [setPwdNew, setSetPwdNew] = useState('');
  const [setPwdConfirm, setSetPwdConfirm] = useState('');
  const [setPwdSaving, setSetPwdSaving] = useState(false);
  const [setPwdToast, setSetPwdToast] = useState(false);

  const handleSetPassword = async () => {
    const pwd = setPwdNew.trim();
    const conf = setPwdConfirm.trim();
    if (pwd.length < 8) {
      Alert.alert(t.common.error, t.clientProfile.info.setPasswordErrorTooShort);
      return;
    }
    if (pwd !== conf) {
      Alert.alert(t.common.error, t.clientProfile.info.setPasswordErrorMismatch);
      return;
    }
    setSetPwdSaving(true);
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(clientId, { password: pwd });
    if (pwdErr) {
      setSetPwdSaving(false);
      Alert.alert(t.common.error, t.clientProfile.info.setPasswordErrorGeneric);
      return;
    }
    const { error: dbErr } = await supabaseAdmin
      .from('users')
      .update({ must_change_password: true })
      .eq('id', clientId);
    setSetPwdSaving(false);
    if (dbErr) {
      Alert.alert(t.common.error, t.clientProfile.info.setPasswordErrorGeneric);
      return;
    }
    setSetPwdOpen(false);
    setSetPwdNew('');
    setSetPwdConfirm('');
    setSetPwdToast(true);
    setTimeout(() => setSetPwdToast(false), 2500);
  };

  const openField = (f: FieldModal) => { setFieldDraft(f.value); setFieldModal(f); };

  return (
    <View>
      {/* Personal info */}
      <SectionHeader title={t.clientProfile.info.personalInfo} />
      <View style={styles.card}>
        <InfoRow label={t.clientProfile.info.name}  value={client?.name ?? '—'} />
        <View style={styles.sep} />
        <InfoRow label={t.clientProfile.info.email} value={client?.email ?? '—'} />
        <View style={styles.sep} />
        <InfoRow label={t.clientProfile.info.username} value={`@${client?.username ?? ''}`} />
        <View style={styles.sep} />
        {/* Phone — tap to open edit modal */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openField({ label: t.clientProfile.info.phone, value: clientPhone, placeholder: t.clientProfile.info.phonePlaceholder, keyboard: 'phone-pad', onSave: onPhoneChange })}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.phone}</Text>
          <Text style={[styles.infoRowValue, !clientPhone && styles.infoRowMuted]}>
            {clientPhone || t.clientProfile.info.phonePlaceholder}
          </Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        {/* DOB — tap to open edit modal */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openField({ label: t.clientProfile.info.dob, value: clientDob, placeholder: 'YYYY-MM-DD', keyboard: 'default', onSave: onDobChange })}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.dob}</Text>
          <Text style={[styles.infoRowValue, !clientDob && styles.infoRowMuted]}>
            {clientDob || t.clientProfile.info.dobPlaceholder}
          </Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        {/* Height — tap to open edit modal */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openField({ label: t.clientProfile.info.height, value: clientHeight, placeholder: t.clientProfile.info.heightPlaceholder, keyboard: 'decimal-pad', onSave: onHeightChange })}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.height}</Text>
          <Text style={[styles.infoRowValue, !clientHeight && styles.infoRowMuted]}>
            {clientHeight ? `${clientHeight} cm` : t.clientProfile.info.heightPlaceholder}
          </Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        {/* Sex toggle */}
        <View style={styles.infoRow}>
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.sex}</Text>
          <View style={styles.sexToggle}>
            {(['male', 'female', 'other', null] as const).map(opt => (
              <TouchableOpacity
                key={String(opt)}
                style={[styles.sexBtn, clientSex === opt && styles.sexBtnActive]}
                onPress={() => onSexChange(opt)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sexBtnText, clientSex === opt && styles.sexBtnTextActive]}>
                  {opt === 'male' ? t.clientProfile.info.sexMale : opt === 'female' ? t.clientProfile.info.sexFemale : opt === 'other' ? t.clientProfile.info.sexOther : t.clientProfile.info.sexNotSet}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.sep} />
        {/* Street address */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openField({ label: t.clientProfile.info.streetAddress, value: clientStreet, placeholder: t.clientProfile.info.streetPlaceholder, keyboard: 'default', onSave: onStreetChange })}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.streetAddress}</Text>
          <Text style={[styles.infoRowValue, !clientStreet && styles.infoRowMuted]}>
            {clientStreet || t.clientProfile.info.streetPlaceholder}
          </Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        {/* City */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openField({ label: t.clientProfile.info.city, value: clientCity, placeholder: t.clientProfile.info.cityPlaceholder, keyboard: 'default', onSave: onCityChange })}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.city}</Text>
          <Text style={[styles.infoRowValue, !clientCity && styles.infoRowMuted]}>
            {clientCity || t.clientProfile.info.cityPlaceholder}
          </Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        {/* Postcode */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openField({ label: t.clientProfile.info.postcode, value: clientPostcode, placeholder: t.clientProfile.info.postcodePlaceholder, keyboard: 'default', onSave: onPostcodeChange })}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.postcode}</Text>
          <Text style={[styles.infoRowValue, !clientPostcode && styles.infoRowMuted]}>
            {clientPostcode || t.clientProfile.info.postcodePlaceholder}
          </Text>
        </TouchableOpacity>
        <View style={styles.sep} />
        {/* Country */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openField({ label: t.clientProfile.info.country, value: clientCountry, placeholder: t.clientProfile.info.countryPlaceholder, keyboard: 'default', onSave: onCountryChange })}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.country}</Text>
          <Text style={[styles.infoRowValue, !clientCountry && styles.infoRowMuted]}>
            {clientCountry || t.clientProfile.info.countryPlaceholder}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Custom slogan */}
      <SectionHeader title={t.clientProfile.info.customSlogan} />
      <View style={styles.card}>
        <TextInput
          style={styles.infoInput}
          value={customSlogan}
          onChangeText={onSloganChange}
          placeholder={t.clientProfile.info.sloganPlaceholder}
          placeholderTextColor="#bbb"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.infoHint}>{t.clientProfile.info.sloganHint}</Text>
      </View>

      {/* Set password */}
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.infoRow, { alignItems: 'center' }]}
          onPress={() => { setSetPwdNew(''); setSetPwdConfirm(''); setSetPwdOpen(true); }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SymbolView name="lock" size={15} tintColor="#666" />
            <Text style={styles.infoRowLabel}>{t.clientProfile.info.setPassword}</Text>
          </View>
          <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
        </TouchableOpacity>
      </View>

      {/* Banner photo */}
      <SectionHeader title={t.clientProfile.info.bannerPhoto} />
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.infoRow, { alignItems: 'center' }]}
          onPress={onPickBannerPhoto}
          disabled={uploadingBanner}
          activeOpacity={0.7}
        >
          <Text style={styles.infoRowLabel}>{t.clientProfile.info.bannerPhoto}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {uploadingBanner ? (
              <ActivityIndicator size="small" color="#24ac88" />
            ) : bannerPhotoUrl ? (
              <Image source={{ uri: bannerPhotoUrl }} style={infoFieldStyles.bannerThumb} resizeMode="cover" />
            ) : (
              <Text style={styles.infoRowMuted}>{t.clientProfile.info.bannerPhotoNone}</Text>
            )}
            <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
          </View>
        </TouchableOpacity>

        {bannerPhotoUrl ? (
          <>
            <View style={styles.sep} />
            <View style={infoFieldStyles.bannerPreviewSection}>
              <Text style={infoFieldStyles.bannerPreviewLabel}>PREVIEW</Text>
              <GestureDetector gesture={bannerPanGesture}>
              <View style={infoFieldStyles.bannerPreviewFrame}>
                <View
                  style={infoFieldStyles.bannerPreviewClip}
                  onLayout={e => setPreviewContainerW(Math.round(e.nativeEvent.layout.width))}
                >
                  <Image
                    source={{ uri: bannerPhotoUrl }}
                    style={[infoFieldStyles.bannerPreviewImage, { width: imageW, left: imageL, height: previewImageH, top: imageTop }]}
                    resizeMode="stretch"
                  />
                  {/* Top gradient */}
                  <LinearGradient
                    colors={['rgba(0,0,0,0.55)', 'transparent']}
                    locations={[0, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.35 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {/* Dynamic island indicator */}
                  <View style={infoFieldStyles.islandBar} pointerEvents="none">
                    <View style={infoFieldStyles.islandPill} />
                  </View>
                  {/* Greeting text overlay */}
                  <View style={infoFieldStyles.greetingOverlay} pointerEvents="none">
                    <Text style={infoFieldStyles.greetingHi}>Hi {clientFirstName},</Text>
                    <Text style={infoFieldStyles.greetingSlogan} numberOfLines={2}>ready to be better than yesterday?</Text>
                  </View>
                  {/* Draggable VF icon */}
                  {previewContainerW > 0 && (
                    <GestureDetector gesture={iconDragGesture}>
                      <View style={[infoFieldStyles.iconDragHandle, {
                        left: Math.round(vfIconPosX * previewContainerW) - 22,
                        top: Math.round(vfIconPosY * INFO_PREVIEW_H) - 22,
                      }]}>
                        <VFIcon size={20} color="#fff" />
                      </View>
                    </GestureDetector>
                  )}
                </View>
                <View style={infoFieldStyles.dragHintRow} pointerEvents="none">
                  <Text style={infoFieldStyles.dragHintText}>Drag to adjust position</Text>
                </View>
              </View>
              </GestureDetector>
              {/* Zoom controls */}
              <View style={infoFieldStyles.zoomRow}>
                <Text style={infoFieldStyles.zoomLabel}>Zoom</Text>
                <View style={infoFieldStyles.zoomBtns}>
                  <TouchableOpacity
                    style={[infoFieldStyles.zoomBtn, !canZoomOut && infoFieldStyles.zoomBtnDisabled]}
                    onPress={() => {
                      if (!canZoomOut) return;
                      const newZoom = Math.max(1.0, parseFloat((bannerPhotoZoom - 0.1).toFixed(1)));
                      const oldOverflow = Math.max(Math.round(baseH * bannerPhotoZoom) - INFO_PREVIEW_H, 1);
                      const newOverflow = Math.max(Math.round(baseH * newZoom) - INFO_PREVIEW_H, 1);
                      const newOffsetY = Math.max(0, Math.min(100, Math.round(bannerPhotoOffsetY * oldOverflow / newOverflow)));
                      onZoomChange(newZoom);
                      onOffsetYChange(newOffsetY);
                    }}
                    activeOpacity={0.7}
                    disabled={!canZoomOut}
                  >
                    <Text style={[infoFieldStyles.zoomBtnText, !canZoomOut && infoFieldStyles.zoomBtnTextDisabled]}>−</Text>
                  </TouchableOpacity>
                  <Text style={infoFieldStyles.zoomValue}>{bannerPhotoZoom.toFixed(1)}×</Text>
                  <TouchableOpacity
                    style={[infoFieldStyles.zoomBtn, !canZoomIn && infoFieldStyles.zoomBtnDisabled]}
                    onPress={() => {
                      if (!canZoomIn) return;
                      const newZoom = Math.min(2.5, parseFloat((bannerPhotoZoom + 0.1).toFixed(1)));
                      const oldOverflow = Math.max(Math.round(baseH * bannerPhotoZoom) - INFO_PREVIEW_H, 1);
                      const newOverflow = Math.max(Math.round(baseH * newZoom) - INFO_PREVIEW_H, 1);
                      const newOffsetY = Math.max(0, Math.min(100, Math.round(bannerPhotoOffsetY * oldOverflow / newOverflow)));
                      onZoomChange(newZoom);
                      onOffsetYChange(newOffsetY);
                    }}
                    activeOpacity={0.7}
                    disabled={!canZoomIn}
                  >
                    <Text style={[infoFieldStyles.zoomBtnText, !canZoomIn && infoFieldStyles.zoomBtnTextDisabled]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.sep} />
            <TouchableOpacity
              style={infoFieldStyles.removePhotoRow}
              onPress={onRemoveBannerPhoto}
              activeOpacity={0.7}
            >
              <Text style={infoFieldStyles.removePhotoText}>Remove photo</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {/* Trainer notes */}
      <AvailabilityTypeField clientId={clientId} initialValue={(client as any)?.availability_type ?? null} />
      <WeeklySessionGoalField clientId={clientId} initialValue={(client as any)?.weekly_session_goal ?? null} />
      <DailyStepsGoalField clientId={clientId} initialValue={(client as any)?.daily_steps_goal ?? null} />

      <SectionHeader title={t.clientProfile.info.trainerNotes} />
      <View style={styles.card}>
        <TextInput
          style={[styles.infoInput, styles.notesInput]}
          value={trainerNotes}
          onChangeText={onNotesChange}
          placeholder={t.clientProfile.info.notesPlaceholder}
          placeholderTextColor="#bbb"
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
        />
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveButton, saving && { opacity: 0.6 }]}
        onPress={onSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        <Text style={styles.saveButtonText}>{saving ? '...' : t.clientProfile.info.save}</Text>
      </TouchableOpacity>

      {/* Field edit modal */}
      {fieldModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setFieldModal(null)} statusBarTranslucent>
          <View style={infoFieldStyles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setFieldModal(null)} />
            <View style={infoFieldStyles.glassShadow}>
            <GlassPanel style={infoFieldStyles.glassBox}>
              <Text style={infoFieldStyles.title}>{fieldModal.label}</Text>
              <TextInput
                style={infoFieldStyles.inputOnGlass}
                value={fieldDraft}
                onChangeText={setFieldDraft}
                keyboardType={fieldModal.keyboard}
                placeholder={fieldModal.placeholder}
                placeholderTextColor="#8a938e"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                inputAccessoryViewID={Platform.OS === 'ios' ? 'info-field-input' : undefined}
              />
              <TouchableOpacity
                style={infoFieldStyles.confirmBtn}
                onPress={() => { fieldModal.onSave(fieldDraft); setFieldModal(null); }}
                activeOpacity={0.85}
              >
                <Text style={infoFieldStyles.confirmBtnText}>{t.common.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFieldModal(null)} hitSlop={8}>
                <Text style={infoFieldStyles.cancelOnGlass}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </GlassPanel>
            </View>
          </View>
          {/* Suppress iOS keyboard Done toolbar — Confirm button in modal is sufficient */}
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID="info-field-input">
              <View style={{ height: 0 }} />
            </InputAccessoryView>
          )}
        </Modal>
      )}

      {/* ── Set password modal ─────────────────────────────────────────────── */}
      <Modal visible={setPwdOpen} transparent animationType="fade" onRequestClose={() => setSetPwdOpen(false)} statusBarTranslucent>
        <View style={infoFieldStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSetPwdOpen(false)} />
          <View style={infoFieldStyles.glassShadow}>
          <GlassPanel style={[infoFieldStyles.glassBox, { alignItems: 'stretch' }]}>
            <Text style={[infoFieldStyles.title, { textAlign: 'center' }]}>{t.clientProfile.info.setPassword}</Text>
            <TextInput
              style={infoFieldStyles.inputOnGlass}
              value={setPwdNew}
              onChangeText={setSetPwdNew}
              placeholder={t.clientProfile.info.setPasswordNewPlaceholder}
              placeholderTextColor="#8a938e"
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              inputAccessoryViewID={Platform.OS === 'ios' ? 'set-pwd-input' : undefined}
            />
            <TextInput
              style={infoFieldStyles.inputOnGlass}
              value={setPwdConfirm}
              onChangeText={setSetPwdConfirm}
              placeholder={t.clientProfile.info.setPasswordConfirmPlaceholder}
              placeholderTextColor="#8a938e"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSetPassword}
              inputAccessoryViewID={Platform.OS === 'ios' ? 'set-pwd-input' : undefined}
            />
            <TouchableOpacity
              style={infoFieldStyles.confirmBtn}
              onPress={handleSetPassword}
              disabled={setPwdSaving}
              activeOpacity={0.85}
            >
              {setPwdSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={infoFieldStyles.confirmBtnText}>{t.common.confirm}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSetPwdOpen(false)} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text style={infoFieldStyles.cancelOnGlass}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </GlassPanel>
          </View>
        </View>
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="set-pwd-input">
            <View style={{ height: 0 }} />
          </InputAccessoryView>
        )}
      </Modal>

      {/* Success toast */}
      {setPwdToast && (
        <View style={infoFieldStyles.toast} pointerEvents="none">
          <Text style={infoFieldStyles.toastText}>{t.clientProfile.info.setPasswordSuccess}</Text>
        </View>
      )}

    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ title, style }: { title: string; style?: object }) {
  return <Text style={[styles.sectionLabel, style]}>{title}</Text>;
}

function SectionHeaderWithLink({ title, link, onLink }: { title: string; link: string; onLink: () => void }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <TouchableOpacity onPress={onLink}><Text style={styles.sectionLink}>{link}</Text></TouchableOpacity>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function WorkoutRow({
  workout,
  isTrainer,
  isRenaming,
  renameText,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onPress,
  onMenuPress,
}: {
  workout: WorkoutWithLastDate;
  isTrainer: boolean;
  isRenaming: boolean;
  renameText: string;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onPress: () => void;
  onMenuPress: () => void;
}) {
  // Workout card style — overlay texts follow the COVER here (this is a cover-crop card
  // with no separate footer). Hook stays above the rename early-return.
  const coverDark = useCoverDark();
  const gradColors = (CATEGORY_GRADIENTS[workout.category ?? ''] ?? GRADIENT_DEFAULT) as [string, string];
  const lastDoneText = workout.lastSessionDate
    ? t.clientProfile.training.lastDone(relativeTime(workout.lastSessionDate))
    : t.clientProfile.training.neverDone;

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
    <TouchableOpacity style={[coverCardStyles.card, coverDark && darkCardStyles.bg]} onPress={onPress} activeOpacity={0.92}>
      <WorkoutPaperCover category={workout.category} workoutId={workout.id} />
      <View style={coverCardStyles.bottom}>
        <View style={coverCardStyles.bottomLeft}>
          <Text style={[coverCardStyles.itemName, coverDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{workout.name}</Text>
          <Text style={[coverCardStyles.itemSub, coverDark && darkCardStyles.subOnDark, ft(400)]} numberOfLines={1}>{lastDoneText}</Text>
        </View>
        <View style={coverCardStyles.bottomRight}>
          {isTrainer && (
            <TouchableOpacity onPress={onMenuPress} hitSlop={8} activeOpacity={0.5}>
              <SymbolView name="ellipsis" size={13} tintColor={coverDark ? DARK_MUTED_ICON : '#bbb'} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── WorkoutMenuModal ─────────────────────────────────────────────────────────

function WorkoutMenuModal({
  workoutName,
  workoutStatus = 'active',
  onEdit,
  onDelete,
  onAddToRoutine,
  onToggleStatus,
  onViewExercises,
  onClose,
}: {
  workoutName: string;
  workoutStatus?: 'active' | 'completed';
  onEdit: () => void;
  onDelete: () => void;
  onAddToRoutine: () => void;
  onToggleStatus: () => void;
  onViewExercises: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <>
          <Text style={menuStyles.sheetTitle} numberOfLines={1}>{workoutName}</Text>
          <View style={menuStyles.sheetDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onEdit)} activeOpacity={0.7}>
            <SymbolView name="square.and.pencil" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>Edit workout</Text>
          </TouchableOpacity>
          <View style={menuStyles.optionDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onViewExercises)} activeOpacity={0.7}>
            <SymbolView name="list.bullet.rectangle" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>Session details</Text>
          </TouchableOpacity>
          <View style={menuStyles.optionDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onAddToRoutine)} activeOpacity={0.7}>
            <SymbolView name="plus.circle" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>Add to Routine</Text>
          </TouchableOpacity>
          <View style={menuStyles.optionDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onToggleStatus)} activeOpacity={0.7}>
            <SymbolView name={workoutStatus === 'completed' ? 'arrow.uturn.left' : 'checkmark.circle'} size={16} tintColor={workoutStatus === 'completed' ? ACCENT : TEXT} />
            <Text style={[menuStyles.optionText, workoutStatus === 'completed' && { color: ACCENT }]}>
              {workoutStatus === 'completed' ? 'Reactivate' : 'Mark as done'}
            </Text>
          </TouchableOpacity>
          <View style={menuStyles.optionDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onDelete)} activeOpacity={0.7}>
            <SymbolView name="trash" size={16} tintColor="#ef4444" />
            <Text style={[menuStyles.optionText, menuStyles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

// ─── RoutinePickerModal ───────────────────────────────────────────────────────

function RoutinePickerModal({
  clientId,
  onPick,
  onClose,
}: {
  clientId: string;
  onPick: (routineId: string) => void;
  onClose: () => void;
}) {
  const [routines, setRoutines] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('routines')
      .select('id, name')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRoutines((data ?? []).map((r: any) => ({ id: r.id, name: r.name })));
        setLoading(false);
      });
  }, [clientId]);

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={menuStyles.sheetContent}>
          <Text style={menuStyles.sheetTitle}>Add to Routine</Text>
          <View style={menuStyles.sheetDivider} />
          {loading ? (
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
        </View>
      )}
    </BottomSheet>
  );
}

function InfoRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={[styles.infoRowValue, muted && styles.infoRowMuted]}>{value}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const BG = '#faf9f7';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const MUTED = '#999';

// Height (below the header) reserved for the pinned pill switcher — content
// pads its top by `headerH + SEG_STRIP_H`.
const SEG_STRIP_H = 50;

const PROFILE_TABS: Tab[] = ['training', 'sessions', 'nutrition', 'progress', 'info'];

/**
 * Pinned section switcher below the solid header — a plain UNDERLINE switcher (the
 * primary level). The 5 titles are evenly spread; the active one gets an accent-green
 * underline + accent text, inactive are dimmed. (Sub-tabs use a glass toggle instead,
 * so the two levels read as clearly different.)
 */
function TabPillSwitcher({
  activeTab, onChange, top,
}: {
  activeTab: Tab;
  onChange: (t: Tab) => void;
  top: number;
}) {
  return (
    <View style={[styles.segStrip, { top }]}>
      <View style={styles.segTrack}>
        {PROFILE_TABS.map(tab => {
          const on = activeTab === tab;
          return (
            <TouchableOpacity key={tab} style={styles.segItem} onPress={() => onChange(tab)} activeOpacity={0.7}>
              <View style={[styles.segUnderline, on && styles.segUnderlineActive]}>
                <Text style={[styles.segLabel, on && styles.segLabelActive]} numberOfLines={1}>
                  {t.clientProfile.tabs[tab]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Header session-timer indicator (glass-header overlay slot) — absolute so the
  // centered title never shifts; sits just left of the + icon.
  hdrSessIndicator: {
    position: 'absolute', right: 62, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  hdrSessTimer: { fontSize: 11, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },

  below: { flex: 1, backgroundColor: BG },

  // Pinned underline switcher (below the solid header). The active tab gets an
  // accent underline; sits a touch lower than the header for breathing room.
  segStrip: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: BG, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
    zIndex: 50,
  },
  segTrack: {
    flexDirection: 'row',
  },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Underline sits under the text only (inner view hugs the label), not the full cell.
  segUnderline: { paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  segUnderlineActive: { borderBottomColor: ACCENT },
  // Inactive titles are DIMMED (#bbb / lighter weight) so only the active tab reads
  // as a live element — 5 black labels in a row was too much noise. Matches the
  // client-side underline switchers (Workouts/Stretching, Body/Strength).
  segLabel: { fontSize: 14, fontWeight: '500', color: '#bbb' },
  segLabelActive: { color: ACCENT, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  // Cards
  card: {
    backgroundColor: CARD, borderRadius: 14, overflow: 'hidden',
    marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  emptyCard: {
    backgroundColor: CARD, borderRadius: RADIUS,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: MUTED, fontSize: 14 },
  emptyInCard: { color: MUTED, fontSize: 14, paddingHorizontal: 16, paddingVertical: 14 },
  emptyHint: { color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 8 },
  cardDivider: { height: 1, backgroundColor: BORDER },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },
  cardWarning: { borderWidth: 1.5, borderColor: '#f59e0b' },

  // Section headers
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 8,
  },
  sectionLink: { fontSize: 13, fontWeight: '600', color: ACCENT },

  // Routine header
  routineHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  routineTextBlock: { flex: 1, gap: 2 },
  routineName: { fontSize: 15, fontWeight: '700', color: TEXT },
  routineSubtitle: { fontSize: 12, color: MUTED },
  activeBadge: {
    backgroundColor: '#e6f7f3', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: ACCENT, letterSpacing: 0.3 },
  routineClosedDate: { fontSize: 12, color: MUTED },

  // Workout rows
  workoutRow: { flexDirection: 'row', alignItems: 'stretch' },
  catBorderStripe: { width: 3, borderRadius: 0 },
  workoutRowMain: { flex: 1, paddingLeft: 12, paddingRight: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCenter: { flex: 1, gap: 3 },
  workoutName: { fontSize: 15, fontWeight: '600', color: TEXT },
  workoutMeta: { fontSize: 12, color: MUTED },
  catPill: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  catPillText: { fontSize: 11, fontWeight: '700' },
  menuBtn: { paddingHorizontal: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  renameRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  renameInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: TEXT,
    backgroundColor: '#f5f5f3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  renameBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  // Closed routine row
  closedRoutineRow: { paddingHorizontal: 16, paddingVertical: 13 },
  closedRoutineName: { fontSize: 15, fontWeight: '600', color: MUTED, marginBottom: 2 },
  closedRoutineMeta: { fontSize: 12, color: '#bbb' },


  // Info tab
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  infoRowLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  infoRowValue: { fontSize: 14, color: MUTED, flex: 1, textAlign: 'right' },
  infoRowValueSet: { color: HEADER, fontWeight: '600' },
  infoRowInput: { fontSize: 14, color: TEXT, flex: 1, textAlign: 'right', paddingVertical: 2 },
  infoRowMuted: { color: MUTED },
  sexToggle: { flexDirection: 'row', gap: 6 },
  sexBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100, backgroundColor: '#f5f5f3' },
  sexBtnActive: { backgroundColor: HEADER },
  sexBtnText: { fontSize: 13, fontWeight: '600', color: MUTED },
  sexBtnTextActive: { color: '#fff' },
  infoInput: {
    fontSize: 15, color: TEXT, paddingHorizontal: 16, paddingVertical: 13,
  },
  notesInput: { minHeight: 100 },
  infoHint: { fontSize: 12, color: MUTED, paddingHorizontal: 16, paddingBottom: 12 },
  saveButton: {
    backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

const infoFieldStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 32 },
  box: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 14 },
  // Liquid Glass popup — radius-38 shadow wrapper + GlassPanel (the account.tsx family).
  glassShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 14 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT },
  input: {
    alignSelf: 'stretch', backgroundColor: '#f5f5f3', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: TEXT, textAlign: 'center',
  },
  inputOnGlass: {
    alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: TEXT, textAlign: 'center',
  },
  confirmBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel: { fontSize: 14, color: MUTED },
  cancelOnGlass: { fontSize: 14, color: '#414b45', fontWeight: '600' },
  bannerThumb: { width: 64, height: 36, borderRadius: 6 },
  bannerPreviewSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  bannerPreviewLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  bannerPreviewFrame: { borderRadius: 12, overflow: 'hidden' },
  bannerPreviewClip: { height: INFO_PREVIEW_H, borderRadius: 12, overflow: 'hidden' },
  bannerPreviewImage: { position: 'absolute', width: '100%' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  zoomLabel: { fontSize: 12, color: MUTED, fontWeight: '500' },
  zoomBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoomBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  zoomBtnDisabled: { borderColor: '#ddd' },
  zoomBtnText: { fontSize: 18, fontWeight: '600', color: ACCENT, lineHeight: 22 },
  zoomBtnTextDisabled: { color: '#ddd' },
  zoomValue: { fontSize: 13, fontWeight: '600', color: TEXT, minWidth: 36, textAlign: 'center' },
  iconDragHandle: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  islandBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 20, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 },
  islandPill: { width: 100, height: 9, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 5 },
  greetingOverlay: { position: 'absolute', bottom: 14, left: 14, right: 14 },
  greetingHi: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 3 },
  greetingSlogan: { fontSize: 15, color: '#fff', fontWeight: '700', lineHeight: 20 },
  dragHintRow: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
  dragHintText: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500', letterSpacing: 0.2, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  removePhotoRow: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  removePhotoText: { fontSize: 14, color: '#e85d4a' },
  toast: {
    position: 'absolute', bottom: 32, left: 0, right: 0,
    alignItems: 'center',
  },
  toastText: {
    backgroundColor: 'rgba(36,78,67,0.92)', color: '#fff',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 100, fontSize: 14, fontWeight: '600', overflow: 'hidden',
  },
});

const menuStyles = StyleSheet.create({
  sheetContent: { paddingBottom: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 },
  sheetShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  sheet: { borderRadius: 38, overflow: 'hidden' },
  // The sheet's subject (a workout name) — 17/700 dark, the same treatment
  // WorkoutExercisesModal and RoutineInfoSheet give their titles. It was 13/600 MUTED
  // (Aug 2026, Vitek: "too light and weirdly positioned, make it more present"): at
  // that weight it read as a caption floating under the drag handle rather than as
  // the thing the menu is about.
  sheetTitle: {
    fontSize: 17, fontWeight: '700', color: TEXT,
    paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14, textAlign: 'center',
  },
  sheetDivider: { height: 1, backgroundColor: BORDER },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 15 },
  optionText: { fontSize: 16, color: TEXT },
  optionDivider: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 20 },
  deleteText: { color: '#ef4444' },
  emptyText: { color: MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 16 },
});

// ─── Sessions tab styles ──────────────────────────────────────────────────────

const AMBER = '#EF9F27';

const pkgStyles = StyleSheet.create({
  pkgHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, gap: 12,
  },
  pkgHeaderText: { flex: 1, gap: 4 },
  pkgTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  pkgMeta: { fontSize: 12, color: MUTED },
  barBg: {
    height: 5, backgroundColor: BG, borderRadius: 3,
    marginHorizontal: 16, marginBottom: 8, overflow: 'hidden',
  },
  barFill: { height: 5, backgroundColor: ACCENT, borderRadius: 3 },
  barLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 10,
  },
  barUsed: { fontSize: 12, color: MUTED },
  barRemaining: { fontSize: 12, fontWeight: '700', color: AMBER },
  warningRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,159,39,0.10)',
    paddingHorizontal: 16, paddingVertical: 9, marginBottom: 0,
  },
  warningDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: AMBER },
  warningText: { fontSize: 13, color: AMBER, fontWeight: '500', flex: 1 },
  actionRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, paddingTop: 12,
  },
  closeBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 100,
    backgroundColor: '#f0f0ee', alignItems: 'center',
  },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  newPkgBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 100,
    backgroundColor: HEADER, alignItems: 'center',
  },
  newPkgBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Session history
  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  sessionName: { fontSize: 14, fontWeight: '600', color: TEXT },
  sessionMeta: { fontSize: 12, color: MUTED },
  doneBadge: {
    backgroundColor: '#f0f0ec', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  doneBadgeText: { fontSize: 12, fontWeight: '700', color: MUTED },
  doneBadgePaid: { backgroundColor: '#e6f7f3' },
  doneBadgeTextPaid: { color: ACCENT },
  seeAllRow: { paddingHorizontal: 16, paddingVertical: 13 },
  seeAllText: { fontSize: 14, fontWeight: '600', color: ACCENT },
  // Past packages
  pastPkgRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  pastPkgName: { fontSize: 14, fontWeight: '600', color: TEXT },
  pastPkgMeta: { fontSize: 12, color: MUTED },
  statusPill: {
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusPillDone: { backgroundColor: '#e6f7f3' },
  statusPillClosed: { backgroundColor: '#f0f0f0' },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  statusTextDone: { color: ACCENT },
  statusTextClosed: { color: MUTED },
  // Total paid
  totalCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  totalLabel: { fontSize: 14, fontWeight: '500', color: MUTED },
  totalAmount: { fontSize: 18, fontWeight: '800', color: HEADER },
});

// Confirm + new package modal styles
const cmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 32 },
  box: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 12 },
  // Liquid Glass popup — radius-38 shadow wrapper + GlassPanel (the account.tsx family).
  glassShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  message: { fontSize: 14, color: MUTED, textAlign: 'center' },
  messageOnGlass: { fontSize: 14, color: '#1f2823', fontWeight: '600', textAlign: 'center' },
  cancelOnGlass: { fontSize: 14, color: '#414b45', fontWeight: '600' },
  actionBtn: {
    backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13,
    alignSelf: 'stretch', alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelText: { fontSize: 14, color: MUTED },
});

// ─── Cover photo card styles (workout cards) ──────────────────────────────────

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

const coverCardStyles = StyleSheet.create({
  // Cover-crop card (Recent Activity + WorkoutRow): the cover fills the 70px card and
  // the texts OVERLAY its bottom, so they follow the COVER's ground — ink base for the
  // 'light' style, darkCardStyles overrides appended when the cover is dark. White base
  // + light lift shadow in both styles.
  card: {
    height: 70, borderRadius: 14, overflow: 'hidden', marginBottom: 0, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingBottom: 8, gap: 8,
  },
  bottomLeft: { flex: 1, gap: 2 },
  bottomRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  itemName: { fontSize: 11, fontWeight: '500', color: '#1a1a1a' },
  itemSub: { fontSize: 8, color: 'rgba(0,0,0,0.45)' },
  catPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  catPillText: { fontSize: 8, fontWeight: '500', color: '#ffffff' },
});

const pkgModalStyles = StyleSheet.create({
  subLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeCol: { gap: 8 },
  typeBtn: {
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#f8f8f6', alignItems: 'center',
  },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#f8f8f6', alignItems: 'center',
  },
  optionBtnSm: { paddingVertical: 10 },
  optionBtnActive: { backgroundColor: HEADER },
  optionBtnText: { fontSize: 14, fontWeight: '600', color: MUTED, textAlign: 'center' },
  optionBtnTextActive: { color: '#fff' },
  priceInput: {
    alignSelf: 'stretch', backgroundColor: '#f8f8f6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 20, color: TEXT, textAlign: 'center',
    fontWeight: '700',
  },
  dateRow: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, backgroundColor: '#f8f8f6',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  dateText: { fontSize: 15, fontWeight: '500', color: TEXT },
  dateMuted: { color: MUTED },
});

const addPopStyles = StyleSheet.create({
  sheetContent: { alignItems: 'center', paddingTop: 4, paddingBottom: 4 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  // Glass popup card (radius-38 GlassPanel family): shadow lives on cardShadow,
  // the OnGlass twins darken the shared muted styles ONLY at popup call sites
  // (heading/divider/cancelText etc. are also used by the white BottomSheets).
  card: {
    borderRadius: 38, overflow: 'hidden',
    width: '100%', paddingTop: 20, paddingBottom: 8,
    alignItems: 'center',
  },
  cardShadow: {
    borderRadius: 38, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22, shadowRadius: 28, elevation: 12,
  },
  headingOnGlass: { color: '#414b45' },
  dividerOnGlass: { backgroundColor: 'rgba(0,0,0,0.08)' },
  cancelTextOnGlass: { color: '#414b45', fontWeight: '600' },
  emptyTextOnGlass: { color: '#1f2823' },
  emptySubOnGlass: { color: '#414b45' },
  // Kept for the GLASS popups that share this stylesheet (Plan a Workout / Schedule /
  // Session in progress, via headingOnGlass). The BottomSheets moved to
  // menuStyles.sheetTitle — 13/700 uppercase grey read as a caption, not a title.
  heading: {
    fontSize: 13, fontWeight: '700', color: '#aaa',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
  },
  // sheetContent centres its children, so a width-less divider would collapse.
  sheetDividerStretch: { alignSelf: 'stretch' },
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

const planStyles = StyleSheet.create({
  workoutName:    { fontSize: 15, fontWeight: '600', color: TEXT, textAlign: 'center', marginBottom: 14, paddingHorizontal: 4 },
  dateRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 14 },
  dateArrow:      { fontSize: 24, color: MUTED, paddingHorizontal: 8 },
  dateText:       { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT, textAlign: 'center' },
  repeatRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingVertical: 10, marginBottom: 6 },
  repeatLabel:    { fontSize: 15, fontWeight: '500', color: TEXT },
  toggleTrack:    { width: 42, height: 24, borderRadius: 12, backgroundColor: '#d8d8d4', justifyContent: 'center', paddingHorizontal: 2 },
  toggleTrackOn:  { backgroundColor: ACCENT },
  toggleThumb:    { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  toggleThumbOn:  { transform: [{ translateX: 18 }] },
  dowRow:         { flexDirection: 'row', gap: 5, width: '100%', marginBottom: 12 },
  dowPill:        { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#f0f0ee' },
  dowPillActive:  { backgroundColor: HEADER },
  dowPillText:    { fontSize: 11, fontWeight: '700', color: MUTED },
  dowPillTextActive: { color: '#fff' },
  endAfterRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 10 },
  endAfterLabel:  { fontSize: 14, fontWeight: '500', color: TEXT },
  endAfterPills:  { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  endPill:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  endPillActive:  { backgroundColor: '#fff' },
  endPillText:    { fontSize: 13, fontWeight: '600', color: MUTED },
  endPillTextActive: { color: TEXT },
  weeksStepper:   { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12, justifyContent: 'center' },
  stepBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0ee', alignItems: 'center', justifyContent: 'center' },
  stepBtnText:    { fontSize: 22, color: HEADER, lineHeight: 26 },
  weeksNum:       { fontSize: 22, fontWeight: '700', color: TEXT, minWidth: 36, textAlign: 'center' },
  saveBtn:            { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', marginTop: 16 },
  saveBtnText:        { fontSize: 15, fontWeight: '700', color: '#fff' },
  pickerCard:          { height: 70, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  pickerCardFooter:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'transparent' },
  pickerCardName:      { fontSize: 15, fontWeight: '700', color: '#fff' },
  pickerCardCheck:     { position: 'absolute', top: 7, right: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: '#24ac88', alignItems: 'center', justifyContent: 'center' },
  pickerCardCheckText: { fontSize: 11, color: '#fff', fontWeight: '700', lineHeight: 15 },
});

// ─── Segmented switcher styles (Training sub-tabs) ───────────────────────────

// ─── Tile styles (matches client side exactly) ────────────────────────────────

const tileStyles = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 0 },
  tile:       { flex: 1, aspectRatio: 1.3, borderRadius: 16, backgroundColor: CARD, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  tileContent: { flex: 1, borderRadius: 16, overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 14, alignItems: 'flex-start', justifyContent: 'space-between' },
  labelRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  labelEmoji:  { fontSize: 18 },
  tileLabelText: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  tileValue:   { fontSize: 36, fontWeight: '800', color: TEXT },
  valueRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  barsCluster: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '50%' },
  bar:         { width: 14, height: 3, borderRadius: 2 },
});

// ─── Trainer note styles (Overview tab) ──────────────────────────────────────

const noteStyles = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderRadius: 14,
    padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  editLink: { fontSize: 13, fontWeight: '600', color: ACCENT },
  noteText: { fontSize: 14, color: TEXT, fontStyle: 'italic', lineHeight: 20 },
  addNote: { fontSize: 14, color: MUTED, fontStyle: 'italic' },
  noteInput: { fontSize: 14, color: TEXT, minHeight: 60, lineHeight: 20 },
});

// ─── Last session highlights styles (Overview tab) ────────────────────────────

const hlStyles = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderRadius: 14,
    padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  label: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  exerciseName: { fontSize: 14, fontWeight: '500', color: TEXT, flex: 1 },
  change: { fontSize: 13, fontWeight: '600', flexShrink: 0 },
});

// ─── Week strip styles (client anatomy, but HEAVIER since July 25 — bigger day
//     numbers/pills/dots + ghost add circle; client not yet matched) ───────────

const wsStyles = StyleSheet.create({
  strip:       { marginTop: 4, paddingBottom: 12 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayBtn:    { width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  todayBtnText: { fontSize: 9, fontWeight: '700', color: '#fff', lineHeight: 18 },
  rangeText:   { fontSize: 17, fontWeight: '700', color: TEXT },
  daysContainer: { flexDirection: 'row', alignItems: 'center' },
  daysArrow:     { width: 14, alignItems: 'center', justifyContent: 'center' },
  daysArrowText: { fontSize: 18, color: '#ccc', lineHeight: 28 },
  daysRow:     { flex: 1, flexDirection: 'row' },
  dayCol:      { flex: 1, alignItems: 'center', gap: 5 },
  dayPill:     { alignItems: 'center', gap: 2, paddingTop: 7, paddingBottom: 8, paddingHorizontal: 11, borderRadius: 18 },
  dayPillSel:  { backgroundColor: ACCENT },
  dayLabel:    { fontSize: 10, color: 'rgba(36,78,67,0.55)', textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.3 },
  dayNum:      { fontSize: 19, fontWeight: '700', color: TEXT },
  dot:           { width: 6, height: 6, borderRadius: 3 },
  dotCompleted:  { backgroundColor: ACCENT },
  dotScheduled:  { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: ACCENT },

  // Ghost style (July 25) — the filled ACCENT disc was the screen's third green focal
  // point in a vertical line (selected pill → + → routine strip) and read "busy".
  addCircle:   { width: 34, height: 34, borderRadius: 17, alignSelf: 'center', marginTop: 12, backgroundColor: 'rgba(36,172,136,0.12)', alignItems: 'center', justifyContent: 'center' },

  // Card-style-aware (white base + light lift shadow; darkCardStyles.bg appended for
  // the 'light' style's dark footer) — matches the client week-strip session cards.
  sessCardOuter: { borderRadius: 16, marginTop: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  sessCardInner: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  checkBadge:  { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  checkMark:   { fontSize: 10, color: '#fff', fontWeight: '700', lineHeight: 14 },

  // paddingVertical 4 — matches the client week-strip card's hlWrap and the gallery
  // minis' wBody, so every cover card lands at the same ~112 height.
  sessionHighlights: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'transparent' },
  hlSectionLabel:    { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' },
  hlStatsRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessFooterName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  // No flex — the chips hug the RIGHT edge like the client's strip-card footer
  // (the name's flex:1 pushes them over); flex:1 spread them across the middle.
  hlStatChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  hlStatValue:   { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  hlNoteChip:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#f5f5f3', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, marginTop: 8 },
  hlNoteText:    { fontSize: 11, color: '#555', flex: 1, lineHeight: 16 },
  hlSectionDivider: { height: 1, backgroundColor: '#eeeeec', marginVertical: 8 },
  hlRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  hlExDot:         { width: 7, height: 7, borderRadius: 3.5, marginRight: 8, flexShrink: 0 },
  hlExDotDone:     { backgroundColor: HEADER },
  hlExDotSkipped:  { backgroundColor: '#d0d0cc' },
  hlExName:        { fontSize: 13, color: TEXT, flex: 1, marginRight: 8 },
  hlExNameSkipped: { color: MUTED },
  hlDelta:         { fontSize: 12, fontWeight: '600' },
  hlDeltaUp:       { color: ACCENT },
  hlDeltaDown:     { color: '#e85d4a' },
  hlDeltaSame:     { color: '#f5a623' },
  hlDivider:       { height: 0.5, backgroundColor: '#f0f0ee' },
  // Scheduled session — quiet gray badge on the white footer; white-alpha twin on the
  // 'light' style's dark footer.
  notYetBadge:       { backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  notYetText:        { fontSize: 12, fontWeight: '600', color: '#8a8a86' },
  // A live session is the app's "now" state — filled ACCENT, not the quiet grey the
  // not-yet-done badge uses. Same geometry so the two cards line up.
  runningBadge:      { backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  runningText:       { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.4 },
  notYetBadgeOnDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  notYetTextOnDark:  { color: 'rgba(255,255,255,0.85)' },
});

// Muted grays are darkened on glass, per the app-wide popup rule.
const busyStyles = StyleSheet.create({
  msg: { fontSize: 14, lineHeight: 20, color: '#1f2823', fontWeight: '600', paddingHorizontal: 4, paddingBottom: 4 },
});

// ─── Move-training calendar modal styles ─────────────────────────────────────

const moveCalStyles = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 24 },
  card:           { backgroundColor: CARD, borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  sheetContent:   { paddingHorizontal: 20, paddingBottom: 12, alignItems: 'center' },
  title:          { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 2 },
  sub:            { fontSize: 13, color: MUTED, marginBottom: 16 },
  monthRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 12 },
  monthLabel:     { fontSize: 15, fontWeight: '700', color: TEXT },
  dowRow:         { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 4 },
  dowLabel:       { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED },
  weekRow:        { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 2 },
  dayCell:        { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dayInner:       { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  dayText:        { fontSize: 13, color: TEXT },
  todayCircle:    { backgroundColor: 'rgba(36,172,136,0.15)' },
  todayText:      { color: ACCENT, fontWeight: '700' },
  currentCircle:  { backgroundColor: ACCENT },
  currentText:    { color: '#fff', fontWeight: '700' },
  confirmCircle:  { backgroundColor: HEADER },
  confirmText:    { color: '#fff', fontWeight: '700' },
  legendRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  legendText:     { fontSize: 11, color: MUTED },
  confirmBar:     { alignSelf: 'stretch', marginTop: 14, backgroundColor: '#f0faf6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10, alignItems: 'center' },
  confirmMsg:     { fontSize: 14, fontWeight: '600', color: HEADER, textAlign: 'center' },
  confirmBtn:     { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 32, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelText:     { fontSize: 14, color: MUTED },
});


