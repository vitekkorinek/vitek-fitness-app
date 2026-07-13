import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { VFIcon } from '@/components/VFIcon';
import { VFLogo } from '@/components/VFLogo';
import { PearIcon } from '@/components/icons/PearIcon';
import { KettlebellIcon } from '@/components/icons/KettlebellIcon';
import { supabase } from '@/lib/supabase';
import { SLOGANS } from '@/i18n/en';
import { useSessionStore } from '@/store/sessionStore';

const TYPE_LABELS: Record<string, string> = {
  pt_session:   'PT Session',
  trial:        'Trial',
  consultation: 'Consultation',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const HERO_HEIGHT = 340;
const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const DAY_ABBRS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Sub-components ───────────────────────────────────────────────────────────


function BulletRow({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={bullet.row} onPress={onPress} activeOpacity={0.6} disabled={!onPress}>
      <View style={bullet.dot} />
      <Text style={bullet.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const bullet = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11, paddingVertical: 2 },
  dot:   { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#fff' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },
});

function CalendarIcon({ dayAbbr, dateNum }: { dayAbbr: string; dateNum: string }) {
  return (
    <View style={calIcon.box}>
      <Text style={calIcon.day}>{dayAbbr}</Text>
      <Text style={calIcon.num}>{dateNum}</Text>
    </View>
  );
}

const calIcon = StyleSheet.create({
  box: { width: 48, alignItems: 'center', backgroundColor: HEADER, borderRadius: 8, paddingTop: 6, paddingBottom: 8 },
  day: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5, textTransform: 'uppercase' },
  num: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 27 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { profile } = useAuth();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const { suspendedSession, clearSuspendedSession } = useSessionStore();

  const clientId   = profile?.id ?? '';
  const hasSession = !!suspendedSession && suspendedSession.clientId === clientId;
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!hasSession || !suspendedSession) { setSessionElapsed(0); return; }
    const tick = () => setSessionElapsed(Math.floor((Date.now() - suspendedSession.startedAt) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [hasSession, suspendedSession?.startedAt]);

  const handleReturnToSession = () => {
    if (!suspendedSession) return;
    const { workoutId: suspWid, activeSessionId: suspSessId, startedAt: suspStart } = suspendedSession;
    clearSuspendedSession();
    const base = suspWid ? `/(client)/workout/${suspWid}` : `/(client)/workout/free`;
    const params = suspSessId ? `?resumeSessionId=${suspSessId}&resumeStartedAt=${suspStart}` : '';
    router.push(`${base}${params}` as any);
  };

  const [loading, setLoading] = useState(true);
  const [heroBannerUrl, setHeroBannerUrl]         = useState<string | null>(null);
  const [heroBannerOffsetY, setHeroBannerOffsetY] = useState(40);
  const [heroBannerZoom, setHeroBannerZoom]       = useState(1.5);
  const [vfIconPosX, setVfIconPosX]               = useState(0.88);
  const [vfIconPosY, setVfIconPosY]               = useState(0.06);
  const [nextAppt, setNextAppt]                   = useState<{ date: string; start_time: string; type: string } | null>(null);

  const slogan = useMemo(() => {
    if (profile?.custom_slogan) return profile.custom_slogan;
    return SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
  }, [profile?.custom_slogan]);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const clientBannerUrl = profile.banner_photo_url ?? null;

    const todayIso = new Date().toISOString().split('T')[0];

    const [trainerRes, clientRes, apptRes] = await Promise.all([
      supabase.rpc('get_trainer_banner').maybeSingle(),
      supabase.from('users').select('vf_icon_pos_x, vf_icon_pos_y').eq('id', profile.id).single(),
      supabase
        .from('appointments')
        .select('date, start_time, type')
        .eq('client_id', profile.id)
        .eq('status', 'scheduled')
        .eq('sent_to_client', true)
        .gte('date', todayIso)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (clientBannerUrl) {
      setHeroBannerUrl(clientBannerUrl);
      setHeroBannerOffsetY(profile.banner_photo_offset_y ?? 40);
      setHeroBannerZoom(profile.banner_photo_zoom ?? 1.5);
    } else {
      const trainerBanner = trainerRes.data as {
        banner_photo_url: string | null;
        banner_photo_offset_y: number | null;
        banner_photo_zoom: number | null;
      } | null;
      setHeroBannerUrl(trainerBanner?.banner_photo_url ?? null);
      setHeroBannerOffsetY(trainerBanner?.banner_photo_offset_y ?? 40);
      setHeroBannerZoom(trainerBanner?.banner_photo_zoom ?? 1.5);
    }
    setVfIconPosX((clientRes.data as any)?.vf_icon_pos_x ?? 0.88);
    setVfIconPosY((clientRes.data as any)?.vf_icon_pos_y ?? 0.06);
    setNextAppt(apptRes.data ?? null);
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const firstName = profile?.name?.split(' ')[0] ?? '';

  // Today's calendar icon values — used in the empty-state appointments row
  const now            = new Date();
  const todayDayAbbr   = DAY_ABBRS[now.getDay()];
  const todayDateNum   = String(now.getDate());

  const screenW        = Dimensions.get('window').width;
  const screenH        = Dimensions.get('window').height;
  const heroContainerH = HERO_HEIGHT + insets.top;
  const heroImageH     = heroContainerH * heroBannerZoom;
  const heroImageTop   = -(heroBannerOffsetY / 100) * (heroImageH - heroContainerH);
  const transparentGap = heroContainerH - 26;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Hero — absolutely behind the scroll ──────────────────────────── */}
      <View style={[styles.heroContainer, { height: heroContainerH }]}>
        {heroBannerUrl ? (
          <Image
            source={{ uri: heroBannerUrl! }}
            style={[styles.heroImage, { height: heroImageH, top: heroImageTop }]}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['#244e43', '#1a3d32']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Top vignette */}
        <LinearGradient
          colors={['rgba(0,0,0,0.82)', 'rgba(0,0,0,0.0)']}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.52 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Left vignette */}
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0.42, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Right vignette */}
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.0)']}
          start={{ x: 1, y: 0.5 }}
          end={{ x: 0.58, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.heroContent, { paddingTop: insets.top }]}>
          <View style={{ flex: 1 }} />
          <View style={styles.heroBottom}>
            <Text style={styles.heroGreeting}>Hi {firstName},</Text>
            <Text style={styles.heroSlogan} numberOfLines={2}>{slogan}</Text>
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Math.round(vfIconPosX * screenW) - 22,
              top: Math.round(vfIconPosY * heroContainerH) - 22,
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <VFIcon size={22} color="rgba(255,255,255,0.5)" />
          </View>
        </View>
      </View>

      {/* ── Static overlay — card sits fixed over the hero ──────────────── */}
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ height: screenH }}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Transparent gap reveals the hero behind */}
        <View style={{ height: transparentGap }} />

        <View style={[styles.sheet, { flex: 1, paddingBottom: insets.bottom + 32 }]}>
          {loading ? (
            <View style={styles.loaderInSheet}>
              <ActivityIndicator color={ACCENT} size="large" />
            </View>
          ) : (
            <View style={styles.cardStack}>

              {/* ── Appointments card ────────────────────────────────── */}
              <TouchableOpacity
                style={styles.apptCard}
                activeOpacity={0.88}
                onPress={() => router.push('/(client)/(tabs)/schedule' as any)}
              >
                <Text style={styles.apptSectionLabel}>YOUR APPOINTMENTS</Text>

                {nextAppt ? (
                  <View style={styles.apptRow}>
                    <CalendarIcon
                      dayAbbr={DAY_ABBRS[new Date(nextAppt.date + 'T00:00:00').getDay()]}
                      dateNum={String(new Date(nextAppt.date + 'T00:00:00').getDate())}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.apptType}>{TYPE_LABELS[nextAppt.type] ?? nextAppt.type}</Text>
                      <Text style={styles.apptTime}>{nextAppt.start_time.slice(0, 5)}</Text>
                    </View>
                    <SymbolView name="chevron.right" size={14} tintColor={MUTED} />
                  </View>
                ) : (
                  <View style={[styles.apptRow, { opacity: 0.45 }]}>
                    <CalendarIcon dayAbbr={todayDayAbbr} dateNum={todayDateNum} />
                    <Text style={styles.apptNoSessions}>No sessions scheduled</Text>
                  </View>
                )}

                <View style={styles.apptSep} />

                <View style={styles.apptFooter}>
                  <TouchableOpacity
                    onPress={() => router.push('/(client)/(tabs)/schedule' as any)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.apptSeeAll}>See all →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push('/(client)/availability' as any)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.apptAvailability}>Give availability →</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>

              {/* ── Feature tiles row ────────────────────────────────── */}
              <View style={styles.tilesRow}>

                {/* Nutrition tile — left */}
                <TouchableOpacity
                  style={styles.tileOuter}
                  activeOpacity={0.85}
                  onPress={() => router.push('/(client)/nutrition' as any)}
                >
                  <View style={styles.tileInner}>
                    <LinearGradient
                      colors={['#2d7a68', '#1e4f42', '#163830']}
                      start={{ x: 0.4, y: 0 }}
                      end={{ x: 0.6, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.tileIconWrap}>
                      <PearIcon size={112} color="rgba(255,255,255,0.10)" />
                    </View>
                    <View style={styles.tileContent}>
                      <View>
                        <Text style={styles.tileTitle}>Nutrition</Text>
                        <BulletRow label="Food log"   onPress={() => router.push('/(client)/nutrition' as any)} />
                        <BulletRow label="Favourites" onPress={() => router.push('/(client)/nutrition/favourites' as any)} />
                        <BulletRow label="Weekly"     onPress={() => router.push('/(client)/nutrition/weekly' as any)} />
                        <BulletRow label="Grocery"    onPress={() => router.push('/(client)/nutrition/grocery-list' as any)} />
                      </View>
                      <SymbolView name="arrow.right" size={13} tintColor="rgba(255,255,255,0.4)" weight="medium" />
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Training tile — right */}
                <TouchableOpacity
                  style={styles.tileOuter}
                  activeOpacity={0.85}
                  onPress={() => router.push('/(client)/(tabs)/train' as any)}
                >
                  <View style={styles.tileInner}>
                    <LinearGradient
                      colors={['#244e43', '#1a3830', '#112820']}
                      start={{ x: 0.4, y: 0 }}
                      end={{ x: 0.6, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.tileIconWrap, { bottom: -10 }]}>
                      <KettlebellIcon size={120} color="rgba(255,255,255,0.10)" />
                    </View>
                    <View style={styles.tileContent}>
                      <View>
                        <Text style={styles.tileTitle}>Training</Text>
                        <BulletRow label="Workouts & Routines" onPress={() => router.push('/(client)/(tabs)/train' as any)} />
                        <BulletRow label="Appointments"        onPress={() => router.push('/(client)/(tabs)/schedule' as any)} />
                        <BulletRow label="Progress"            onPress={() => router.push('/(client)/(tabs)/progress' as any)} />
                        <BulletRow label="Me"                  onPress={() => router.push('/(client)/(tabs)/me' as any)} />
                      </View>
                      <SymbolView name="arrow.right" size={13} tintColor="rgba(255,255,255,0.4)" weight="medium" />
                    </View>
                  </View>
                </TouchableOpacity>

              </View>

              {/* ── Wordmark watermark ───────────────────────────────── */}
              <View style={styles.logoWrap}>
                <VFLogo textOnly width={148} color="rgba(36,78,67,0.28)" />
              </View>

            </View>
          )}
        </View>
      </ScrollView>

      {/* Session indicator — rendered after ScrollView so it's on top */}
      {hasSession && (
        <TouchableOpacity
          style={[styles.heroSessionPill, { top: insets.top + 10, right: 20 }]}
          onPress={handleReturnToSession}
          activeOpacity={0.85}
        >
          <SymbolView name="timer" size={12} tintColor="#fff" />
          <Text style={styles.heroSessionTimer}>
            {String(Math.floor(sessionElapsed / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PLASTIC_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.10,
  shadowRadius: 10,
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 28,
    backgroundColor: BG,
  },
  loaderInSheet: { paddingTop: 80, alignItems: 'center' },
  cardStack:     { gap: 20 },

  // Hero
  heroContainer: { overflow: 'hidden' },
  heroImage:     { position: 'absolute', width: '100%' },
  heroContent:   { flex: 1 },
  heroBottom:    { paddingHorizontal: 20, paddingBottom: 54 },
  heroSessionPill: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#24ac88', borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  heroSessionTimer: { fontSize: 12, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] as any },
  heroGreeting:  { fontSize: 21, color: 'rgba(255,255,255,0.65)', fontWeight: '500', marginBottom: 6 },
  heroSlogan:    { fontSize: 24, color: '#fff', fontWeight: '700', lineHeight: 31 },

  // Appointments card — shadow holder (no overflow:hidden needed, content is flat)
  apptCard:          { backgroundColor: CARD, borderRadius: 20, ...PLASTIC_SHADOW },
  apptSectionLabel:  { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  apptRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  apptNoSessions:    { fontSize: 13, color: MUTED, fontStyle: 'italic' },
  apptType:          { fontSize: 13, fontWeight: '600', color: TEXT },
  apptTime:          { fontSize: 12, color: MUTED, marginTop: 2 },
  apptSep:           { height: 1, backgroundColor: BORDER },
  apptFooter:        { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  apptSeeAll:        { fontSize: 13, fontWeight: '600', color: ACCENT },
  apptAvailability:  { fontSize: 13, color: MUTED },

  // Feature tiles — outer holds shadow, inner clips gradient
  tilesRow:   { flexDirection: 'row', gap: 12, marginTop: 8 },
  tileOuter:  { flex: 1, borderRadius: 20, ...PLASTIC_SHADOW },
  tileInner:  { height: 228, borderRadius: 20, overflow: 'hidden' },
  tileIconWrap: { position: 'absolute', right: -48, bottom: 0 },
  tileContent:  { flex: 1, padding: 16, justifyContent: 'space-between' },
  tileTitle:    { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 2 },
  logoWrap:     { alignItems: 'center', paddingTop: 20, paddingBottom: 8 },
});
